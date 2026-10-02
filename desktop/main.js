'use strict';

// Beaver for Windows: a desktop window around your self-hosted Beaver server.

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function normalizeUrl(input) {
  let value = String(input || '').trim();
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  const url = new URL(value);
  return url.origin;
}

let win;

function showSetup() {
  win.loadFile(path.join(__dirname, 'setup.html'), { query: { current: readConfig().serverUrl || '' } });
}

function showApp() {
  const { serverUrl } = readConfig();
  if (!serverUrl) return showSetup();
  win.loadURL(serverUrl).catch(() => {});
}

function createWindow() {
  const bounds = readConfig().bounds || { width: 1280, height: 820 };
  win = new BrowserWindow({
    ...bounds,
    minWidth: 380,
    minHeight: 480,
    title: 'Beaver',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#f4efe6',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.on('close', () => writeConfig({ ...readConfig(), bounds: win.getBounds() }));

  // Keep the window on the Beaver server; open anything else in the default browser.
  const allowed = (url) => {
    const { serverUrl } = readConfig();
    return url.startsWith('file://') || (serverUrl && new URL(url).origin === serverUrl);
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!allowed(url)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.webContents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3: navigation aborted
    dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Cannot reach Beaver',
      message: `Could not connect to ${url}`,
      detail: `${description}. Check that the Beaver server is running and the address is right.`,
      buttons: ['Try again', 'Change server…'],
    }).then(({ response }) => (response === 0 ? showApp() : showSetup()));
  });

  showApp();
}

ipcMain.handle('beaver:save-server', async (_event, input) => {
  let serverUrl;
  try { serverUrl = normalizeUrl(input); } catch { throw new Error('That is not a valid address.'); }
  let res;
  try {
    res = await fetch(`${serverUrl}/api/setup`, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new Error(`Could not reach ${serverUrl}. Is the Beaver server running?`);
  }
  const body = res.ok ? await res.json().catch(() => null) : null;
  if (!body || typeof body.needsSetup !== 'boolean') throw new Error('That address does not look like a Beaver server.');
  writeConfig({ ...readConfig(), serverUrl });
  showApp();
  return serverUrl;
});

const menu = Menu.buildFromTemplate([
  {
    label: 'File',
    submenu: [
      { label: 'Change server…', click: () => showSetup() },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { role: 'toggleDevTools' },
    ],
  },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.setAppUserModelId('app.beaver.desktop'); // needed for Windows notifications
  app.whenReady().then(() => {
    Menu.setApplicationMenu(menu);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
