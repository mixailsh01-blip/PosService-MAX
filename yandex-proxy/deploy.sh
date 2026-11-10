#!/usr/bin/env bash
# Установка yandex-proxy на сервер: контейнер с прокси + Caddy, который сам выпускает HTTPS-сертификат.
# Запуск (от root):  curl -fsSL https://raw.githubusercontent.com/mixailsh01-blip/PosService-MAX/main/yandex-proxy/deploy.sh | sudo bash
# Повторный запуск обновляет код и пересобирает контейнер.
set -euo pipefail

DOMAIN="${DOMAIN:-91-210-170-56.sslip.io}"   # sslip.io сам указывает на IP из имени, свой домен не нужен
REPO="https://github.com/mixailsh01-blip/PosService-MAX.git"
DIR=/opt/yandex-proxy
ORIGINS="${ALLOWED_ORIGINS:-*}"

command -v docker >/dev/null || { echo "Нет docker"; exit 1; }
command -v git >/dev/null || { echo "Нет git (apt install -y git)"; exit 1; }

mkdir -p "$DIR"
if [ -d "$DIR/src/.git" ]; then
  git -C "$DIR/src" pull -q --ff-only
else
  git clone -q --depth 1 --filter=blob:none --sparse "$REPO" "$DIR/src"
  git -C "$DIR/src" sparse-checkout set yandex-proxy
fi

echo "== сборка образа"
docker build -q -t yandex-proxy "$DIR/src/yandex-proxy" >/dev/null
docker network create yandex-net >/dev/null 2>&1 || true

echo "== запуск прокси"
docker rm -f yandex-proxy >/dev/null 2>&1 || true
docker run -d --name yandex-proxy --restart unless-stopped --network yandex-net \
  -p 8080:8080 -e ALLOWED_ORIGINS="$ORIGINS" yandex-proxy >/dev/null
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS http://127.0.0.1:8080/health >/dev/null 2>&1 && break || sleep 1
done
curl -fsS http://127.0.0.1:8080/health && echo "  <- прокси отвечает"
echo "Для кнопки «Яндекс Еда» в SPRT API этого достаточно: прокси доступен на порту 8080 (http://$(hostname -I | awk '{print $1}'):8080)."

echo "== HTTPS (Caddy)"
docker rm -f yandex-caddy >/dev/null 2>&1 || true
if ss -ltnH '( sport = :80 or sport = :443 )' | grep -q .; then
  echo "Порты 80/443 заняты другим сервисом, HTTPS-прокси (Caddy) не запускаю. Это нужно, только если приложение открывается по https."
  echo "Если понадобится HTTPS, пришлите вывод этих двух команд, настрою через имеющийся веб-сервер:"
  echo "  sudo ss -ltnp | grep -E ':(80|443)\\b'"
  echo "  sudo docker ps --format '{{.Names}}  {{.Ports}}'"
  exit 0
fi
cat > "$DIR/Caddyfile" <<CADDY
$DOMAIN {
	reverse_proxy yandex-proxy:8080
}
CADDY
docker run -d --name yandex-caddy --restart unless-stopped --network yandex-net \
  -p 80:80 -p 443:443 -v "$DIR/Caddyfile":/etc/caddy/Caddyfile:ro -v yandex-caddy-data:/data caddy:2 >/dev/null

echo "Жду сертификат (до 90 секунд)…"
for i in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then
    echo "ГОТОВО: https://$DOMAIN/yandex/devOps"
    exit 0
  fi
  sleep 3
done
echo "HTTPS пока не отвечает. Проверьте, что в файрволе Timeweb открыты порты 80 и 443, и пришлите вывод: docker logs --tail 30 yandex-caddy"
exit 1
