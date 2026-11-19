/** CDP screencast → H.264 mp4 recorder for web-version simulations.
 *
 * The installed-app journeys (scripts/smoke.mjs) record the native WebView2
 * window through the same Page.startScreencast pipeline; this module keeps the
 * identical frame-capture approach for runs against the dev server, so a
 * recording made here shows the very renderer the desktop shell embeds.
 *
 * FFMPEG_PATH points at an ffmpeg binary (the Windows bundle ships
 * app/media/ffmpeg.exe; local runs may use any build with libx264).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export function ffmpegPath() {
  const explicit = process.env.FFMPEG_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  throw new Error("set FFMPEG_PATH to an ffmpeg binary with libx264");
}

/** Start capturing JPEG screencast frames; stop() composes the mp4. */
export async function startRecording(page, output, ffmpeg, options = {}) {
  const {
    width = 1440,
    height = 900,
    quality = 82,
    fps = 24,
    folder = resolve(".work/frames-" + Math.random().toString(36).slice(2, 8)),
  } = options;
  mkdirSync(folder, { recursive: true });
  mkdirSync(dirname(resolve(output)), { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", (event) => {
    const file = join(folder, `${frames.length}.jpg`);
    writeFileSync(file, Buffer.from(event.data, "base64"));
    frames.push([file, Date.now()]);
    cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality,
    maxWidth: width,
    maxHeight: height,
  });
  return async () => {
    await delay(600);
    await cdp.send("Page.stopScreencast").catch(() => {});
    if (frames.length < 2) throw new Error("no captured frames for " + output);
    const list =
      frames
        .map(
          ([file, t], i) =>
            `file '${file.replaceAll("\\", "/")}'\nduration ${Math.min(2, ((frames[i + 1]?.[1] ?? t + 1200) - t) / 1000)}`,
        )
        .join("\n") +
      `\nfile '${frames.at(-1)[0].replaceAll("\\", "/")}'\n`;
    const listFile = join(folder, "frames.txt");
    writeFileSync(listFile, list);
    execFileSync(ffmpeg, [
      "-loglevel", "error", "-y", "-safe", "0", "-f", "concat", "-i", listFile,
      "-vf", `scale=${width}:${height},fps=${fps},format=yuv420p`,
      "-c:v", "libx264", "-preset", "fast", "-movflags", "+faststart", resolve(output),
    ]);
    return { frames: frames.length, output: resolve(output) };
  };
}
