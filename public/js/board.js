// The sticky-note wall.

import { h, append, icon, avatar, dueInfo, dueKey, inkFor, popover, todayStr, addDays } from './util.js';
import { state, fontCss, noteLook, userById, relation, canEditContent, canEditStyle } from './state.js';

/** Deterministic small tilt so the wall looks hand-placed but doesn't jump around between renders. */
const tilt = (id) => `${(((id * 7919) % 7) - 3) * 0.45}deg`;

export function sortForWall(tasks) {
  const open = tasks.filter((t) => t.status !== 'done');
  const dated = open.filter((t) => t.dueDate)
    .sort((a, b) => dueKey(a).localeCompare(dueKey(b)) || b.urgent - a.urgent || a.id - b.id);
  const undated = open.filter((t) => !t.dueDate)
    .sort((a, b) => b.urgent - a.urgent || b.createdAt.localeCompare(a.createdAt));
  const done = tasks.filter((t) => t.status === 'done')
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  return { dated, undated, done };
}

export function renderWall(container, tasks, actions) {
  const { dated, undated, done } = sortForWall(tasks);
  const section = (title, items, cls) => items.length > 0 && h('section', { class: `wall-section ${cls}` },
    h('h2', { class: 'wall-heading' }, title, h('span', { class: 'count' }, items.length)),
    h('div', { class: 'wall' }, items.map((t) => noteEl(t, actions))));

  append(container,
    section('Scheduled', dated, 'scheduled'),
    section('Notes', undated, 'unscheduled'),
    state.showDone && section('Done', done, 'done'),
  );
}

export function noteEl(task, actions, { preview = false } = {}) {
  const look = noteLook(task);
  const due = dueInfo(task);
  const rel = relation(task);
  const editableStyle = !preview && canEditStyle(task);
  const editableContent = !preview && canEditContent(task);
  const done = task.status === 'done';

  const badges = h('div', { class: 'note-badges' },
    task.dueDate
      ? h('button', {
        class: `due-chip ${due.state}`,
        type: 'button',
        title: editableContent ? 'Change date' : due.label,
        disabled: !editableContent,
        onclick: (e) => { e.stopPropagation(); datePopover(e.currentTarget, task, actions); },
      }, icon(due.icon), due.label)
      : null,
    task.urgent ? h('span', { class: 'badge urgent', title: 'Urgent' }, icon('flame'), 'Urgent') : null,
    task.isPrivate ? h('span', { class: 'badge private', title: 'Private — only you can see this' }, icon('lock')) : null,
  );

  const people = rel === 'own' ? null : h('div', { class: 'note-people' },
    rel === 'assigned-by-me' && [h('span', {}, 'to'), avatar(userById(task.assignedTo), 'xs'), h('span', {}, firstName(task.assignedTo))],
    rel === 'assigned-to-me' && [h('span', {}, 'from'), avatar(userById(task.createdBy), 'xs'), h('span', {}, firstName(task.createdBy))],
    rel === 'their-own' && [avatar(userById(task.createdBy), 'xs'), h('span', {}, `${firstName(task.createdBy)}'s note`)],
  );

  const tools = preview ? null : h('div', { class: 'note-tools' },
    editableStyle && toolBtn(done ? 'undo' : 'check', done ? 'Mark as not done' : 'Mark as done',
      () => actions.update(task, { status: done ? 'open' : 'done' })),
    editableContent && !task.dueDate && toolBtn('calendar', 'Add a date', (e) => datePopover(e.currentTarget, task, actions)),
    editableStyle && toolBtn('palette', 'Change color', (e) => colorPopover(e.currentTarget, task, actions)),
    editableContent && toolBtn('trash', 'Delete', () => actions.remove(task)),
  );

  const el = h('article', {
    class: `note ${done ? 'is-done' : ''} ${due.state !== 'none' ? `due-${due.state}` : ''} ${editableStyle ? 'resizable' : ''}`,
    tabIndex: preview ? -1 : 0,
    dataset: { id: task.id },
    style: {
      '--note-bg': look.color,
      '--note-ink': inkFor(look.color),
      '--tilt': preview ? '0deg' : tilt(task.id),
      width: `${look.width}px`,
      height: `${look.height}px`,
      fontFamily: fontCss(look.fontFamily),
      fontSize: `${look.fontSize}px`,
    },
    'aria-label': task.title || 'Note',
    onclick: preview ? null : (e) => { if (!e.target.closest('button')) actions.open(task); },
    onkeydown: preview ? null : (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) actions.open(task); },
  },
  h('div', { class: 'tape', 'aria-hidden': 'true' }),
  badges,
  h('div', { class: 'note-content' },
    task.title ? h('h3', { class: 'note-title' }, task.title) : null,
    task.body ? h('p', { class: 'note-body' }, task.body) : null),
  h('footer', { class: 'note-footer' }, people, tools),
  done ? h('div', { class: 'done-stamp', 'aria-hidden': 'true' }, icon('check')) : null);

  if (editableStyle) watchResize(el, task, actions);
  return el;
}

