/**
 * OpenDirector Windows desktop shell.
 *
 * Responsibilities
 *  - own the Python Host (bundled runtime) and the authenticated loopback URL
 *  - serve the shared Web UI over the privileged `opendirector://app` scheme
 *  - deliver the Windows experience: Mica backdrop, window-state restore,
 *    Jump Lists, tray, taskbar progress, toast notifications, deep links,
 *    file associations, update checks and diagnostics
 *
 * The renderer stays sandboxed: Node integration off, context isolation on,
 * every native capability exposed through preload with sender validation.
 */
import {
  app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, Notification,
  powerSaveBlocker, protocol, screen, session, shell, nativeTheme, Tray, JumpListCategory,
} from 'electron';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync, existsSync, copySync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform, release } from 'node:os';
import { Host, ownedURL, proxyRequest } from './host.mjs';
import { messages, localeFor, format } from './locale.mjs';
import { registerCommand, commandPath } from './command.mjs';
import {
  attachWindowState, restoreWindowState, readState, sanitizeBounds,
} from './window-state.mjs';
import {
  jumpList, taskbarProgress, shouldNotify, trayMenu,
} from './windows-native.mjs';
import { UpdateManager } from './updater.mjs';

app.setName('OpenDirector');
if (process.platform === 'win32') app.setAppUserModelId('org.opendirector.desktop');

const desktopChrome = ['darwin', 'win32'].includes(process.platform);
const captionHeight = 48;
const here = dirname(fileURLToPath(import.meta.url));
const runtime = app.isPackaged ? join(process.resourcesPath, 'runtime') : join(here, '..', 'runtime');
const isolated = process.env.OPENDIRECTOR_DESKTOP_DATA;
if (isolated) app.setPath('userData', isolated);

protocol.registerSchemesAsPrivileged([{
  scheme: 'opendirector',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
}]);

let host;
let window = null;
let tray = null;
let exporting = false;
let activity = { agents: 0, generations: 0, tools: 0 };
let quitting = false;
let locale = localeFor(app.getLocale());
const text = () => messages[locale];
const t = (key, params) => format(text()[key] ?? key, params);
const userData = app.getPath('userData');
const logs = join(userData, 'logs');
const workspace = join(userData, 'workspace');
const stateFile = join(userData, 'window-state.json');
const prefsFile = join(userData, 'desktop-prefs.json');
mkdirSync(logs, { recursive: true });
mkdirSync(workspace, { recursive: true });
const logFile = join(logs, 'desktop.log');
const log = createWriteStream(logFile, { flags: 'a', mode: 0o600 });
const startedAt = Date.now();

let prefs = { minimizeToTray: true, updateChannel: 'release', theme: 'system' };
try { prefs = { ...prefs, ...JSON.parse(readFileSync(prefsFile, 'utf8')) }; } catch {}
const savePrefs = () => writeFileSync(prefsFile, JSON.stringify(prefs, null, 2), { mode: 0o600 });

