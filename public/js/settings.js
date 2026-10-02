// Settings: preferences, account, levels & hierarchy, team members.

import { h, icon, clear, avatar, toast, confirmDialog } from './util.js';
import { api } from './api.js';
import { state, FONTS, SIZES, levelLabel } from './state.js';

let tab = 'prefs';

export function renderSettings(container, { reload }) {
  const isAdmin = state.me.isAdmin;
  const tabs = [
    ['prefs', 'Note defaults'],
    ['account', 'My account'],
    ['levels', 'Levels'],
    ['team', 'Team members'],
  ];
  const panel = h('div', { class: 'settings-panel' });
  const draw = () => {
    clear(panel);
    ({ prefs: prefsTab, account: accountTab, levels: levelsTab, team: teamTab })[tab](panel, { reload, isAdmin, redraw: draw });
  };

  container.append(h('div', { class: 'settings' },
    h('nav', { class: 'settings-tabs', role: 'tablist' }, tabs.map(([key, label]) => h('button', {
      type: 'button',
      role: 'tab',
      class: key === tab ? 'active' : '',
      'aria-selected': key === tab ? 'true' : 'false',
      onclick: (e) => {
        tab = key;
        e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('active', b === e.currentTarget);
          b.setAttribute('aria-selected', b === e.currentTarget ? 'true' : 'false');
        });
        draw();
      },
    }, label))),
    panel));
  draw();
}

const field = (label, control, hint) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint && h('small', { class: 'hint' }, hint));

// ---------- preferences ----------

function prefsTab(panel, { reload }) {
  const p = state.prefs;
  const font = h('select', {}, FONTS.map((f) => h('option', { value: f.id }, f.label)));
  font.value = p.fontFamily;
  const fontSize = h('input', { type: 'number', min: 10, max: 48, value: p.fontSize });
  const size = h('select', {}, Object.entries(SIZES).map(([k, s]) => h('option', { value: k }, `${s.label} (${s.width}×${s.height})`)));
  size.value = p.noteSize;
  const mode = h('select', {}, h('option', { value: 'random' }, 'Random color for each note'), h('option', { value: 'fixed' }, 'Always the same color'));
  mode.value = p.colorMode;
  const fixed = h('input', { type: 'color', value: p.fixedColor });
  const fixedField = field('Note color', fixed);
  const syncMode = () => { fixedField.hidden = mode.value !== 'fixed'; };
  mode.addEventListener('change', syncMode);
  syncMode();

  const notify = h('input', { type: 'checkbox', checked: p.notifications });

  clear(panel,
    h('h2', {}, 'Note defaults'),
    h('p', { class: 'muted' }, 'New notes start with these settings. You can still change any single note from its editor.'),
    h('form', {
      class: 'settings-form',
      onsubmit: async (e) => {
        e.preventDefault();
        if (notify.checked && 'Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        try {
          const res = await api.updateMe({
            prefs: {
              fontFamily: font.value,
              fontSize: Number(fontSize.value),
              noteSize: size.value,
              colorMode: mode.value,
              fixedColor: fixed.value,
              notifications: notify.checked,
            },
          });
          Object.assign(state.prefs, res.prefs);
          toast('Preferences saved');
          reload();
        } catch (err) { toast(err.message, 'error'); }
      },
    },
    field('Font', font),
    field('Font size (px)', fontSize),
    field('Note size', size),
    field('Colors', mode),
    fixedField,
    h('label', { class: 'check' }, notify, 'Remind me with a desktop notification when my tasks are due'),
    h('div', { class: 'form-actions' }, h('button', { class: 'btn primary', type: 'submit' }, 'Save preferences'))),
  );
}

// ---------- account ----------

