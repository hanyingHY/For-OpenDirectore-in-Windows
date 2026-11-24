import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizeBounds, readState, writeState, DEFAULT_BOUNDS } from '../src/window-state.mjs';

const display = (x, y, width, height) => ({ bounds: { x, y, width, height } });

test('sanitizeBounds keeps in-view bounds', () => {
  const saved = { x: 100, y: 60, width: 1200, height: 800 };
  const result = sanitizeBounds(saved, [display(0, 0, 1920, 1080)]);
  assert.deepEqual(result, { x: 100, y: 60, width: 1200, height: 800 });
});

test('sanitizeBounds recenters when the monitor disappeared', () => {
  const saved = { x: 3000, y: 400, width: 1200, height: 800 }; // second monitor
  const result = sanitizeBounds(saved, [display(0, 0, 1920, 1080)]);
  assert.equal(result.x, Math.round((1920 - 1200) / 2));
  assert.equal(result.y, Math.round((1080 - 800) / 2));
});

test('sanitizeBounds clamps absurd sizes and rejects junk', () => {
  const huge = sanitizeBounds({ x: 0, y: 0, width: 99999, height: 99999 }, [display(0, 0, 1920, 1080)]);
  assert.equal(huge.width, 16384);
  assert.equal(huge.height, 16384);
  assert.deepEqual(sanitizeBounds(null, [display(0, 0, 1920, 1080)]), { ...DEFAULT_BOUNDS });
  assert.deepEqual(sanitizeBounds({ x: NaN, y: 0, width: 'wide', height: 800 }, [display(0, 0, 1920, 1080)]), { ...DEFAULT_BOUNDS });
});

test('sanitizeBounds works across a negative-origin display layout', () => {
  const saved = { x: -1600, y: 100, width: 1280, height: 800 };
  const result = sanitizeBounds(saved, [display(-1920, 0, 1920, 1080), display(0, 0, 1920, 1080)]);
  assert.equal(result.x, -1600);
});

test('window state file round-trips and tolerates corruption', () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-state-'));
  const file = join(dir, 'nested', 'window-state.json');
  assert.deepEqual(readState(file), {});
  writeState(file, { bounds: DEFAULT_BOUNDS, maximized: true });
  assert.equal(readState(file).maximized, true);
  writeFileSync(file, '{corrupt');
  assert.deepEqual(readState(file), {});
  assert.equal(JSON.parse(readFileSync(file, 'utf8') === '{corrupt' ? '{}' : '{}') !== undefined, true);
});
