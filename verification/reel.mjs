/** Evidence reel: record a real window and write an H.264 .mp4 — no ffmpeg, no
 * browser download, no native toolchain.
 *
 * Why this exists: the acceptance journeys run against a live WebView/Chromium
 * (see `scripts/smoke.ps1` on Windows, `.github/workflows/canvas.yml` on Linux).
 * The evidence a reviewer needs is the moving window, not a stack of PNGs, and
 * a harness that shells out to a system `ffmpeg` fails on every machine that
 * does not happen to have one — which is most Windows installs, and this
 * container. So the reel is produced with what the browser already ships:
 *
 *   1. `Page.startScreencast` (CDP) streams the window's own repaints as JPEG.
 *   2. Consecutive identical frames are dropped and every distinct frame is held
 *      for at most `maxHoldMs`, so waiting for a render costs the viewer a second
 *      instead of a minute. Motion is never dropped: a frame is only removed if
 *      its bytes match its neighbour's.
 *   3. A second page replays the frames onto a canvas and records that canvas
 *      with `MediaRecorder('video/mp4;codecs=avc1…')` — the same H.264 encoder
 *      the app itself uses for timeline exports (see `src/canvas/mp4Export.ts`).
 *
 * The MP4 is therefore encoded and decoded by the same engine the shipped app
 * uses on the machine under test: if this reel plays, the export path works.
 *
 * Captions are drawn into the page under test (a fixed overlay, `pointer-events:
 * none`), so the reel explains itself without a post-production step.
 *
 * No application source is touched, and nothing is uploaded: the encoder page is
 * served from 127.0.0.1 and only ever reads the reel's own temp directory.
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const MIN_HOLD_MS = 90;
const MAX_HOLD_MS = 900;
const ENCODER_HTML = `<!doctype html><meta charset=utf-8><title>reel encoder</title>
<body><script>
window.encodeReel = async (manifestPath, outPath) => {
  const frames = await fetch(manifestPath).then((r) => r.json());
  const first = new Image();
  first.src = frames.items[0].file;
  await new Promise((ok, bad) => { first.onload = ok; first.onerror = bad; });
  const width = frames.width || first.naturalWidth, height = frames.height || first.naturalHeight;
  // H.264 requires even dimensions; the encoder rounds down rather than up so no
  // captured pixel column is invented.
  const canvas = document.createElement('canvas');
  canvas.width = width - (width % 2); canvas.height = height - (height % 2);
  const paint = canvas.getContext('2d', { alpha: false });
  // The container follows the engine's answer, not the file name we hoped for:
  // a chrome-headless-shell build without proprietary codecs records WebM, and a
  // .mp4 that is really WebM is the kind of evidence nobody can re-check.
  const candidates = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1.42001F', 'video/mp4', 'video/webm;codecs=vp9'];
  const type = candidates.find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) return { error: 'this browser records neither MP4/H.264 nor WebM/VP9 — install a full Chromium build (playwright install chromium, not --only-shell)' };
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: frames.bitrate || 8_000_000 });
  const parts = [];
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  const shot = async (item) => {
    const image = new Image();
    image.src = item.file;
    await new Promise((ok, bad) => { image.onload = ok; image.onerror = bad; });
    paint.fillStyle = '#000';
    paint.fillRect(0, 0, canvas.width, canvas.height);
    paint.drawImage(image, 0, 0, canvas.width, canvas.height);
    track.requestFrame();
  };
  rec.start();
  await shot(frames.items[0]);
  for (const item of frames.items) {
    // Real pacing: the viewer sees each distinct frame for exactly as long as the
    // window actually held it, bounded by the compaction above.
    await new Promise((r) => setTimeout(r, Math.max(item.holdMs, 40)));
    await shot(item);
  }
  await new Promise((r) => setTimeout(r, 240));
  await new Promise((r) => { rec.onstop = r; rec.stop(); });
  const blob = new Blob(parts, { type: rec.mimeType });
  await fetch(outPath, { method: 'POST', body: blob });
  return { mime: rec.mimeType, mp4: (rec.mimeType || type).includes('mp4'), bytes: blob.size,
           frames: frames.items.length, width: canvas.width, height: canvas.height };
};
</script>`;

/** Start a static server for the reel directory that also accepts the encoded
 * file via POST. Returns {origin, close}. */
async function serve(dir) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "POST" && url.pathname === "/write") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      await writeFile(join(dir, "reel.mp4"), Buffer.concat(chunks));
      response.writeHead(200, { "content-type": "text/plain" });
      return response.end("ok");
    }
    if (request.method !== "GET") {
      response.writeHead(405);
      return response.end();
    }
    const body = url.pathname === "/encode"
      ? ENCODER_HTML
      : await readFile(join(dir, url.pathname.replace(/^\/+/, ""))).catch(() => null);
    if (body === null) {
      response.writeHead(404);
      return response.end();
    }
    const type = url.pathname.endsWith(".json") ? "application/json"
      : url.pathname.endsWith(".jpg") ? "image/jpeg"
      : url.pathname.endsWith(".mp4") ? "video/mp4" : "text/html";
    response.writeHead(200, { "content-type": `${type}; charset=utf-8`, "access-control-allow-origin": "*" });
    response.end(body);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => new Promise((ok) => server.close(ok)) };
}

