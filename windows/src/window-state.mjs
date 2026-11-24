/**
 * DPI-aware window state persistence.
 *
 * Pure logic lives here so tests can run without Electron: `sanitizeBounds`
 * validates saved geometry against the current display layout (handles a
 * monitor being unplugged between runs) and `readState`/`writeState` handle
 * the JSON file with tolerant parsing.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DEFAULT_BOUNDS = { x: 120, y: 80, width: 1440, height: 900 };

/**
 * Clamp saved bounds into the visible displays.
 * `displays` is a list of `{ bounds: {x,y,width,height} }` in DIPs.
 * Returns bounds that always intersect some display by at least 80×80.
 */
export function sanitizeBounds(saved, displays, fallback = DEFAULT_BOUNDS) {
  if (!saved || !Number.isFinite(saved.width) || !Number.isFinite(saved.height)) return { ...fallback };
  const width = Math.max(480, Math.min(saved.width, 16384));
  const height = Math.max(320, Math.min(saved.height, 16384));
  const list = displays?.length ? displays : [{ bounds: fallback }];
  const intersects = (a, b) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const visible = list.some(d => intersects({ x: saved.x, y: saved.y, width, height }, d.bounds));
  if (visible && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    return { x: Math.round(saved.x), y: Math.round(saved.y), width: Math.round(width), height: Math.round(height) };
  }
  // Fall back to the primary display, centred like a first launch.
  const primary = list[0].bounds;
  return {
    x: Math.round(primary.x + Math.max(0, (primary.width - width) / 2)),
    y: Math.round(primary.y + Math.max(0, (primary.height - height) / 2)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function readState(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* missing or corrupt state behaves like a first launch */ }
  return {};
}

export function writeState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = file + '.tmp';
  writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  renameSync(temporary, file);
}

/**
 * Wire a BrowserWindow to a state file. Returns a `persist()` you can also call
 * from the close handler. Debounce keeps resize storms out of the disk.
 */
export function attachWindowState(window, file, screen, { debounceMs = 400 } = {}) {
  let timer;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const maximized = window.isMaximized();
        const bounds = maximized ? window.getNormalBounds?.() ?? window.getBounds() : window.getBounds();
        writeState(file, {
          bounds, maximized, fullscreen: window.isFullScreen?.() ?? false,
          displayId: displayNearest(screen, bounds)?.id ?? null,
          savedAt: new Date().toISOString(),
        });
      } catch { /* persistence must never break the window */ }
    }, debounceMs);
  };
  window.on('resize', persist);
  window.on('move', persist);
  window.on('maximize', persist);
  window.on('unmaximize', persist);
  window.on('close', () => { clearTimeout(timer); try { persist(); } catch {} });
  return persist;
}

function displayNearest(screen, bounds) {
  try {
    return screen.getDisplayNearestPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  } catch { return null; }
}

/** Restore window placement from a state blob. */
export function restoreWindowState(window, state, screen) {
  const displays = screen.getAllDisplays().map(d => ({ bounds: d.bounds }));
  const bounds = sanitizeBounds(state.bounds, displays);
  window.setBounds(bounds);
  if (state.maximized) window.maximize();
  else if (state.fullscreen) window.setFullScreen(true);
}
