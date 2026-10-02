// Table view of tasks.

import { h, icon, avatar, dueInfo, dueKey, formatDate, formatDateTime } from './util.js';
import { state, userById, canEditStyle } from './state.js';

let sort = { key: 'due', dir: 1 };

const statusOf = (t) => {
  if (t.status === 'done') return { key: 'done', label: 'Done', rank: 5 };
  const due = dueInfo(t);
  if (due.state === 'overdue') return { key: 'overdue', label: 'Overdue', rank: 0 };
  if (due.state === 'today') return { key: 'today', label: 'Due today', rank: 1 };
  if (t.urgent) return { key: 'urgent', label: 'Urgent', rank: 2 };
  if (due.state === 'soon') return { key: 'soon', label: 'Due soon', rank: 3 };
  return { key: 'open', label: 'Open', rank: 4 };
};

const nameOf = (id) => userById(id)?.name || 'Unknown';

const COLUMNS = [
  { key: 'done', label: '', sortable: false },
  { key: 'title', label: 'Task', value: (t) => (t.title || t.body).toLowerCase() },
  { key: 'assignedTo', label: 'Assigned to', value: (t) => nameOf(t.assignedTo).toLowerCase() },
  { key: 'createdBy', label: 'Assigned by', value: (t) => nameOf(t.createdBy).toLowerCase() },
  { key: 'due', label: 'Due', value: (t) => dueKey(t) },
  { key: 'status', label: 'Status', value: (t) => statusOf(t).rank },
  { key: 'completedAt', label: 'Completed', value: (t) => t.completedAt || '~' },
  { key: 'createdAt', label: 'Created', value: (t) => t.createdAt },
];

export function renderList(container, tasks, actions) {
  const rows = tasks.filter((t) => state.showDone || t.status !== 'done');
  const col = COLUMNS.find((c) => c.key === sort.key);
  rows.sort((a, b) => {
    const va = col.value(a);
    const vb = col.value(b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir || a.id - b.id;
  });

  const header = h('tr', {}, COLUMNS.map((c) => h('th', {
    scope: 'col',
    class: c.sortable === false ? 'narrow' : 'sortable',
    'aria-sort': c.key === sort.key ? (sort.dir === 1 ? 'ascending' : 'descending') : null,
  }, c.sortable === false ? h('span', { class: 'sr-only' }, 'Done') : h('button', {
    type: 'button',
    onclick: () => {
      sort = sort.key === c.key ? { key: c.key, dir: -sort.dir } : { key: c.key, dir: 1 };
      actions.rerender();
    },
  }, c.label, c.key === sort.key ? icon(sort.dir === 1 ? 'arrowUp' : 'arrowDown', 'sort-icon') : null))));

  const body = rows.map((t) => {
    const st = statusOf(t);
    const due = dueInfo(t);
    return h('tr', { class: t.status === 'done' ? 'is-done' : '', onclick: (e) => { if (!e.target.closest('input')) actions.open(t); } },
      h('td', { class: 'narrow' }, h('input', {
        type: 'checkbox',
        checked: t.status === 'done',
        disabled: !canEditStyle(t),
        'aria-label': 'Done',
        onchange: (e) => actions.update(t, { status: e.target.checked ? 'done' : 'open' }),
      })),
      h('td', { class: 'task-cell' },
        h('span', { class: 'color-dot', style: { background: t.color || '#fff59d' } }),
        h('span', { class: 'task-title' }, t.title || t.body.slice(0, 80)),
        t.isPrivate ? icon('lock', 'muted') : null,
        t.urgent ? icon('flame', 'urgent-icon') : null),
      h('td', {}, personCell(t.assignedTo)),
      h('td', {}, personCell(t.createdBy)),
      h('td', { class: `due-cell ${due.state}` }, t.dueDate ? [icon(due.icon || 'calendar'), ` ${formatDate(t.dueDate)}${t.dueTime ? ` ${t.dueTime}` : ''}`] : '—'),
      h('td', {}, h('span', { class: `status-pill ${st.key}` }, st.label)),
      h('td', {}, t.completedAt ? formatDateTime(t.completedAt) : '—'),
      h('td', {}, formatDate(t.createdAt.slice(0, 10))));
  });

  container.append(h('div', { class: 'table-wrap' },
    h('table', { class: 'task-table' },
      h('thead', {}, header),
      h('tbody', {}, body))));
}

function personCell(id) {
  const u = userById(id);
  return h('span', { class: 'person' }, avatar(u, 'xs'), id === state.me.id ? 'Me' : (u?.name || 'Unknown'));
}
