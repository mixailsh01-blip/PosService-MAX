import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Diagnostics } from '../diagnostics.mjs';

test('diagnostic log drops bodies, cookies, errors and query strings and respects identity', () => {
  const log = new Diagnostics(2);
  log.add({ uid: 'alice', path: '/sprt/me', method: 'GET', status: 200, duration: 3,
    body: 'secret', headers: { Cookie: 'secret' }, error: 'secret' });
  log.add({ uid: 'bob', path: '/unknown?token=secret', method: 'GET', status: 404, duration: 2 });
  assert.equal(log.read('alice').length, 1);
  assert.equal(JSON.stringify(log.read('admin', true)).includes('secret'), false);
  log.add({ uid: 'bob', path: '/sprt/events', method: 'POST', status: 200, duration: 1 });
  assert.equal(log.entries.length, 2); assert.equal(log.read('alice').length, 0);
});

test('backup extractor emits progress only, decodes COPY JSON escapes and excludes credentials', () => {
  const helper = fileURLToPath(new URL('../recovery_report.py', import.meta.url));
  const python = `import importlib.util,json\nspec=importlib.util.spec_from_file_location('recovery',${JSON.stringify(helper)})\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nproperties=json.dumps({'API_KEY':'never-export','SPRT_LEARN':{'l1':True,'l2':True,'r1':True}})\nrow='u1\\t'+properties.replace('\\\\','\\\\\\\\')+'\\n'\nlines=['COPY public."UserSettings" ("userUid", properties) FROM stdin;\\n',row,'\\\\.\\n']\nprint(json.dumps(m.extract(lines)))`;
  const rows = JSON.parse(execFileSync('python3', ['-c', python], { encoding: 'utf8' }));
  assert.equal(rows[0].uid, 'u1'); assert.equal(rows[0].progress.l2, true); assert.equal(rows[0].attempt, 2);
  assert.equal(JSON.stringify(rows).includes('never-export'), false);
});
