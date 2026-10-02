// Small DOM + date helpers shared by the UI modules.

/** Create an element. Text children are inserted as text nodes, so user content is never parsed as HTML. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (v === undefined || v === null) continue;
        if (k.startsWith('--')) el.style.setProperty(k, v);
        else el.style[k] = v;
      }
    } else if (key === 'html') el.innerHTML = value; // only ever used with trusted icon markup
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (value === true) el.setAttribute(key, '');
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

/** Like Element.append, but skips null/false so conditional children can be written inline. */
export function append(el, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

// ---------- icons (trusted static SVG) ----------

const svg = (body) => `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  alert: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  clock: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  flame: svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.3 1.2 1.2 2.3 2.5 2.8z"/>'),
  lock: svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  undo: svg('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>'),
  palette: svg('<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7h2A5.6 5.6 0 0 0 22 11.1C22 6.1 17.5 2 12 2z"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  grid: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  send: svg('<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'),
  menu: svg('<path d="M3 12h18M3 6h18M3 18h18"/>'),
  search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  arrowUp: svg('<path d="m18 15-6-6-6 6"/>'),
  arrowDown: svg('<path d="m6 9 6 6 6-6"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  arrowRight: svg('<path d="M5 12h14M12 5l7 7-7 7"/>'),
};

export const icon = (name, cls = '') => h('span', { class: `icon ${cls}`, html: ICONS[name] });

// ---------- dates ----------

const pad = (n) => String(n).padStart(2, '0');
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => toDateStr(new Date());
export const addDays = (n, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
};

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const dayDiff = (dateStr) => Math.round((parseDate(dateStr) - parseDate(todayStr())) / 864e5);

export function formatTime(t) {
  if (!t) return '';
  const [hh, mm] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDate(dateStr, { withYear = false } = {}) {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  const opts = { month: 'short', day: 'numeric' };
  if (withYear || d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString([], opts);
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${formatDate(toDateStr(d))}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * Describe how urgent a task's due date is.
 * state: overdue | today | soon (within 2 days) | later | none
 */
export function dueInfo(task) {
  if (!task.dueDate) return { state: 'none', label: '' };
  const diff = dayDiff(task.dueDate);
  const time = task.dueTime ? ` ${formatTime(task.dueTime)}` : '';
  if (task.status === 'done') return { state: 'later', label: formatDate(task.dueDate) + time, icon: 'calendar' };

  const nowHM = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  if (diff < 0 || (diff === 0 && task.dueTime && task.dueTime < nowHM)) {
    const label = diff < 0 ? `Overdue · ${diff === -1 ? 'yesterday' : formatDate(task.dueDate)}` : `Overdue · ${formatTime(task.dueTime)}`;
    return { state: 'overdue', label, icon: 'alert' };
  }
  if (diff === 0) return { state: 'today', label: `Due today${time}`, icon: 'bell' };
  if (diff === 1) return { state: 'soon', label: `Tomorrow${time}`, icon: 'clock' };
  if (diff === 2) return { state: 'soon', label: `${parseDate(task.dueDate).toLocaleDateString([], { weekday: 'short' })}${time}`, icon: 'clock' };
  if (diff < 7) return { state: 'later', label: `${parseDate(task.dueDate).toLocaleDateString([], { weekday: 'short' })}${time}`, icon: 'calendar' };
  return { state: 'later', label: formatDate(task.dueDate) + time, icon: 'calendar' };
}

/** Sort key for due date + time; undated tasks sort last. */
export const dueKey = (t) => (t.dueDate ? `${t.dueDate}T${t.dueTime || '99:99'}` : '9999');

// ---------- colours ----------

/** Pick a readable ink colour for text on the given background. */
export function inkFor(hex) {
  const n = parseInt(String(hex || '#fff59d').slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#2b2416' : '#fdfbf5';
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function avatar(user, size = '') {
  return h('span', {
    class: `avatar ${size}`,
    style: { background: user?.color || '#90a4ae' },
    title: user?.name || 'Unknown',
  }, initials(user?.name || '?'));
}

// ---------- feedback ----------

let toastTimer;
export function toast(message, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3200);
}

/** Show a small floating panel anchored to an element. Returns a close function. */
export function popover(anchor, content, { onClose } = {}) {
  document.querySelectorAll('.popover').forEach((p) => p._close?.());
  const pop = h('div', { class: 'popover', role: 'dialog' }, content);
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  let left = Math.min(Math.max(8, r.left), window.innerWidth - pw - 8);
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  pop.style.left = `${left + window.scrollX}px`;
  pop.style.top = `${top + window.scrollY}px`;

  const onDoc = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    pop.remove();
    document.removeEventListener('pointerdown', onDoc, true);
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
  }
  pop._close = close;
  setTimeout(() => {
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
  });
  pop.querySelector('input, button, select')?.focus();
  return close;
}

export function confirmDialog(message, { okLabel = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'confirm' },
      h('form', { method: 'dialog' },
        h('p', {}, message),
        h('div', { class: 'dialog-actions' },
          h('button', { value: 'cancel', class: 'btn ghost' }, 'Cancel'),
          h('button', { value: 'ok', class: `btn ${danger ? 'danger' : 'primary'}` }, okLabel))));
    document.body.append(dlg);
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'ok'); dlg.remove(); });
    dlg.showModal();
  });
}
