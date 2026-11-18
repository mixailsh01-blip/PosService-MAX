#!/usr/bin/env bash
# Run on the production server: sudo bash deploy/install-workspaces.sh
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Запустите через sudo bash'; exit 1; }
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BASE=/opt/sprt-workspaces
APP=${SPRT_APP_CONTAINER:-hoppscotch-hoppscotch-1}
PG=${SPRT_POSTGRES_CONTAINER:-n8n-postgres}
export SPRT_TRAINING_ADMINS=${SPRT_TRAINING_ADMINS:-m.demetiev@sprt-service.ru}
export PUBLIC_ORIGIN=${PUBLIC_ORIGIN:-https://sprtapi.sprt-service.ru}
[[ ! -e "$BASE/current" ]] || { echo "Установка уже существует: $BASE/current. Повторный запуск остановлен."; exit 1; }
for command in docker python3 gzip; do command -v "$command" >/dev/null; done
test -s "$ROOT/workspaces/package-lock.json"
test -s "$ROOT/iiko/iiko-cloud-api.collection.json"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RELEASE="$BASE/releases/$STAMP"
mkdir -p "$RELEASE" "$BASE/backups"
chmod 700 "$BASE" "$BASE/backups"
cp -R "$ROOT/workspaces" "$ROOT/learn-app" "$RELEASE/"
rm -rf "$RELEASE/workspaces/node_modules"
mkdir -p "$RELEASE/iiko"
cp "$ROOT/iiko/"*.json "$RELEASE/iiko/"
# The image needs readable static files; credentials and backups remain root-only.
chmod -R a+rX "$RELEASE/workspaces" "$RELEASE/learn-app" "$RELEASE/iiko"
docker inspect "$APP" > "$RELEASE/inspect.json"
export RELEASE BASE APP STAMP
python3 <<'PY'
import json, os, shlex
from pathlib import Path
release=Path(os.environ['RELEASE']); base=Path(os.environ['BASE'])
container=json.loads((release/'inspect.json').read_text())[0]
labels=container['Config']['Labels']; env=dict(item.split('=',1) for item in container['Config']['Env'] if '=' in item)
database=env.get('DATABASE_URL')
if not database or '\n' in database: raise SystemExit('DATABASE_URL не найден')
origin=os.environ['PUBLIC_ORIGIN'].rstrip('/')
from urllib.parse import urlparse, unquote
parsed=urlparse(origin)
if parsed.scheme!='https' or not parsed.hostname: raise SystemExit('Нужен HTTPS PUBLIC_ORIGIN')
domain=parsed.hostname
routers=[key[:-5] for key,value in labels.items() if key.startswith('traefik.http.routers.') and key.endswith('.rule') and 'Host(`'+domain+'`)' in value and 'PathPrefix' not in value]
if len(routers)!=1: raise SystemExit('Не найден однозначный HTTPS router приложения')
router=routers[0]; entry=labels.get(router+'.entrypoints'); resolver=labels.get(router+'.tls.certresolver')
if not entry or not resolver: raise SystemExit('Не найдены entrypoint и certresolver Traefik')
files=labels.get('com.docker.compose.project.config_files','').split(',')
if not all(files) or not all(Path(file).is_file() for file in files): raise SystemExit('Не найдены текущие Compose-файлы')
directory=labels.get('com.docker.compose.project.working_dir','/opt/hoppscotch')
project=labels.get('com.docker.compose.project','hoppscotch')
networks=list(container['NetworkSettings']['Networks'])
network_defs={'net'+str(i):{'external':True,'name':name} for i,name in enumerate(networks)}
route_network=labels.get('traefik.docker.network', networks[0])
service={
 'build':{'context':str(release),'dockerfile':'workspaces/Dockerfile'},
 'image':'sprt-workspaces:'+os.environ['STAMP'], 'container_name':'sprt-workspaces', 'restart':'unless-stopped',
 'env_file':[{'path':str(release/'service.env'),'format':'raw'}],
 'environment':{'PUBLIC_ORIGIN':origin,'SPRT_TRAINING_ADMINS':os.environ['SPRT_TRAINING_ADMINS'],
   'HOPPSCOTCH_GQL':'http://'+os.environ['APP']+':80/backend/graphql'},
 'networks':list(network_defs),
 'labels':{'traefik.enable':'true','traefik.docker.network':route_network,
   'traefik.http.routers.sprt-workspaces.rule':'Host(`'+domain+'`) && PathPrefix(`/sprt/`)',
   'traefik.http.routers.sprt-workspaces.entrypoints':entry,
   'traefik.http.routers.sprt-workspaces.tls':'true',
   'traefik.http.routers.sprt-workspaces.tls.certresolver':resolver,
   'traefik.http.routers.sprt-workspaces.priority':'100',
   'traefik.http.services.sprt-workspaces.loadbalancer.server.port':'8082'}}
(release/'service.env').write_text('DATABASE_URL='+database+'\n')
(release/'compose.json').write_text(json.dumps({'name':'sprt-workspaces','services':{'workspaces':service},'networks':network_defs},indent=2))
overlay=base/'learn.override.json'
overlay.write_text(json.dumps({'services':{'hoppscotch':{'volumes':[{'type':'bind','source':str(release/'learn-app'),'target':'/site/selfhost-web/learn-app','read_only':True}]}}},indent=2))
command=['docker','compose','--project-directory',directory,'-p',project]
for file in files: command+=['-f',file]
(release/'previous-app-compose.sh').write_text('#!/bin/sh\nexec '+shlex.join(command)+' "$@"\n')
command+=['-f',str(overlay)]
(base/'app-compose.sh').write_text('#!/bin/sh\nexec '+shlex.join(command)+' "$@"\n')
(release/'db-name').write_text(unquote(urlparse(database).path.lstrip('/')))
(release/'inspect.json').unlink()
PY
DB_NAME=$(cat "$RELEASE/db-name")
DB_USER=$(docker exec "$PG" sh -c 'printf "%s" "${POSTGRES_USER:-postgres}"')
echo 'Создаю резервную копию базы Hoppscotch…'
docker exec "$PG" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl | gzip > "$BASE/backups/$STAMP.sql.gz"
gzip -t "$BASE/backups/$STAMP.sql.gz"
echo 'Собираю и запускаю сервис пространств…'
docker compose -f "$RELEASE/compose.json" up -d --build --wait --wait-timeout 120
echo 'Подключаю обновлённый тренажёр; текущие Compose-файлы и патч авторизации сохранены…'
bash "$BASE/app-compose.sh" up -d --no-deps --pull never --wait --wait-timeout 120 hoppscotch
ln -s "$RELEASE" "$BASE/current"
echo "Установка завершена. Обновите страницу SPRT API."
echo "Обучение сотрудников: $PUBLIC_ORIGIN/sprt/training"
echo "Для дальнейшего управления приложением: sudo bash $BASE/app-compose.sh <команда>"
echo "Резервная копия: $BASE/backups/$STAMP.sql.gz"
