import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const patch = await readFile(new URL('../../hoppscotch-pyrus/pyrus-login.patch', import.meta.url), 'utf8');
const section = patch.split('diff --git ').find((s) => s.startsWith('a/packages/hoppscotch-backend/src/auth/pyrus-allowlist.service.ts '));
const source = section.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1)).join('\n')
  .replace("import { Injectable, Logger, OnModuleInit } from '@nestjs/common';", 'class Logger { error() {} log() {} warn() {} }')
  .replace('@Injectable()\n', '');
const js = stripTypeScriptTypes(source, { mode: 'transform' });
const { PyrusAllowlistService } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('source patch creates login task with authorization type resolved by label', async () => {
  const service = new PyrusAllowlistService();
  Object.defineProperty(service, 'enabled', { value: true });
  service.memberIds.set('employee@example.com', 42);
  service.cached = { token: 'mock-token', apiUrl: 'https://mock.invalid/v4/', at: Date.now() };
  let task;
  service.request = async (url, opts) => {
    if (url.endsWith('/tasks')) { task = JSON.parse(opts.body); return {}; }
    return { fields: [{ id: 1, info: { fields: [{ id: 8, type: 'multiple_choice', info: { options: [
      { choice_id: 3, choice_value: 'Просроченный обед' },
      { choice_id: 19, choice_value: 'Авторизация на API портал' },
    ] } }] } }] };
  };
  assert.equal(await service.notifyLogin('employee@example.com', 'https://portal.invalid/enter?token=test-pin'), true);
  assert.deepEqual(task.fields[0].value, { choice_ids: [19] });
  assert.equal(task.fields[3].value, 'test-pin');
  service.request = async () => ({ fields: [] });
  assert.equal(await service.notifyLogin('employee@example.com', 'https://portal.invalid/enter?token=test-pin'), false);
});
