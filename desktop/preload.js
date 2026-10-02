'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('beaverDesktop', {
  saveServer: (url) => ipcRenderer.invoke('beaver:save-server', url),
});
