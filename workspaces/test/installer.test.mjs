import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('installer inherits all live Compose overlays and networks, including the authorization fix', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'sprt-installer-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const release = join(folder, 'release'); await mkdir(release);
  const files = ['compose.yml', 'domain.yml', 'auth-fix.yml'].map((name) => join(folder, name));
  for (const file of files) await writeFile(file, 'services: {}');
  await writeFile(join(release, 'inspect.json'), JSON.stringify([{
    Config: { Env: ['DATABASE_URL=postgresql://user:secret@db/hoppscotch'], Labels: {
      'com.docker.compose.project.config_files': files.join(','),
      'com.docker.compose.project.working_dir': folder,
      'com.docker.compose.project': 'hoppscotch',
      'traefik.docker.network': 'n8n_default',
      'traefik.http.routers.sprtapi.rule': 'Host(`sprtapi.sprt-service.ru`)',
      'traefik.http.routers.sprtapi.entrypoints': 'websecure',
      'traefik.http.routers.sprtapi.tls.certresolver': 'letsencrypt',
    } }, NetworkSettings: { Networks: { n8n_default: {}, hoppscotch_default: {} } },
  }]));
  const script = await readFile(new URL('../../deploy/install-workspaces.sh', import.meta.url), 'utf8');
  const python = script.split("python3 <<'PY'\n")[1].split('\nPY\n')[0];
  execFileSync('python3', ['-c', python], { env: { ...process.env, RELEASE: release, BASE: folder,
    APP: 'hoppscotch-hoppscotch-1', STAMP: 'test', PUBLIC_ORIGIN: 'https://sprtapi.sprt-service.ru', SPRT_TRAINING_ADMINS: 'm.demetiev@sprt-service.ru' } });
  const wrapper = await readFile(join(folder, 'app-compose.sh'), 'utf8');
  for (const file of files) assert.ok(wrapper.includes(file));
  const compose = JSON.parse(await readFile(join(release, 'compose.json'), 'utf8'));
  assert.equal(Object.keys(compose.networks).length, 2);
  assert.equal(compose.volumes['training-data'].name,'sprt-training-data');
  assert.equal(compose.services.workspaces.environment.TRAINING_SQLITE,'/var/lib/sprt-training/training.sqlite');
  assert.equal(compose.services.workspaces.labels['traefik.http.routers.sprt-workspaces.tls.certresolver'], 'letsencrypt');
  assert.equal(compose.services.workspaces.ports, undefined);
  assert.ok(!JSON.stringify(compose).includes('secret'));
  const overlay = JSON.parse(await readFile(join(folder, 'learn.override.json'), 'utf8'));
  assert.equal(overlay.services.hoppscotch.volumes[0].target, '/site/selfhost-web/learn-app');
});

