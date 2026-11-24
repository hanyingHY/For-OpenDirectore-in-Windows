import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLatestYaml, compareVersions, decideUpdate, UpdateManager } from '../src/updater.mjs';

const FEED = `version: 0.3.0
files:
  - url: OpenDirector-v0.3.0-win-x64-setup.exe
    sha512: abc123
    size: 308000000
path: OpenDirector-v0.3.0-win-x64-setup.exe
sha512: abc123
releaseDate: '2026-11-24T00:00:00.000Z'
`;

test('parseLatestYaml reads version, path and files', () => {
  const parsed = parseLatestYaml(FEED);
  assert.equal(parsed.version, '0.3.0');
  assert.equal(parsed.path, 'OpenDirector-v0.3.0-win-x64-setup.exe');
  assert.equal(parsed.files.length >= 1, true);
  assert.equal(parsed.files[0].sha512, 'abc123');
});

test('compareVersions orders dotted releases', () => {
  assert.equal(compareVersions('0.2.0', '0.10.0'), -1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.2.1', '0.2.0'), 1);
  assert.equal(compareVersions('0.2', '0.2.0'), 0);
});

test('decideUpdate only fires for newer versions', () => {
  const latest = parseLatestYaml(FEED);
  assert.equal(decideUpdate({ current: '0.2.0', latest }).action, 'update');
  assert.equal(decideUpdate({ current: '0.3.0', latest }).action, 'none');
  assert.equal(decideUpdate({ current: '0.4.0', latest }).action, 'none');
  assert.equal(decideUpdate({ current: '0.2.0', latest: null }).action, 'none');
});

test('UpdateManager: outdated feed prompts and installs, later defers', async () => {
  const calls = [];
  const fetchImpl = async () => ({ ok: true, text: async () => FEED, body: null });
  const manager = new UpdateManager({
    current: '0.2.0',
    feedUrl: 'https://example.invalid/latest.yml',
    fetchImpl,
    dialog: {
      async showMessageBox(options) {
        calls.push(options);
        return { response: options.buttons.length === 2 && options.type === 'question' ? 1 : 0 };
      },
    },
    app: { quit() {} },
    log: { write() {} },
    localeText: (key) => key,
  });
  const result = await manager.check({ interactive: true });
  assert.equal(result.action, 'deferred');
  assert.equal(calls[0].message, 'updateAvailable');
});

test('UpdateManager: feed failure surfaces interactively, silent otherwise', async () => {
  const failing = async () => { throw new Error('offline'); };
  const shown = [];
  const manager = new UpdateManager({
    current: '0.2.0', feedUrl: 'https://example.invalid/latest.yml',
    fetchImpl: failing,
    dialog: { async showMessageBox(options) { shown.push(options); return { response: 0 }; } },
    app: { quit() {} }, log: { write() {} }, localeText: (key, params) => `${key}:${JSON.stringify(params ?? {})}`,
  });
  const quiet = await manager.check({ interactive: false });
  assert.equal(quiet.action, 'error');
  assert.equal(shown.length, 0);
  const loud = await manager.check({ interactive: true });
  assert.equal(loud.action, 'error');
  assert.equal(shown.length, 1);
  assert.match(shown[0].detail, /offline/);
});

test('UpdateManager: up to date shows the friendly notice only when interactive', async () => {
  const shown = [];
  const manager = new UpdateManager({
    current: '0.3.0', feedUrl: 'https://example.invalid/latest.yml',
    fetchImpl: async () => ({ ok: true, text: async () => FEED }),
    dialog: { async showMessageBox(options) { shown.push(options); return { response: 0 }; } },
    app: { quit() {} }, log: { write() {} }, localeText: (key) => key,
  });
  const quiet = await manager.check({ interactive: false });
  assert.equal(quiet.action, 'none');
  assert.equal(shown.length, 0);
  await manager.check({ interactive: true });
  assert.equal(shown[0].message, 'updateNone');
});
