const { app, BrowserWindow, Menu, session, desktopCapturer, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const sysAudio = require('./audio');

/* ---------- flags do Chromium (antes do app ficar pronto) ---------- */
if (process.platform === 'linux') {
  // captura de tela via portal PipeWire (Wayland) + Wayland nativo quando disponível
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  // evita o Chromium derrubar o volume da fonte capturada (bug conhecido: 100% → ~8%)
  app.commandLine.appendSwitch('disable-features', 'WebRtcAllowInputVolumeAdjustment');

  // Ubuntu 23.10+/24.04 restringe namespaces de usuário e o sandbox do Chromium não abre
  try {
    const f = '/proc/sys/kernel/apparmor_restrict_unprivileged_userns';
    if (fs.existsSync(f) && fs.readFileSync(f, 'utf8').trim() === '1') {
      app.commandLine.appendSwitch('no-sandbox');
    }
  } catch (_) {}
}

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#313338',
    title: 'Xorachat',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // links externos abrem no navegador, nunca dentro do app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); }
  });
  win.on('closed', () => { win = null; });
}

/* ---------- permissões: microfone / tela ---------- */
const OK_PERMS = new Set(['media', 'audioCapture', 'videoCapture', 'display-capture']);
function setupPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(OK_PERMS.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => OK_PERMS.has(permission));
}

/* ---------- compartilhar tela: escolha da fonte ----------
   Wayland: o sistema já mostra o seletor dele e o Electron devolve 1 fonte → usamos direto.
   X11: devolve várias → mostramos um menu simples para escolher tela/janela. */
function setupDisplayMedia() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const deny = () => { try { callback({}); } catch (_) { try { callback(null); } catch (__) {} } };
    let sources;
    try {
      sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 160, height: 100 },
      });
    } catch (_) { return deny(); }

    if (!sources.length) return deny();
    // só vídeo: o som do sistema entra pela fonte virtual "SomDoSistema" (ver audio.js)
    if (sources.length === 1) return callback({ video: sources[0] });

    let chosen = false;
    const menu = Menu.buildFromTemplate([
      { label: 'Compartilhar qual tela/janela?', enabled: false },
      { type: 'separator' },
      ...sources.map(src => ({
        label: (src.name || 'Tela').slice(0, 60),
        icon: src.thumbnail && !src.thumbnail.isEmpty() ? src.thumbnail.resize({ height: 24 }) : undefined,
        click: () => { chosen = true; callback({ video: src }); },
      })),
    ]);
    menu.popup({
      window: win || undefined,
      callback: () => setTimeout(() => { if (!chosen) deny(); }, 300),
    });
  });
}

ipcMain.handle('xora:audio-status', () => sysAudio.getStatus());

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  setupPermissions();
  setupDisplayMedia();
  sysAudio.start();          // cria o "SomDoSistema" antes da janela abrir
  createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => sysAudio.stop());
process.on('SIGINT', () => app.quit());
process.on('SIGTERM', () => app.quit());
