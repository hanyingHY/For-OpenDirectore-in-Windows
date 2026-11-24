import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Host, ownedURL, proxyRequest, eventSchema } from '../src/host.mjs';

/** A fake `python` executable that speaks the Host control protocol. */
function fakePython(scriptBody) {
  const dir = mkdtempSync(join(tmpdir(), 'od-fake-python-'));
  const script = join(dir, 'fake.mjs');
  writeFileSync(script, scriptBody);
  const launcher = join(dir, 'python');
  writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  chmodSync(launcher, 0o755);
  return launcher;
}

const PASS_THROUGH = `
let ready = false;
process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', chunk => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.type === 'initialize') {
      process.stdout.write(JSON.stringify({ type: 'starting', version: 1 }) + '\\n');
      process.stdout.write(JSON.stringify({ type: 'ready', version: 1, url: 'http://127.0.0.1:39937/', runtime: { python: '3.12.0' } }) + '\\n');
    } else if (message.type === 'inspect') {
      process.stdout.write(JSON.stringify({ type: 'inspection', requestId: message.requestId, agents: 1, generations: 0, tools: 2 }) + '\\n');
    } else if (message.type === 'shutdown') {
      process.stdout.write(JSON.stringify({ type: 'shutdown-complete' }) + '\\n');
      process.exit(0);
    } else if (message.type === 'session') {
      process.stdout.write(JSON.stringify({ type: 'starting', version: 1 }) + '\\n');
    }
  }
});
`;

test('eventSchema validates the control protocol', () => {
  assert.equal(eventSchema.safeParse({ type: 'ready', version: 1, url: 'http://127.0.0.1:1/', runtime: {} }).success, true);
  assert.equal(eventSchema.safeParse({ type: 'ready', version: 1, url: 'https://evil.example/', runtime: {} }).success, false);
  assert.equal(eventSchema.safeParse({ type: 'ready', version: 1, url: 'http://127.0.0.1:1/?x=1', runtime: {} }).success, false);
});

test('ownedURL accepts only the app scheme', () => {
  assert.equal(ownedURL('opendirector://app/api/health'), true);
  assert.equal(ownedURL('opendirector://app:8000/x'), false);
  assert.equal(ownedURL('https://app/'), false);
});

test('Host starts, inspects and shuts down cleanly', async () => {
  const host = new Host({
    python: fakePython(PASS_THROUGH),
    env: { PATH: '/usr/bin:/bin' },
    directory: tmpdir(),
    log: { write() {} },
    onExit() {},
  });
  const ready = await host.ready;
  assert.equal(ready.url, 'http://127.0.0.1:39937/');
  assert.equal(host.token.length, 64);
  const inspection = await host.inspect();
  assert.equal(inspection.agents, 1);
  assert.equal(inspection.tools, 2);
  host.registerSession('2f0d9b1e-6c5a-4f2f-9c2b-8f1e2d3c4b5a');
  assert.equal(await host.stop(), true);
});

test('Host reports unexpected exits through onExit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-crash-'));
  const crash = join(dir, 'crash.mjs');
  writeFileSync(crash, `
    process.stdout.write(JSON.stringify({ type: 'starting', version: 1 }) + '\\n');
    process.stdout.write(JSON.stringify({ type: 'ready', version: 1, url: 'http://127.0.0.1:39938/', runtime: {} }) + '\\n');
    setTimeout(() => process.exit(7), 50);
  `);
  const launcher = join(dir, 'python');
  writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${crash}"\n`);
  chmodSync(launcher, 0o755);
  let exited = null;
  const host = new Host({ python: launcher, env: { PATH: '/usr/bin:/bin' }, directory: tmpdir(), log: { write() {} }, onExit: code => { exited = code; } });
  await host.ready;
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(exited, 7);
});

test('proxyRequest strips identity headers and pins the desktop credential', async () => {
  const host = { url: 'http://127.0.0.1:39939/', token: 'a'.repeat(64) };
  const request = new Request('opendirector://app/api/health', {
    method: 'GET',
    headers: { 'x-opendirector-desktop': 'stolen', authorization: 'Bearer x', cookie: 'sid=1' },
  });
  const captured = {};
  const response = await proxyRequest(request, host, async (url, options) => {
    captured.url = url;
    captured.headers = Object.fromEntries(options.headers.entries());
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'nope' } });
  });
  assert.equal(response.status, 200);
  assert.equal(captured.headers['x-opendirector-desktop'], 'a'.repeat(64));
  assert.equal(captured.headers.authorization, undefined);
  assert.equal(captured.headers.cookie, undefined);
  assert.equal(response.headers.get('content-security-policy').includes("default-src 'self'"), true);
  const denied = await proxyRequest(new Request('https://evil.example/'), host, async () => new Response());
  assert.equal(denied.status, 403);
});
