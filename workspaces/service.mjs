import { randomUUID, createHash } from 'node:crypto';

import { LESSONS, LIBRARY, VERSION, normalizedEmail, progressOnly, HttpError } from './domain.mjs';
export { LESSONS, LIBRARY, VERSION, normalizedEmail, complete, HttpError } from './domain.mjs';
const id = (prefix, uid) => `sprt-${prefix}-${createHash('sha256').update(uid).digest('hex').slice(0, 24)}`;

export class Workspaces {
  constructor(pool, { admins, collection, environment, training }) {
    this.pool = pool;
    if (!training) throw new Error('SQLite training store is required');
    this.training = training;
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
    const users = await this.transaction(async (db) => {
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

      }
      await db.query('DELETE FROM "TeamMember" WHERE "teamID"=$1 AND "userUid" NOT IN (SELECT uid FROM "User" WHERE email IS NOT NULL)', [LIBRARY]);
      return users;
    });
    await this.prepareTraining();
    for (const user of users) this.training.ensure(user.uid);
    return users.length;
  }
  async prepareTraining() {
    // PostgreSQL marker detects an accidentally missing/replaced persistent volume.
    // Legacy tables remain untouched; import is one atomic SQLite transaction.
    await this.transaction(async (db) => {
      const { rows: markers } = await db.query("SELECT value FROM sprt.storage_meta WHERE key='training_sqlite_instance'");
      const instance = this.training.instance();
      if (markers.length && markers[0].value !== instance) throw new Error('SQLite volume missing or replaced: restore training.sqlite from backup');
      if (!instance) {
        const { rows: states } = await db.query('SELECT * FROM sprt.training');
        const { rows: events } = await db.query('SELECT * FROM sprt.event ORDER BY created_at,id');
        const { rows: users } = await db.query('SELECT u.uid,s.properties FROM "User" u LEFT JOIN "UserSettings" s ON s."userUid"=u.uid');
        this.training.importLegacy(states, events, users);
      }
      await db.query("INSERT INTO sprt.storage_meta(key,value) VALUES ('training_sqlite_instance',$1) ON CONFLICT (key) DO NOTHING", [this.training.instance()]);
    });
  }
  async me(uid) {
    const user = await this.user(this.pool, uid);
    const { rows } = await this.pool.query('SELECT work_team,training_team FROM sprt.workspace WHERE user_uid=$1', [uid]);
    const state = this.training.get(uid);
    if (!rows[0] || !state) throw new HttpError(503, 'Рабочие пространства готовятся. Повторите через минуту.');
    return { uid, email: user.email, admin: this.isAdmin(user), library: LIBRARY, ...rows[0],
      progress: state.progress, attempt: state.attempt, storage: 'sqlite' };
  }
  async recover(uid, input, source = 'browser') {
    await this.user(this.pool, uid);
    return this.training.recover(uid, input, source);
  }
  async record(uid, input) {
    await this.user(this.pool, uid);
    return this.training.record(uid, input);
  }
  async debug(uid, target) {
    const actor = await this.user(this.pool, uid);
    if (target && target !== uid && !this.isAdmin(actor)) throw new HttpError(403, 'Чужая диагностика недоступна');
    const account = await this.user(this.pool, target || uid);
    const { rows } = await this.pool.query('SELECT properties FROM "UserSettings" WHERE "userUid"=$1', [account.uid]);
    let properties = rows[0]?.properties;
    if (typeof properties === 'string') { try { properties = JSON.parse(properties); } catch { properties = {}; } }
    return { version: VERSION, storage: 'sqlite', account: { uid: account.uid, email: account.email },
      training: this.training.get(account.uid), settingsProgress: progressOnly(properties?.SPRT_LEARN),
      events: this.training.counts(account.uid), admin: this.isAdmin(actor),
      note: 'SQLite is authoritative; settingsProgress is an obsolete PostgreSQL cache' };
  }
  async report(uid, target) {
    const user = await this.user(this.pool, uid);
    if (!this.isAdmin(user)) throw new HttpError(403, 'Доступ только администратору обучения');
    const { rows } = await this.pool.query('SELECT uid,email,"displayName" AS name FROM "User" WHERE email IS NOT NULL AND ($1::text IS NULL OR uid=$1) ORDER BY email', [target || null]);
    const employees = rows.filter((u) => this.training.get(u.uid)).map((u) => ({ ...u, ...this.training.get(u.uid),
      requests: this.training.counts(u.uid).find((e) => e.kind === 'attempt')?.count || 0 }));
    if (target && !employees.length) throw new HttpError(404, 'Сотрудник не найден');
    return target ? { employee: employees[0], lessons: LESSONS, events: this.training.events(target) } : { employees, lessons: LESSONS };
  }
}