const firstName = (id) => (userById(id)?.name || 'Unknown').split(/\s+/)[0];

const toolBtn = (name, label, onClick) => h('button', {
  class: 'tool',
  type: 'button',
  title: label,
  'aria-label': label,
  onclick: (e) => { e.stopPropagation(); onClick(e); },
}, icon(name));

/** Save the new size after the user drags a note's resize corner. One observer is shared by the whole wall. */
const resizeTargets = new WeakMap();
const resizeTimers = new WeakMap();
const resizeObserver = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    const entry = resizeTargets.get(target);
    if (!entry) continue;
    clearTimeout(resizeTimers.get(target));
    resizeTimers.set(target, setTimeout(() => {
      if (!target.isConnected) return;
      const w = Math.round(target.offsetWidth);
      const hgt = Math.round(target.offsetHeight);
      const look = noteLook(entry.task);
      if (Math.abs(w - look.width) > 2 || Math.abs(hgt - look.height) > 2) {
        entry.actions.update(entry.task, {
          width: Math.min(800, Math.max(120, w)),
          height: Math.min(800, Math.max(100, hgt)),
        }, { quiet: true });
      }
    }, 450));
  }
});

/** Stop watching notes from a previous render. */
export const resetResizeWatch = () => resizeObserver.disconnect();

function watchResize(el, task, actions) {
  resizeTargets.set(el, { task, actions });
  resizeObserver.observe(el);
}

export function datePopover(anchor, task, actions) {
  const date = h('input', { type: 'date', value: task.dueDate || '' });
  const time = h('input', { type: 'time', value: task.dueTime || '' });
  let close;
  const save = (dueDate, dueTime) => {
    close();
    actions.update(task, { dueDate: dueDate || null, dueTime: dueDate ? (dueTime || null) : null });
  };
  const quick = (label, value) => h('button', { type: 'button', class: 'btn small ghost', onclick: () => save(value, time.value) }, label);
  close = popover(anchor, h('form', {
    class: 'date-pop',
    onsubmit: (e) => { e.preventDefault(); save(date.value, time.value); },
  },
  h('div', { class: 'quick-row' }, quick('Today', todayStr()), quick('Tomorrow', addDays(1)), quick('Next week', addDays(7))),
  h('label', {}, 'Date', date),
  h('label', {}, 'Time (optional)', time),
  h('div', { class: 'pop-actions' },
    task.dueDate ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => save(null) }, 'Remove date') : null,
    h('button', { type: 'submit', class: 'btn small primary' }, 'Save'))));
}

export function colorPopover(anchor, task, actions) {
  let close;
  const choose = (color) => { close(); actions.update(task, { color }, { quiet: true }); };
  const custom = h('input', { type: 'color', value: task.color || '#fff59d', title: 'Custom color', onchange: (e) => choose(e.target.value) });
  close = popover(anchor, h('div', { class: 'color-pop' },
    h('div', { class: 'swatches' }, state.noteColors.map((c) => h('button', {
      type: 'button',
      class: `swatch ${c === task.color ? 'selected' : ''}`,
      style: { background: c },
      title: c,
      'aria-label': `Color ${c}`,
      onclick: () => choose(c),
    }))),
    h('label', { class: 'custom-color' }, custom, 'Custom…')));
}
