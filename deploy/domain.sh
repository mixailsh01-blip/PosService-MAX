#!/usr/bin/env bash
# Перевод SPRT API на домен с HTTPS через уже работающий Traefik (тот, что обслуживает n8n).
# Запуск:  curl -fsSL https://raw.githubusercontent.com/mixailsh01-blip/PosService-MAX/main/deploy/domain.sh | sudo bash
# Другой домен:  ... | sudo DOMAIN=sprtapi.example.ru bash
# Откат: вернуть /opt/hoppscotch/.env из .env.bak-ip, удалить docker-compose.override.yml, docker compose up -d
set -euo pipefail

DOMAIN="${DOMAIN:-sprtapi.sprt-service.ru}"
DIR=/opt/hoppscotch
OLD_HTTP="http://91.210.170.56:3080"
OLD_WS="ws://91.210.170.56:3080"
NET=n8n_default

cd "$DIR"

echo "== 1. DNS"
IPS="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
MYIP="$(curl -fsS4 --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
if ! echo " $IPS" | grep -q " $MYIP "; then
  echo "Домен $DOMAIN пока не указывает на этот сервер ($MYIP). Сейчас он указывает на: ${IPS:-никуда (записи в DNS нет)}"
  echo "Добавьте A-запись и запустите команду ещё раз (DNS может обновляться до часа)."
  exit 1
fi
echo "$DOMAIN -> $MYIP"

echo "== 2. Traefik"
TR="$(docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /^traefik/ {print $1; exit}')"
[ -n "$TR" ] || { echo "Не нашёл контейнер Traefik"; exit 1; }
ARGS="$(docker inspect -f '{{range .Args}}{{println .}}{{end}}{{range .Config.Env}}{{println .}}{{end}}' "$TR")"
ENTRY="$(echo "$ARGS" | grep -ioE 'entrypoints[._][a-z0-9_-]+[._]address=:443' | head -1 | sed -E 's/^[^._]+[._]//; s/[._][aA][dD][dD][rR][eE][sS][sS]=.*//')"
RESOLVER="$(echo "$ARGS" | grep -ioE 'certificatesresolvers[._][a-z0-9_-]+[._]acme' | head -1 | sed -E 's/^[^._]+[._]//; s/[._][aA][cC][mM][eE]$//')"
# имена из переменных окружения TRAEFIK_* приходят заглавными, Traefik читает их строчными
echo "$ENTRY$RESOLVER" | grep -q "[a-z]" || { ENTRY="${ENTRY,,}"; RESOLVER="${RESOLVER,,}"; }
if [ -z "$ENTRY" ] || [ -z "$RESOLVER" ]; then
  echo "Не смог определить настройки Traefik (entrypoint='$ENTRY', resolver='$RESOLVER'). Пришлите этот вывод:"
  echo "$ARGS" | grep -iE 'entrypoints|certificatesresolvers|providers' | sed -E 's/(email=).*/\1***/'
  exit 1
fi
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$TR" | grep -qx "$NET" \
  || { echo "Traefik не в сети $NET, пришлите: docker inspect -f '{{json .NetworkSettings.Networks}}' $TR"; exit 1; }
echo "контейнер $TR, entrypoint $ENTRY, сертификаты $RESOLVER"

echo "== 3. Настройки SPRT API"
[ -f .env.bak-ip ] || cp -p .env .env.bak-ip
sed -i "s|$OLD_HTTP|https://$DOMAIN|g; s|$OLD_WS|wss://$DOMAIN|g; s|^ALLOW_SECURE_COOKIES=.*|ALLOW_SECURE_COOKIES=true|" .env
cat > docker-compose.override.yml <<YML
services:
  hoppscotch:
    labels:
      - traefik.enable=true
      - traefik.docker.network=$NET
      - traefik.http.routers.sprtapi.rule=Host(\`$DOMAIN\`)
      - traefik.http.routers.sprtapi.entrypoints=$ENTRY
      - traefik.http.routers.sprtapi.tls=true
      - traefik.http.routers.sprtapi.tls.certresolver=$RESOLVER
      - traefik.http.services.sprtapi.loadbalancer.server.port=80
YML
docker compose pull -q
docker compose up -d

echo "== 4. Прокси Яндекс Еды (тот же домен, путь /yandex/devOps; порт 8080 закрывается)"
if docker image inspect yandex-proxy >/dev/null 2>&1; then
  docker rm -f yandex-proxy yandex-caddy >/dev/null 2>&1 || true
  docker run -d --name yandex-proxy --restart unless-stopped --network "$NET" \
    -e ALLOWED_ORIGINS="https://$DOMAIN" \
    -l traefik.enable=true \
    -l traefik.docker.network="$NET" \
    -l "traefik.http.routers.sprtapi-yandex.rule=Host(\`$DOMAIN\`) && PathPrefix(\`/yandex/devOps\`)" \
    -l traefik.http.routers.sprtapi-yandex.entrypoints="$ENTRY" \
    -l traefik.http.routers.sprtapi-yandex.tls=true \
    -l traefik.http.routers.sprtapi-yandex.tls.certresolver="$RESOLVER" \
    -l traefik.http.services.sprtapi-yandex.loadbalancer.server.port=8080 \
    yandex-proxy >/dev/null
  echo "запущен"
else
  echo "образ yandex-proxy не найден, пропускаю (сначала запустите yandex-proxy/deploy.sh)"
fi

echo "== 5. Проверка (сертификат выпускается до 2 минут)"
for i in $(seq 1 40); do
  if curl -fsS -o /dev/null --max-time 5 "https://$DOMAIN/"; then
    echo "SPRT API отвечает: https://$DOMAIN"
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST -H 'Content-Type: application/json' -d '{}' "https://$DOMAIN/yandex/devOps" || true)"
    [ "$code" = "400" ] && echo "Прокси Яндекс Еды отвечает" || echo "Прокси Яндекс Еды: код $code (ожидался 400), пришлите: docker logs --tail 20 yandex-proxy"
    echo "ГОТОВО. Старый адрес $OLD_HTTP больше использовать не нужно."
    exit 0
  fi
  sleep 3
done
echo "https://$DOMAIN пока не отвечает. Пришлите вывод: docker logs --tail 40 $TR 2>&1 | grep -i -E 'sprtapi|acme|error'"
exit 1
