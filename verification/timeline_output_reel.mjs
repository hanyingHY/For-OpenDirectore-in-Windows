/** RFC #362 · the recorded demonstration of the timeline output failure card.
 *
 * This is the *visual* half of the acceptance evidence for the bug the user
 * reported: pressing "输出视频 / Output video" on a timeline with nothing on it
 * opened a failed card that could not be dismissed. `verification/
 * timeline_output_dismiss.mjs` asserts the state machine; this script records the
 * same journey in a real window and writes an H.264 MP4 with `reel.mjs`.
 *
 * It runs unchanged against the original (unpatched) tree and against the patched
 * one, so the two reels can be compared frame by frame:
 *
 *   OD_REEL=before   original upstream behaviour: a stuck card, no exit
 *   OD_REEL=after    patched behaviour: toast instead of a card, three exits
 *
 * What it does, in order:
 *   1. opens a backend project in the canvas (same isolated fixture as CI);
 *   2. adds a Timeline node and asks for its output, as a user would;
 *   3. reports what the answer was and how many ways out it offered;
 *   4. tries every escape a user would try — Escape, clicking away, double-click,
 *      the node context menu, Delete, and "Retry output" twice;
 *   5. (patched only) induces a real encoder rejection at 4096×4096, then uses
 *      "Edit timeline" and "Close card", and re-renders a valid 640×400 sequence
 *      to prove the guard did not freeze the timeline;
 *   6. switches the interface to 中文 and shows the same card's controls.
 *
 * No paid provider, no network beyond 127.0.0.1 and no fake UI: the failure comes
 * from the browser's own H.264 encoder refusing an out-of-range frame size, which
 * is the same rejection path as a Windows N install without the Media Feature
 * Pack. The MP4 at the end is the app's own export, downloaded through the
 * browser's download manager.
 *
 * Preconditions (see .github/workflows/canvas.yml for the same wiring):
 *   python tests/browser/creation_server.py --port 8019
 *   OPENDIRECTOR_API_URL=http://127.0.0.1:8019 npx vite --port 5179
 *   CREATION_WEB_URL / CREATION_API_URL, BROWSER_PATH, OD_REEL, OD_REEL_DIR
 */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { launchBrowser } from "./browser-engine.mjs";
import { openReel, encodeReel } from "./reel.mjs";

const mode = process.env.OD_REEL === "before" ? "before" : "after";
const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5179";
const api = process.env.CREATION_API_URL ?? base;
const dir = process.env.OD_REEL_DIR ?? `.work/reel-${mode}`;
const headers = { "X-OpenDirector-Request": "1" };
const jpeg = await readFile(join(import.meta.dirname, "..", "examples", "01-orbit.jpg"));

const packageFor = (width, height) => JSON.stringify({
  format: "opendirector-editable-timeline",
  version: 1,
  timeUnit: "seconds",
  timeline: {
    fps: 24, width, height, importedAssets: [],
    tracks: [{
      id: "visual", kind: "visual", title: "Orbit", muted: false,
      clips: [{
        id: "clip", inPoint: 0, outPoint: 1, speed: 1, volume: 1, muted: false,
        resource: {
          id: "orbit", kind: "image", title: "Orbit",
          src: "data:image/jpeg;base64," + jpeg.toString("base64"),
          mimeType: "image/jpeg", width: 960, height: 600,
        },
      }],
    }],
  },
});

const observation = (page) => page.evaluate(() => {
  const card = document.querySelector(".cw-timeline-pending");
  const visible = (node) => !!node && getComputedStyle(node).display !== "none";
  return {
    card: !!card,
    alert: card ? (card.querySelector('[role="alert"]')?.innerText || "").trim() : "",
    actions: card
      ? [...card.querySelectorAll("button")].map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim())
      : [],
    toasts: [...document.querySelectorAll(".cw-toast")].map((t) => t.innerText.trim()),
    closable: !!card?.querySelector(".cw-timeline-pending-close"),
    menu: [...document.querySelectorAll('[role="menuitem"]')].map((m) => m.innerText.trim()).filter(Boolean),
    dialog: visible(document.querySelector(".cw-timeline-dialog")),
    nodes: document.querySelectorAll(".react-flow__node").length,
  };
});

