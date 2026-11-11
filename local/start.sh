#!/usr/bin/env bash
# Первый запуск создаёт .env со случайными ключами; дальше просто поднимает контейнеры.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  r() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-32}"; }
  cat > .env <<ENV
DATABASE_URL=postgresql://hoppscotch:hoppscotch@db:5432/hoppscotch
JWT_SECRET=$(r 40)
SESSION_SECRET=$(r 40)
TOKEN_SALT_COMPLEX=10
MAGIC_LINK_TOKEN_VALIDITY=3
REFRESH_TOKEN_VALIDITY=604800000
ACCESS_TOKEN_VALIDITY=86400000
DATA_ENCRYPTION_KEY=$(r 32)
ALLOW_SECURE_COOKIES=false
ENABLE_SUBPATH_BASED_ACCESS=true
REDIRECT_URL=http://localhost:3080
WHITELISTED_ORIGINS=http://localhost:3080
VITE_BASE_URL=http://localhost:3080
VITE_SHORTCODE_BASE_URL=http://localhost:3080
VITE_ADMIN_URL=http://localhost:3080/admin
VITE_BACKEND_GQL_URL=http://localhost:3080/backend/graphql
VITE_BACKEND_WS_URL=ws://localhost:3080/backend/graphql
VITE_BACKEND_API_URL=http://localhost:3080/backend/v1
VITE_ALLOWED_AUTH_PROVIDERS=EMAIL
INFRA_TOKEN=$(r 32)
MAILER_SMTP_ENABLE=true
MAILER_USE_CUSTOM_CONFIGS=false
MAILER_SMTP_URL=smtp://mailpit:1025
MAILER_ADDRESS_FROM="SPRT API <noreply@localhost>"
ENV
  echo "Создан .env (это локальный файл, в репозиторий он не попадёт)"
fi

docker compose pull
docker compose up -d
echo
echo "Готово. SPRT API:  http://localhost:3080"
echo "Для входа введите любую почту, письмо со ссылкой придёт сюда: http://localhost:8025"
