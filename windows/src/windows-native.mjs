/**
 * Windows shell integrations: Jump Lists, tray menu, taskbar progress and
 * toast notifications. Every builder is a pure function over plain data so the
 * behaviour is unit-tested without Electron; `apply*` helpers are thin glue.
 */
import { homedir } from 'node:os';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Recent projects: name + path pairs from the workspace `projects/` folder. */
export function recentProjects(workspace, limit = 8) {
  try {
    const root = join(workspace, 'projects');
    return readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => {
        const path = join(root, entry.name);
        let mtime = 0;
        try { mtime = statSync(path).mtimeMs; } catch {}
        return { name: entry.name, path, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** Build the Jump List payload (categories + tasks) for app.setJumpList. */
export function jumpList({ workspace, logs, text, onOpen, onNew, deepLinkBase = 'opendirector://' }) {
  const recent = recentProjects(workspace);
  const categories = [];
  if (recent.length) {
    categories.push({
      name: text.recentProjects,
      items: recent.map(project => ({
        type: 'task',
        title: project.name,
        description: project.path,
        program: process.execPath,
        args: [`${deepLinkBase}project/${encodeURIComponent(project.name)}`],
        iconPath: process.execPath,
        iconIndex: 0,
      })),
    });
  }
  return {
    tasks: [
      {
        items: [
          { type: 'task', title: text.jumpNew, program: process.execPath, args: [`${deepLinkBase}new`], iconPath: process.execPath, iconIndex: 0 },
          { type: 'task', title: text.jumpData, program: process.execPath, args: ['--open-data'], iconPath: process.execPath, iconIndex: 0 },
          { type: 'task', title: text.jumpLogs, program: process.execPath, args: ['--open-logs'], iconPath: process.execPath, iconIndex: 0 },
        ],
      },
    ],
    categories,
  };
}

/** Taskbar progress mapping for win.setProgressBar. */
export function taskbarProgress(value, mode = 'normal') {
  if (mode === 'indeterminate') return { value: 1, options: { mode: 'indeterminate' } };
  if (value === null || value === undefined) return { clear: true };
  const clamped = Math.max(0, Math.min(1, Number(value) || 0));
  if (mode === 'error') return { value: clamped, options: { mode: 'error' } };
  if (mode === 'paused') return { value: clamped, options: { mode: 'paused' } };
  return { value: clamped, options: { mode: 'normal' } };
}

/**
 * Decide whether a toast should fire: only for completed background work and
 * never while the window is focused (the UI already shows the result).
 */
export function shouldNotify({ focused, minimized, hidden }) {
  return !focused || minimized || hidden;
}

/** Tray menu template. Checkbox reflects the persisted preference. */
export function trayMenu({ text, minimizeToTray, handlers }) {
  return [
    { label: text.trayShow, click: handlers.show },
    { label: text.trayNew, click: handlers.newProject },
    { type: 'separator' },
    { label: text.trayOpenData, click: handlers.openData },
    { type: 'separator' },
    { label: text.trayMinimize, type: 'checkbox', checked: Boolean(minimizeToTray), click: handlers.toggleMinimize },
    { type: 'separator' },
    { label: text.trayQuit, click: handlers.quit },
  ];
}

export const defaultIconDir = join(homedir());
