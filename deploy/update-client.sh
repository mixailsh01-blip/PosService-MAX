#!/usr/bin/env bash
# Install the exact CI-built frontend/backend image, preserving domain, auth and training overlays.
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Запустите через sudo bash'; exit 1; }
BASE=/opt/sprt-workspaces
APP=${SPRT_APP_CONTAINER:-hoppscotch-hoppscotch-1}
IMAGE=${1:?Укажите полный адрес образа с SHA-коммитом}
[[ "$IMAGE" =~ ^ghcr\.io/mixailsh01-blip/hoppscotch-pyrus:[0-9a-f]{40}$ ]] || { echo 'Нужен образ проекта с полным SHA-коммитом'; exit 1; }
test -x "$BASE/app-compose.sh" || test -f "$BASE/app-compose.sh"
echo 'Загружаю проверенную сборку…'
docker pull "$IMAGE"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
SAVE="$BASE/client-backups/$STAMP"
mkdir -p "$SAVE"
cp "$BASE/app-compose.sh" "$SAVE/app-compose.sh"
if [[ -e "$BASE/client-image.override.json" ]]; then
  cp "$BASE/client-image.override.json" "$SAVE/previous-image.override.json"
fi
docker inspect --format '{{json .Config.Labels}}' "$APP" > "$SAVE/labels.json"
docker inspect --format '{{.Image}}' "$APP" > "$SAVE/previous-image"
export BASE SAVE IMAGE
python3 <<'PY'
import json,os,shlex
from pathlib import Path
base=Path(os.environ['BASE']); save=Path(os.environ['SAVE'])
labels=json.loads((save/'labels.json').read_text())
overlay=base/'client-image.override.json'
files=[f for f in labels['com.docker.compose.project.config_files'].split(',') if f!=str(overlay)]
if not files or not all(Path(f).is_file() for f in files): raise SystemExit('Не найдены исходные Compose-файлы')
if str(base/'learn.override.json') not in files: raise SystemExit('Не найден overlay обучения; обновление остановлено')
def image_file(path,image): path.write_text(json.dumps({'services':{'hoppscotch':{'image':image}}},indent=2))
image_file(overlay,os.environ['IMAGE'])
image_file(save/'rollback-image.override.json',(save/'previous-image').read_text().strip())
command=['docker','compose','--project-directory',labels['com.docker.compose.project.working_dir'],'-p',labels['com.docker.compose.project']]
for f in files: command+=['-f',f]
(base/'app-compose.sh').write_text('#!/bin/sh\nexec '+shlex.join(command+['-f',str(overlay)])+' "$@"\n')
rollback='#!/bin/bash\nset -euo pipefail\n'
rollback+=shlex.join(command+['-f',str(save/'rollback-image.override.json'),'up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','hoppscotch'])+'\n'
# Pin the old local image for future starts as well, retaining all original overlays.
rollback+=shlex.join(['cp',str(save/'rollback-image.override.json'),str(overlay)])+'\n'
(save/'rollback.sh').write_text(rollback)
PY
if ! bash "$BASE/app-compose.sh" up -d --no-deps --pull never --wait --wait-timeout 180 hoppscotch; then
  echo "Сборка не запустилась. Откат: sudo bash $SAVE/rollback.sh"
  exit 1
fi
echo 'Оболочка обновлена. Откройте https://sprtapi.sprt-service.ru/?learn-app=1 — ссылка загружает новую оболочку в обход прежнего кеша навигации.'
echo "Откат оболочки: sudo bash $SAVE/rollback.sh"
