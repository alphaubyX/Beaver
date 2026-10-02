'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');

async function startServer() {
  const app = createApp({ dbFile: ':memory:' });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

/** A tiny client that keeps its own session cookie. */
function client(base) {
  let cookie = '';
  return async function call(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json();
    return { status: res.status, data };
  };
}

test('setup, levels, assignment rules and privacy', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const boss = client(base);
  assert.equal((await boss('GET', '/api/setup')).data.needsSetup, true);
  const setup = await boss('POST', '/api/setup', { name: 'Boss', username: 'boss', password: 'secret1' });
  assert.equal(setup.status, 200);
  assert.equal(setup.data.user.isAdmin, true);
  assert.equal((await boss('POST', '/api/setup', { name: 'X', username: 'x', password: 'secret1' })).status, 409);

  // Default levels: Leadership (1) can assign to Team (2); Team cannot assign upwards.
  let levels = (await boss('GET', '/api/levels')).data;
  assert.deepEqual(levels.map((l) => [l.rank, l.name]), [[1, 'Leadership'], [2, 'Team']]);
  const [top, team] = levels;
  assert.deepEqual(top.canAssignTo.sort(), [top.id, team.id].sort());
  assert.deepEqual(team.canAssignTo, [team.id]);

  // Add a third level; levels above may assign down to it.
  levels = (await boss('POST', '/api/levels', { name: 'Interns' })).data;
  const interns = levels.find((l) => l.name === 'Interns');
  assert.equal(interns.rank, 3);
  assert.ok(levels.find((l) => l.id === top.id).canAssignTo.includes(interns.id));
  assert.ok(levels.find((l) => l.id === team.id).canAssignTo.includes(interns.id));

  const alice = (await boss('POST', '/api/users', { name: 'Alice', username: 'alice', password: 'secret1', levelId: team.id })).data;
  const ivan = (await boss('POST', '/api/users', { name: 'Ivan', username: 'ivan', password: 'secret1', levelId: interns.id })).data;
  assert.equal((await boss('POST', '/api/users', { name: 'A2', username: 'ALICE', password: 'secret1', levelId: team.id })).status, 409);

  const a = client(base);
  assert.equal((await a('POST', '/api/login', { username: 'alice', password: 'nope' })).status, 401);
  assert.equal((await a('POST', '/api/login', { username: 'alice', password: 'secret1' })).status, 200);
  const i = client(base);
  await i('POST', '/api/login', { username: 'ivan', password: 'secret1' });

  // Boss assigns to Alice (allowed), Alice cannot assign up to Boss.
  const t1 = await boss('POST', '/api/tasks', { title: 'Quarterly report', assignedTo: alice.id, dueDate: '2026-10-05' });
  assert.equal(t1.status, 200);
  assert.match(t1.data.color, /^#[0-9a-f]{6}$/);
  assert.equal((await a('POST', '/api/tasks', { title: 'Hey boss', assignedTo: setup.data.user.id })).status, 403);
  assert.equal((await i('POST', '/api/tasks', { title: 'Up', assignedTo: alice.id })).status, 403);
  assert.equal((await a('POST', '/api/tasks', { title: 'For intern', assignedTo: ivan.id })).status, 200);

  // Alice's own notes: public one visible to boss (who is above), private one never.
  await a('POST', '/api/tasks', { title: 'Alice public note' });
  await a('POST', '/api/tasks', { title: 'Alice secret', isPrivate: true });
  const bossView = (await boss('GET', `/api/tasks?member=${alice.id}`)).data.map((x) => x.title).sort();
  assert.deepEqual(bossView, ['Alice public note', 'Quarterly report']);
  // Ivan is below Alice so cannot see her own notes.
  assert.deepEqual((await i('GET', `/api/tasks?member=${alice.id}`)).data.map((x) => x.title), ['For intern']);

  const mine = (await a('GET', '/api/tasks?scope=mine')).data.map((x) => x.title).sort();
  assert.deepEqual(mine, ['Alice public note', 'Quarterly report']);
  assert.deepEqual((await a('GET', '/api/tasks?scope=private')).data.map((x) => x.title), ['Alice secret']);
  assert.deepEqual((await a('GET', '/api/tasks?scope=delegated')).data.map((x) => x.title), ['For intern']);

  // Assignee may complete and restyle but not rewrite or redate.
  const done = await a('PUT', `/api/tasks/${t1.data.id}`, { status: 'done', color: '#123456', width: 300 });
  assert.equal(done.status, 200);
  assert.equal(done.data.status, 'done');
  assert.ok(done.data.completedAt);
  assert.equal((await a('PUT', `/api/tasks/${t1.data.id}`, { dueDate: '2026-12-01' })).status, 403);
  assert.equal((await a('DELETE', `/api/tasks/${t1.data.id}`)).status, 403);

  // Author can change the date; clearing the date clears the time.
  const redated = await boss('PUT', `/api/tasks/${t1.data.id}`, { dueDate: '2026-10-09', dueTime: '14:30' });
  assert.equal(redated.data.dueTime, '14:30');
  assert.equal((await boss('PUT', `/api/tasks/${t1.data.id}`, { dueDate: null })).data.dueTime, null);

  // Private notes are invisible to everyone else, even admins.
  const secret = (await a('GET', '/api/tasks?scope=private')).data[0];
  assert.equal((await boss('PUT', `/api/tasks/${secret.id}`, { title: 'peek' })).status, 404);

  // Private only makes sense for self-assigned notes.
  const forIvan = await a('POST', '/api/tasks', { title: 'Not private', assignedTo: ivan.id, isPrivate: true });
  assert.equal(forIvan.data.isPrivate, false);

  // Changing rules takes effect: let Team assign to Leadership.
  await boss('PUT', `/api/levels/${team.id}`, { canAssignTo: [team.id, top.id] });
  assert.equal((await a('POST', '/api/tasks', { title: 'Hey boss', assignedTo: setup.data.user.id })).status, 200);
  assert.ok((await a('GET', '/api/me')).data.assignable.includes(setup.data.user.id));

  // Non-admins cannot manage settings.
  assert.equal((await a('POST', '/api/levels', { name: 'Nope' })).status, 403);

  // Reorder and delete levels.
  levels = (await boss('POST', '/api/levels/reorder', { ids: [top.id, interns.id, team.id] })).data;
  assert.deepEqual(levels.map((l) => l.name), ['Leadership', 'Interns', 'Team']);
  assert.equal((await boss('DELETE', `/api/levels/${interns.id}`)).status, 409);
  await boss('PUT', `/api/users/${ivan.id}`, { levelId: team.id });
  levels = (await boss('DELETE', `/api/levels/${interns.id}`)).data;
  assert.deepEqual(levels.map((l) => [l.rank, l.name]), [[1, 'Leadership'], [2, 'Team']]);

  // Deactivated members are signed out.
  await boss('PUT', `/api/users/${ivan.id}`, { active: false });
  assert.equal((await i('GET', '/api/me')).status, 401);

  // Counts
  const counts = (await boss('GET', '/api/counts')).data;
  assert.equal(counts.delegated, 0);
});

test('mutations must be JSON', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const res = await fetch(`${base}/api/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'name=a&username=a&password=abcdef',
  });
  assert.equal(res.status, 415);
});
