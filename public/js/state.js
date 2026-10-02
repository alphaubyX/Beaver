// Shared client state and note appearance defaults.

export const FONTS = [
  { id: 'Caveat', label: 'Caveat — handwritten', css: "'Caveat', 'Segoe Print', cursive" },
  { id: 'Patrick Hand', label: 'Patrick Hand — handwritten', css: "'Patrick Hand', 'Segoe Print', cursive" },
  { id: 'Kalam', label: 'Kalam — handwritten', css: "'Kalam', 'Segoe Print', cursive" },
  { id: 'Indie Flower', label: 'Indie Flower — handwritten', css: "'Indie Flower', 'Segoe Print', cursive" },
  { id: 'Sans', label: 'Clean sans-serif', css: "system-ui, 'Segoe UI', Roboto, sans-serif" },
  { id: 'Serif', label: 'Serif', css: "Georgia, 'Times New Roman', serif" },
  { id: 'Mono', label: 'Typewriter', css: "ui-monospace, Consolas, 'Courier New', monospace" },
];

export const SIZES = {
  s: { label: 'Small', width: 180, height: 170 },
  m: { label: 'Medium', width: 230, height: 210 },
  l: { label: 'Large', width: 290, height: 260 },
};

export const DEFAULT_PREFS = {
  fontFamily: 'Caveat',
  fontSize: 22,
  noteSize: 'm',
  colorMode: 'random',
  fixedColor: '#fff59d',
  notifications: false,
  view: 'wall',
};

export const state = {
  me: null,
  prefs: { ...DEFAULT_PREFS },
  assignable: new Set(),
  noteColors: [],
  users: [],
  levels: [],
  counts: { mine: 0, private: 0, delegated: 0, members: {} },
  page: 'board', // board | settings
  context: { type: 'mine' }, // mine | private | delegated | member (+ memberId)
  memberFilter: 'all',
  view: 'wall',
  showDone: false,
  search: '',
  tasks: [],
  loading: false,
};

export const fontCss = (id) => (FONTS.find((f) => f.id === id) || FONTS[0]).css;
export const userById = (id) => state.users.find((u) => u.id === id);
export const levelById = (id) => state.levels.find((l) => l.id === id);

export function levelLabel(levelId) {
  const l = levelById(levelId);
  return l ? `Level ${l.rank} · ${l.name}` : 'No level';
}

/** How a task relates to the signed-in user. */
export function relation(task) {
  const me = state.me.id;
  if (task.createdBy === me && task.assignedTo === me) return 'own';
  if (task.createdBy === me) return 'assigned-by-me';
  if (task.assignedTo === me) return 'assigned-to-me';
  return 'their-own';
}

export const canEditContent = (task) => task.createdBy === state.me.id;
export const canEditStyle = (task) => task.createdBy === state.me.id || task.assignedTo === state.me.id;

/** Appearance for a new note, following the user's preferences. */
export function newNoteDefaults() {
  const p = state.prefs;
  const colors = state.noteColors.length ? state.noteColors : ['#fff59d'];
  return {
    color: p.colorMode === 'fixed' ? p.fixedColor : colors[Math.floor(Math.random() * colors.length)],
    fontFamily: p.fontFamily,
    fontSize: p.fontSize,
    width: SIZES[p.noteSize]?.width,
    height: SIZES[p.noteSize]?.height,
  };
}

/** Effective appearance of a note, falling back to the viewer's defaults. */
export function noteLook(task) {
  const p = state.prefs;
  const size = SIZES[p.noteSize] || SIZES.m;
  return {
    color: task.color || '#fff59d',
    fontFamily: task.fontFamily || p.fontFamily,
    fontSize: task.fontSize || p.fontSize,
    width: task.width || size.width,
    height: task.height || size.height,
  };
}
