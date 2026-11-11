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

# В этой версии Hoppscotch почта настраивается записями в базе, а не переменными .env.
# Ждём, пока приложение создаст настройки, и направляем письма в локальную «почту» (mailpit).
SQL() { docker compose exec -T db psql -U hoppscotch -d hoppscotch -tA -c "$1"; }
echo "Жду, пока приложение подготовит настройки (до 3 минут)..."
for i in $(seq 1 90); do
  n="$(SQL "select count(*) from \"InfraConfig\" where name='MAILER_SMTP_ENABLE'" 2>/dev/null || echo 0)"
  [ "${n:-0}" = "1" ] && break
  sleep 2
done
if [ "$(SQL "select value from \"InfraConfig\" where name='MAILER_SMTP_ENABLE'" 2>/dev/null)" != "true" ]; then
  SQL "update \"InfraConfig\" set value = case name
    when 'MAILER_SMTP_ENABLE' then 'true'
    when 'MAILER_USE_CUSTOM_CONFIGS' then 'true'
    when 'MAILER_SMTP_HOST' then 'mailpit'
    when 'MAILER_SMTP_PORT' then '1025'
    when 'MAILER_SMTP_SECURE' then 'false'
    when 'MAILER_SMTP_IGNORE_TLS' then 'true'
    when 'MAILER_TLS_REJECT_UNAUTHORIZED' then 'false'
    when 'MAILER_ADDRESS_FROM' then 'SPRT API <noreply@localhost>'
    end
    where name in ('MAILER_SMTP_ENABLE','MAILER_USE_CUSTOM_CONFIGS','MAILER_SMTP_HOST','MAILER_SMTP_PORT','MAILER_SMTP_SECURE','MAILER_SMTP_IGNORE_TLS','MAILER_TLS_REJECT_UNAUTHORIZED','MAILER_ADDRESS_FROM')" >/dev/null
  docker compose restart hoppscotch >/dev/null
  echo "Почта настроена, приложение перезапущено."
fi
echo
echo "Готово. SPRT API:  http://localhost:3080"
echo "Для входа введите любую почту, письмо со ссылкой придёт сюда: http://localhost:8025"
