#!/usr/bin/env bash
# Публикует скрытый сервис получения токена iiko на том же домене SPRT API.
# clientSecret остаётся на сервере и не попадает в Hoppscotch или браузер.
set -euo pipefail

DOMAIN="${DOMAIN:-sprtapi.sprt-service.ru}"
DIR=/opt/hoppscotch
SRC=$DIR/yandex-app-src
NET="${TRAEFIK_NETWORK:-n8n_default}"
ENTRY="${TRAEFIK_ENTRYPOINT:-websecure}"
RESOLVER="${TRAEFIK_RESOLVER:-mytlschallenge}"
ENV_FILE=$DIR/iiko-auth.env

if [ ! -d "$SRC/.git" ]; then
  echo "Не найден checkout $SRC. Сначала запустите deploy/yandex-app.sh"
  exit 1
fi

git -C "$SRC" sparse-checkout set yandex-app learn-app iiko-auth
git -C "$SRC" pull -q --ff-only

if [ ! -f "$ENV_FILE" ]; then
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  grep -E '^IIKO_(APP_ID|CLIENT_SECRET)=' "$DIR/.env" > "$ENV_FILE" || true
fi

if ! grep -qE '^IIKO_CLIENT_SECRET=.+$' "$ENV_FILE"; then
  echo "Не задан IIKO_CLIENT_SECRET. Добавьте его в $ENV_FILE и запустите скрипт снова."
  exit 2
fi

echo "== Сборка iiko-auth"
docker build -q -t sprt-iiko-auth "$SRC/iiko-auth" >/dev/null
docker rm -f sprt-iiko-auth >/dev/null 2>&1 || true

docker run -d --name sprt-iiko-auth --restart unless-stopped \
  --network "$NET" --env-file "$ENV_FILE" \
  -e ALLOWED_ORIGINS="https://$DOMAIN" \
  -l traefik.enable=true \
  -l traefik.docker.network="$NET" \
  -l "traefik.http.routers.sprtapi-iiko-auth.rule=Host(\`$DOMAIN\`) && (PathPrefix(\`/iiko-auth\`) || PathPrefix(\`/iiko-api\`))" \
  -l traefik.http.routers.sprtapi-iiko-auth.entrypoints="$ENTRY" \
  -l traefik.http.routers.sprtapi-iiko-auth.tls=true \
  -l traefik.http.routers.sprtapi-iiko-auth.tls.certresolver="$RESOLVER" \
  -l traefik.http.services.sprtapi-iiko-auth.loadbalancer.server.port=8081 \
  sprt-iiko-auth >/dev/null

for _ in $(seq 1 20); do
  if curl -fsS --max-time 5 "https://$DOMAIN/iiko-auth/health" | grep -q '"ok":true'; then
    echo "iiko-auth отвечает: https://$DOMAIN/iiko-auth/health"
    exit 0
  fi
  sleep 2
done

echo "iiko-auth не ответил. Проверьте: docker logs --tail 30 sprt-iiko-auth"
exit 1
