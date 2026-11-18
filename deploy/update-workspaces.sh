#!/usr/bin/env bash
# Updates an existing installation from this checkout; no manual file copies.
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Запустите через sudo bash'; exit 1; }
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BASE=/opt/sprt-workspaces
test -L "$BASE/current"
OLD=$(readlink -f "$BASE/current")
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RELEASE="$BASE/releases/$STAMP"
test ! -e "$RELEASE"
mkdir -p "$RELEASE/iiko"
cp -R "$ROOT/workspaces" "$ROOT/learn-app" "$RELEASE/"
rm -rf "$RELEASE/workspaces/node_modules"
cp "$ROOT/iiko/"*.json "$RELEASE/iiko/"
chmod -R a+rX "$RELEASE/workspaces" "$RELEASE/learn-app" "$RELEASE/iiko"
cp "$OLD/service.env" "$RELEASE/service.env"
cp "$BASE/learn.override.json" "$RELEASE/previous-learn.override.json"
export OLD RELEASE BASE STAMP
python3 <<'PY'
import json, os
from pathlib import Path
from urllib.parse import urlparse, unquote
old=Path(os.environ['OLD']); release=Path(os.environ['RELEASE'])
config=json.loads((old/'compose.json').read_text())
service=config['services']['workspaces']
service['build']['context']=str(release)
service['image']='sprt-workspaces:'+os.environ['STAMP']
service['env_file']=[{'path':str(release/'service.env'),'format':'raw'}]
service['volumes']=[{'type':'bind','source':str(release/'recovery.json'),'target':'/app/data/recovery.json','read_only':True}]
(release/'compose.json').write_text(json.dumps(config,indent=2))
database=(release/'service.env').read_text().split('DATABASE_URL=',1)[1].splitlines()[0]
(release/'db-name').write_text(unquote(urlparse(database).path.lstrip('/')))
PY
DB_USER=$(docker exec n8n-postgres sh -c 'printf "%s" "${POSTGRES_USER:-postgres}"')
DB_NAME=$(cat "$RELEASE/db-name")
echo 'Создаю резервную копию перед обновлением…'
docker exec n8n-postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl | gzip > "$BASE/backups/$STAMP.sql.gz"
gzip -t "$BASE/backups/$STAMP.sql.gz"
BACKUP=${SPRT_RECOVERY_BACKUP:-$(find "$BASE/backups" -maxdepth 1 -name '*.sql.gz' | sort | head -n 1)}
python3 "$ROOT/workspaces/recovery_report.py" "$BACKUP" > "$RELEASE/recovery.json"
chmod 644 "$RELEASE/recovery.json"
python3 - "$RELEASE/recovery.json" <<'PY'
import json,sys
print('Найдено прежних прогрессов в резервной копии:',len(json.load(open(sys.argv[1]))))
PY
cat > "$RELEASE/rollback.sh" <<SH
#!/usr/bin/env bash
set -euo pipefail
docker compose -f '$OLD/compose.json' up -d --wait --wait-timeout 120
cp '$RELEASE/previous-learn.override.json' '$BASE/learn.override.json'
bash '$BASE/app-compose.sh' up -d --no-deps --pull never --wait --wait-timeout 120 hoppscotch
ln -sfn '$OLD' '$BASE/current'
SH
echo 'Собираю обновление…'
docker compose -f "$RELEASE/compose.json" up -d --build --wait --wait-timeout 120
python3 <<'PY'
import json,os
from pathlib import Path
path=Path(os.environ['BASE'])/'learn.override.json'
config=json.loads(path.read_text())
for volume in config['services']['hoppscotch']['volumes']:
 if volume.get('target')=='/site/selfhost-web/learn-app': volume['source']=os.environ['RELEASE']+'/learn-app'
path.write_text(json.dumps(config,indent=2))
PY
bash "$BASE/app-compose.sh" up -d --no-deps --pull never --wait --wait-timeout 120 hoppscotch
ln -sfn "$RELEASE" "$BASE/current"
echo 'Обновление завершено. Обновите страницу обучения.'
echo 'Диагностика: https://sprtapi.sprt-service.ru/sprt/settings'
echo "Откат этой версии: sudo bash $RELEASE/rollback.sh"
