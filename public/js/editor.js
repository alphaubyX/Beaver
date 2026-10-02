// Create / edit dialog for a sticky note, with a live preview.

import { h, icon, clear, todayStr, addDays, formatDateTime } from './util.js';
import {
  state, FONTS, SIZES, userById, levelLabel, newNoteDefaults, noteLook, canEditContent, canEditStyle,
} from './state.js';
import { noteEl } from './board.js';

/**
 * @param {object|null} task existing task, or null for a new one
 * @param {object} opts { preset: fields for a new note, onSave(patch), onDelete() }
 */
export function openEditor(task, { preset = {}, onSave, onDelete }) {
  const isNew = !task;
  const draft = isNew
    ? { title: '', body: '', assignedTo: state.me.id, isPrivate: false, dueDate: null, dueTime: null, urgent: false, status: 'open', ...newNoteDefaults(), ...preset }
    : { ...task, ...noteLook(task) };
  const contentOk = isNew || canEditContent(task);
  const styleOk = isNew || canEditStyle(task);
  const readOnly = !contentOk && !styleOk;

  const preview = h('div', { class: 'editor-preview' });
  const renderPreview = () => {
    clear(preview, noteEl({
      id: task?.id || 0,
      createdBy: isNew ? state.me.id : task.createdBy,
      createdAt: task?.createdAt || new Date().toISOString(),
      ...draft,
      title: draft.title || (isNew ? 'Your note' : ''),
    }, {}, { preview: true }));
  };

  const field = (label, control, extra = {}) => h('label', { class: `field ${extra.class || ''}` }, h('span', { class: 'field-label' }, label), control);
  const bind = (el, key, transform = (v) => v) => {
    el.addEventListener('input', () => { draft[key] = transform(el.type === 'checkbox' ? el.checked : el.value); renderPreview(); syncPrivate(); });
    return el;
  };

  // ----- content -----
  const title = bind(h('input', { type: 'text', value: draft.title, maxLength: 200, placeholder: 'What needs doing?', disabled: !contentOk, required: false }), 'title');
  const body = bind(h('textarea', { rows: 4, maxLength: 5000, placeholder: 'Details (optional)', disabled: !contentOk }, draft.body || ''), 'body');

  // ----- assignment -----
  const assign = h('select', { disabled: !contentOk });
  assign.append(h('option', { value: state.me.id }, 'Me'));
  const groups = new Map();
  for (const u of state.users) {
    if (u.id === state.me.id || !u.active) continue;
    const allowed = state.assignable.has(u.id);
    if (!allowed && u.id !== draft.assignedTo) continue;
    const key = levelLabel(u.levelId);
    if (!groups.has(key)) groups.set(key, h('optgroup', { label: key }));
    groups.get(key).append(h('option', { value: u.id, disabled: !allowed && u.id !== draft.assignedTo }, u.name));
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  sortedGroups.forEach(([, g]) => assign.append(g));
  if (draft.assignedTo !== state.me.id && !userById(draft.assignedTo)?.active) {
    assign.append(h('option', { value: draft.assignedTo }, userById(draft.assignedTo)?.name || 'Unknown'));
  }
  assign.value = String(draft.assignedTo);
  bind(assign, 'assignedTo', Number);

  const privateBox = bind(h('input', { type: 'checkbox', checked: draft.isPrivate, disabled: !contentOk }), 'isPrivate');
  const privateRow = h('label', { class: 'check' }, privateBox, icon('lock'), 'Private — only I can see this note');
  function syncPrivate() {
    const self = Number(draft.assignedTo) === state.me.id;
    privateRow.hidden = !self;
    if (!self) draft.isPrivate = false;
  }
  syncPrivate();

  // ----- schedule -----
  const date = bind(h('input', { type: 'date', value: draft.dueDate || '', disabled: !contentOk }), 'dueDate', (v) => v || null);
  const time = bind(h('input', { type: 'time', value: draft.dueTime || '', disabled: !contentOk }), 'dueTime', (v) => v || null);
  const setDate = (v) => { date.value = v; draft.dueDate = v || null; if (!v) { time.value = ''; draft.dueTime = null; } renderPreview(); };
  const quick = (label, v) => h('button', { type: 'button', class: 'btn small ghost', disabled: !contentOk, onclick: () => setDate(v) }, label);
  const urgent = bind(h('input', { type: 'checkbox', checked: draft.urgent, disabled: !contentOk }), 'urgent');

  // ----- look -----
  const swatches = h('div', { class: 'swatches' });
  const customColor = h('input', { type: 'color', value: draft.color, disabled: !styleOk, title: 'Custom color' });
  const renderSwatches = () => clear(swatches, state.noteColors.map((c) => h('button', {
    type: 'button',
    class: `swatch ${c === draft.color ? 'selected' : ''}`,
    style: { background: c },
    'aria-label': `Color ${c}`,
    disabled: !styleOk,
    onclick: () => { draft.color = c; customColor.value = c; renderSwatches(); renderPreview(); },
  })), h('label', { class: 'swatch custom', title: 'Custom color' }, customColor));
  customColor.addEventListener('input', () => { draft.color = customColor.value; renderSwatches(); renderPreview(); });
  renderSwatches();

  const font = h('select', { disabled: !styleOk }, FONTS.map((f) => h('option', { value: f.id, style: { fontFamily: f.css } }, f.label)));
  font.value = draft.fontFamily;
  bind(font, 'fontFamily');

  const sizeOut = h('output', {}, `${draft.fontSize}px`);
  const fontSize = h('input', { type: 'range', min: 12, max: 40, value: draft.fontSize, disabled: !styleOk });
  fontSize.addEventListener('input', () => { draft.fontSize = Number(fontSize.value); sizeOut.value = `${fontSize.value}px`; renderPreview(); });

  const width = h('input', { type: 'number', min: 120, max: 800, step: 10, value: draft.width, disabled: !styleOk });
  const height = h('input', { type: 'number', min: 100, max: 800, step: 10, value: draft.height, disabled: !styleOk });
  const clampSize = () => {
    draft.width = Math.min(800, Math.max(120, Number(width.value) || 120));
    draft.height = Math.min(800, Math.max(100, Number(height.value) || 100));
    renderPreview();
  };
  width.addEventListener('change', clampSize);
  height.addEventListener('change', clampSize);
  const sizeBtns = Object.entries(SIZES).map(([, s]) => h('button', {
    type: 'button',
    class: 'btn small ghost',
    disabled: !styleOk,
    onclick: () => { width.value = s.width; height.value = s.height; clampSize(); },
  }, s.label));

  // ----- meta / actions -----
  const meta = !isNew && h('p', { class: 'editor-meta' },
    `Written by ${task.createdBy === state.me.id ? 'you' : userById(task.createdBy)?.name || 'Unknown'} · ${formatDateTime(task.createdAt)}`,
    task.completedAt ? ` · Completed ${formatDateTime(task.completedAt)}` : '');

  const error = h('p', { class: 'form-error', role: 'alert' });
  const doneToggle = !isNew && styleOk && h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: draft.status === 'done', onchange: (e) => { draft.status = e.target.checked ? 'done' : 'open'; renderPreview(); } }),
    'Completed');

  const dlg = h('dialog', { class: 'editor', 'aria-label': isNew ? 'New note' : 'Edit note' });
  const form = h('form', { method: 'dialog', onsubmit: submit },
    h('header', { class: 'dialog-head' },
      h('h2', {}, isNew ? 'New note' : readOnly ? 'Note' : 'Edit note'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => dlg.close() }, icon('x'))),
    h('div', { class: 'editor-grid' },
      h('div', { class: 'editor-fields' },
        readOnly && h('p', { class: 'notice' }, 'This is a team member\'s own note. You can view it but not change it.'),
        !isNew && !contentOk && styleOk && h('p', { class: 'notice' }, 'This task was assigned to you. You can mark it done and change how it looks.'),
        field('Title', title),
        field('Details', body),
        h('div', { class: 'row' },
          field('Assign to', assign, { class: 'grow' })),
        privateRow,
        h('fieldset', {},
          h('legend', {}, 'Schedule'),
          h('div', { class: 'row' }, field('Date', date), field('Time', time)),
          h('div', { class: 'quick-row' }, quick('Today', todayStr()), quick('Tomorrow', addDays(1)), quick('Next week', addDays(7)), quick('No date', '')),
          h('label', { class: 'check' }, urgent, icon('flame', 'urgent-icon'), 'Urgent')),
        h('fieldset', {},
          h('legend', {}, 'Look'),
          field('Color', swatches),
          h('div', { class: 'row' }, field('Font', font, { class: 'grow' }), field(h('span', {}, 'Font size ', sizeOut), fontSize)),
          h('div', { class: 'row' }, field('Width', width), field('Height', height), h('div', { class: 'size-btns' }, sizeBtns))),
        doneToggle,
        meta,
        error),
      preview),
    h('footer', { class: 'dialog-actions' },
      !isNew && contentOk && onDelete && h('button', { type: 'button', class: 'btn danger ghost left', onclick: async () => { if (await onDelete()) dlg.close(); } }, icon('trash'), 'Delete'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, readOnly ? 'Close' : 'Cancel'),
      !readOnly && h('button', { type: 'submit', class: 'btn primary' }, isNew ? 'Stick it' : 'Save')));

  async function submit(e) {
    e.preventDefault();
    error.textContent = '';
    if (contentOk && !draft.title.trim() && !(draft.body || '').trim()) {
      error.textContent = 'Write something on the note first.';
      title.focus();
      return;
    }
    const patch = {};
    if (styleOk) Object.assign(patch, { color: draft.color, fontFamily: draft.fontFamily, fontSize: draft.fontSize, width: draft.width, height: draft.height, status: draft.status });
    if (contentOk) {
      Object.assign(patch, {
        title: draft.title,
        body: draft.body || '',
        assignedTo: Number(draft.assignedTo),
        isPrivate: !!draft.isPrivate,
        dueDate: draft.dueDate || null,
        dueTime: draft.dueDate ? draft.dueTime || null : null,
        urgent: !!draft.urgent,
      });
    }
    try {
      await onSave(patch);
      dlg.close();
    } catch (err) {
      error.textContent = err.message;
    }
  }

  dlg.append(form);
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  renderPreview();
  dlg.showModal();
  if (contentOk) title.focus();
}
