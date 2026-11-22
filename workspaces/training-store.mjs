import { DatabaseSync, backup } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { LESSONS, progressOnly, complete, HttpError } from './domain.mjs';

const asDate = (value) => value == null ? null : new Date(value).toISOString();
export class TrainingStore {
  constructor(path) {
    if (!path) throw new Error('TRAINING_SQLITE is required');
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA busy_timeout=15000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS training(user_uid TEXT PRIMARY KEY,progress TEXT NOT NULL DEFAULT '{}',
        attempt INTEGER NOT NULL DEFAULT 1 CHECK(attempt>=1),legacy INTEGER NOT NULL DEFAULT 0,
        started_at TEXT,updated_at TEXT,completed_at TEXT,recovery_checked INTEGER NOT NULL DEFAULT 0,recovered_from TEXT);
      CREATE TABLE IF NOT EXISTS event(id TEXT PRIMARY KEY,user_uid TEXT NOT NULL REFERENCES training(user_uid),
        attempt INTEGER NOT NULL,kind TEXT NOT NULL,lesson_id TEXT,passed INTEGER,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS event_user_date ON event(user_uid,created_at);`);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  instance() { return this.db.prepare("SELECT value FROM meta WHERE key='instance'").get()?.value || null; }
  ensure(uid) { this.db.prepare('INSERT INTO training(user_uid) VALUES (?) ON CONFLICT DO NOTHING').run(uid); }
  get(uid) {
    const row = this.db.prepare('SELECT * FROM training WHERE user_uid=?').get(uid);
    return row ? { ...row, progress: progressOnly(JSON.parse(row.progress)), legacy: !!row.legacy, recovery_checked: !!row.recovery_checked } : null;
  }
  importLegacy(states, events, users) {
    return this.transaction(() => {
      if (this.instance()) return;
      for (const user of users) {
        let properties = user.properties;
        if (typeof properties === 'string') { try { properties = JSON.parse(properties); } catch { properties = {}; } }
        const old = states.find((s) => s.user_uid === user.uid);
        const cached = properties?.SPRT_LEARN || {};
        const progress = progressOnly(old ? old.progress : cached);
        const attempt = old?.attempt || Object.keys(cached).filter((k) => /^r\d+$/.test(k) && cached[k] === true).length + 1;
        this.db.prepare(`INSERT INTO training VALUES (?,?,?,?,?,?,?,?,?)`).run(user.uid, JSON.stringify(progress), attempt,
          Number(old ? old.legacy : Object.values(progress).some(Boolean)), asDate(old?.started_at), asDate(old?.updated_at),
          asDate(old?.completed_at), Number(old?.recovery_checked || false), old?.recovered_from || null);
      }
      for (const e of events) {
        if (!this.get(e.user_uid)) continue;
        this.db.prepare('INSERT INTO event VALUES (?,?,?,?,?,?,?)').run(e.id,e.user_uid,e.attempt,e.kind,e.lesson_id,e.passed == null ? null : Number(e.passed),asDate(e.created_at));
      }
      this.db.prepare("INSERT INTO meta VALUES ('instance',?)").run(randomUUID());
    });
  }
  counts(uid) { return this.db.prepare('SELECT kind,count(*) AS count FROM event WHERE user_uid=? GROUP BY kind').all(uid).map((r) => ({ ...r })); }
  events(uid) { return this.db.prepare('SELECT kind,lesson_id,passed,attempt,created_at FROM event WHERE user_uid=? ORDER BY created_at DESC,rowid DESC LIMIT 200').all(uid).map((e) => ({ ...e, passed: e.passed == null ? null : !!e.passed })); }
  recover(uid, input, source = 'browser') {
    if (!input || typeof input.progress !== 'object' || input.progress === null || Array.isArray(input.progress) ||
      !Number.isInteger(input.attempt) || input.attempt < 1 || input.attempt > 10000) throw new HttpError(400, 'Неверный сохранённый прогресс');
    return this.transaction(() => {
      const state = this.get(uid);
      if (!state) throw new HttpError(503, 'Обучение ещё не подготовлено');
      const reset = this.db.prepare("SELECT id FROM event WHERE user_uid=? AND kind='reset' LIMIT 1").get(uid);
      if (reset || (source === 'browser' && state.recovery_checked)) return { progress: state.progress, attempt: state.attempt, restored: false };
      const old = progressOnly(input.progress);
      let gap = false;
      for (const lesson of LESSONS) { if (!old[lesson]) gap = true; else if (gap) throw new HttpError(400, 'Некорректный порядок сохранённых заданий'); }
      const progress = Object.fromEntries(LESSONS.map((key) => [key, state.progress[key] || old[key]]));
      const restored = LESSONS.some((key) => progress[key] && !state.progress[key]);
      const attempt = restored ? Math.max(input.attempt, state.attempt) : state.attempt;
      this.db.prepare('UPDATE training SET progress=?,attempt=?,recovery_checked=?,recovered_from=?,legacy=? WHERE user_uid=?').run(
        JSON.stringify(progress),attempt,Number(state.recovery_checked || (source === 'browser' && Object.values(old).some(Boolean))),
        restored ? source : state.recovered_from,Number(state.legacy || restored),uid);
      if (restored) this.db.prepare('INSERT INTO event VALUES (?,?,?,?,?,?,?)').run(randomUUID(),uid,attempt,'recovery',null,null,new Date().toISOString());
      return { progress, attempt, restored };
    });
  }
  record(uid, input) {
    if (!input || !['lesson','reset','attempt'].includes(input.kind)) throw new HttpError(400, 'Неверное событие');
    if (input.kind !== 'reset' && !LESSONS.includes(input.lesson)) throw new HttpError(400, 'Неизвестное задание');
    if (input.kind === 'lesson' && input.passed !== true || input.kind === 'attempt' && typeof input.passed !== 'boolean') throw new HttpError(400, 'Неверный результат');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id || '')) throw new HttpError(400, 'Неверный ID события');
    return this.transaction(() => {
      const prior = this.db.prepare('SELECT user_uid FROM event WHERE id=?').get(input.id);
      if (prior && prior.user_uid !== uid) throw new HttpError(409, 'ID события уже использован');
      const state = this.get(uid);
      if (!state) throw new HttpError(503, 'Обучение ещё не подготовлено');
      if (prior) return { progress: state.progress, attempt: state.attempt };
      if (input.attempt !== state.attempt) throw new HttpError(409, 'Попытка изменилась. Обновите страницу.');
      let progress = progressOnly(state.progress), attempt = state.attempt;
      const reset = input.kind === 'reset', now = new Date().toISOString();
      if (reset) { progress = progressOnly({}); attempt++; }
      if (input.kind === 'lesson') {
        const index = LESSONS.indexOf(input.lesson);
        if (index && !progress[LESSONS[index-1]]) throw new HttpError(409, 'Сначала выполните предыдущее задание');
        progress[input.lesson] = true;
      }
      this.db.prepare('INSERT INTO event VALUES (?,?,?,?,?,?,?)').run(input.id,uid,attempt,input.kind,input.lesson || null,reset ? null : Number(input.passed),now);
      this.db.prepare('UPDATE training SET progress=?,attempt=?,updated_at=?,legacy=?,started_at=?,completed_at=? WHERE user_uid=?').run(
        JSON.stringify(progress),attempt,now,Number(reset ? false : state.legacy),reset ? null : state.started_at || now,
        reset ? null : state.completed_at || (input.kind === 'lesson' && !complete(state.progress) && complete(progress) ? now : null),uid);
      return { progress, attempt };
    });
  }
  async backup(path) { await backup(this.db, path); chmodSync(path, 0o600); }
  close() { this.db.close(); }
}
