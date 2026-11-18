import { randomUUID, createHash } from 'node:crypto';

export const LESSONS = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];
export const LIBRARY = 'sprt-library-v1';
export const VERSION = '2026.11.18.3';
export const normalizedEmail = (email) => String(email || '').trim().toLowerCase();
const id = (prefix, uid) => `sprt-${prefix}-${createHash('sha256').update(uid).digest('hex').slice(0, 24)}`;
const progressOnly = (value) => Object.fromEntries(LESSONS.map((key) => [key, value?.[key] === true]));
export const complete = (value) => LESSONS.every((key) => value[key] === true);
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export class Workspaces {
  constructor(pool, { admins, collection, environment }) {
    this.pool = pool;
    this.admins = admins.map(normalizedEmail).filter(Boolean);
    if (!this.admins.length) throw new Error('SPRT_TRAINING_ADMINS must not be empty');
    this.collection = collection;
    this.environment = environment;
  }
  isAdmin(user) { return this.admins.includes(normalizedEmail(user.email)); }
  async transaction(fn) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Serialize reconciliation and training updates, including multiple replicas.
      await db.query('SELECT pg_advisory_xact_lock(7519562)');
      const result = await fn(db);
      await db.query('COMMIT');
      return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
  async user(db, uid) {
    const { rows } = await db.query('SELECT uid, email, "displayName" FROM "User" WHERE uid=$1', [uid]);
    if (!rows[0]?.email) throw new HttpError(401, 'Войдите в SPRT API');
    return rows[0];
  }
  async membership(db, team, uid, role) {
    await db.query(`INSERT INTO "TeamMember"(id, role, "userUid", "teamID") VALUES ($1,$2,$3,$4)
      ON CONFLICT ("teamID","userUid") DO UPDATE SET role=EXCLUDED.role`, [randomUUID(), role, uid, team]);
  }
  async insertCollection(db, collection, team, parent = null, index = 1) {
    const cid = randomUUID();
    const data = Object.fromEntries(['auth','headers','variables','description','preRequestScript','testScript']
      .filter((key) => collection[key] !== undefined).map((key) => [key, collection[key]]));
    await db.query(`INSERT INTO "TeamCollection"(id,"parentID","teamID",title,"orderIndex",data,"updatedOn")
      VALUES ($1,$2,$3,$4,$5,$6,now())`, [cid, parent, team, collection.name, index, JSON.stringify(data)]);
    for (const [i, request] of (collection.requests || []).entries()) {
      await db.query(`INSERT INTO "TeamRequest"(id,"collectionID","teamID",title,request,"orderIndex","updatedOn")
        VALUES ($1,$2,$3,$4,$5,$6,now())`, [randomUUID(), cid, team, request.name, JSON.stringify(request), i + 1]);
    }
    for (const [i, child] of (collection.folders || []).entries()) await this.insertCollection(db, child, team, cid, i + 1);
  }
  async reconcile() {
    return this.transaction(async (db) => {
      const { rows: users } = await db.query('SELECT uid,email FROM "User" WHERE email IS NOT NULL ORDER BY uid');
      const admins = users.filter((u) => this.isAdmin(u));
      if (!admins.length) throw new Error('No registered training administrator: refusing to change memberships');
      await db.query('INSERT INTO "Team"(id,name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING', [LIBRARY, 'Библиотека СПРТ']);
      const { rows: roots } = await db.query('SELECT id FROM "TeamCollection" WHERE "teamID"=$1 AND "parentID" IS NULL', [LIBRARY]);
      // Seed once; later edits by the librarian remain authoritative for everybody.
      if (!roots.length) await this.insertCollection(db, this.collection, LIBRARY);
      for (const user of users) {
        await this.membership(db, LIBRARY, user.uid, this.isAdmin(user) ? 'OWNER' : 'VIEWER');
        let { rows: mappings } = await db.query('SELECT * FROM sprt.workspace WHERE user_uid=$1', [user.uid]);
        let mapping = mappings[0];
        if (!mapping) {
          const local = user.email.split('@')[0];
          const { rows: work } = await db.query(`SELECT t.id FROM "Team" t JOIN "TeamMember" m ON m."teamID"=t.id
            WHERE m."userUid"=$1 AND t.name IN ($2,$3)`, [user.uid, `SPRT-Service · ${local}`, `Папка: ${user.email}`]);
          if (work.length > 1) throw new Error(`Multiple legacy workspaces for ${user.uid}; manual review required`);
          // A legacy training name uses only the email prefix. Do not adopt it when ambiguous.
          const ambiguous = users.filter((u) => u.email.split('@')[0] === local).length > 1;
          const { rows: training } = ambiguous ? { rows: [] } : await db.query(
            'SELECT id FROM "Team" WHERE name=$1 AND id NOT IN (SELECT training_team FROM sprt.workspace)', [`Обучение · ${local}`]);
          if (training.length > 1) throw new Error(`Multiple legacy training spaces for ${user.uid}; manual review required`);
          mapping = { work_team: work[0]?.id || id('work', user.uid), training_team: training[0]?.id || id('learn', user.uid) };
          for (const [team, name] of [[mapping.work_team, `Рабочее · ${user.email}`], [mapping.training_team, `Обучение · ${user.email}`]]) {
            await db.query('INSERT INTO "Team"(id,name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING', [team, name]);
          }
          await db.query('INSERT INTO sprt.workspace(user_uid,work_team,training_team) VALUES ($1,$2,$3)', [user.uid, mapping.work_team, mapping.training_team]);
        }
        await this.membership(db, mapping.work_team, user.uid, 'OWNER');
        await db.query('DELETE FROM "TeamMember" WHERE "teamID"=$1 AND "userUid"<>$2', [mapping.work_team, user.uid]);
        await this.membership(db, mapping.training_team, user.uid, this.isAdmin(user) ? 'OWNER' : 'EDITOR');
        for (const admin of admins) await this.membership(db, mapping.training_team, admin.uid, 'OWNER');
        await db.query('DELETE FROM "TeamMember" WHERE "teamID"=$1 AND NOT ("userUid"=ANY($2::text[]))',
          [mapping.training_team, [...new Set([user.uid, ...admins.map((a) => a.uid)])]]);
        // Copy the employee's existing environment to their personal environment store once.
        // No keys ever enter the shared library or another employee's workspace.
        const { rows: personal } = await db.query('SELECT id FROM "UserEnvironment" WHERE "userUid"=$1 AND name=$2', [user.uid, this.environment.name]);
        if (!personal.length) {
          const { rows: old } = await db.query('SELECT variables FROM "TeamEnvironment" WHERE "teamID"=$1 AND name=$2 LIMIT 1', [mapping.work_team, this.environment.name]);
          await db.query('INSERT INTO "UserEnvironment"(id,"userUid",name,variables,"isGlobal") VALUES ($1,$2,$3,$4,false)',
            [randomUUID(), user.uid, this.environment.name, JSON.stringify(old[0]?.variables || this.environment.variables)]);
        }
        const { rows: settings } = await db.query('SELECT properties FROM "UserSettings" WHERE "userUid"=$1', [user.uid]);
        let properties = settings[0]?.properties;
        if (typeof properties === 'string') { try { properties = JSON.parse(properties); } catch { properties = {}; } }
        const legacy = progressOnly(properties?.SPRT_LEARN);
        const resets = Object.keys(properties?.SPRT_LEARN || {}).filter((k) => /^r\d+$/.test(k) && properties.SPRT_LEARN[k] === true).length;
        await db.query(`INSERT INTO sprt.training(user_uid,progress,legacy,attempt) VALUES ($1,$2,$3,$4)
          ON CONFLICT (user_uid) DO NOTHING`, [user.uid, JSON.stringify(legacy), Object.values(legacy).some(Boolean), resets + 1]);
      }
      await db.query('DELETE FROM "TeamMember" WHERE "teamID"=$1 AND "userUid" NOT IN (SELECT uid FROM "User" WHERE email IS NOT NULL)', [LIBRARY]);
      return users.length;
    });
  }
  async me(uid) {
    const user = await this.user(this.pool, uid);
    const { rows } = await this.pool.query(`SELECT w.work_team,w.training_team,t.progress,t.attempt
      FROM sprt.workspace w JOIN sprt.training t ON t.user_uid=w.user_uid WHERE w.user_uid=$1`, [uid]);
    if (!rows[0]) throw new HttpError(503, 'Рабочие пространства готовятся. Повторите через минуту.');
    return { uid, email: user.email, admin: this.isAdmin(user), library: LIBRARY, ...rows[0] };
  }
  async syncSettings(db, uid, progress, attempt) {
    const { rows } = await db.query('SELECT properties FROM "UserSettings" WHERE "userUid"=$1 FOR UPDATE', [uid]);
    let properties = rows[0]?.properties || {};
    if (typeof properties === 'string') { try { properties = JSON.parse(properties); } catch { properties = {}; } }
    const markers = Object.fromEntries(Array.from({ length: attempt - 1 }, (_, i) => [`r${i + 1}`, true]));
    properties.SPRT_LEARN = { ...markers, ...progress };
    await db.query(`INSERT INTO "UserSettings"(id,"userUid",properties,"updatedOn") VALUES ($1,$2,$3,now())
      ON CONFLICT ("userUid") DO UPDATE SET properties=EXCLUDED.properties,"updatedOn"=now()`, [randomUUID(), uid, JSON.stringify(properties)]);
  }
  async recover(uid, input, source = 'browser') {
    if (!input || typeof input.progress !== 'object' || input.progress === null || Array.isArray(input.progress) ||
      !Number.isInteger(input.attempt) || input.attempt < 1 || input.attempt > 10000) throw new HttpError(400, 'Неверный сохранённый прогресс');
    return this.transaction(async (db) => {
      await this.user(db, uid);
      const { rows } = await db.query('SELECT * FROM sprt.training WHERE user_uid=$1 FOR UPDATE', [uid]);
      const state = rows[0];
      if (!state) throw new HttpError(503, 'Обучение ещё не подготовлено');
      const { rows: resets } = await db.query("SELECT id FROM sprt.event WHERE user_uid=$1 AND kind='reset' LIMIT 1", [uid]);
      // Never resurrect an earlier course after an explicit reset, or import a
      // second browser's cache after this browser migration has been checked.
      if (resets.length || (source === 'browser' && state.recovery_checked)) return { progress: state.progress, attempt: state.attempt, restored: false };
      const old = progressOnly(input.progress);
      // Old exercises are sequential. Reject malformed/non-prefix cached flags.
      let gap = false;
      for (const lesson of LESSONS) { if (!old[lesson]) gap = true; else if (gap) throw new HttpError(400, 'Некорректный порядок сохранённых заданий'); }
      const merged = Object.fromEntries(LESSONS.map((key) => [key, state.progress[key] === true || old[key]]));
      const restored = LESSONS.some((key) => merged[key] && !state.progress[key]);
      const attempt = restored ? Math.max(input.attempt, state.attempt) : state.attempt;
      await db.query(`UPDATE sprt.training SET progress=$2,attempt=$3,
        recovery_checked=CASE WHEN $4='browser' AND $6 THEN true ELSE recovery_checked END,
        recovered_from=CASE WHEN $5 THEN $4 ELSE recovered_from END,
        legacy=CASE WHEN $5 THEN true ELSE legacy END WHERE user_uid=$1`, [uid, JSON.stringify(merged), attempt, source, restored, Object.values(old).some(Boolean)]);
      if (restored) {
        await db.query(`INSERT INTO sprt.event(id,user_uid,attempt,kind) VALUES ($1,$2,$3,'recovery')`, [randomUUID(), uid, attempt]);
        await this.syncSettings(db, uid, merged, attempt);
      }
      // A recovery timestamp is not a historical course completion timestamp.
      return { progress: merged, attempt, restored };
    });
  }
  async debug(uid, target) {
    const actor = await this.user(this.pool, uid);
    if (target && target !== uid && !this.isAdmin(actor)) throw new HttpError(403, 'Чужая диагностика недоступна');
    const selected = target || uid;
    const account = await this.user(this.pool, selected);
    const { rows } = await this.pool.query('SELECT * FROM sprt.training WHERE user_uid=$1', [selected]);
    const { rows: settings } = await this.pool.query('SELECT properties FROM "UserSettings" WHERE "userUid"=$1', [selected]);
    let properties = settings[0]?.properties;
    if (typeof properties === 'string') { try { properties = JSON.parse(properties); } catch { properties = {}; } }
    const { rows: counts } = await this.pool.query(`SELECT kind,count(*)::int AS count FROM sprt.event WHERE user_uid=$1 GROUP BY kind`, [selected]);
    return { version: VERSION, account: { uid: account.uid, email: account.email },
      training: rows[0] || null, settingsProgress: progressOnly(properties?.SPRT_LEARN), events: counts,
      admin: this.isAdmin(actor), note: 'Only training metadata; no credentials or request bodies' };
  }
  async record(uid, input) {
    if (!input || !['lesson','reset','attempt'].includes(input.kind)) throw new HttpError(400, 'Неверное событие');
    if (input.kind !== 'reset' && !LESSONS.includes(input.lesson)) throw new HttpError(400, 'Неизвестное задание');
    if (input.kind === 'lesson' && input.passed !== true) throw new HttpError(400, 'Неверный результат');
    if (input.kind === 'attempt' && typeof input.passed !== 'boolean') throw new HttpError(400, 'Неверный результат');
    // The client must provide a UUID: retries reuse it and never duplicate/reset twice.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id || '')) throw new HttpError(400, 'Неверный ID события');
    return this.transaction(async (db) => {
      await this.user(db, uid);
      const { rows: prior } = await db.query('SELECT user_uid FROM sprt.event WHERE id=$1', [input.id]);
      if (prior.length && prior[0].user_uid !== uid) throw new HttpError(409, 'ID события уже использован');
      const { rows } = await db.query('SELECT * FROM sprt.training WHERE user_uid=$1 FOR UPDATE', [uid]);
      const state = rows[0];
      if (!state) throw new HttpError(503, 'Обучение ещё не подготовлено');
      if (prior.length) return { progress: state.progress, attempt: state.attempt };
      if (input.attempt !== state.attempt) throw new HttpError(409, 'Попытка изменилась. Обновите страницу.');
      let progress = progressOnly(state.progress);
      let attempt = state.attempt;
      if (input.kind === 'reset') { progress = progressOnly({}); attempt += 1; }
      if (input.kind === 'lesson') {
        const index = LESSONS.indexOf(input.lesson);
        if (index && !progress[LESSONS[index - 1]]) throw new HttpError(409, 'Сначала выполните предыдущее задание');
        progress[input.lesson] = true;
      }
      await db.query(`INSERT INTO sprt.event(id,user_uid,attempt,kind,lesson_id,passed) VALUES ($1,$2,$3,$4,$5,$6)`,
        [input.id, uid, attempt, input.kind, input.lesson || null, input.kind === 'reset' ? null : input.passed]);
      await db.query(`UPDATE sprt.training SET progress=$2,attempt=$3,updated_at=now(),
        legacy=CASE WHEN $4 THEN false ELSE legacy END,
        started_at=CASE WHEN $4 THEN NULL ELSE coalesce(started_at,now()) END,
        completed_at=CASE WHEN $4 THEN NULL WHEN $5 THEN coalesce(completed_at,now()) ELSE completed_at END
        WHERE user_uid=$1`, [uid, JSON.stringify(progress), attempt, input.kind === 'reset', input.kind === 'lesson' && !complete(state.progress) && complete(progress)]);
      // Keep the original frontend gate in sync, without replacing any other settings.
      await this.syncSettings(db, uid, progress, attempt);
      return { progress, attempt };
    });
  }
  async report(uid, target) {
    const user = await this.user(this.pool, uid);
    if (!this.isAdmin(user)) throw new HttpError(403, 'Доступ только администратору обучения');
    const { rows } = await this.pool.query(`SELECT u.uid,u.email,u."displayName" AS name,t.progress,t.attempt,
      t.legacy,t.started_at,t.updated_at,t.completed_at,
      (SELECT count(*)::int FROM sprt.event e WHERE e.user_uid=u.uid AND e.kind='attempt') AS requests
      FROM "User" u JOIN sprt.training t ON t.user_uid=u.uid
      WHERE ($1::text IS NULL OR u.uid=$1) ORDER BY u.email`, [target || null]);
    if (target && !rows.length) throw new HttpError(404, 'Сотрудник не найден');
    if (!target) return { employees: rows, lessons: LESSONS };
    const events = await this.pool.query('SELECT kind,lesson_id,passed,attempt,created_at FROM sprt.event WHERE user_uid=$1 ORDER BY created_at DESC LIMIT 200', [target]);
    return { employee: rows[0], lessons: LESSONS, events: events.rows };
  }
}