test('update keeps stable SQLite volume, recovery snapshot, networks and unrelated mounts', async (t) => {
  const folder = await mkdtemp(join(tmpdir(),'sprt-update-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const old=join(folder,'old'), release=join(folder,'release');
  await mkdir(old); await mkdir(release);
  const previous={services:{workspaces:{build:{context:old},environment:{PUBLIC_ORIGIN:'https://example.test'},volumes:[
    {type:'bind',source:'/old/recovery.json',target:'/app/data/recovery.json'},
    {type:'bind',source:'/custom',target:'/custom'},
    {type:'volume',source:'training-data',target:'/var/lib/sprt-training'}]}},networks:{main:{external:true,name:'main'}}};
  await writeFile(join(old,'compose.json'),JSON.stringify(previous));
  await writeFile(join(release,'service.env'),'DATABASE_URL=postgresql://user:secret@db/hoppscotch\n');
  const script=await readFile(new URL('../../deploy/update-workspaces.sh',import.meta.url),'utf8');
  const python=script.split("python3 <<'PY'\n")[1].split('\nPY\n')[0];
  execFileSync('python3',['-c',python],{env:{...process.env,OLD:old,RELEASE:release,STAMP:'test'}});
  const updated=JSON.parse(await readFile(join(release,'compose.json'),'utf8'));
  assert.equal(updated.volumes['training-data'].name,'sprt-training-data');
  const mounts=updated.services.workspaces.volumes;
  assert.equal(mounts.filter((v)=>v.target==='/var/lib/sprt-training').length,1);
  assert.equal(mounts.find((v)=>v.target==='/app/data/recovery.json').source,join(release,'recovery.json'));
  assert.ok(mounts.some((v)=>v.target==='/custom'));
  assert.deepEqual(updated.networks,previous.networks);
  assert.equal(updated.services.workspaces.environment.TRAINING_SQLITE,'/var/lib/sprt-training/training.sqlite');
});


test('client updater retains auth/domain/training overlays and pins rollback to the previous local image', async (t) => {
  const folder=await mkdtemp(join(tmpdir(),'sprt-client-update-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const save=join(folder,'save'); await mkdir(save);
  const files=['compose.yml','auth-patch.yml','domain.yml','learn.override.json'].map(f=>join(folder,f));
  for(const f of files)await writeFile(f,'services: {}');
  await writeFile(join(save,'labels.json'),JSON.stringify({
    'com.docker.compose.project.config_files':files.join(','),
    'com.docker.compose.project.working_dir':folder,
    'com.docker.compose.project':'hoppscotch',
  }));
  await writeFile(join(save,'previous-image'),'sha256:previous-image');
  const script=await readFile(new URL('../../deploy/update-client.sh',import.meta.url),'utf8');
  const python=script.split("python3 <<'PY'\n")[1].split('\nPY\n')[0];
  execFileSync('python3',['-c',python],{env:{...process.env,BASE:folder,SAVE:save,IMAGE:'ghcr.io/mixailsh01-blip/hoppscotch-pyrus:test'}});
  const wrapper=await readFile(join(folder,'app-compose.sh'),'utf8');
  for(const f of files)assert.ok(wrapper.includes(f));
  assert.ok(wrapper.includes('client-image.override.json'));
  assert.equal(JSON.parse(await readFile(join(save,'rollback-image.override.json'),'utf8')).services.hoppscotch.image,'sha256:previous-image');
  assert.ok((await readFile(join(save,'rollback.sh'),'utf8')).includes('--pull never'));
});

test('gateway updater preserves secrets, Traefik routing and networks while preparing a pinned rollback',async(t)=>{
 const release=await mkdtemp(join(tmpdir(),'sprt-gateway-'));
 t.after(()=>rm(release,{recursive:true,force:true}));
 await writeFile(join(release,'inspect.json'),JSON.stringify([{
  Config:{Env:['IIKO_CLIENT_SECRET=private-test-secret','IIKO_APP_ID=app'],Labels:{'traefik.http.routers.iiko.rule':'Host(`sprtapi.sprt-service.ru`)','traefik.http.routers.iiko.tls.certresolver':'existing'},Cmd:['node','server.js']},
  Image:'sha256:previous',HostConfig:{RestartPolicy:{Name:'unless-stopped'},PortBindings:{}},
  NetworkSettings:{Networks:{n8n_default:{}}},Mounts:[],
 }]));
 const source=await readFile(new URL('../../deploy/update-iiko-gateway.sh',import.meta.url),'utf8');
 const python=source.split("python3 <<'PY'\n")[1].split('\nPY\n')[0];
 execFileSync('python3',['-c',python],{env:{...process.env,RELEASE:release,APP:'sprt-iiko-auth',STAMP:'test'}});
 const config=JSON.parse(await readFile(join(release,'compose.json'),'utf8'));
 assert.equal(config.services.gateway.image,'sprt-iiko-auth:test');
 assert.equal(config.services.gateway.labels['traefik.http.routers.iiko.tls.certresolver'],'existing');
 assert.equal(config.networks.net0.name,'n8n_default');
 assert.ok(!JSON.stringify(config).includes('private-test-secret'));
 assert.ok((await readFile(join(release,'gateway.env'),'utf8')).includes('IIKO_CLIENT_SECRET=private-test-secret'));
 assert.equal(JSON.parse(await readFile(join(release,'rollback.json'),'utf8')).services.gateway.image,'sha256:previous');
});
