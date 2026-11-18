-- Own schema: no changes to Hoppscotch tables or stored client credentials.
CREATE SCHEMA IF NOT EXISTS sprt;
CREATE TABLE IF NOT EXISTS sprt.workspace (
  user_uid text PRIMARY KEY REFERENCES "User"(uid) ON DELETE CASCADE,
  work_team text NOT NULL UNIQUE REFERENCES "Team"(id),
  training_team text NOT NULL UNIQUE REFERENCES "Team"(id)
);
CREATE TABLE IF NOT EXISTS sprt.training (
  user_uid text PRIMARY KEY REFERENCES "User"(uid) ON DELETE CASCADE,
  progress jsonb NOT NULL DEFAULT '{}',
  attempt integer NOT NULL DEFAULT 1,
  legacy boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS sprt.event (
  id text PRIMARY KEY,
  user_uid text NOT NULL REFERENCES "User"(uid) ON DELETE CASCADE,
  attempt integer NOT NULL,
  kind text NOT NULL,
  lesson_id text,
  passed boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sprt_event_user_date ON sprt.event(user_uid, created_at);
ALTER TABLE sprt.training ADD COLUMN IF NOT EXISTS recovery_checked boolean NOT NULL DEFAULT false;
ALTER TABLE sprt.training ADD COLUMN IF NOT EXISTS recovered_from text;

-- Only the storage identity lives here; training and events above are legacy import sources.
CREATE TABLE IF NOT EXISTS sprt.storage_meta (key text PRIMARY KEY, value text NOT NULL);
