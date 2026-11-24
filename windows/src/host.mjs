/**
 * Python Host lifecycle bridge.
 *
 * Protocol (JSON lines over stdio, compatible with upstream
 * `opendirector_api.desktop`):
 *   parent → child : initialize {token} | session {sessionId} | inspect {requestId} | shutdown {requestId}
 *   child → parent : starting | ready {url, runtime} | fatal {message} | inspection {…} | shutdown-complete
 *
 * Improvements over the reference implementation:
 *  - restart() recovers from a crashed Host without restarting the app
 *  - exit code reporting survives the Windows console detach quirks
 *  - the ready event keeps full runtime version evidence for diagnostics
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { z } from 'zod';

export const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('starting'), version: z.literal(1) }),
  z.object({
    type: z.literal('ready'), version: z.literal(1),
    url: z.url().refine(value => {
      const url = new URL(value);
      return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port !== '' &&
        url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash;
    }),
    runtime: z.record(z.string(), z.string()),
  }),
  z.object({ type: z.literal('fatal'), version: z.literal(1), message: z.string() }),
  z.object({
    type: z.literal('inspection'), requestId: z.number().int().positive(),
    agents: z.number().int().nonnegative(), generations: z.number().int().nonnegative(),
    tools: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('shutdown-complete') }),
]);

export class Host {
  constructor({ python, env, directory, log, onExit }) {
    this.options = { python, env, directory, log, onExit };
    this.token = randomBytes(32).toString('hex');
    this.pending = new Map();
    this.nextId = 0;
    this.stopping = false;
    this.shutdownComplete = false;
    this.spawn();
  }

  spawn() {
    const { python, env, directory, log } = this.options;
    this.token = randomBytes(32).toString('hex');
    this.stopping = false;
    this.shutdownComplete = false;
    this.child = spawn(python, ['-I', '-B', '-X', 'utf8', '-m', 'opendirector_api.desktop'], {
      cwd: directory, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    // `log` may be any { write } sink (a file stream in production, a stub in tests).
    this.child.stderr.on('data', chunk => { try { log?.write?.(chunk); } catch {} });
    this.closed = new Promise(resolve => this.child.once('close', resolve));
    this.ready = new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('Host startup timed out')), 60_000);
      const input = createInterface({ input: this.child.stdout });
      input.on('line', line => {
        try {
          if (line.length > 65536) throw new Error('Host message exceeds the control limit');
          const event = eventSchema.parse(JSON.parse(line));
          if (event.type === 'ready') {
            this.url = event.url;
            this.runtime = event.runtime;
            clearTimeout(deadline);
            resolve(event);
          } else if (event.type === 'fatal') {
            clearTimeout(deadline);
            reject(new Error(event.message));
          } else if (event.type === 'shutdown-complete') {
            this.shutdownComplete = true;
          } else if (event.type === 'inspection') {
            this.pending.get(event.requestId)?.(event);
            this.pending.delete(event.requestId);
          }
        } catch (error) {
          clearTimeout(deadline);
          reject(error);
          this.child.kill();
        }
      });
      this.child.once('error', error => { clearTimeout(deadline); reject(error); });
      this.child.once('close', code => {
        clearTimeout(deadline);
        reject(new Error(`Host exited (${code})`));
        for (const resolve of this.pending.values()) resolve(null);
        this.pending.clear();
        if (this.url && !this.stopping) this.options.onExit?.(code);
        this.url = undefined;
      });
    });
    this.child.stdin.on('error', () => {}); // Exit is reported by the child close event.
    this.child.stdin.write(JSON.stringify({ type: 'initialize', version: 1, token: this.token }) + '\n');
  }

  registerSession(sessionId) {
    if (this.child.exitCode === null) {
      this.child.stdin.write(JSON.stringify({ type: 'session', sessionId }) + '\n');
    }
  }

  async inspect() {
    if (!this.url || this.child.exitCode !== null) return null;
    const requestId = ++this.nextId;
    return new Promise(resolve => {
      const timeout = setTimeout(() => { this.pending.delete(requestId); resolve(null); }, 2000);
      this.pending.set(requestId, event => { clearTimeout(timeout); resolve(event); });
      this.child.stdin.write(JSON.stringify({ type: 'inspect', requestId }) + '\n');
    });
  }

  /** Stop the Host. Returns true when it shut down cleanly. */
  async stop() {
    this.stopping = true;
    if (this.child.exitCode !== null) return true;
    this.child.stdin.end(JSON.stringify({ type: 'shutdown', requestId: ++this.nextId }) + '\n');
    const timeout = setTimeout(() => this.child.kill('SIGKILL'), 20_000);
    try {
      const code = await this.closed;
      return code === 0 && this.shutdownComplete;
    } finally { clearTimeout(timeout); }
  }

  /** Restart after a crash. The caller refreshes the renderer once ready. */
  async restart() {
    if (this.child.exitCode === null) await this.stop();
    this.spawn();
    await this.ready;
    return this.url;
  }
}

export function ownedURL(value) {
  const url = new URL(value);
  return url.protocol === 'opendirector:' && url.hostname === 'app' && !url.port && !url.username && !url.password;
}

const CENSORED_REQUEST_HEADERS = ['host', 'origin', 'cookie', 'authorization', 'connection', 'content-length', 'x-opendirector-desktop'];
const CENSORED_RESPONSE_HEADERS = ['connection', 'transfer-encoding', 'keep-alive', 'set-cookie', 'content-encoding', 'content-length'];

export async function proxyRequest(request, host, fetcher) {
  if (!ownedURL(request.url) || !host.url) return new Response(null, { status: 403 });
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, host.url);
  if (target.origin !== new URL(host.url).origin) return new Response(null, { status: 403 });
  const headers = new Headers(request.headers);
  for (const name of CENSORED_REQUEST_HEADERS) headers.delete(name);
  headers.set('X-OpenDirector-Desktop', host.token);
  const upload = request.method === 'PUT' && /^\/api\/creation\/projects\/[^/]+\/uploads\/[^/]+$/.test(incoming.pathname);
  const options = {
    method: request.method, headers, redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: request.signal,
  };
  if (request.body) {
    if (upload) {
      options.body = request.body;
      options.duplex = 'half';
    } else {
      options.body = await request.arrayBuffer();
    }
  }
  const response = await fetcher(target.href, options);
  if (response.status >= 300 && response.status < 400 && response.status !== 304) return new Response(null, { status: 502 });
  const outgoing = new Headers(response.headers);
  for (const name of CENSORED_RESPONSE_HEADERS) outgoing.delete(name);
  outgoing.set('Cache-Control', 'no-store');
  outgoing.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outgoing });
}