function accountTab(panel, { reload }) {
  const name = h('input', { type: 'text', value: state.me.name, maxLength: 80, required: true });
  const current = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const next = h('input', { type: 'password', autocomplete: 'new-password', minLength: 6, required: true });

  clear(panel,
    h('h2', {}, 'My account'),
    h('p', { class: 'muted' }, `Signed in as ${state.me.username} · ${levelLabel(state.me.levelId)}${state.me.isAdmin ? ' · Admin' : ''}`),
    h('form', {
      class: 'settings-form',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const res = await api.updateMe({ name: name.value });
          Object.assign(state.me, res.user);
          toast('Name updated');
          reload();
        } catch (err) { toast(err.message, 'error'); }
      },
    }, field('Display name', name), h('div', { class: 'form-actions' }, h('button', { class: 'btn primary' }, 'Save'))),
    h('h3', {}, 'Change password'),
    h('form', {
      class: 'settings-form',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api.changePassword({ currentPassword: current.value, newPassword: next.value });
          current.value = '';
          next.value = '';
          toast('Password changed');
        } catch (err) { toast(err.message, 'error'); }
      },
    }, field('Current password', current), field('New password', next, 'At least 6 characters'),
    h('div', { class: 'form-actions' }, h('button', { class: 'btn primary' }, 'Change password'))),
  );
}

// ---------- levels ----------

