'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { openDb, tx } = require('./db');

const SESSION_DAYS = 30;
const COOKIE = 'beaver_sid';
const FONT_PACKAGES = ['caveat', 'patrick-hand', 'kalam', 'indie-flower'];
const NOTE_COLORS = ['#fff59d', '#ffcc80', '#f8bbd0', '#e1bee7', '#90caf9', '#80deea', '#a5d6a7', '#e6ee9c', '#ffab91', '#b2dfdb'];
const AVATAR_COLORS = ['#e57373', '#f06292', '#ba68c8', '#7986cb', '#4fc3f7', '#4db6ac', '#81c784', '#ffb74d', '#a1887f', '#90a4ae'];

const now = () => new Date().toISOString();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => { throw new HttpError(status, message); };

// ---------- passwords ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// ---------- validation ----------

function str(value, { field, max = 200, required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) fail(400, `${field} is required`);
    return value;
  }
  if (typeof value !== 'string') fail(400, `${field} must be text`);
  const v = value.trim();
  if (required && !v) fail(400, `${field} is required`);
  if (v.length > max) fail(400, `${field} is too long (max ${max})`);
  return v;
}

function password(value) {
  if (typeof value !== 'string' || value.length < 6) fail(400, 'Password must be at least 6 characters');
  if (value.length > 200) fail(400, 'Password is too long');
  return value;
}

function username(value) {
  const v = str(value, { field: 'Username', max: 40, required: true });
  if (!/^[a-zA-Z0-9._-]+$/.test(v)) fail(400, 'Username may only contain letters, numbers, dot, dash and underscore');
  return v;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function optional(value, re, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !re.test(value)) fail(400, `Invalid ${field}`);
  return value;
}

