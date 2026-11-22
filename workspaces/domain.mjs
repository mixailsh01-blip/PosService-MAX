export const LESSONS = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];
export const LIBRARY = 'sprt-library-v1';
export const VERSION = '2026.11.18.5';
export const normalizedEmail = (email) => String(email || '').trim().toLowerCase();
export const progressOnly = (value) => Object.fromEntries(LESSONS.map((key) => [key, value?.[key] === true]));
export const complete = (value) => LESSONS.every((key) => value[key] === true);
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