function levelsTab(panel, { reload, isAdmin, redraw }) {
  const levels = state.levels;
  const save = async (fn) => {
    try {
      state.levels = await fn();
      await reload({ keepPage: true });
      redraw();
    } catch (err) { toast(err.message, 'error'); }
  };

  const move = (index, delta) => {
    const ids = levels.map((l) => l.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    save(() => api.reorderLevels(ids));
  };

  const memberCount = (levelId) => state.users.filter((u) => u.active && u.levelId === levelId).length;

  const cards = levels.map((l, i) => {
    const nameInput = h('input', {
      type: 'text', value: l.name, maxLength: 60, disabled: !isAdmin, 'aria-label': `Name of level ${l.rank}`,
      onchange: (e) => save(() => api.updateLevel(l.id, { name: e.target.value })),
    });
    return h('div', { class: 'level-card' },
      h('div', { class: 'level-head' },
        h('span', { class: 'level-rank' }, `Level ${l.rank}`),
        nameInput,
        h('span', { class: 'muted small' }, `${memberCount(l.id)} member(s)`),
        isAdmin && h('div', { class: 'level-buttons' },
          h('button', { type: 'button', class: 'icon-btn', title: 'Move up', disabled: i === 0, onclick: () => move(i, -1) }, icon('arrowUp')),
          h('button', { type: 'button', class: 'icon-btn', title: 'Move down', disabled: i === levels.length - 1, onclick: () => move(i, 1) }, icon('arrowDown')),
          h('button', {
            type: 'button', class: 'icon-btn danger', title: 'Delete level',
            onclick: async () => {
              if (await confirmDialog(`Delete "${l.name}"?`)) save(() => api.deleteLevel(l.id));
            },
          }, icon('trash')))),
      h('div', { class: 'level-rules' },
        h('span', { class: 'small muted' }, 'Can submit tasks to:'),
        h('div', { class: 'chips' }, levels.map((target) => {
          const checked = l.canAssignTo.includes(target.id);
          return h('label', { class: `chip ${checked ? 'on' : ''}` },
            h('input', {
              type: 'checkbox',
              checked,
              disabled: !isAdmin,
              onchange: (e) => {
                const set = new Set(l.canAssignTo);
                if (e.target.checked) set.add(target.id); else set.delete(target.id);
                save(() => api.updateLevel(l.id, { canAssignTo: [...set] }));
              },
            }),
            `L${target.rank} · ${target.name}`);
        }))));
  });

  const newName = h('input', { type: 'text', placeholder: 'e.g. Managers', maxLength: 60, required: true });

  clear(panel,
    h('h2', {}, 'Levels & hierarchy'),
    h('p', { class: 'muted' },
      'Level 1 is the top. Each level decides which levels its members may submit tasks to. ',
      'Members can also see the own (non-private) notes of the people they are allowed to submit tasks to. ',
      'Private notes are never visible to anyone else.'),
    !isAdmin && h('p', { class: 'notice' }, 'Only admins can change levels.'),
    h('div', { class: 'levels' }, cards),
    isAdmin && h('form', {
      class: 'inline-form',
      onsubmit: (e) => {
        e.preventDefault();
        const name = newName.value;
        newName.value = '';
        save(() => api.createLevel({ name }));
      },
    }, field(`Add level ${levels.length + 1}`, newName), h('button', { class: 'btn primary' }, icon('plus'), 'Add level')),
  );
}

// ---------- team ----------

function teamTab(panel, { reload, isAdmin, redraw }) {
  const levelSelect = (value, attrs = {}) => {
    const sel = h('select', attrs, state.levels.map((l) => h('option', { value: l.id }, `Level ${l.rank} · ${l.name}`)));
    if (value) sel.value = String(value);
    return sel;
  };
  const save = async (fn, msg) => {
    try {
      await fn();
      if (msg) toast(msg);
      await reload({ keepPage: true });
      redraw();
    } catch (err) { toast(err.message, 'error'); }
  };

  const users = [...state.users].sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
  const rows = users.map((u) => h('tr', { class: u.active ? '' : 'inactive' },
    h('td', {}, h('span', { class: 'person' }, avatar(u, 'sm'), h('span', {}, u.name, h('small', { class: 'muted block' }, u.username)))),
    h('td', {}, isAdmin
      ? levelSelect(u.levelId, { 'aria-label': `Level of ${u.name}`, onchange: (e) => save(() => api.updateUser(u.id, { levelId: Number(e.target.value) }), 'Level updated') })
      : levelLabel(u.levelId)),
    h('td', {}, isAdmin
      ? h('input', { type: 'checkbox', checked: u.isAdmin, 'aria-label': 'Admin', disabled: u.id === state.me.id, onchange: (e) => save(() => api.updateUser(u.id, { isAdmin: e.target.checked })) })
      : (u.isAdmin ? 'Yes' : '')),
    isAdmin && h('td', { class: 'actions' },
      h('button', {
        type: 'button', class: 'btn small ghost',
        onclick: () => resetPassword(u, save),
      }, 'Reset password'),
      u.id !== state.me.id && h('button', {
        type: 'button', class: `btn small ${u.active ? 'danger ghost' : 'ghost'}`,
        onclick: async () => {
          if (u.active && !(await confirmDialog(`Deactivate ${u.name}? They will be signed out and hidden from the team list. Their tasks are kept.`, { okLabel: 'Deactivate' }))) return;
          save(() => api.updateUser(u.id, { active: !u.active }), u.active ? 'Member deactivated' : 'Member reactivated');
        },
      }, u.active ? 'Deactivate' : 'Reactivate'))));

  const name = h('input', { type: 'text', required: true, maxLength: 80 });
  const username = h('input', { type: 'text', required: true, maxLength: 40, pattern: '[A-Za-z0-9._\\-]+', autocomplete: 'off' });
  const pw = h('input', { type: 'text', required: true, minLength: 6, autocomplete: 'off' });
  const level = levelSelect(state.levels[state.levels.length - 1]?.id);
  const adminBox = h('input', { type: 'checkbox' });

  clear(panel,
    h('h2', {}, 'Team members'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'task-table team-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Member'), h('th', {}, 'Level'), h('th', {}, 'Admin'), isAdmin && h('th', {}, ''))),
      h('tbody', {}, rows))),
    isAdmin && [
      h('h3', {}, 'Add a member'),
      h('p', { class: 'muted' }, 'Share the username and temporary password with them; they can change it under My account.'),
      h('form', {
        class: 'settings-form grid-2',
        onsubmit: (e) => {
          e.preventDefault();
          save(() => api.createUser({ name: name.value, username: username.value, password: pw.value, levelId: Number(level.value), isAdmin: adminBox.checked }), `${name.value} added`);
        },
      },
      field('Full name', name),
      field('Username', username, 'Letters, numbers, dot, dash, underscore'),
      field('Temporary password', pw, 'At least 6 characters'),
      field('Level', level),
      h('label', { class: 'check' }, adminBox, 'Admin (can manage levels and members)'),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn primary' }, icon('plus'), 'Add member'))),
    ],
  );
}

function resetPassword(user, save) {
  const pw = h('input', { type: 'text', minLength: 6, required: true, autocomplete: 'off' });
  const dlg = h('dialog', { class: 'confirm' },
    h('form', {
      method: 'dialog',
      onsubmit: (e) => {
        if (e.submitter?.value !== 'ok') return;
        save(() => api.updateUser(user.id, { password: pw.value }), 'Password reset');
      },
    },
    h('p', {}, `New password for ${user.name}`),
    pw,
    h('div', { class: 'dialog-actions' },
      h('button', { value: 'cancel', class: 'btn ghost', formnovalidate: true }, 'Cancel'),
      h('button', { value: 'ok', class: 'btn primary' }, 'Reset'))));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}