try { locale = localeFor(readFileSync(join(userData, 'locale'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') log.write(`Locale read failed: ${error.message}\n`); }

const updater = new UpdateManager({
  current: app.getVersion(),
  feedUrl: 'https://github.com/hanyingHY/For-OpenDirectore-in-Windows/releases/latest/download/latest.yml',
  dialog, app, log,
  localeText: (key, params) => t(key, params),
});

// ---------------------------------------------------------------------------
// Single instance and deep links
// ---------------------------------------------------------------------------
const isSecondary = !app.requestSingleInstanceLock();
if (isSecondary) app.quit();
else {
  app.on('second-instance', (_event, argv) => {
    window?.show();
    window?.focus();
    handleLaunchTargets(argv.slice(1));
  });
  app.whenReady().then(start).catch(fatal);
}

function handleLaunchTargets(args) {
  for (const arg of args) {
    if (typeof arg !== 'string') continue;
    if (arg === '--open-data') { shell.openPath(workspace); continue; }
    if (arg === '--open-logs') { shell.openPath(logs); continue; }
    if (arg === '--updated') { log.write('update: relaunched after update\n'); continue; }
    if (arg.startsWith('opendirector://')) {
      const target = parseDeepLink(arg);
      if (target) openTarget(target);
      continue;
    }
    if (arg.endsWith('.odcanvas') && existsSync(arg)) openTarget({ kind: 'import', path: arg });
  }
}

function parseDeepLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'opendirector:') return null;
    const [kind, ...rest] = url.hostname.split('/').concat(url.pathname.split('/').filter(Boolean));
    if (kind === 'new') return { kind: 'new' };
    if (kind === 'project' && rest[0]) return { kind: 'project', name: decodeURIComponent(rest[0]) };
    return { kind: 'home' };
  } catch { return null; }
}

function openTarget(target) {
  if (!window) return;
  window.show();
  window.focus();
  window.webContents.send('desktop:open-target', target);
}

// ---------------------------------------------------------------------------
// Window + native chrome
// ---------------------------------------------------------------------------
function windowsCaption() {
  const dark = nativeTheme.shouldUseDarkColors;
  return { height: captionHeight, color: dark ? '#141414' : '#f7f8fa', symbolColor: dark ? '#eceef2' : '#30343c' };
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 640,
    show: false, backgroundColor: '#141414',
    ...(process.platform === 'win32' ? {
      titleBarStyle: 'hidden',
      titleBarOverlay: windowsCaption(),
      backgroundMaterial: 'mica',
    } : {}),
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      session: session.fromPartition('persist:opendirector'),
    },
  });

  // Restore placement (multi-monitor safe) before first paint.
  const state = readState(stateFile);
  try {
    const displays = screen.getAllDisplays().map(d => ({ bounds: d.bounds }));
    const bounds = sanitizeBounds(state.bounds, displays);
    window.setBounds(bounds);
    if (state.maximized) window.maximize();
  } catch {}
  attachWindowState(window, stateFile, screen);

  window.once('ready-to-show', () => window.show());
  window.on('close', event => {
    // Closing hides the window so Host work continues; the tray keeps the app
    // reachable. Quitting (menu/tray/shortcut) runs the guarded shutdown.
    if (!quitting && prefs.minimizeToTray && process.platform === 'win32') {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('closed', () => { window = null; });

  const owned = window.webContents.session;
  owned.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  let projectSubscription;
  owned.protocol.handle('opendirector', request => proxyRequest(request, host, async (url, options) => {
    const pathname = new URL(url).pathname;
    if (options.method === 'GET' && /^\/api\/creation\/projects\/[^/]+\/subscribe$/.test(pathname)) {
      projectSubscription?.abort();
      projectSubscription = new AbortController();
      options.signal = AbortSignal.any([options.signal, projectSubscription.signal]);
    }
    const assetMedia = options.method === 'GET' &&
      /^\/api\/creation\/projects\/[^/]+\/assets\/[^/]+\/content$/.test(pathname);
    if (assetMedia || options.method === 'PUT') {
      return fetch(url, { ...options, duplex: options.method === 'PUT' ? 'half' : undefined });
    }
    return net.fetch(url, options);
  }));

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    log.write(`renderer gone: ${details.reason}\n`);
    if (!quitting && details.reason !== 'clean-exit') {
      dialog.showMessageBox(window, {
        type: 'error', message: t('startup'), detail: t('interrupted'),
        buttons: [t('retry'), t('quit')], defaultId: 0,
      }).then(({ response }) => response === 0 ? window?.webContents.reload() : app.quit());
    }
  });

  window.loadURL('opendirector://app/');
}

function refreshJumpList() {
  if (process.platform !== 'win32') return;
  try {
    app.setJumpList(jumpList({ workspace, logs, text: text() }).categories.length
      ? jumpList({ workspace, logs, text: text() })
      : jumpList({ workspace, logs, text: text() }));
  } catch (error) { log.write(`jump list failed: ${error.message}\n`); }
}

function createTray() {
  if (process.platform !== 'win32') return;
  const icon = join(here, '..', 'assets', 'tray.png');
  if (!existsSync(icon)) return;
  tray = new Tray(icon);
  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate(trayMenu({
    text: text(), minimizeToTray: prefs.minimizeToTray,
    handlers: {
      show: () => { window?.show(); window?.focus(); },
      newProject: () => openTarget({ kind: 'new' }),
      openData: () => shell.openPath(workspace),
      toggleMinimize: () => { prefs.minimizeToTray = !prefs.minimizeToTray; savePrefs(); rebuild(); },
      quit: () => app.quit(),
    },
  })));
  rebuild();
  tray.setToolTip('OpenDirector');
  tray.on('double-click', () => { window?.show(); window?.focus(); });
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
function desktopActions() {
  return [
    { label: text().newProject, click: () => openTarget({ kind: 'new' }) },
    { label: text().command, click: manageCommand },
    { label: text().data, click: () => shell.openPath(workspace) },
    { label: text().logs, click: () => shell.openPath(logs) },
    { label: text().diagnostics, click: copyDiagnostics },
    { label: text().checkUpdates, click: () => updater.check({ interactive: true }) },
  ];
}

