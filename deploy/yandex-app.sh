#!/usr/bin/env bash
# Подключает разделы «Яндекс Еда» и «Обучение» к SPRT API отдельными папками на сервере, чтобы правки в них
# доставлялись за секунды (git pull), без пересборки образа на 15 минут.
# Первый запуск:  curl -fsSL https://raw.githubusercontent.com/mixailsh01-blip/PosService-MAX/main/deploy/yandex-app.sh | sudo bash
# Дальше обновление:  sudo sprt-update
set -euo pipefail

DIR=/opt/hoppscotch
SRC=$DIR/yandex-app-src
REPO=https://github.com/mixailsh01-blip/PosService-MAX.git
cd "$DIR"

command -v git >/dev/null || { echo "Нет git (apt install -y git)"; exit 1; }

echo "== 1. Файлы раздела"
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" pull -q --ff-only
else
  git clone -q --depth 1 --filter=blob:none --sparse "$REPO" "$SRC"
  git -C "$SRC" sparse-checkout set yandex-app learn-app
fi
git -C "$SRC" sparse-checkout set yandex-app learn-app
test -f "$SRC/yandex-app/index.html" || { echo "В репозитории не нашёл yandex-app/index.html"; exit 1; }
test -f "$SRC/learn-app/index.html" || { echo "В репозитории не нашёл learn-app/index.html"; exit 1; }
chmod -R a+rX "$SRC"

echo "== 2. Подключение к контейнеру"
if grep -q 'learn-app' docker-compose.yml; then
  echo "уже подключено"
else
  cp -p docker-compose.yml docker-compose.yml.bak-yandex
  python3 - <<'PY'
import re
p = "docker-compose.yml"
s = open(p, encoding="utf-8").read()
# убираем блок прошлой версии скрипта (только «Яндекс Еда»), если он был
s = re.sub(r"    volumes:\n      - \./yandex-app-src/yandex-app:/site/selfhost-web/yandex-app:ro\n", "", s)
key = '      - "3080:80"\n'
assert key in s, "не нашёл строку с портом 3080 в docker-compose.yml"
block = ("    volumes:\n"
         "      - ./yandex-app-src/yandex-app:/site/selfhost-web/yandex-app:ro\n"
         "      - ./yandex-app-src/learn-app:/site/selfhost-web/learn-app:ro\n")
s = s.replace(key, key + block, 1)
open(p, "w", encoding="utf-8").write(s)
PY
  docker compose config -q
  docker compose up -d
fi

echo "== 3. Команда обновления"
cat > /usr/local/bin/sprt-update <<'UPD'
#!/usr/bin/env bash
set -e
git -C /opt/hoppscotch/yandex-app-src pull -q --ff-only
echo "Разделы обновлены: $(git -C /opt/hoppscotch/yandex-app-src log -1 --format='%h %s')"
UPD
chmod +x /usr/local/bin/sprt-update
ln -sf /usr/local/bin/sprt-update /usr/local/bin/sprt-yandex-update
echo "ГОТОВО. Обновлять разделы: sudo sprt-update (перезапуск не нужен, достаточно обновить страницу)"
