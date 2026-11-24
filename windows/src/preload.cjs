const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('opendirectorDesktop', {
  // Session registration keeps Host-side edit sessions aligned with pages.
  registerSession: id => ipcRenderer.send('desktop:session', id),
  setLocale: locale => ipcRenderer.send('desktop:locale', locale),
  setTheme: theme => ipcRenderer.send('desktop:theme', theme),
  setExporting: active => ipcRenderer.send('desktop:exporting', active),
  // Windows shell extensions
  setTaskProgress: (value, mode) => ipcRenderer.send('desktop:task-progress', { value, mode }),
  notify: payload => ipcRenderer.send('desktop:notify', payload),
  showMore: () => ipcRenderer.send('desktop:more'),
  reportActivity: active => ipcRenderer.send('desktop:activity', active),
  requestTakeover: projectId => ipcRenderer.invoke('desktop:takeover', projectId),
  onOpenTarget: handler => ipcRenderer.on('desktop:open-target', (_event, target) => handler(target)),
  platform: process.platform,
});

function markDesktop() {
  document.documentElement.dataset.desktopPlatform = process.platform;
  if (['darwin', 'win32'].includes(process.platform)) document.documentElement.dataset.desktopChrome = '';
  const theme = () => ipcRenderer.send('desktop:theme', document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  theme();
  new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
if (document.documentElement) markDesktop();
else window.addEventListener('DOMContentLoaded', markDesktop, { once: true });

ipcRenderer.on('desktop:fullscreen', (_event, fullscreen) => {
  if (fullscreen) document.documentElement.dataset.desktopFullscreen = 'true';
  else delete document.documentElement.dataset.desktopFullscreen;
});
