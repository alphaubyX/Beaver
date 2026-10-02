// Beaver — app shell: sign-in, sidebar, toolbar and data loading.

import { h, icon, clear, avatar, toast, confirmDialog, dueInfo, todayStr } from './util.js';
import { api, ApiError } from './api.js';
import { state, DEFAULT_PREFS, userById, levelLabel, relation } from './state.js';
import { renderWall, resetResizeWatch } from './board.js';
import { renderList } from './list.js';
import { openEditor } from './editor.js';
import { renderSettings } from './settings.js';

const root = document.getElementById('app');

// ---------- boot ----------

async function boot() {
  try {
    await loadSession();
    renderShell();
    await refresh();
    startTimers();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const { needsSetup } = await api.setupStatus();
      renderAuth(needsSetup);
    } else {
      clear(root, h('div', { class: 'fatal' }, h('h1', {}, 'Cannot reach the Beaver server'), h('p', {}, err.message),
        h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Try again')));
    }
  }
}

async function loadSession() {
  const [me, users, levels] = await Promise.all([api.me(), api.users(), api.levels()]);
  state.me = me.user;
  state.prefs = { ...DEFAULT_PREFS, ...me.prefs };
  state.assignable = new Set(me.assignable);
  state.noteColors = me.noteColors;
  state.users = users;
  state.levels = levels;
  state.view = state.prefs.view || 'wall';
}

window.addEventListener('beaver:signed-out', () => {
  if (state.me) {
    state.me = null;
    stopTimers();
    renderAuth(false);
  }
});

// ---------- sign in / first-run setup ----------

function renderAuth(needsSetup) {
  const err = h('p', { class: 'form-error', role: 'alert' });
  const name = h('input', { type: 'text', required: true, maxLength: 80, autocomplete: 'name' });
  const username = h('input', { type: 'text', required: true, maxLength: 40, autocomplete: 'username', autocapitalize: 'off' });
  const password = h('input', { type: 'password', required: true, minLength: needsSetup ? 6 : undefined, autocomplete: needsSetup ? 'new-password' : 'current-password' });
  const field = (label, input) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);

  const form = h('form', {
    class: 'auth-card',
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        if (needsSetup) await api.setup({ name: name.value, username: username.value, password: password.value });
        else await api.login({ username: username.value, password: password.value });
        clear(root);
        boot();
      } catch (ex) { err.textContent = ex.message; }
    },
  },
  h('div', { class: 'brand big' }, h('img', { src: 'img/icon.svg', alt: '' }), 'Beaver'),
  needsSetup
    ? [h('h1', {}, 'Welcome! Create the admin account'), h('p', { class: 'muted' }, 'You will be the first member, at Level 1. You can add levels and teammates afterwards in Settings.'), field('Your name', name)]
    : h('h1', {}, 'Sign in'),
  field('Username', username),
  field('Password', password),
  err,
  h('button', { class: 'btn primary wide', type: 'submit' }, needsSetup ? 'Create account' : 'Sign in'));

  clear(root, h('main', { class: 'auth' }, form));
  (needsSetup ? name : username).focus();
}

// ---------- shell ----------

let els = {};

function renderShell() {
  els.sidebar = h('aside', { class: 'sidebar', id: 'sidebar' });
  els.title = h('div', { class: 'page-title' });
  els.content = h('div', { class: 'content', id: 'content' });
  els.filters = h('div', { class: 'filters' });
  els.search = h('label', { class: 'search' }, icon('search'), h('input', {
    type: 'search',
    placeholder: 'Search notes',
    'aria-label': 'Search notes',
    oninput: (e) => { state.search = e.target.value.trim().toLowerCase(); renderContent(); },
  }));
  els.viewToggle = h('div', { class: 'segmented', role: 'group', 'aria-label': 'View' });
  els.doneToggle = h('label', { class: 'check small' }, h('input', {
    type: 'checkbox',
    checked: state.showDone,
    onchange: (e) => { state.showDone = e.target.checked; renderContent(); },
  }), 'Show done');
  els.newBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => newNote() }, icon('plus'), h('span', { class: 'label' }, 'New note'));

  const topbar = h('header', { class: 'topbar' },
    h('button', { class: 'icon-btn menu-btn', type: 'button', 'aria-label': 'Menu', 'aria-controls': 'sidebar', onclick: () => document.body.classList.toggle('nav-open') }, icon('menu')),
    els.title,
    h('div', { class: 'toolbar' }, els.search, els.doneToggle, els.viewToggle, els.newBtn));

  clear(root,
    h('div', { class: 'layout' },
      els.sidebar,
      h('div', { class: 'scrim', onclick: () => document.body.classList.remove('nav-open') }),
      h('main', { class: 'main' }, topbar, els.filters, els.content)));
  renderSidebar();
}

