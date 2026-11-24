import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  recentProjects, jumpList, taskbarProgress, shouldNotify, trayMenu,
} from '../src/windows-native.mjs';

const text = {
  recentProjects: 'Recent projects', jumpNew: 'New project',
  jumpData: 'Open data folder', jumpLogs: 'Open diagnostics folder',
  trayShow: 'Show', trayNew: 'New project', trayOpenData: 'Data',
  trayMinimize: 'Minimize', trayQuit: 'Quit',
};

function workspaceFixture() {
  const workspace = mkdtempSync(join(tmpdir(), 'od-workspace-'));
  mkdirSync(join(workspace, 'projects', 'Alpha film'), { recursive: true });
  mkdirSync(join(workspace, 'projects', 'Beta reel'), { recursive: true });
  utimesSync(join(workspace, 'projects', 'Alpha film'), new Date(2000), new Date(2000));
  utimesSync(join(workspace, 'projects', 'Beta reel'), new Date(4000), new Date(4000));
  return workspace;
}

test('recentProjects lists newest first and survives missing roots', () => {
  const workspace = workspaceFixture();
  const recent = recentProjects(workspace);
  assert.deepEqual(recent.map(p => p.name), ['Beta reel', 'Alpha film']);
  assert.deepEqual(recentProjects(join(workspace, 'nope')), []);
});

test('jumpList carries recent projects plus the task entries', () => {
  const list = jumpList({ workspace: workspaceFixture(), logs: '/tmp/logs', text });
  assert.equal(list.tasks[0].items.length, 3);
  assert.equal(list.categories[0].name, 'Recent projects');
  assert.equal(list.categories[0].items.length, 2);
  assert.match(list.categories[0].items[0].args[0], /^opendirector:\/\/project\//);
});

test('taskbarProgress maps values and clears', () => {
  assert.deepEqual(taskbarProgress(null), { clear: true });
  assert.deepEqual(taskbarProgress(0.5), { value: 0.5, options: { mode: 'normal' } });
  assert.deepEqual(taskbarProgress(2), { value: 1, options: { mode: 'normal' } });
  assert.deepEqual(taskbarProgress(-3), { value: 0, options: { mode: 'normal' } });
  assert.deepEqual(taskbarProgress(undefined, 'indeterminate'), { value: 1, options: { mode: 'indeterminate' } });
  assert.equal(taskbarProgress(0.4, 'error').options.mode, 'error');
  assert.equal(taskbarProgress(0.4, 'paused').options.mode, 'paused');
});

test('shouldNotify only fires when the user would miss the in-app signal', () => {
  assert.equal(shouldNotify({ focused: true, minimized: false, hidden: false }), false);
  assert.equal(shouldNotify({ focused: false, minimized: false, hidden: false }), true);
  assert.equal(shouldNotify({ focused: true, minimized: true, hidden: false }), true);
  assert.equal(shouldNotify({ focused: true, minimized: false, hidden: true }), true);
});

test('trayMenu reflects the preference and wires handlers', () => {
  let minimized = false;
  const menu = trayMenu({
    text, minimizeToTray: true,
    handlers: {
      show() {}, newProject() {}, openData() {},
      toggleMinimize() { minimized = true; }, quit() {},
    },
  });
  assert.equal(menu.find(item => item.type === 'checkbox').checked, true);
  menu.find(item => item.type === 'checkbox').click();
  assert.equal(minimized, true);
  assert.equal(menu.filter(item => item.type === 'separator').length, 3);
});