/** Wait until the app has answered — with a card, a toast or a dialog — then read it. */
const settled = async (page, what = ".cw-toast, .cw-timeline-pending") => {
  await page.waitForFunction((sel) => !!document.querySelector(sel), what, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(260); // let the publish round-trip and the exit animation land
  return observation(page);
};

const browser = await launchBrowser();
const report = { mode, steps: [] };
let reel = null;
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await context.addInitScript(() => {
    localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
    localStorage.setItem("opendirector.locale.v1", "en-US");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mkdir(dir, { recursive: true });
  reel = await openReel(page, { dir, size: { width: 1500, height: 950 } });
  const note = async (text) => { await reel.caption(text); report.steps.push(text); await page.waitForTimeout(320); };

  // The welcome overlay swallows the first click; only the seed navigation needs it.
  const bootstrap = (url) => url.origin === new URL(base).origin && url.pathname === "/";
  await page.route(bootstrap, (route) => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await page.goto(base + "/");
  await note("OpenDirector · Windows harness evidence reel · baseline upstream ab3f0585 · " + mode.toUpperCase() + " state");
  const projectId = await page.evaluate(async () => {
    const { createDocument } = await import("/src/canvas/model.ts");
    const { importWorkspaceDocument } = await import("/src/backend/workspace.ts");
    const saved = await importWorkspaceDocument({
      ...createDocument("Reel " + crypto.randomUUID().slice(0, 8)), nodes: [],
    });
    (await import("/src/backend/creationClient.ts")).creationClient(saved.id).close();
    await (await import("/src/backend/projects.ts")).releaseBackendProject();
    return saved.id;
  });
  await page.unroute(bootstrap);
  await page.goto(`${base}/ai-tool/ai-canvas/${projectId}`);
  await page.getByText("Saved on this device", { exact: true }).waitFor();
  await note("A project served by the bundled Python host — the same canvas the desktop app shows");

  // A ReactFlow pan is not a DOM scroll: nothing can reach a node the camera left
  // behind, so the canvas has to be fitted again first.
  const refit = async () => {
    await page.locator(".cw-workspace").focus();
    await page.keyboard.press("Shift+1");
    await page.waitForTimeout(150);
  };

  // Upstream hides the selection toolbar while the node's rect is off-screen,
  // and a render pans the camera to its output slot — so the node a failed card
  // belongs to is usually out of view by the time the user wants it again. Every
  // helper here therefore refits first and retries: `Shift+1` is the app's own
  // 「看全图」, not a test-only nudge. Timeouts stay short so a genuinely broken
  // control fails loudly instead of eating the reel.
  const tryOn = async (label, run, attempts = 4) => {
    let last;
    for (let i = 0; i < attempts; i++) {
      await refit();
      try {
        await run();
        return;
      } catch (error) {
        last = error;
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(200);
      }
    }
    throw new Error(`${label} never reached its control: ${(last?.message || last || "").toString().slice(0, 220)}`);
  };
  const addTimeline = async () => {
    await page.getByRole("button", { name: /^(Add Timeline|添加时间线)$/ }).first().click();
    await page.locator(".react-flow__node.selected").waitFor();
  };
  const outputButton = async () => {
    await tryOn("the node's output button", async () => {
      await page.locator(".react-flow__node .cw-node-title").last().click({ timeout: 4000 });
      // Localised on purpose: step 7 repeats this in 中文, and the reel is one take.
      await page.locator(".cw-selection-toolbar").getByRole("button", { name: /^(Output video|输出视频)$/ })
        .waitFor({ state: "visible", timeout: 4000 });
    });
    return page.locator(".cw-selection-toolbar").getByRole("button", { name: /^(Output video|输出视频)$/ });
  };
  const openEditor = async () => {
    await tryOn("the node's editor", async () => {
      await page.locator(".react-flow__node .cw-node-title").last().click({ button: "right", timeout: 4000 });
      await page.getByRole("menuitem", { name: /^(Open editor|打开编辑器)$/ }).click({ timeout: 4000 });
      await page.locator(".cw-timeline-dialog").waitFor({ timeout: 4000 });
    });
  };
  // Loading a package into the open editor; `apply` also closes it, which is the
  // difference between「this is the timeline now」and「let me render it here」.
  const loadPackage = async (width, height, { apply = true } = {}) => {
    await page.getByLabel("Import timeline JSON", { exact: true }).setInputFiles({
      name: "orbit.timeline.json", mimeType: "application/json", buffer: Buffer.from(packageFor(width, height)),
    });
    await page.locator(".cw-timeline-clip").first().waitFor();
    if (!apply) return;
    await page.getByRole("button", { name: /^(Apply edits|应用修改)$/ }).click();
    await page.locator(".cw-timeline-dialog").waitFor({ state: "detached" });
  };
  const importPackage = (width, height) => loadPackage(width, height);
  const card = page.locator(".cw-timeline-pending");

  await addTimeline();
  await note("Step 1 · the report: an empty timeline, asked for an output video");
  await (await outputButton()).click();
  const asked = await settled(page);
  report.emptyTimeline = asked;

  if (asked.card) {
    await note(`Answer: a failed card reading 「${asked.alert}」 with only: ${asked.actions.join(" / ") || "nothing"}`);
    // Every exit a user would try, in front of the camera.
    const trials = [];
    const trial = async (label, run) => {
      await run();
      await page.waitForTimeout(420);
      const state = await observation(page);
      trials.push({ action: label, stillStuck: state.card });
    };
    await note("Step 2 · trying to close it: Escape");
    await trial("Escape", () => page.keyboard.press("Escape"));
    await note("Trying: click the empty canvas");
    await trial("click empty canvas", () => page.mouse.click(1200, 780));
    await note("Trying: double-click the card");
    await trial("double-click card", () => card.dblclick().catch(() => {}));
    await note("Trying: the card's right-click menu");
    await trial("right-click card", () => card.click({ button: "right" }).catch(() => {}));
    await note("Trying: Delete on the keyboard");
    await trial("Delete", () => page.keyboard.press("Delete"));
    await note("Trying: the only button it offers, twice");
    await trial("Retry output", () => card.getByRole("button", { name: /Retry|重试/ }).first().click().catch(() => {}));
    await settled(page);
    await trial("Retry output again", () => card.getByRole("button", { name: /Retry|重试/ }).first().click().catch(() => {}));
    await settled(page);
    await page.keyboard.press("Escape");
    await page.mouse.click(1200, 780);
    await page.waitForTimeout(400);
    report.trials = trials;
    const after = await observation(page);
    report.stuckAfterTrials = after.card;
    await note(after.card
      ? `Result: ${trials.filter((t) => t.stillStuck).length} of ${trials.length} escapes failed — the card is still there, and so is the same error`
      : "Result: the card is gone");
    // A still of the decisive moment next to the reel, so a reviewer can read the
    // card text without scrubbing (same file name the installed-app check writes).
    await page.screenshot({ path: process.env.OD_REEL_STUCK_SHOT ?? `delivery/timeline-${mode}-stuck.png` });
    // Clear it so the next scene starts from a clean canvas, whichever build this is.
    if (after.card) {
      const close = card.getByRole("button", { name: /Close card|关闭卡片/ }).first();
      if (await close.count()) { await close.click(); await card.waitFor({ state: "detached" }).catch(() => {}); }
      else { await page.reload(); await page.getByText("Saved on this device", { exact: true }).waitFor(); await refit(); }
    }
  } else {
    await note(`Answer: a toast — 「${(asked.toasts.at(-1) || "").trim()}」 — and no card, so nothing has to be closed`);
    assert.ok(asked.toasts.join(" ").match(/Add media to the timeline first|请先向时间线加入素材/),
      "the patched build must answer where the user asked: " + JSON.stringify(asked));
  }

  if (mode === "after") {
    // A failure the user cannot fix by waiting: the encoder itself says no.
    await openEditor();
    await importPackage(4096, 4096);
    await note("Step 3 · a real encoder rejection: 4096×4096 is outside every H.264 level");
    await (await outputButton()).click();
    await card.locator('[role="alert"]').waitFor();
    await page.waitForTimeout(300);
    const failed = await observation(page);
    report.failedCard = failed;
    await page.screenshot({ path: process.env.OD_REEL_FAIL_SHOT ?? "delivery/timeline-after-failed-card.png" });
    await note(`The card now offers: ${failed.actions.join(" / ")}`);
    await note("Step 4 · “Edit timeline” goes straight to the thing that failed");
    await card.getByRole("button", { name: "Edit timeline", exact: true }).click();
    await page.locator(".cw-timeline-dialog").waitFor();
    await page.getByRole("button", { name: /^(Close editor|关闭编辑器)$/ }).click();
    await page.locator(".cw-timeline-dialog").waitFor({ state: "detached" });
    await note("Step 5 · “Close card” (the ✕) leaves the overlay and frees the canvas");
    await (await outputButton()).click();
    await card.locator('[role="alert"]').waitFor();
    await card.getByRole("button", { name: "Close card", exact: true }).click();
    await card.waitFor({ state: "detached" });
    await page.waitForTimeout(300);
    const cleared = await observation(page);
    report.afterDismiss = cleared;

    await note("Step 6 · and the guard left the timeline usable — a real render runs");
    await openEditor();
    await loadPackage(640, 400, { apply: false });
    await page.getByRole("button", { name: /^(Render MP4|渲染 MP4)$/ }).click();
    const download = page.getByRole("button", { name: /^(Download MP4|下载 MP4)$/ });
    await download.waitFor({ timeout: 120000 });
    await note("The exported file is the app's own H.264 encode");
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    const exportPath = join(dir, "app-export.mp4");
    await file.saveAs(exportPath);
    report.exportBytes = (await readFile(exportPath)).length;
    await page.getByRole("button", { name: /^(Close editor|关闭编辑器)$/ }).click();
    await page.locator(".cw-timeline-dialog").waitFor({ state: "detached" });

    // Make the failure self-contained instead of relying on what the previous step
    // left in the project: the editor's render may have persisted a valid size, in
    // which case the next request would simply succeed. The import is done in the
    // language it was written for, and only the card is shown in 中文 — the editor's
    // own labels are localised too, and this scene is about the card.
    await openEditor();
    await importPackage(4096, 4096);
    await note("Step 7 · same controls in 中文");
    await page.getByRole("button", { name: "中文", exact: true }).first().click();
    await page.waitForTimeout(900);
    await (await outputButton()).click();
    await card.locator('[role="alert"]').waitFor();
    await page.waitForTimeout(300);
    report.chineseCard = await observation(page);
    await note(`中文界面 · 「${report.chineseCard.alert.slice(0, 46)}」 同样给出：${report.chineseCard.actions.join(" / ")}`);
    // Asserted on the controls, not on the wording: the same card carries an
    // encoder rejection here and a service-side 409 on a machine whose media
    // toolchain is broken, and both have to be escapable.
    assert.deepEqual(report.chineseCard.actions, ["编辑时间线", "重试输出", "关闭卡片"],
      "the 中文 failed card lost a control: " + report.chineseCard.actions.join("|"));
    await card.getByRole("button", { name: "关闭卡片", exact: true }).click();
    await card.waitFor({ state: "detached" });
  }

  await note("End · reel produced by verification/reel.mjs: CDP screencast → browser H.264 encoder");
  const manifest = await reel.stop();
  reel = null;
  report.wallClockMs = manifest.ms;
  report.frames = manifest.items.length;
  const encoded = await encodeReel(browser, dir, join(process.env.OD_REEL_OUT ?? ".work", `timeline-output-${mode}.mp4`));
  report.reel = encoded;
  assert.equal(pageErrors.length, 0, "page errors during the reel: " + pageErrors.join(" | "));
  if (mode === "before") {
    assert.equal(report.stuckAfterTrials, true, "the unpatched card unexpectedly offered a way out");
  } else {
    assert.equal(report.emptyTimeline.card, false, "an empty timeline still opened a card");
    assert.equal(report.afterDismiss.card, false, "Close card did not release the overlay");
    assert.deepEqual(report.failedCard.actions.filter((n) => /Edit timeline|Retry output|Close card/.test(n)),
      ["Edit timeline", "Retry output", "Close card"], "a failed card must offer fix / retry / leave");
  }
  console.log(JSON.stringify(report, null, 1));
} finally {
  await reel?.stop().catch(() => {});
  await browser.close();
}
