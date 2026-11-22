#!/usr/bin/env bash
# Rebuild the installed iiko gateway from this checkout, retaining its secrets, networks and Traefik labels.
set -euo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Запустите через sudo bash'; exit 1; }
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BASE=/opt/sprt-workspaces
APP=${SPRT_IIKO_CONTAINER:-sprt-iiko-auth}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RELEASE="$BASE/gateway-releases/$STAMP"
mkdir -p "$RELEASE"
chmod 700 "$RELEASE"
docker inspect "$APP" > "$RELEASE/inspect.json"
export RELEASE APP STAMP
python3 <<'PY'
import json,os
from pathlib import Path
release=Path(os.environ['RELEASE'])
old=json.loads((release/'inspect.json').read_text())[0]
if (old['Config'].get('Labels') or {}).get('com.docker.compose.project') not in (None,'sprt-iiko-gateway'):
 raise SystemExit('Шлюз управляется другим Compose-проектом; его конфигурация требует отдельного обновления')
env=old['Config']['Env']
if any('\n' in value or '\r' in value for value in env): raise SystemExit('Многострочные env требуют отдельной обработки')
(release/'gateway.env').write_text('\n'.join(env)+'\n')
networks={f'net{i}':{'external':True,'name':name} for i,name in enumerate(old['NetworkSettings']['Networks'])}
if not networks: raise SystemExit('Не найдены сети шлюза')
volumes={}; mounts=[]
for i,v in enumerate(old.get('Mounts',[])):
 if v['Destination'] in ['/app','/app/server.js']: raise SystemExit('Исходник шлюза перекрыт mount; требуется проверить его источник')
 if v['Type']=='bind': mounts.append({'type':'bind','source':v['Source'],'target':v['Destination'],'read_only':not v['RW']})
 elif v['Type']=='volume':
  key=f'volume{i}'; volumes[key]={'external':True,'name':v['Name']}
  mounts.append({'type':'volume','source':key,'target':v['Destination'],'read_only':not v['RW']})
 else: raise SystemExit('Неподдерживаемый mount шлюза')
service={'image':'sprt-iiko-auth:'+os.environ['STAMP'],'container_name':os.environ['APP'],
 'restart':old['HostConfig']['RestartPolicy']['Name'] or 'unless-stopped',
 'env_file':[{'path':str(release/'gateway.env'),'format':'raw'}],
 'networks':list(networks),'volumes':mounts,
 'labels':{k:v for k,v in (old['Config'].get('Labels') or {}).items() if not k.startswith('com.docker.compose.')},
 'command':old['Config']['Cmd']}
ports=[]
for container_port,bindings in (old['HostConfig'].get('PortBindings') or {}).items():
 target,protocol=container_port.split('/')
 for binding in bindings or []:
  ports.append({'target':int(target),'published':binding['HostPort'],'host_ip':binding['HostIp'] or '0.0.0.0','protocol':protocol})
if ports: service['ports']=ports
config={'name':'sprt-iiko-gateway','services':{'gateway':service},'networks':networks,'volumes':volumes}
(release/'compose.json').write_text(json.dumps(config,indent=2))
service['image']=old['Image']
(release/'rollback.json').write_text(json.dumps(config,indent=2))
(release/'inspect.json').unlink()
PY
echo 'Собираю шлюз iiko с поддержкой reporting API…'
docker build -t "sprt-iiko-auth:$STAMP" "$ROOT/iiko-auth"
cat > "$RELEASE/rollback.sh" <<SH
#!/usr/bin/env bash
set -euo pipefail
docker compose -f '$RELEASE/rollback.json' up -d --pull never --wait --wait-timeout 120
SH
# All configuration and the replacement image exist before stopping the old process.
docker stop "$APP" >/dev/null
docker rm "$APP" >/dev/null
if ! docker compose -f "$RELEASE/compose.json" up -d --pull never --wait --wait-timeout 120; then
 echo 'Новый шлюз не запустился; возвращаю прежний образ…'
 bash "$RELEASE/rollback.sh"
 exit 1
fi
ln -sfn "$RELEASE" "$BASE/gateway-current"
echo 'Шлюз обновлён. Поддерживаются GET/POST на /api/…, включая /api/reporting/v1/… .'
echo "Откат шлюза: sudo bash $RELEASE/rollback.sh"
