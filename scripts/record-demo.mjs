#!/usr/bin/env node
/**
 * Record the full functional simulation as an MP4 demo.
 *
 * Usage:
 *   CHROMIUM_PATH=/path/to/chromium FFMPEG_PATH=/path/to/ffmpeg \
 *   CREATION_WEB_URL=http://127.0.0.1:5179 \
 *   node scripts/record-demo.mjs [--out demo/opendirector-windows-simulation.mp4] [--speed 1.6]
 *
 * Prerequisites (see docs/validation.md):
 *   - fixture API:  python tests/browser/creation_server.py --port 8019 --assistant-fixture
 *   - web UI:       OPENDIRECTOR_API_URL=http://127.0.0.1:8019 npm run dev -- --port 5179
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Director } from './recorder/driver.mjs';
import { runFullJourney } from './recorder/journey-full.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const web = process.env.CREATION_WEB_URL ?? 'http://127.0.0.1:5179';
const out = resolve(arg('out', join(root, 'demo', 'opendirector-windows-full-simulation.mp4')));
const speed = Number(arg('speed', '1'));
const fps = Number(arg('fps', '2'));
const chromium = process.env.CHROMIUM_PATH ?? process.env.BROWSER_PATH;
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';

if (!chromium) {
  console.error('CHROMIUM_PATH is required (a Chromium/Chrome binary)');
  process.exit(2);
}

// Sample media used by the import section: a gradient PNG and a 2 s tone WAV.
const samples = join(root, 'build', 'demo-samples');
mkdirSync(samples, { recursive: true });
const png = join(samples, 'seascape.png');
const wav = join(samples, 'tone.wav');
if (ffmpeg !== 'ffmpeg' || !spawnSync('ffmpeg', ['-version']).error) {
  const gradient = 'color=c=3366cc:s=640x360:d=1,format=rgb24';
  spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', gradient, '-frames:v', '1', png], { stdio: 'ignore' });
  spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-ar', '48000', wav], { stdio: 'ignore' });
}
globalThis.__demoSamples = { png, wav };

mkdirSync(dirname(out), { recursive: true });
const framesDir = join(root, 'build', 'frames');

const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
console.log('record-demo: launching browser…');
const director = await Director.launch({ chromium, playwright, framesDir, ffmpeg });
try {
  await runFullJourney(director, { web, api: process.env.CREATION_API_URL ?? 'http://127.0.0.1:8019' });
} finally {
  await director.close();
}
console.log(`record-demo: encoding ${director.index} frames…`);
const path = director.encode(out, { fps, speed });
writeFileSync(join(dirname(out), 'latest-demo.json'), JSON.stringify({
  out: path, frames: director.index, fps, speed, recordedAt: new Date().toISOString(),
}, null, 2));
console.log(`record-demo: done → ${path}`);