/**
 * Record the visual output of `page`.
 *
 * @param {import('playwright-core').Page} page
 * @param {{dir?: string, size?: {width: number, height: number}, quality?: number,
 *          maxWidthMs?: number}} [options]
 */
export async function openReel(page, options = {}) {
  const dir = options.dir;
  if (!dir) throw new Error("openReel needs options.dir: the reel's working directory");
  await mkdir(dir, { recursive: true });
  const size = options.size ?? { width: 1500, height: 950 };
  const quality = options.quality ?? 78;
  const maxHoldMs = options.maxWidthMs ?? MAX_HOLD_MS;
  const context = page.context();
  const cdp = await context.newCDPSession(page);
  const items = [];
  let startedAt = Date.now();
  const overlay = async (text) => page.evaluate((caption) => {
    let node = document.getElementById("od-reel-caption");
    if (!node) {
      node = document.createElement("div");
      node.id = "od-reel-caption";
      node.setAttribute("style", [
        "position:fixed", "left:50%", "bottom:22px", "transform:translateX(-50%)",
        "z-index:2147483000", "pointer-events:none", "max-width:76vw",
        "padding:7px 15px", "border-radius:999px", "border:1px solid #ffffff2e",
        "background:#101010e8", "color:#f2f2f2", "font:600 13px/1.4 system-ui,sans-serif",
        "text-align:center", "box-shadow:0 6px 22px #0006",
      ].join(";"));
      document.body.appendChild(node);
    }
    node.textContent = caption;
    return !!caption;
  }, text).catch(() => false);
  cdp.on("Page.screencastFrame", (frame) => {
    void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
    const bytes = Buffer.from(frame.data, "base64");
    const hash = createHash("md5").update(bytes).digest("hex");
    const at = Date.now() - startedAt;
    const last = items.at(-1);
    if (last && last.hash === hash) return; // An idle window repaints; it is not new information.
    if (last) last.holdMs = Math.min(Math.max(at - last.at, MIN_HOLD_MS), maxHoldMs);
    const name = `f${String(items.length).padStart(4, "0")}.jpg`;
    items.push({ at, hash, file: name, holdMs: MIN_HOLD_MS });
    void writeFile(join(dir, name), bytes);
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg", quality, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1,
  });
  startedAt = Date.now();
  return {
    dir,
    /** Say what the next few seconds of the reel are about. */
    caption: (text) => overlay(text),
    frames: () => items.length,
    async stop() {
      await cdp.send("Page.stopScreencast").catch(() => {});
      await page.evaluate(() => document.getElementById("od-reel-caption")?.remove()).catch(() => {});
      const last = items.at(-1);
      if (last) last.holdMs = Math.min(Math.max(Date.now() - last.at, MIN_HOLD_MS), maxHoldMs);
      const manifest = { width: size.width, height: size.height, items: items.map(({ at, hash, ...keep }) => keep) };
      await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest));
      return { ...manifest, ms: Date.now() - startedAt, dir };
    },
  };
}

/**
 * Turn a recorded reel directory into `outPath`.
 * @param {import('playwright-core').Browser} browser
 */
export async function encodeReel(browser, dir, outPath, options = {}) {
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  if (!manifest.items?.length) throw new Error(`reel in ${dir} captured no frames`);
  if (!existsSync(join(dir, manifest.items[0].file))) throw new Error("reel frames are missing");
  const { origin, close } = await serve(dir);
  const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/encode`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (args) => {
      const run = window.encodeReel;
      if (!run) throw new Error("encoder page did not load");
      return run(args.manifest, args.out);
    }, { manifest: `${origin}/manifest.json`, out: `${origin}/write` }).catch(async (error) => {
      throw new Error(`reel encoding failed: ${error.message}`);
    });
    if (result?.error) throw new Error(result.error);
    const bytes = await readFile(join(dir, "reel.mp4"));
    await writeFile(outPath, bytes);
    if (result?.mp4 === false) {
      const swap = outPath.replace(/\.mp4$/, ".webm");
      await writeFile(swap, bytes);
      return { ...result, outPath: swap, bytes: bytes.length,
               ms: Math.round(manifest.items.reduce((t, i) => t + i.holdMs, 0)) };
    }
    return { ...result, outPath, bytes: bytes.length, ms: Math.round(manifest.items.reduce((t, i) => t + i.holdMs, 0)) };
  } finally {
    await context.close().catch(() => {});
    await close();
  }
}
