'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

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

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

/** Run fn inside a transaction; rolls back if it throws. */
function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, tx };
