'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS levels (
  id    INTEGER PRIMARY KEY,
  name  TEXT    NOT NULL,
  rank  INTEGER NOT NULL
);

-- "from_level may submit tasks to members of to_level"
CREATE TABLE IF NOT EXISTS level_rules (
  from_level INTEGER NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  to_level   INTEGER NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  PRIMARY KEY (from_level, to_level)
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  level_id      INTEGER REFERENCES levels(id),
  is_admin      INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  color         TEXT,
  prefs         TEXT    NOT NULL DEFAULT '{}',
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY,
  title        TEXT    NOT NULL DEFAULT '',
  body         TEXT    NOT NULL DEFAULT '',
  created_by   INTEGER NOT NULL REFERENCES users(id),
  assigned_to  INTEGER NOT NULL REFERENCES users(id),
  is_private   INTEGER NOT NULL DEFAULT 0,
  due_date     TEXT,
  due_time     TEXT,
  urgent       INTEGER NOT NULL DEFAULT 0,
  status       TEXT    NOT NULL DEFAULT 'open',
  completed_at TEXT,
  color        TEXT,
  width        INTEGER,
  height       INTEGER,
  font_family  TEXT,
  font_size    INTEGER,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS tasks_created  ON tasks(created_by);
`;

/**
 * Turn a BEAVER_DB value into a libSQL URL.
 * Accepts ":memory:", a file path, or a URL (file:, libsql://, https://).
 */
function toUrl(location) {
  if (location === ':memory:') return ':memory:';
  if (/^(file:|libsql:|https?:|wss?:)/i.test(location)) return location;
  const abs = path.resolve(location);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return `file:${abs}`;
}

// libSQL rejects undefined arguments; treat them as NULL.
const clean = (args = []) => (Array.isArray(args)
  ? args.map((v) => (v === undefined ? null : v))
  : Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v === undefined ? null : v])));

/**
 * Open the database. Works with a local SQLite file or a remote libSQL/Turso database.
 * Returns a small async helper API: get / all / run / batch.
 */
async function openDb(location, { authToken } = {}) {
  const url = toUrl(location);
  // Remote databases use the pure-JavaScript client (no native module needed, e.g. on Vercel).
  const local = url === ':memory:' || url.startsWith('file:');
  const { createClient } = local ? require('@libsql/client') : require('@libsql/client/web');
  const client = createClient({ url, authToken: authToken || undefined });
  if (url.startsWith('file:')) await client.execute('PRAGMA journal_mode = WAL');
  await client.executeMultiple(SCHEMA);

  const exec = (sql, args) => client.execute({ sql, args: clean(args) });
  return {
    url,
    client,
    get: async (sql, args) => (await exec(sql, args)).rows[0],
    all: async (sql, args) => (await exec(sql, args)).rows,
    run: async (sql, args) => {
      const r = await exec(sql, args);
      return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid === undefined ? undefined : Number(r.lastInsertRowid) };
    },
    /** Run several statements atomically. Each item is [sql, args]. */
    batch: async (statements) => {
      const results = await client.batch(statements.map(([sql, args]) => ({ sql, args: clean(args) })), 'write');
      return results.map((r) => ({ changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid === undefined ? undefined : Number(r.lastInsertRowid) }));
    },
    close: () => client.close(),
  };
}

module.exports = { openDb, toUrl };
