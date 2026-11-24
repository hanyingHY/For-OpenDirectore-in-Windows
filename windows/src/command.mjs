/**
 * Terminal command registration (`opendirector` launcher on PATH).
 * Ported from upstream with Windows %APPDATA% semantics preserved.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export function commandPath(home = homedir()) {
  return process.platform === 'win32'
    ? join(home, 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'opendirector.cmd')
    : join(home, '.local', 'bin', 'opendirector');
}

export function commandPathFromLocalAppData(localAppData) {
  return join(localAppData, 'Microsoft', 'WindowsApps', 'opendirector.cmd');
}

export async function registerCommand({ destination, launcher }) {
  if (existsSync(destination)) {
    const existing = readFileSync(destination, 'utf8');
    if (existing.includes('opendirector_api') || existing.includes('opendirector.cli')) {
      if (existing.includes(launcher) || existing.includes('OpenDirector')) return 'already-installed';
      throw new Error('command_collision');
    }
    throw new Error('command_collision');
  }
  mkdirSync(dirname(destination), { recursive: true });
  if (process.platform === 'win32') {
    writeFileSync(destination, `@echo off\r\n"${launcher}" %*\r\n`, { mode: 0o755 });
  } else {
    copyFileSync(launcher, destination);
    writeFileSync(destination, `#!/bin/sh\nexec "${launcher}" "$@"\n`, { mode: 0o755 });
  }
  return 'installed';
}