function renderSidebar() {
  const c = state.counts;
  const item = (ctx, iconName, label, count, extra = {}) => {
    const active = state.page === 'board' && state.context.type === ctx.type && state.context.memberId === ctx.memberId;
    return h('button', {
      type: 'button',
      class: `nav-item ${active ? 'active' : ''}`,
      'aria-current': active ? 'page' : null,
      title: extra.title,
      onclick: () => go(ctx),
    }, extra.avatar || icon(iconName), h('span', { class: 'nav-label' }, label, extra.sub && h('small', {}, extra.sub)), count ? h('span', { class: 'count' }, count) : null);
  };

  const teammates = state.users.filter((u) => u.active && u.id !== state.me.id);
  const byLevel = state.levels.map((l) => ({ level: l, members: teammates.filter((u) => u.levelId === l.id) }))
    .filter((g) => g.members.length);
  const noLevel = teammates.filter((u) => !state.levels.some((l) => l.id === u.levelId));

  clear(els.sidebar,
    h('div', { class: 'brand' }, h('img', { src: 'img/icon.svg', alt: '' }), 'Beaver'),
    h('nav', { class: 'nav', 'aria-label': 'Boards' },
      h('div', { class: 'nav-group' }, 'My space'),
      item({ type: 'mine' }, 'grid', 'My board', c.mine),
      item({ type: 'private' }, 'lock', 'Private notes', c.private),
      item({ type: 'delegated' }, 'send', 'Assigned by me', c.delegated),
      h('div', { class: 'nav-group' }, 'Team'),
      teammates.length === 0 && h('p', { class: 'nav-empty' }, state.me.isAdmin ? 'Add teammates in Settings → Team members.' : 'No teammates yet.'),
      byLevel.map(({ level, members }) => [
        h('div', { class: 'nav-level' }, `Level ${level.rank} · ${level.name}`),
        members.map((u) => item({ type: 'member', memberId: u.id }, null, u.name, c.members[u.id], {
          avatar: avatar(u, 'sm'),
          title: state.assignable.has(u.id) ? `You can assign tasks to ${u.name}` : `${u.name} (you cannot assign to this level)`,
        })),
      ]),
      noLevel.length > 0 && [h('div', { class: 'nav-level' }, 'No level'), noLevel.map((u) => item({ type: 'member', memberId: u.id }, null, u.name, c.members[u.id], { avatar: avatar(u, 'sm') }))]),
    h('div', { class: 'sidebar-foot' },
      h('div', { class: 'me' }, avatar(state.me, 'sm'), h('span', {}, state.me.name, h('small', {}, levelLabel(state.me.levelId)))),
      h('button', { type: 'button', class: `nav-item ${state.page === 'settings' ? 'active' : ''}`, onclick: () => { state.page = 'settings'; closeNav(); renderAll(); } }, icon('settings'), h('span', { class: 'nav-label' }, 'Settings')),
      h('button', {
        type: 'button', class: 'nav-item',
        onclick: async () => { await api.logout().catch(() => {}); state.me = null; stopTimers(); renderAuth(false); },
      }, icon('logout'), h('span', { class: 'nav-label' }, 'Sign out'))));
}

const closeNav = () => document.body.classList.remove('nav-open');

function go(ctx) {
  state.page = 'board';
  state.context = ctx;
  state.memberFilter = 'all';
  state.tasks = [];
  closeNav();
  renderAll();
  refresh();
}

// ---------- header + content ----------

function contextTitle() {
  if (state.page === 'settings') return ['Settings', ''];
  const ctx = state.context;
  if (ctx.type === 'mine') return ['My board', 'Your own notes and tasks assigned to you'];
  if (ctx.type === 'private') return ['Private notes', 'Only you can ever see these'];
  if (ctx.type === 'delegated') return ['Assigned by me', 'Everything you have handed to teammates'];
  const u = userById(ctx.memberId);
  return [u?.name || 'Member', levelLabel(u?.levelId)];
}

