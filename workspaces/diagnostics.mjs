// Fixed allowlist: never retain cookies, headers, URLs with queries, bodies,
// SQL text, tokens or caller-supplied error messages.
export class Diagnostics {
  constructor(limit = 200) { this.limit = limit; this.entries = []; }
  add({ requestId, path, method, status, duration, uid }) {
    this.entries.push({ at: new Date().toISOString(), requestId,
      path: ['/sprt/me','/sprt/events','/sprt/recover','/sprt/report','/sprt/debug'].includes(path) ? path : 'other',
      method: ['GET','POST'].includes(method) ? method : 'other',
      status: Number(status), durationMs: Math.max(0, Math.round(duration)), uid: uid || null });
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
  }
  read(uid, admin = false) { return this.entries.filter((e) => admin || e.uid === uid).map((e) => ({ ...e })); }
}
