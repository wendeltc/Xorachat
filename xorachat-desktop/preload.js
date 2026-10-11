const { contextBridge, ipcRenderer } = require('electron');

// a página detecta o app desktop por window.xoraDesktop
contextBridge.exposeInMainWorld('xoraDesktop', {
  platform: process.platform,
  audioStatus: () => ipcRenderer.invoke('xora:audio-status'),
});
