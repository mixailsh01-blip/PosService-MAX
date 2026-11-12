#!/usr/bin/env bash
# Создаёт каждому сотруднику личное рабочее пространство «Папка: <почта>».
# Сотрудник видит только своё, администратор (SPRT_ADMINS) состоит во всех.
# Запуск: ./private-teams.sh            один раз
#         ./private-teams.sh --watch    каждые 15 секунд, пока не нажмёте Ctrl+C
#         ./private-teams.sh --reseed   удалить окружение и коллекцию iiko во всех пространствах и создать заново (новая версия)
#         ./private-teams.sh --backfill добавить окружение и коллекцию iiko и в уже существующие пространства
cd "$(dirname "$0")" || exit 1
ADMINS="${SPRT_ADMINS:-m.demetiev@sprt-service.ru}"
OPTS="-c sprt.admins=$ADMINS"
[ "$1" = "--backfill" ] && OPTS="$OPTS -c sprt.backfill=on"
[ "$1" = "--reseed" ] && OPTS="$OPTS -c sprt.reseed=on"
run() {
  docker compose exec -T -e PGOPTIONS="$OPTS" db \
    psql -U hoppscotch -d hoppscotch -q -v ON_ERROR_STOP=1 -f - < ../deploy/private-teams.sql
}
if [ "$1" = "--watch" ]; then
  echo "Слежу за новыми сотрудниками (Ctrl+C, чтобы остановить)..."
  while true; do run || true; sleep 15; done
else
  run && echo "Готово: у каждого сотрудника есть своё пространство, администратор видит все."
fi
