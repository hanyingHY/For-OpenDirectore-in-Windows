/**
 * Lightweight auto-update for the Windows NSIS channel.
 *
 * Feed format: electron-builder `latest.yml` published next to the installer
 * (GitHub Releases by default). Parsing and version comparison are pure and
 * unit-tested; `UpdateManager` glues them to Electron dialogs and the NSIS
 * silent-install handshake (`/S` + `--updated`).
 */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Parse the subset of electron-builder's latest.yml we need. */
export function parseLatestYaml(text) {
  const field = name => {
    const match = new RegExp(`^${name}:\\s*['"]?([^\\s'"]+)`, 'm').exec(text);
    return match?.[1] ?? null;
  };
  const version = field('version');
  const files = [];
  const block = /files:\s*\n([\s\S]*?)(\n\w|$)/.exec(text);
  if (block) {
    // Each file entry starts with "- url:"; read its indented fields.
    const chunks = block[1].split(/\n(?=\s*-\s)/).filter(chunk => chunk.includes('url:'));
    for (const chunk of chunks) {
      const url = /url:\s*['"]?([^\s'"]+)/.exec(chunk)?.[1] ?? null;
      const sha512 = /sha512:\s*['"]?([^\s'"]+)/.exec(chunk)?.[1] ?? null;
      const size = /size:\s*['"]?(\d+)/.exec(chunk)?.[1] ?? null;
      if (url) files.push({ url, sha512, size: size ? Number(size) : null });
    }
  }
  const path = field('path') ?? files[0]?.url ?? null;
  return { version, path, files };
}

/** Compare dotted versions; returns -1/0/1 like a comparator. */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function decideUpdate({ current, latest }) {
  if (!latest?.version || !latest?.path) return { action: 'none', reason: 'no-release' };
  const cmp = compareVersions(latest.version, current);
  if (cmp > 0) return { action: 'update', version: latest.version, path: latest.path };
  return { action: 'none', reason: 'up-to-date', version: latest.version };
}

/**
 * UpdateManager: check → prompt → download → launch installer → quit.
 * All OS interactions go through injected functions for tests.
 */
export class UpdateManager {
  constructor({ current, feedUrl, fetchImpl = fetch, dialog, app, log, tmp = tmpdir(), localeText }) {
    Object.assign(this, { current, feedUrl, fetchImpl, dialog, app, log, tmp, localeText });
  }

  async check({ interactive = false } = {}) {
    let latest = null;
    try {
      const response = await this.fetchImpl(this.feedUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`feed returned ${response.status}`);
      latest = parseLatestYaml(await response.text());
    } catch (error) {
      this.log?.write(`update: feed check failed: ${error.message}\n`);
      if (interactive) {
        await this.dialog.showMessageBox({
          type: 'error',
          message: this.localeText('updateFailed'),
          detail: this.localeText('updateFailedDetail', { error: error.message }),
          buttons: ['OK'],
        });
      }
      return { action: 'error', error: error.message };
    }
    const decision = decideUpdate({ current: this.current, latest });
    if (decision.action !== 'update') {
      if (interactive) {
        await this.dialog.showMessageBox({
          message: this.localeText('updateNone'),
          detail: this.localeText('updateNoneDetail', { current: this.current }),
          buttons: ['OK'],
        });
      }
      return decision;
    }
    const { response: confirmed } = await this.dialog.showMessageBox({
      type: 'question',
      message: this.localeText('updateAvailable'),
      detail: this.localeText('updateAvailableDetail', { version: decision.version, current: this.current }),
      buttons: [this.localeText('updateDownload'), this.localeText('updateLater')],
      defaultId: 0, cancelId: 1,
    });
    if (confirmed !== 0) return { action: 'deferred', version: decision.version };
    return this.downloadAndInstall(decision);
  }

  async downloadAndInstall(decision) {
    const installer = join(this.tmp, `OpenDirector-${decision.version}-setup.exe`);
    try {
      const base = new URL(this.feedUrl).href.replace(/[^/]+$/, '');
      const response = await this.fetchImpl(new URL(decision.path, base).href);
      if (!response.ok) throw new Error(`download returned ${response.status}`);
      await streamToFile(response.body, installer);
      if (!existsSync(installer)) throw new Error('installer missing after download');
      // NSIS: silent update preserving user data; --updated marks the relaunch.
      const child = spawn(installer, ['/S', '--updated'], { detached: true, stdio: 'ignore' });
      child.unref();
      this.log?.write(`update: installer launched (${decision.version})\n`);
      this.app?.quit();
      return { action: 'installing', version: decision.version };
    } catch (error) {
      this.log?.write(`update: install failed: ${error.message}\n`);
      await this.dialog.showMessageBox({
        type: 'error',
        message: this.localeText('updateFailed'),
        detail: this.localeText('updateFailedDetail', { error: error.message }),
        buttons: ['OK'],
      });
      return { action: 'error', error: error.message };
    }
  }
}

async function streamToFile(stream, path) {
  const { Readable } = await import('node:stream');
  const { pipeline } = await import('node:stream/promises');
  const temporary = path + '.part';
  await pipeline(Readable.fromWeb(stream), createWriteStream(temporary));
  await rename(temporary, path);
}