function renderHeader() {
  const [title, sub] = contextTitle();
  const member = state.page === 'board' && state.context.type === 'member' ? userById(state.context.memberId) : null;
  clear(els.title, member && avatar(member), h('div', {}, h('h1', {}, title), sub && h('p', {}, sub)));

  const onBoard = state.page === 'board';
  els.search.hidden = !onBoard;
  els.doneToggle.hidden = !onBoard;
  els.viewToggle.hidden = !onBoard;
  els.newBtn.hidden = !onBoard || (member && !state.assignable.has(member.id));

  clear(els.viewToggle, [['wall', 'grid', 'Wall'], ['list', 'list', 'List']].map(([v, ic, label]) => h('button', {
    type: 'button',
    class: state.view === v ? 'active' : '',
    'aria-pressed': state.view === v ? 'true' : 'false',
    title: `${label} view`,
    onclick: () => {
      state.view = v;
      api.updateMe({ prefs: { view: v } }).catch(() => {});
      renderHeader();
      renderContent();
    },
  }, icon(ic), h('span', { class: 'label' }, label))));

  // Member filter chips
  clear(els.filters);
  if (member) {
    const counts = { all: 0, 'assigned-by-me': 0, 'their-own': 0, 'assigned-to-me': 0 };
    for (const t of state.tasks) {
      if (t.status === 'done' && !state.showDone) continue;
      counts.all += 1;
      counts[relation(t)] += 1;
    }
    const chip = (key, label) => h('button', {
      type: 'button',
      class: `chip ${state.memberFilter === key ? 'on' : ''}`,
      onclick: () => { state.memberFilter = key; renderHeader(); renderContent(); },
    }, label, h('span', { class: 'count' }, counts[key]));
    els.filters.append(
      chip('all', 'All'),
      chip('assigned-by-me', `Assigned by me`),
      chip('their-own', `${member.name.split(/\s+/)[0]}'s own notes`),
      chip('assigned-to-me', 'Assigned to me'),
    );
  }
}

function visibleTasks() {
  let list = state.tasks;
  if (state.context.type === 'member' && state.memberFilter !== 'all') list = list.filter((t) => relation(t) === state.memberFilter);
  if (state.search) {
    list = list.filter((t) => `${t.title} ${t.body} ${userById(t.assignedTo)?.name || ''} ${userById(t.createdBy)?.name || ''}`.toLowerCase().includes(state.search));
  }
  return list;
}

function renderContent() {
  resetResizeWatch();
  clear(els.content);
  els.content.className = `content ${state.page === 'settings' ? 'is-settings' : `is-${state.view}`}`;
  if (state.page === 'settings') {
    renderSettings(els.content, { reload: reloadAll });
    return;
  }
  const tasks = visibleTasks();
  const shown = tasks.filter((t) => state.showDone || t.status !== 'done');
  if (!shown.length) {
    els.content.append(emptyState(tasks.length > shown.length));
    return;
  }
  if (state.view === 'list') renderList(els.content, tasks, actions);
  else renderWall(els.content, tasks, actions);
}

function emptyState(hasDone) {
  if (state.loading) return h('p', { class: 'empty muted' }, 'Loading…');
  if (state.search) return h('div', { class: 'empty' }, h('p', {}, 'No notes match your search.'));
  const ctx = state.context;
  const member = ctx.type === 'member' ? userById(ctx.memberId) : null;
  const msg = {
    mine: 'Your board is empty. Stick your first note on it!',
    private: 'No private notes yet. Notes you mark as private appear here and nobody else can see them.',
    delegated: 'You have not assigned anything to anyone yet.',
    member: member && (state.assignable.has(member.id)
      ? `Nothing here yet. Use “New note” to assign something to ${member.name}.`
      : `Nothing to show. Your level cannot assign tasks to ${member.name}, so only tasks between the two of you appear here.`),
  }[ctx.type];
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-note', 'aria-hidden': 'true' }),
    h('p', {}, hasDone ? 'Everything here is done. ' : '', msg),
    (ctx.type !== 'member' || state.assignable.has(member?.id)) && ctx.type !== 'delegated'
      && h('button', { class: 'btn primary', onclick: () => newNote() }, icon('plus'), 'New note'));
}

function renderAll() {
  renderSidebar();
  renderHeader();
  renderContent();
}

// ---------- data ----------

let refreshSeq = 0;
async function refresh() {
  if (!state.me || state.page !== 'board') {
    if (state.me) loadCounts();
    return;
  }
  const seq = ++refreshSeq;
  state.loading = true;
  try {
    const ctx = state.context;
    const params = ctx.type === 'member' ? { member: ctx.memberId } : { scope: ctx.type };
    const [tasks, counts] = await Promise.all([api.tasks(params), api.counts()]);
    if (seq !== refreshSeq) return;
    state.tasks = tasks;
    state.counts = counts;
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) toast(err.message, 'error');
  } finally {
    if (seq === refreshSeq) state.loading = false;
  }
  if (seq === refreshSeq && state.me) renderAll();
}

async function loadCounts() {
  try { state.counts = await api.counts(); renderSidebar(); } catch { /* ignore */ }
}

/** Reload members, levels and permissions after a settings change. */
async function reloadAll({ keepPage = false } = {}) {
  await loadSession();
  if (!keepPage) renderAll();
  else { renderSidebar(); renderHeader(); }
}