function copyDiagnostics() {
  const versions = host?.runtime ?? {};
  const summary = [
    `OpenDirector Desktop ${app.getVersion()} (${process.platform}/${process.arch})`,
    `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
    `OS ${platform()} ${release()}`,
    ...Object.entries(versions).map(([key, value]) => `${key}: ${value}`),
    `Uptime ${Math.round((Date.now() - startedAt) / 1000)}s`,
    `Workspace ${workspace}`,
  ].join('\n');
  clipboard.writeText(summary);
  dialog.showMessageBox(window, { message: text().diagnostics, detail: summary, buttons: ['OK'] });
}

function menu() {
  const editing = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'].map(role => ({ role, label: text()[role] }));
  const view = [
    { role: 'togglefullscreen', label: text().fullscreen },
    { role: 'toggleDevTools', label: text().devtools },
  ];
  const quit = { label: text().quit, accelerator: 'CmdOrCtrl+Q', click: () => app.quit() };
  const shortcuts = [...editing, ...view, quit].map(item => ({ ...item, visible: false, acceleratorWorksWhenHidden: true }));
  if (process.platform === 'win32') {
    // Windows uses the caption/context menus; keep accelerators working hidden.
    Menu.setApplicationMenu(Menu.buildFromTemplate(shortcuts));
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: text().app, submenu: [{ role: 'about', label: text().app }, ...desktopActions(), quit] },
    { label: text().edit, submenu: editing },
    { label: text().view, submenu: view },
  ]));
}

async function manageCommand() {
  const destination = commandPath(homedir());
  const { response } = await dialog.showMessageBox(window, {
    message: text().command, detail: destination,
    buttons: [text().install, text().remove, text().cancel], cancelId: 2,
  });
  if (response === 2) return;
  if (response === 1) {
    await dialog.showMessageBox(window, { message: text().commandRemoveHelp, detail: destination });
    return;
  }
  try {
    const launcher = join(runtime, 'bin', process.platform === 'win32' ? 'opendirector.cmd' : 'opendirector');
    const result = await registerCommand({ destination, launcher });
    await dialog.showMessageBox(window, {
      message: text()[result === 'installed' ? 'commandDone' : 'commandAlreadyInstalled'], detail: destination,
    });
  } catch (error) {
    await dialog.showMessageBox(window, {
      type: 'error', message: text().failed,
      detail: error.message === 'command_collision' ? [text().collision, destination].join('\n') : error.message,
    });
  }
}

// ---------------------------------------------------------------------------
// IPC (sender-validated)
// ---------------------------------------------------------------------------
function trusted(event) {
  return event.sender === window?.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    ownedURL(event.senderFrame.url);
}

ipcMain.on('desktop:locale', (event, value) => {
  if (!trusted(event) || !['en-US', 'zh-CN'].includes(value)) return;
  locale = value;
  writeFileSync(join(userData, 'locale'), value, { mode: 0o600 });
  menu();
  refreshJumpList();
  if (tray) createTray();
});

ipcMain.on('desktop:theme', (event, value) => {
  if (trusted(event) && ['light', 'dark'].includes(value)) {
    nativeTheme.themeSource = value;
    if (process.platform === 'win32' && window) window.setTitleBarOverlay(windowsCaption());
  }
});

ipcMain.on('desktop:session', (event, value) => {
  if (trusted(event) && /^[0-9a-f-]{36}$/i.test(String(value))) host?.registerSession(value);
});

ipcMain.on('desktop:exporting', (event, value) => {
  if (!trusted(event) || typeof value !== 'boolean') return;
  exporting = value;
  // Keep the machine awake while the renderer encodes MP4 in-browser.
  if (value) {
    if (!powerSaveBlocker.isStarted(blockerId)) blockerId = powerSaveBlocker.start('prevent-display-sleep');
    log.write(t('exportActive') + '\n');
  } else if (powerSaveBlocker.isStarted(blockerId)) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
});
let blockerId = null;

ipcMain.on('desktop:activity', (event, value) => {
  if (!trusted(event) || typeof value !== 'object' || value === null) return;
  for (const key of ['agents', 'generations', 'tools']) {
    if (Number.isFinite(value[key])) activity[key] = value[key];
  }
});

ipcMain.on('desktop:task-progress', (event, payload) => {
  if (!trusted(event) || !window) return;
  const { value, mode } = payload ?? {};
  const mapped = taskbarProgress(
    typeof value === 'number' ? value : value === null ? null : undefined,
    ['normal', 'indeterminate', 'error', 'paused'].includes(mode) ? mode : 'normal',
  );
  if (mapped.clear) window.setProgressBar(-1);
  else window.setProgressBar(mapped.value, mapped.options);
});

ipcMain.on('desktop:notify', (event, payload) => {
  if (!trusted(event) || !Notification.isSupported()) return;
  const focused = window?.isFocused() ?? false;
  const hidden = window?.isMinimized() ?? true;
  if (!shouldNotify({ focused, minimized: window?.isMinimized(), hidden: !window?.isVisible() })) return;
  const { title, body } = payload ?? {};
  if (typeof title !== 'string' || title.length > 200) return;
  new Notification({
    title: title.slice(0, 200),
    body: typeof body === 'string' ? body.slice(0, 500) : '',
    icon: join(here, '..', 'assets', 'open-director.png'),
  }).show();
});

ipcMain.on('desktop:more', event => {
  if (trusted(event) && desktopChrome) Menu.buildFromTemplate(desktopActions()).popup({ window });
});

/** Take over a project whose lease is held by a dead window (see patches/). */
ipcMain.handle('desktop:takeover', async (event, projectId) => {
  if (!trusted(event) || !/^[0-9a-f-]{36}$/i.test(String(projectId))) return { ok: false };
  try {
    const response = await fetch(new URL(`/api/creation/projects/${projectId}/takeover`, host.url), {
      method: 'POST',
      headers: {
        'X-OpenDirector-Desktop': host.token,
        'X-OpenDirector-Session': crypto.randomUUID(),
        'Content-Type': 'application/json',
      },
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    log.write(`takeover failed: ${error.message}\n`);
    return { ok: false, error: error.message };
  }
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
async function start() {
  menu();
  handleLaunchTargets(process.argv.slice(1));
  const manifestPath = join(runtime, 'manifest.json');
  if (!existsSync(manifestPath)) {
    // Development convenience: without a prepared runtime the shell can still
    // talk to an external host (OPENDIRECTOR_API_URL) for UI work.
    const external = process.env.OPENDIRECTOR_API_URL;
    if (external) {
      host = { url: external, token: 'dev', registerSession() {}, async inspect() { return null; }, async stop() { return true; } };
      createWindow();
      createTray();
      refreshJumpList();
      scheduleUpdateCheck();
      return;
    }
    throw new Error(`Runtime missing: ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof manifest.python !== 'string' || manifest.python.startsWith('/') || manifest.python.split(/[\\/]/).includes('..')) {
    throw new Error('Invalid runtime Python path');
  }
  if (manifest.version !== 1 || manifest.platform !== process.platform || manifest.arch !== process.arch) {
    throw new Error('Runtime platform does not match this application');
  }
  host = new Host({
    python: join(runtime, manifest.python),
    directory: workspace,
    log,
    env: {
      ...process.env,
      OPENDIRECTOR_ROOT: workspace,
      PATH: join(runtime, 'bin') + (process.platform === 'win32' ? ';' : ':') + process.env.PATH,
    },
    onExit: () => { if (!quitting) void fatal(new Error(t('interrupted'))); },
  });
  await host.ready;
  createWindow();
  createTray();
  refreshJumpList();
  scheduleUpdateCheck();
}

