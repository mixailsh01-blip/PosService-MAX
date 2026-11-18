import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

test('client serializes reset and later events; transient retries reuse their event ID', async () => {
  const source = await readFile(new URL('../public/training-client.js', import.meta.url), 'utf8');
  const calls = []; let transient = true; let attempt = 1;
  const status = { textContent: '', setAttribute() {} };
  const window = { addEventListener() {} };
  vm.runInNewContext(source, { window, crypto: { randomUUID }, document: { getElementById: () => status },
    setTimeout: (fn) => fn(), fetch: async (url, opts) => {
      if (url.endsWith('/me')) return { ok: true, json: async () => ({ attempt, progress: {} }) };
      const event = JSON.parse(opts.body); calls.push(event);
      if (transient) { transient = false; throw new Error('Network'); }
      assert.equal(event.attempt, attempt);
      if (event.kind === 'reset') attempt++;
      return { ok: true, json: async () => ({ attempt, progress: {} }) };
    } });
  await window.SPRTTraining.init();
  const first = window.SPRTTraining.record('attempt', 'l1', false);
  const second = window.SPRTTraining.record('reset');
  const third = window.SPRTTraining.record('lesson', 'l1', true);
  await Promise.all([first, second, third]);
  assert.equal(calls.length, 4); assert.equal(calls[0].id, calls[1].id);
  assert.equal(calls[3].attempt, 2);
  assert.equal(status.textContent, 'Прогресс сохранён на сервере');
  assert.ok(calls.every((event) => !('body' in event) && !('headers' in event)));
});
