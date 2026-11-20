#!/usr/bin/env bash
# Publish both the Yandex UI and its JSON API through the existing Traefik.
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Запустите через sudo bash'; exit 1; }
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BASE=/opt/sprt-workspaces
APP=${SPRT_APP_CONTAINER:-hoppscotch-hoppscotch-1}
ORIGIN=${PUBLIC_ORIGIN:-https://sprtapi.sprt-service.ru}
YANDEX_HOSTS=${SPRT_YANDEX_ALLOWED_HOSTS:-*.iikoweb.ru,api-ru.iiko.services}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RELEASE="$BASE/yandex-releases/$STAMP"
for command in docker python3 curl; do command -v "$command" >/dev/null; done
mkdir -p "$RELEASE"
chmod 700 "$RELEASE"
docker inspect --format '{{json .Config.Labels}}' "$APP" > "$RELEASE/labels.json"
docker inspect --format '{{json .NetworkSettings.Networks}}' "$APP" > "$RELEASE/networks.json"
OLD=$(readlink -f "$BASE/yandex-current" 2>/dev/null || true)
export RELEASE BASE ORIGIN YANDEX_HOSTS STAMP OLD
python3 <<'PY'
import json,os,shlex
from pathlib import Path
from urllib.parse import urlparse
release=Path(os.environ['RELEASE']); base=Path(os.environ['BASE'])
labels=json.loads((release/'labels.json').read_text()); networks=json.loads((release/'networks.json').read_text())
origin=os.environ['ORIGIN'].rstrip('/'); parsed=urlparse(origin)
if parsed.scheme!='https' or not parsed.hostname or parsed.path: raise SystemExit('Нужен HTTPS origin без пути')
domain=parsed.hostname
routers=[key[:-5] for key,value in labels.items() if key.startswith('traefik.http.routers.') and key.endswith('.rule') and 'Host(`'+domain+'`)' in value and 'PathPrefix' not in value]
if len(routers)!=1: raise SystemExit('Не найден однозначный router основного сайта')
router=routers[0]; entry=labels.get(router+'.entrypoints'); resolver=labels.get(router+'.tls.certresolver')
network=labels.get('traefik.docker.network') or next(iter(networks),None)
if not entry or not resolver or network not in networks: raise SystemExit('Не найдены сеть и TLS-настройки Traefik')
service={'image':'sprt-yandex:'+os.environ['STAMP'],'container_name':'sprt-yandex-proxy','restart':'unless-stopped',
 'environment':{'ALLOWED_ORIGINS':origin,'ALLOWED_HOSTS':os.environ['YANDEX_HOSTS']},'networks':['edge'],
 'labels':{'traefik.enable':'true','traefik.docker.network':network,
 'traefik.http.routers.sprt-yandex.rule':'Host(`'+domain+'`) && (PathPrefix(`/yandex/devOps`) || PathPrefix(`/yandex-app/`))',
 'traefik.http.routers.sprt-yandex.priority':'300','traefik.http.routers.sprt-yandex.entrypoints':entry,
 'traefik.http.routers.sprt-yandex.tls':'true','traefik.http.routers.sprt-yandex.tls.certresolver':resolver,
 'traefik.http.services.sprt-yandex.loadbalancer.server.port':'8080'}}
config={'name':'sprt-yandex','services':{'proxy':service},'networks':{'edge':{'external':True,'name':network}}}
(release/'compose.json').write_text(json.dumps(config,indent=2))
old=os.environ['OLD']
if old and (Path(old)/'compose.json').is_file():
 rollback=shlex.join(['docker','compose','-f',old+'/compose.json','up','-d','--pull','never','--wait','--wait-timeout','120'])+'\n'
 rollback+=shlex.join(['ln','-sfn',old,str(base/'yandex-current')])+'\n'
else:
 rollback=shlex.join(['docker','compose','-f',str(release/'compose.json'),'down'])+'\n'
 rollback+=shlex.join(['rm','-f',str(base/'yandex-current')])+'\n'
(release/'rollback.sh').write_text('#!/bin/bash\nset -euo pipefail\n'+rollback)
PY
echo 'Собираю раздел Яндекс Еды и его прокси…'
docker build -f "$ROOT/yandex-proxy/Dockerfile.web" -t "sprt-yandex:$STAMP" "$ROOT"
if ! docker compose -f "$RELEASE/compose.json" up -d --pull never --wait --wait-timeout 120; then
  echo 'Запуск не удался; возвращаю прежнее состояние…'
  bash "$RELEASE/rollback.sh"
  exit 1
fi
echo 'Проверяю маршрутизацию через HTTPS…'
for attempt in $(seq 1 15); do
 if curl -fsS --max-time 5 "$ORIGIN/yandex/devOps/health" > "$RELEASE/health.json" && python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if d.get("version")=="2026.11.20.3" else 1)' "$RELEASE/health.json" 2>/dev/null; then break; fi
 if [[ $attempt -eq 15 ]]; then echo "Не подключился HTTPS-router. Откат: sudo bash $RELEASE/rollback.sh"; exit 1; fi
 sleep 1
done
python3 - "$ORIGIN" <<'PY'
import json,sys,urllib.request,urllib.error
req=urllib.request.Request(sys.argv[1]+'/yandex/devOps',method='POST',data=b'{"type":"auth"}',headers={'Content-Type':'application/json'})
try: response=urllib.request.urlopen(req,timeout=10)
except urllib.error.HTTPError as error: response=error
with response:
 data=json.load(response)
 if response.status!=400 or data.get('error',{}).get('type')!='BAD_REQUEST': raise SystemExit('Прокси вернул неожиданный ответ; требуется проверить маршрутизацию')
print('Прокси отвечает JSON; маршрут /yandex/devOps подключён.')
PY
ln -sfn "$RELEASE" "$BASE/yandex-current"
echo "Обновление завершено: $ORIGIN/yandex-app/index.html?learn-app=1&v=$STAMP"
echo "Откат раздела: sudo bash $RELEASE/rollback.sh"
