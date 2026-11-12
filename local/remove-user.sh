#!/usr/bin/env bash
# Удаляет сотрудника и его личное пространство «SPRT-Service · имя».
# Запуск: bash remove-user.sh test@sprt-service.ru
# Если удалить пользователя из базы не получится, удалит только пространство:
# тогда пользователя уберите в панели администратора (/admin → Users → Delete).
cd "$(dirname "$0")" || exit 1
EMAIL="$(echo "$1" | tr 'A-Z' 'a-z')"
[ -z "$EMAIL" ] && { echo "Укажите почту: bash remove-user.sh test@sprt-service.ru"; exit 1; }
LOCAL="${EMAIL%@*}"
read -r -p "Удалить пользователя $EMAIL и его пространства «SPRT-Service · $LOCAL» и «Обучение · $LOCAL»? Это нельзя отменить. Введите yes: " A
[ "$A" = "yes" ] || { echo "Отменено."; exit 0; }
run() { docker compose exec -T db psql -U hoppscotch -d hoppscotch -v ON_ERROR_STOP=1 -q -c "$1"; }
run "DELETE FROM \"Team\" WHERE name IN ('SPRT-Service · $LOCAL', 'Обучение · $LOCAL');" && echo "Пространства удалены."
if run "DELETE FROM \"User\" WHERE lower(email) = '$EMAIL';" 2>/dev/null; then
  echo "Пользователь удалён."
else
  echo "Пользователя в базе удалить не вышло: уберите его в панели администратора (/admin → Users)."
fi
