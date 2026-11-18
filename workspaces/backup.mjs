// Uses SQLite's online backup API: includes committed WAL data in a consistent snapshot.
import { DatabaseSync, backup } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const source = process.env.TRAINING_SQLITE;
const target = process.argv[2];
if (!source || !target || source === target) throw new Error('Specify TRAINING_SQLITE and a different snapshot path');
mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(source, { readOnly: true });
try { await backup(db, target); chmodSync(target, 0o600); }
finally { db.close(); }