// ---------- actions ----------

const actions = {
  open: (task) => openEditor(task, {
    onSave: async (patch) => {
      const updated = await api.updateTask(task.id, patch);
      applyUpdate(updated);
      toast('Saved');
    },
    onDelete: () => removeTask(task),
  }),

  async update(task, patch, { quiet = false } = {}) {
    try {
      const updated = await api.updateTask(task.id, patch);
      if (quiet) {
        // Size changes are already on screen; avoid re-rendering mid-resize.
        Object.assign(task, updated);
        if (patch.color) renderContent();
      } else {
        applyUpdate(updated);
        if (patch.status === 'done') toast('Nice! Marked as done');
      }
    } catch (err) { toast(err.message, 'error'); }
  },

  remove: (task) => removeTask(task),
  rerender: () => renderContent(),
};

function applyUpdate(updated) {
  const ctx = state.context;
  // Drop it from this board if it no longer belongs here (e.g. reassigned or made private).
  const belongs = {
    mine: updated.assignedTo === state.me.id && !updated.isPrivate,
    private: updated.isPrivate,
    delegated: updated.createdBy === state.me.id && updated.assignedTo !== state.me.id,
    member: ctx.type === 'member' && [updated.assignedTo, updated.createdBy].includes(ctx.memberId),
  }[ctx.type];
  const i = state.tasks.findIndex((t) => t.id === updated.id);
  if (belongs) {
    if (i >= 0) state.tasks[i] = updated; else state.tasks.push(updated);
  } else if (i >= 0) {
    state.tasks.splice(i, 1);
  }
  renderAll();
  loadCounts();
}

async function removeTask(task) {
  if (!(await confirmDialog(`Delete “${task.title || 'this note'}”? This cannot be undone.`))) return false;
  try {
    await api.deleteTask(task.id);
    state.tasks = state.tasks.filter((t) => t.id !== task.id);
    renderAll();
    loadCounts();
    toast('Note deleted');
    return true;
  } catch (err) {
    toast(err.message, 'error');
    return false;
  }
}

function newNote() {
  const ctx = state.context;
  const preset = {};
  if (ctx.type === 'private') preset.isPrivate = true;
  if (ctx.type === 'member' && state.assignable.has(ctx.memberId)) preset.assignedTo = ctx.memberId;
  openEditor(null, {
    preset,
    onSave: async (patch) => {
      const created = await api.createTask(patch);
      applyUpdate(created);
      const who = created.assignedTo === state.me.id ? '' : ` for ${userById(created.assignedTo)?.name}`;
      toast(`Note stuck${who}`);
    },
  });
}

// ---------- background refresh & reminders ----------

let timers = [];
function startTimers() {
  stopTimers();
  // Pick up tasks teammates assign to you.
  timers.push(setInterval(() => {
    if (document.visibilityState === 'visible' && !document.querySelector('dialog[open], .popover')) refresh();
  }, 60_000));
  timers.push(setInterval(checkReminders, 60_000));
  checkReminders();
}
function stopTimers() { timers.forEach(clearInterval); timers = []; }

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.me && !document.querySelector('dialog[open]')) refresh();
});

async function checkReminders() {
  if (!state.me || !state.prefs.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
  let tasks;
  try {
    const [mine, priv] = await Promise.all([api.tasks({ scope: 'mine' }), api.tasks({ scope: 'private' })]);
    tasks = [...mine, ...priv];
  } catch { return; }
  const today = todayStr();
  for (const t of tasks) {
    if (t.status === 'done' || !t.dueDate) continue;
    const due = dueInfo(t);
    let kind = null;
    if (due.state === 'overdue') kind = 'overdue';
    else if (due.state === 'today' && !t.dueTime) kind = 'today';
    else if (due.state === 'today') {
      // Timed tasks: remind 15 minutes ahead.
      const [hh, mm] = t.dueTime.split(':').map(Number);
      const at = new Date();
      at.setHours(hh, mm, 0, 0);
      if (at - Date.now() <= 15 * 60e3) kind = 'soon';
    }
    if (!kind) continue;
    const key = `beaver:reminded:${t.id}:${today}:${kind}`;
    try { if (localStorage.getItem(key)) continue; localStorage.setItem(key, '1'); } catch { /* storage unavailable */ }
    const heading = { overdue: 'Overdue task', today: 'Due today', soon: `Due at ${t.dueTime}` }[kind];
    const n = new Notification(heading, {
      body: `${t.title || t.body}${t.dueTime ? ` — ${t.dueTime}` : ''}`,
      tag: `beaver-${t.id}`,
    });
    n.onclick = () => { window.focus(); go({ type: t.isPrivate ? 'private' : 'mine' }); };
  }
}

boot();