function optionalInt(value, min, max, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${field} must be between ${min} and ${max}`);
  return n;
}

function cleanPrefs(input) {
  const p = input && typeof input === 'object' ? input : {};
  const out = {};
  if (typeof p.fontFamily === 'string' && p.fontFamily.length <= 60) out.fontFamily = p.fontFamily;
  if (Number.isInteger(p.fontSize) && p.fontSize >= 10 && p.fontSize <= 48) out.fontSize = p.fontSize;
  if (['s', 'm', 'l'].includes(p.noteSize)) out.noteSize = p.noteSize;
  if (['random', 'fixed'].includes(p.colorMode)) out.colorMode = p.colorMode;
  if (typeof p.fixedColor === 'string' && COLOR_RE.test(p.fixedColor)) out.fixedColor = p.fixedColor;
  if (typeof p.notifications === 'boolean') out.notifications = p.notifications;
  if (['wall', 'list'].includes(p.view)) out.view = p.view;
  return out;
}

// ---------- app ----------

function createApp({ dbFile = ':memory:', trustProxy = false, admin: envAdmin = null } = {}) {
  const db = openDb(dbFile);
  const app = express();
  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');
  app.locals.db = db;

  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
    levels: db.prepare('SELECT * FROM levels ORDER BY rank'),
    levelById: db.prepare('SELECT * FROM levels WHERE id = ?'),
    rules: db.prepare('SELECT from_level, to_level FROM level_rules'),
    ruleExists: db.prepare('SELECT 1 FROM level_rules WHERE from_level = ? AND to_level = ?'),
    session: db.prepare('SELECT * FROM sessions WHERE token = ?'),
    taskById: db.prepare('SELECT * FROM tasks WHERE id = ?'),
  };

  // ----- helpers bound to db -----

  function publicUser(u) {
    return {
      id: u.id,
      username: u.username,
      name: u.name,
      levelId: u.level_id,
      isAdmin: !!u.is_admin,
      active: !!u.active,
      color: u.color,
    };
  }

  function levelsWithRules() {
    const rules = q.rules.all();
    return q.levels.all().map((l) => ({
      id: l.id,
      name: l.name,
      rank: l.rank,
      canAssignTo: rules.filter((r) => r.from_level === l.id).map((r) => r.to_level),
    }));
  }

  /** Can `from` submit tasks to `to`? Everyone can always write notes for themselves. */
  function canAssign(from, to) {
    if (!to || !to.active) return false;
    if (from.id === to.id) return true;
    if (!from.level_id || !to.level_id) return false;
    return !!q.ruleExists.get(from.level_id, to.level_id);
  }

  function renumberLevels() {
    db.prepare('SELECT id FROM levels ORDER BY rank, id').all()
      .forEach((l, i) => db.prepare('UPDATE levels SET rank = ? WHERE id = ?').run(i + 1, l.id));
  }

  function createLevel(name) {
    const { maxRank } = db.prepare('SELECT COALESCE(MAX(rank), 0) AS maxRank FROM levels').get();
    const { lastInsertRowid: id } = db.prepare('INSERT INTO levels (name, rank) VALUES (?, ?)').run(name, maxRank + 1);
    // New (lowest) level may assign within itself; every level above it may assign down to it.
    const insertRule = db.prepare('INSERT OR IGNORE INTO level_rules (from_level, to_level) VALUES (?, ?)');
    for (const l of q.levels.all()) insertRule.run(l.id, id);
    return Number(id);
  }

  function serializeTask(t) {
    return {
      id: t.id,
      title: t.title,
      body: t.body,
      createdBy: t.created_by,
      assignedTo: t.assigned_to,
      isPrivate: !!t.is_private,
      dueDate: t.due_date,
      dueTime: t.due_time,
      urgent: !!t.urgent,
      status: t.status,
      completedAt: t.completed_at,
      color: t.color,
      width: t.width,
      height: t.height,
      fontFamily: t.font_family,
      fontSize: t.font_size,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  }

  /** Can viewer see another member's self-written (non-private) notes? Same rule as assigning. */
  function canOversee(viewer, member) {
    return viewer.id !== member.id && canAssign(viewer, member);
  }

  function canView(viewer, t) {
    if (t.created_by === viewer.id) return true;
    if (t.is_private) return false;
    if (t.assigned_to === viewer.id) return true;
    if (t.created_by === t.assigned_to) {
      const owner = q.userById.get(t.created_by);
      return !!owner && canOversee(viewer, owner);
    }
    return false;
  }

  // ----- sessions -----

  function startSession(res, req, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires.toISOString());
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      expires,
      path: '/',
    });
  }

  function readCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
    }
    return null;
  }

  // ----- middleware -----

  app.use(express.json({ limit: '200kb' }));

  // Basic CSRF defence: POST/PUT bodies must be JSON, which a plain HTML form cannot send (forms cannot DELETE).
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).json({ error: 'Expected application/json' });
    }
    next();
  });

  app.use('/api', (req, res, next) => {
    const token = readCookie(req, COOKIE);
    if (token) {
      const s = q.session.get(token);
      if (s && s.expires_at > now()) {
        const user = q.userById.get(s.user_id);
        if (user && user.active) {
          req.user = user;
          req.sessionToken = token;
        }
      } else if (s) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      }
    }
    next();
  });

  const auth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please sign in' }));
  const admin = (req, res, next) => (req.user?.is_admin ? next() : res.status(403).json({ error: 'Admins only' }));
  const route = (fn) => (req, res, next) => {
    try {
      const result = fn(req, res);
      if (result !== undefined) res.json(result);
    } catch (err) {
      next(err);
    }
  };

  // Simple in-memory login throttle.
  const attempts = new Map();
  function throttle(key) {
    const t = Date.now();
    const entry = attempts.get(key) || { count: 0, first: t };
    if (t - entry.first > 15 * 60e3) { entry.count = 0; entry.first = t; }
    entry.count += 1;
    attempts.set(key, entry);
    if (entry.count > 10) fail(429, 'Too many sign-in attempts. Try again in a few minutes.');
  }

  /** Create the default levels and the first admin (Level 1). Only allowed on an empty database. */
  function createFirstAdmin(name, uname, pw) {
    return tx(db, () => {
      if (q.userCount.get().n > 0) fail(409, 'Setup has already been completed');
      const top = createLevel('Leadership');
      createLevel('Team');
      const { lastInsertRowid } = db.prepare(
        'INSERT INTO users (username, name, password_hash, level_id, is_admin, color, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
      ).run(uname, name, hashPassword(pw), top, pick(AVATAR_COLORS), now());
      return q.userById.get(lastInsertRowid);
    });
  }

  /**
   * Admin account from environment variables (BEAVER_ADMIN_*):
   * created on an empty database; on an existing one its password is only reset when resetPassword is set.
   */
  function applyAdminFromEnv({ name, username: rawUsername, password: rawPassword, resetPassword }) {
    const uname = username(rawUsername);
    const pw = password(rawPassword);
    if (q.userCount.get().n === 0) {
      createFirstAdmin(str(name, { field: 'Name', max: 80 }) || uname, uname, pw);
      return `Created admin account "${uname}"`;
    }
    const existing = q.userByName.get(uname);
    if (!resetPassword) {
      return existing
        ? `Admin account "${uname}" already exists; its password was left unchanged`
        : `Users already exist, so "${uname}" was not created (add members in Settings)`;
    }
    if (existing) {
      db.prepare('UPDATE users SET password_hash = ?, is_admin = 1, active = 1 WHERE id = ?').run(hashPassword(pw), existing.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
      return `Reset the password of "${uname}"`;
    }
    const top = q.levels.all()[0]?.id ?? createLevel('Leadership');
    db.prepare(
      'INSERT INTO users (username, name, password_hash, level_id, is_admin, color, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
    ).run(uname, str(name, { field: 'Name', max: 80 }) || uname, hashPassword(pw), top, pick(AVATAR_COLORS), now());
    return `Created admin account "${uname}"`;
  }

  if (envAdmin?.username || envAdmin?.password) {
    if (!envAdmin.username || !envAdmin.password) {
      throw new Error('Set both BEAVER_ADMIN_USERNAME and BEAVER_ADMIN_PASSWORD (or neither).');
    }
    try {
      app.locals.adminMessage = applyAdminFromEnv(envAdmin);
    } catch (err) {
      throw new Error(`Invalid admin settings: ${err.message}`);
    }
  }

  // ----- setup & auth -----

  app.get('/api/setup', route(() => ({ needsSetup: q.userCount.get().n === 0 })));

  app.post('/api/setup', route((req, res) => {
    const name = str(req.body.name, { field: 'Name', max: 80, required: true });
    const uname = username(req.body.username);
    const pw = password(req.body.password);
    const user = createFirstAdmin(name, uname, pw);
    startSession(res, req, user.id);
    return { user: publicUser(user) };
  }));

  app.post('/api/login', route((req, res) => {
    const uname = str(req.body.username, { field: 'Username', max: 40, required: true });
    throttle(`${req.ip}|${uname.toLowerCase()}`);
    const user = q.userByName.get(uname);
    const ok = user && user.active && verifyPassword(String(req.body.password ?? ''), user.password_hash);
    if (!ok) fail(401, 'Wrong username or password');
    attempts.delete(`${req.ip}|${uname.toLowerCase()}`);
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
    startSession(res, req, user.id);
    return { user: publicUser(user) };
  }));

  app.post('/api/logout', route((req, res) => {
    if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
    res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }));

  // ----- me -----

  app.get('/api/me', auth, route((req) => {
    const assignable = db.prepare('SELECT * FROM users WHERE active = 1').all()
      .filter((u) => canAssign(req.user, u)).map((u) => u.id);
    return {
      user: publicUser(req.user),
      prefs: JSON.parse(req.user.prefs || '{}'),
      assignable,
      noteColors: NOTE_COLORS,
    };
  }));

  app.put('/api/me', auth, route((req) => {
    const name = str(req.body.name, { field: 'Name', max: 80 });
    if (name !== undefined) {
      if (!name) fail(400, 'Name is required');
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
    }
    if (req.body.prefs !== undefined) {
      const merged = { ...JSON.parse(req.user.prefs || '{}'), ...cleanPrefs(req.body.prefs) };
      db.prepare('UPDATE users SET prefs = ? WHERE id = ?').run(JSON.stringify(merged), req.user.id);
    }
    const u = q.userById.get(req.user.id);
    return { user: publicUser(u), prefs: JSON.parse(u.prefs) };
  }));

  app.put('/api/me/password', auth, route((req) => {
    if (!verifyPassword(String(req.body.currentPassword ?? ''), req.user.password_hash)) fail(400, 'Current password is wrong');
    const pw = password(req.body.newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(pw), req.user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(req.user.id, req.sessionToken);
    return { ok: true };
  }));

  // ----- levels -----

  app.get('/api/levels', auth, route(() => levelsWithRules()));

  app.post('/api/levels', auth, admin, route((req) => {
    const name = str(req.body.name, { field: 'Level name', max: 60, required: true });
    tx(db, () => createLevel(name));
    return levelsWithRules();
  }));

  app.put('/api/levels/:id', auth, admin, route((req) => {
    const level = q.levelById.get(Number(req.params.id)) || fail(404, 'Level not found');
    tx(db, () => {
      const name = str(req.body.name, { field: 'Level name', max: 60 });
      if (name !== undefined) {
        if (!name) fail(400, 'Level name is required');
        db.prepare('UPDATE levels SET name = ? WHERE id = ?').run(name, level.id);
      }
      if (req.body.canAssignTo !== undefined) {
        if (!Array.isArray(req.body.canAssignTo)) fail(400, 'canAssignTo must be a list');
        const valid = new Set(q.levels.all().map((l) => l.id));
        db.prepare('DELETE FROM level_rules WHERE from_level = ?').run(level.id);
        const ins = db.prepare('INSERT OR IGNORE INTO level_rules (from_level, to_level) VALUES (?, ?)');
        for (const to of req.body.canAssignTo) {
          if (!valid.has(to)) fail(400, 'Unknown level in canAssignTo');
          ins.run(level.id, to);
        }
      }
    });
    return levelsWithRules();
  }));

  app.post('/api/levels/reorder', auth, admin, route((req) => {
    const ids = req.body.ids;
    const existing = q.levels.all().map((l) => l.id);
    if (!Array.isArray(ids) || ids.length !== existing.length || !existing.every((id) => ids.includes(id))) {
      fail(400, 'ids must list every level exactly once');
    }
    tx(db, () => ids.forEach((id, i) => db.prepare('UPDATE levels SET rank = ? WHERE id = ?').run(i + 1, id)));
    return levelsWithRules();
  }));

  app.delete('/api/levels/:id', auth, admin, route((req) => {
    const level = q.levelById.get(Number(req.params.id)) || fail(404, 'Level not found');
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM users WHERE level_id = ? AND active = 1').get(level.id);
    if (n > 0) fail(409, `Move the ${n} member(s) in "${level.name}" to another level first`);
    tx(db, () => {
      db.prepare('UPDATE users SET level_id = NULL WHERE level_id = ?').run(level.id);
      db.prepare('DELETE FROM levels WHERE id = ?').run(level.id);
      renumberLevels();
    });
    return levelsWithRules();
  }));

  // ----- users -----

  app.get('/api/users', auth, route(() => db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE').all().map(publicUser)));

  function levelIdOrFail(value) {
    const id = Number(value);
    if (!q.levelById.get(id)) fail(400, 'Choose a valid level');
    return id;
  }

  app.post('/api/users', auth, admin, route((req) => {
    const name = str(req.body.name, { field: 'Name', max: 80, required: true });
    const uname = username(req.body.username);
    const pw = password(req.body.password);
    const levelId = levelIdOrFail(req.body.levelId);
    if (q.userByName.get(uname)) fail(409, 'That username is taken');
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO users (username, name, password_hash, level_id, is_admin, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uname, name, hashPassword(pw), levelId, req.body.isAdmin ? 1 : 0, pick(AVATAR_COLORS), now());
    return publicUser(q.userById.get(lastInsertRowid));
  }));

  app.put('/api/users/:id', auth, admin, route((req) => {
    const user = q.userById.get(Number(req.params.id)) || fail(404, 'Member not found');
    const self = user.id === req.user.id;
    tx(db, () => {
      const name = str(req.body.name, { field: 'Name', max: 80 });
      if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);
      if (req.body.levelId !== undefined) {
        db.prepare('UPDATE users SET level_id = ? WHERE id = ?').run(levelIdOrFail(req.body.levelId), user.id);
      }
      if (req.body.isAdmin !== undefined) {
        if (self && !req.body.isAdmin) fail(400, 'You cannot remove your own admin rights');
        db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(req.body.isAdmin ? 1 : 0, user.id);
      }
      if (req.body.active !== undefined) {
        if (self && !req.body.active) fail(400, 'You cannot deactivate yourself');
        db.prepare('UPDATE users SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, user.id);
        if (!req.body.active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      }
      if (req.body.password !== undefined) {
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password(req.body.password)), user.id);
        if (!self) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      }
    });
    return publicUser(q.userById.get(user.id));
  }));

  // ----- tasks -----

  app.get('/api/tasks', auth, route((req) => {
    const me = req.user.id;
    const member = req.query.member ? Number(req.query.member) : null;
    let rows;
    if (member) {
      const other = q.userById.get(member) || fail(404, 'Member not found');
      const oversee = canOversee(req.user, other) ? 1 : 0;
      rows = db.prepare(`
        SELECT * FROM tasks WHERE
          (created_by = :me AND assigned_to = :x AND :me <> :x)
          OR (created_by = :x AND assigned_to = :me AND is_private = 0 AND :me <> :x)
          OR (:oversee = 1 AND created_by = :x AND assigned_to = :x AND is_private = 0)
      `).all({ me, x: other.id, oversee });
    } else {
      const scope = req.query.scope || 'mine';
      const where = {
        mine: 'assigned_to = :me AND is_private = 0',
        private: 'created_by = :me AND is_private = 1',
        delegated: 'created_by = :me AND assigned_to <> :me',
      }[scope] || fail(400, 'Unknown scope');
      rows = db.prepare(`SELECT * FROM tasks WHERE ${where}`).all({ me });
    }
    return rows.map(serializeTask);
  }));

  // Per-user open-task counts for the sidebar.
  app.get('/api/counts', auth, route((req) => {
    const me = req.user.id;
    const one = (sql) => db.prepare(sql).get({ me }).n;
    const perMember = db.prepare(`
      SELECT assigned_to AS id, COUNT(*) AS n FROM tasks
      WHERE created_by = :me AND assigned_to <> :me AND status = 'open' GROUP BY assigned_to
    `).all({ me });
    return {
      mine: one("SELECT COUNT(*) AS n FROM tasks WHERE assigned_to = :me AND is_private = 0 AND status = 'open'"),
      private: one("SELECT COUNT(*) AS n FROM tasks WHERE created_by = :me AND is_private = 1 AND status = 'open'"),
      delegated: one("SELECT COUNT(*) AS n FROM tasks WHERE created_by = :me AND assigned_to <> :me AND status = 'open'"),
      members: Object.fromEntries(perMember.map((r) => [r.id, r.n])),
    };
  }));

  function readTaskFields(body) {
    return {
      title: str(body.title, { field: 'Title', max: 200 }),
      body: str(body.body, { field: 'Details', max: 5000 }),
      dueDate: optional(body.dueDate, DATE_RE, 'due date'),
      dueTime: optional(body.dueTime, TIME_RE, 'due time'),
      color: optional(body.color, COLOR_RE, 'color'),
      width: optionalInt(body.width, 120, 800, 'Width'),
      height: optionalInt(body.height, 100, 800, 'Height'),
      fontSize: optionalInt(body.fontSize, 10, 48, 'Font size'),
      fontFamily: str(body.fontFamily, { field: 'Font', max: 60 }),
      urgent: body.urgent === undefined ? undefined : !!body.urgent,
      isPrivate: body.isPrivate === undefined ? undefined : !!body.isPrivate,
      status: body.status === undefined ? undefined
        : (['open', 'done'].includes(body.status) ? body.status : fail(400, 'Invalid status')),
    };
  }

  app.post('/api/tasks', auth, route((req) => {
    const f = readTaskFields(req.body);
    if (!f.title && !f.body) fail(400, 'Write something on the note first');
    let assignee = req.user;
    if (req.body.assignedTo !== undefined && req.body.assignedTo !== null && Number(req.body.assignedTo) !== req.user.id) {
      assignee = q.userById.get(Number(req.body.assignedTo));
      if (!canAssign(req.user, assignee)) fail(403, 'Your level is not allowed to submit tasks to this member');
    }
    const isPrivate = assignee.id === req.user.id && f.isPrivate ? 1 : 0;
    const t = now();
    const status = f.status || 'open';
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO tasks (title, body, created_by, assigned_to, is_private, due_date, due_time, urgent, status, completed_at,
                         color, width, height, font_family, font_size, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      f.title || '', f.body || '', req.user.id, assignee.id, isPrivate,
      f.dueDate ?? null, f.dueDate ? (f.dueTime ?? null) : null, f.urgent ? 1 : 0, status, status === 'done' ? t : null,
      f.color ?? pick(NOTE_COLORS), f.width ?? null, f.height ?? null, f.fontFamily || null, f.fontSize ?? null, t, t,
    );
    return serializeTask(q.taskById.get(lastInsertRowid));
  }));

  app.put('/api/tasks/:id', auth, route((req) => {
    const task = q.taskById.get(Number(req.params.id));
    if (!task || !canView(req.user, task)) fail(404, 'Task not found');
    const isCreator = task.created_by === req.user.id;
    const isAssignee = task.assigned_to === req.user.id;
    if (!isCreator && !isAssignee) fail(403, 'You can only view this note');

    const f = readTaskFields(req.body);
    const sets = {};
    // Assignees may tick tasks off and restyle the note; everything else belongs to the author.
    if (f.status !== undefined) {
      sets.status = f.status;
      sets.completed_at = f.status === 'done' ? (task.status === 'done' ? task.completed_at : now()) : null;
    }
    if (f.color !== undefined) sets.color = f.color;
    if (f.width !== undefined) sets.width = f.width;
    if (f.height !== undefined) sets.height = f.height;
    if (f.fontSize !== undefined) sets.font_size = f.fontSize;
    if (f.fontFamily !== undefined) sets.font_family = f.fontFamily || null;

    const authorOnly = ['title', 'body', 'dueDate', 'dueTime', 'urgent', 'isPrivate'].filter((k) => f[k] !== undefined);
    if ((authorOnly.length || req.body.assignedTo !== undefined) && !isCreator) {
      fail(403, 'Only the person who wrote this note can change its text, date or assignment');
    }
    if (f.title !== undefined) sets.title = f.title || '';
    if (f.body !== undefined) sets.body = f.body || '';
    if (f.dueDate !== undefined) sets.due_date = f.dueDate;
    if (f.dueTime !== undefined) sets.due_time = f.dueTime;
    if (f.urgent !== undefined) sets.urgent = f.urgent ? 1 : 0;

    let assignedTo = task.assigned_to;
    if (req.body.assignedTo !== undefined) {
      const target = Number(req.body.assignedTo ?? req.user.id);
      if (target !== task.assigned_to) {
        const assignee = q.userById.get(target);
        if (!canAssign(req.user, assignee)) fail(403, 'Your level is not allowed to submit tasks to this member');
        sets.assigned_to = assignedTo = target;
      }
    }
    const wantPrivate = f.isPrivate !== undefined ? f.isPrivate : !!task.is_private;
    sets.is_private = wantPrivate && assignedTo === task.created_by ? 1 : 0;

    const finalDue = sets.due_date !== undefined ? sets.due_date : task.due_date;
    if (!finalDue) sets.due_time = null;
    const finalTitle = sets.title !== undefined ? sets.title : task.title;
    const finalBody = sets.body !== undefined ? sets.body : task.body;
    if (!finalTitle && !finalBody) fail(400, 'A note cannot be empty');

    sets.updated_at = now();
    const cols = Object.keys(sets);
    db.prepare(`UPDATE tasks SET ${cols.map((c) => `${c} = :${c}`).join(', ')} WHERE id = :id`).run({ ...sets, id: task.id });
    return serializeTask(q.taskById.get(task.id));
  }));

  app.delete('/api/tasks/:id', auth, route((req) => {
    const task = q.taskById.get(Number(req.params.id));
    if (!task || !canView(req.user, task)) fail(404, 'Task not found');
    if (task.created_by !== req.user.id) fail(403, 'Only the person who wrote this note can delete it');
    db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
    return { ok: true };
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // ----- static files -----

  for (const pkg of FONT_PACKAGES) {
    const dir = path.dirname(require.resolve(`@fontsource/${pkg}/package.json`));
    app.use(`/fonts/${pkg}`, express.static(dir, { maxAge: '30d', immutable: true }));
  }
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));

  // ----- errors -----

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}

module.exports = { createApp, hashPassword, verifyPassword };