function scheduleUpdateCheck() {
  // Non-interactive check shortly after launch; only prompts when outdated.
  setTimeout(() => { if (!quitting) updater.check({ interactive: false }).catch(() => {}); }, 15_000);
}

async function busy() {
  const inspection = await host?.inspect?.();
  if (!inspection) return exporting || activity.agents > 0 || activity.generations > 0 || activity.tools > 0;
  return exporting || inspection.agents > 0 || inspection.generations > 0 || inspection.tools > 0;
}

app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault();
  void (async () => {
    if (await busy()) {
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning', message: text().running,
        buttons: [text().quitNow, text().keepRunning], defaultId: 1, cancelId: 1,
      });
      if (response !== 0) return;
    }
    quitting = true;
    try { await host?.stop(); } catch (error) { log.write(`shutdown failed: ${error.message}\n`); }
    app.quit();
  })();
});

app.on('window-all-closed', () => {
  // Keep running for the tray/Host; platform convention handled by close-to-tray.
  if (process.platform !== 'win32' && !prefs.minimizeToTray) app.quit();
});

app.on('activate', () => {
  if (window) window.show();
  else if (host) createWindow();
});

async function fatal(error) {
  log.write(`fatal: ${error.message}\n`);
  if (quitting) return;
  const retry = await dialog.showMessageBox({
    type: 'error', message: t('startup'), detail: error.message ?? t('startupDetail'),
    buttons: [t('retry'), t('quit')], defaultId: 0, cancelId: 1,
  });
  if (retry.response === 0) {
    try {
      if (host?.restart) { await host.restart(); if (!window) createWindow(); else window.webContents.reload(); return; }
      await start();
      return;
    } catch (next) { log.write(`retry failed: ${next.message}\n`); }
  }
  quitting = true;
  app.quit();
}
