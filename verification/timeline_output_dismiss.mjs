/** RFC #362 desktop.8 regression: the timeline output failure card must have a way out.
 *
 * Two defects, both inherited from the pinned upstream UI (they reproduce in the web
 * version too, so this is not a Windows-shell problem):
 *
 * 1. "Output video" on an empty timeline started an encode that cannot produce a
 *    frame. The card it left behind reported 「请先向时间线加入素材。」 with a single
 *    action, "Retry output", which failed identically forever: the overlay is a
 *    virtual node (not selectable, deletable or focusable), Escape and the node
 *    context menu are swallowed, and the only real escapes were switching project
 *    or deleting the *source* timeline node.
 * 2. A held publish (a render that succeeded but could not be written back) parks
 *    every other timeline through `blockedItemId`, so one unclosable card also froze
 *    the other timelines' output buttons until its retry happened to succeed.
 *
 * Patched behaviour checked here:
 *  - an empty timeline answers with the existing toast and never opens a card;
 *  - a genuine encode failure offers Edit timeline / Retry output / Close card;
 *  - closing releases the overlay and any held render, leaves no orphan video item,
 *    and a later attempt still works (no stuck `active`/`pending` refs).
 *
 * The failure is induced with a 4096×4096 frame: the H.264 encoder rejects that
 * size, which is the same "this browser cannot encode at this size" path a Windows N
 * install without the Media Feature Pack hits. Deterministic, offline, no provider
 * account and no paid request.
 *
 * Runs against the pinned upstream tree with the patches applied, using the same
 * dev server + isolated creation fixture as the tests/browser suites (see
 * .github/workflows/canvas.yml). The file lives in verification/ and is copied to
 * tests/ — never tests/browser/ — because scripts/check-browser-manifest.mjs insists
 * that every tests/browser journey is listed in upstream's manifest.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { launchBrowser } from "./browser/engine.mjs";

const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5179";
const api = process.env.CREATION_API_URL ?? base;
const headers = { "X-OpenDirector-Request": "1" };
const health = await fetch(api + "/api/creation-test-health", { headers }).then((r) => r.json());
assert.equal(health.isolated, true);

// A real, decodable JPEG, so the import validator accepts the clip and only the
// frame size is impossible. The distribution keeps one next to this repository.
const jpeg = (() => {
  for (const path of ["../examples/01-orbit.jpg", "examples/01-orbit.jpg"]) {
    try {
      return "data:image/jpeg;base64," + readFileSync(path).toString("base64");
    } catch {}
  }
  throw new Error("no example JPEG to build the failing clip from");
})();

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
        resource: { id: "orbit", kind: "image", title: "Orbit", src: jpeg, mimeType: "image/jpeg", width: 960, height: 600 },
      }],
    }],
  },
});

const cardState = (page) => page.evaluate(() => {
  const node = document.querySelector(".cw-timeline-pending");
  return {
    card: !!node,
    alert: node ? (node.querySelector('[role="alert"]')?.innerText || "").trim() : "",
    actions: node
      ? [...node.querySelectorAll("button")].map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim())
      : [],
    toasts: [...document.querySelectorAll(".cw-toast")].map((t) => t.innerText.trim()),
  };
});
// The request is answered asynchronously (save → refresh → project the editor
// document), so "nothing happened" must never be read off a frame too early.
const settled = (page) => page
  .waitForFunction(() => !!document.querySelector(".cw-toast, .cw-timeline-pending"), null, { timeout: 20000 })
  .then(() => cardState(page));
// Toasts stack, so clear them first: an old toast would satisfy `settled`.
const clearToasts = (page) => page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 20 && document.querySelector(".cw-toast"); i++) {
    document.querySelector(".cw-toast .cw-toast-close")?.click();
    await wait(320);
  }
  while (document.querySelector(".cw-toast-slot")) await wait(150);
});

const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.setDefaultTimeout(25000);
  const errors = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
  await page.addInitScript(() => {
    localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
    localStorage.setItem("opendirector.locale.v1", "en-US");
  });
  // The welcome overlay would eat the first click; only the seed navigation needs it.
  const bootstrap = (url) => url.origin === new URL(base).origin && url.pathname === "/";
  await page.route(bootstrap, (route) => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await page.goto(base + "/");
  const projectId = await page.evaluate(async () => {
    const { createDocument } = await import("/src/canvas/model.ts");
    const { importWorkspaceDocument } = await import("/src/backend/workspace.ts");
    const saved = await importWorkspaceDocument({
      ...createDocument("Timeline dismissal " + crypto.randomUUID().slice(0, 8)), nodes: [],
    });
    (await import("/src/backend/creationClient.ts")).creationClient(saved.id).close();
    await (await import("/src/backend/projects.ts")).releaseBackendProject();
    return saved.id;
  });
  await page.unroute(bootstrap);
  await page.goto(`${base}/ai-tool/ai-canvas/${projectId}`);
  await page.getByText("Saved on this device", { exact: true }).waitFor();
  const videoItems = () => fetch(`${api}/api/creation/projects/${projectId}`, { headers })
    .then((r) => r.json())
    .then((body) => (body.canvasItems || []).filter((item) => item.kind === "video").length);

  const addTimeline = async () => {
    await page.getByRole("button", { name: "Add Timeline", exact: true }).click();
    await page.locator(".react-flow__node.selected").waitFor();
  };
  // Selecting through the title is what a user does; the node keeps its id, while
  // `.selected` comes and goes with the camera and the editor modal.
  const select = async (nth = -1) => {
    await page.locator(".react-flow__node .cw-node-title").nth(nth < 0 ? -1 : nth).click();
    const toolbar = page.locator(".cw-selection-toolbar");
    await toolbar.waitFor();
    return toolbar.getByRole("button", { name: "Output video", exact: true });
  };
  // A render pans the camera to its output slot; a ReactFlow pan is not a DOM
  // scroll, so refit the document before touching node chrome again.
  const refit = async () => {
    await page.locator(".cw-workspace").focus();
    await page.keyboard.press("Shift+1");
  };
  const openEditor = async (nth = -1) => {
    await page.locator(".react-flow__node .cw-node-title").nth(nth < 0 ? -1 : nth)
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "Open editor", exact: true }).click();
    await page.locator(".cw-timeline-dialog").waitFor();
  };
  const importPackage = async (width, height) => {
    await page.getByLabel("Import timeline JSON", { exact: true }).setInputFiles({
      name: "orbit.timeline.json", mimeType: "application/json", buffer: Buffer.from(packageFor(width, height)),
    });
    await page.locator(".cw-timeline-clip").first().waitFor();
    await page.getByRole("button", { name: "Apply edits", exact: true }).click();
    await page.locator(".cw-timeline-dialog").waitFor({ state: "detached" });
  };
  const failedCard = page.locator(".cw-timeline-pending");
  const failOnce = async (nth) => {
    await refit();
    await clearToasts(page);
    await (await select(nth)).click();
    await failedCard.locator('[role="alert"]').waitFor();
    return cardState(page);
  };

  // (1) The reported scenario: answered where it was asked, no card left behind.
  await addTimeline();
  await clearToasts(page);
  await (await select()).click();
  const empty = await settled(page);
  assert.equal(empty.card, false, "an empty timeline must not leave an output card behind");
  assert.match(empty.toasts.join(" "), /Add media to the timeline first/, "the reason belongs where the user asked");
  assert.equal(await videoItems(), 0, "the refused request wrote to the project");

  // (2) A genuine encode failure: three ways out, and one of them is "leave".
  await openEditor();
  await importPackage(4096, 4096);
  const shot = await failOnce();
  assert.match(shot.alert, /cannot encode H\.264 at this size/, "unexpected failure text: " + shot.alert);
  assert.deepEqual(shot.actions.filter((name) => /Edit timeline|Retry output|Close card/.test(name)),
    ["Edit timeline", "Retry output", "Close card"],
    "a failed card needs fix-source, retry and leave, got: " + shot.actions.join("|"));
  // The leave control is reachable by keyboard and named for assistive tech.
  assert.equal(await failedCard.locator(".cw-timeline-pending-close").getAttribute("aria-label"), "Close card");

  // (3) "Edit timeline" is the short path to the fix, not a dead end.
  await failedCard.getByRole("button", { name: "Edit timeline", exact: true }).click();
  await page.locator(".cw-timeline-dialog").waitFor();
  await page.locator(".cw-timeline-dialog").getByRole("button", { name: "Close editor", exact: true }).click();
  await page.locator(".cw-timeline-dialog").waitFor({ state: "detached" });

  // (4) Closing releases the overlay and everything it held.
  const closed = await failOnce();
  assert.equal(closed.card, true, "the second attempt never reached its card");
  await failedCard.getByRole("button", { name: "Close card", exact: true }).click();
  await failedCard.waitFor({ state: "detached" });
  assert.equal(await videoItems(), 0, "closing the card left an orphan output item");

  // (5) No stuck refs: a third attempt still reaches a closable card.
  await failOnce();
  await failedCard.getByRole("button", { name: "Close card", exact: true }).click();
  await failedCard.waitFor({ state: "detached" });

  // (6) The guard is per timeline: a second, still-empty timeline is refused too,
  // repeatably, and nothing leaked into a card or into the project. (Selecting the
  // first node again is not asserted here: upstream hides the selection toolbar
  // while a node's rect is off-screen, which is a viewport concern, not a state one.)
  await refit();
  await addTimeline();
  await clearToasts(page);
  await (await select()).click();
  const other = await settled(page);
  assert.equal(other.card, false, "an empty second timeline opened a card");
  assert.match(other.toasts.join(" "), /Add media to the timeline first/);
  await (await select()).click();
  const repeat = await settled(page);
  assert.equal(repeat.card, false, "a repeated empty request opened a card");
  assert.equal(await videoItems(), 0, "refused requests wrote to the project");

  assert.deepEqual(errors, [], "page errors during the journey: " + errors.join(" | "));
  console.log("timeline output: empty request refused with a toast, failed card closable, no orphan output, no stuck refs");
} finally {
  await browser.close();
}
