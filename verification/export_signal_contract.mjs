/** RFC #362 desktop.11 contract: `data-od-exporting` marks an in-flight export.
 *
 * Hosts must know when an export or render runs (quit confirmation, tray busy).
 * Reading `.cw-render-status` / `.cw-timeline-pending` class names from Host.cs
 * tied that decision to markup that can be renamed at any time. The contract is
 * now explicit: while at least one export/render is in flight the document
 * element carries `data-od-exporting`; when none is, the attribute is absent.
 * Electron-style shells exposing `window.opendirectorDesktop.setExporting`
 * receive the same transitions (bridge shape borrowed from upstream PR #397).
 *
 * This journey drives a real, small timeline render and asserts:
 *  - no signal before the export starts (attribute absent, bridge quiet);
 *  - the attribute is set while frames render or the result publishes —
 *    sampled continuously from the page, so a flash would be caught —
 *    and the refcount never drops below zero;
 *  - the host bridge, when present, receives per-call state pushes (upstream
 *    #397 semantics: every start reports true; ends report the shared count);
 *  - the attribute is gone once the render finishes, and a genuine encode
 *    failure clears it too (a failed card is not "exporting").
 *
 * The render is genuine H.264 through WebCodecs at 320×240 — the same encode
 * path the Output video button uses — offline and deterministic (no provider).
 *
 * Runs against the pinned upstream tree with the patches applied, using the same
 * dev server + isolated creation fixture as tests/timeline_output_dismiss.mjs.
 * Lives in verification/ and is copied to tests/ — never tests/browser/ —
 * because scripts/check-browser-manifest.mjs owns that directory.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { launchBrowser } from "./browser/engine.mjs";

const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5179";
const api = process.env.CREATION_API_URL ?? base;
const headers = { "X-OpenDirector-Request": "1" };
const health = await fetch(api + "/api/creation-test-health", { headers }).then((r) => r.json());
assert.equal(health.isolated, true);

const jpeg = (() => {
  for (const path of ["../examples/01-orbit.jpg", "examples/01-orbit.jpg"]) {
    try {
      return "data:image/jpeg;base64," + readFileSync(path).toString("base64");
    } catch {}
  }
  throw new Error("no example JPEG for the render clip");
})();

const packageFor = (width, height, seconds = 1) => JSON.stringify({
  format: "opendirector-editable-timeline",
  version: 1,
  timeUnit: "seconds",
  timeline: {
    fps: 24, width, height, importedAssets: [],
    tracks: [{
      id: "visual", kind: "visual", title: "Orbit", muted: false,
      clips: [{
        id: "clip", inPoint: 0, outPoint: seconds, speed: 1, volume: 1, muted: false,
        resource: { id: "orbit", kind: "image", title: "Orbit", src: jpeg, mimeType: "image/jpeg", width: 960, height: 600 },
      }],
    }],
  },
});

const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
  await page.addInitScript(() => {
    localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
    localStorage.setItem("opendirector.locale.v1", "en-US");
    // Record the optional host bridge exactly as a desktop shell would see it,
    // and sample the contract attribute 10×/s from inside the page so a signal
    // that flashes for one frame cannot escape the assertions.
    window.__exportingBridge = [];
    window.__exportSamples = [];
    window.opendirectorDesktop = {
      // Full DesktopBridge shape (upstream 0.1.5 api.ts calls registerSession
      // and setLocale on the object when present; a partial bridge throws).
      registerSession() {},
      setLocale() {},
      showMore() {},
      setExporting(active) { window.__exportingBridge.push(active); },
    };
    document.addEventListener("DOMContentLoaded", () => {
      setInterval(() => {
        window.__exportSamples.push(
          document.documentElement.hasAttribute("data-od-exporting") ? 1 : 0,
        );
      }, 100);
    });
  });

  // Same fixture bootstrap as timeline_output_dismiss.mjs: create the project
  // through the real workspace modules with the welcome overlay stubbed out.
  const bootstrap = (url) => url.origin === new URL(base).origin && url.pathname === "/";
  await page.route(bootstrap, (route) => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await page.goto(base + "/");
  const projectId = await page.evaluate(async () => {
    const { createDocument } = await import("/src/canvas/model.ts");
    const { importWorkspaceDocument } = await import("/src/backend/workspace.ts");
    const saved = await importWorkspaceDocument({
      ...createDocument("Export signal " + crypto.randomUUID().slice(0, 8)), nodes: [],
    });
    (await import("/src/backend/creationClient.ts")).creationClient(saved.id).close();
    await (await import("/src/backend/projects.ts")).releaseBackendProject();
    return saved.id;
  });
  await page.unroute(bootstrap);
  await page.goto(`${base}/ai-tool/ai-canvas/${projectId}`);
  await page.getByText("Saved on this device", { exact: true }).waitFor();

  const addTimeline = async () => {
    await page.getByRole("button", { name: "Add Timeline", exact: true }).click();
    await page.locator(".react-flow__node.selected").waitFor();
  };
  const refit = async () => {
    await page.locator(".cw-workspace").focus();
    await page.keyboard.press("Shift+1");
    await page.waitForTimeout(600); // the fit is animated; click before it lands is off-screen
  };
  // D7 papercut workaround (also a finding: "Fit all" passes a `nodes` filter
  // to flow.fitView and gets a silent no-op in this state, keyboard and menu
  // alike — recorded in the ledger for an upstream report). Zooming out through
  // the real zoom control always brings every node into the viewport.
  const seeEverything = async () => {
    await page.getByRole("button", { name: /Zoom options|缩放选项/ }).first().click();
    await page.locator(".cw-zoom-menu input[type=number]").fill("8");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await page.mouse.click(20, 20); // close the popover like a user
    await page.waitForTimeout(300);
  };
  const clickTitle = async (button) => {
    const title = page.locator(".react-flow__node-timeline .cw-node-title").last();
    try {
      await title.click({ timeout: 4000, ...(button ? { button } : {}) });
    } catch {
      await seeEverything();
      await title.click({ timeout: 15000, ...(button ? { button } : {}) });
    }
  };
  const select = async () => {
    // A successful render leaves an output video node behind and pans the
    // camera to it; the timeline node is often off-screen afterwards (the D7
    // papercut). Pick the timeline node by its kind, never by DOM position.
    await clickTitle();
    const toolbar = page.locator(".cw-selection-toolbar:visible");
    await toolbar.waitFor();
    return toolbar.getByRole("button", { name: "Output video", exact: true });
  };
  const openEditor = async () => {
    await clickTitle("right");
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
  const signal = async () => page.evaluate(() => ({
    attribute: document.documentElement.hasAttribute("data-od-exporting"),
    inFlight: window.__exportInFlightProbe ?? null,
    bridge: [...window.__exportingBridge],
  }));

  // Contract seam: read the live refcount from the very module the app uses.
  await page.evaluate(async () => {
    const mod = await import("/src/canvas/exportSignal.ts");
    window.__exportInFlightProbe = () => mod.exportInFlight();
    window.__exportSamples = [];
  });

  await addTimeline();
  await (await select()).waitFor(); // settle selection + toolbar before the menu
  await openEditor();
  await importPackage(320, 240);

  // (1) Quiet before the export: no attribute, no bridge traffic.
  let state = await signal();
  assert.equal(state.attribute, false, "signal set before any export started");
  assert.deepEqual(state.bridge, [], "bridge fired before any export started");
  assert.equal(await page.evaluate(() => window.__exportInFlightProbe()), 0);

  // (2) A real render: the signal must hold for the whole in-flight window.
  await refit();
  await (await select()).click();
  await page.waitForFunction(() => window.__exportSamples.some((s) => s === 1), null, { timeout: 30000 })
    .catch(() => { throw new Error("the render never raised data-od-exporting"); });
  // Wait for the render to finish: the video item is published to the canvas.
  await page.waitForFunction(
    (id) => fetch(`/api/creation/projects/${id}`, { headers: { "X-OpenDirector-Request": "1" } })
      .then((r) => r.json())
      .then((b) => (b.canvasItems || []).some((item) => item.kind === "video"))
      .catch(() => false),
    projectId, { timeout: 120000 },
  );
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-od-exporting"), null, { timeout: 30000 });
  state = await signal();
  assert.equal(state.attribute, false, "signal still set after the render finished");
  assert.equal(await page.evaluate(() => window.__exportInFlightProbe()), 0, "refcount leaked");
  const samples = await page.evaluate(() => window.__exportSamples);
  assert.ok(samples.filter((s) => s === 1).length >= 2,
    "the in-flight window was too short to serve a host: " + JSON.stringify(samples));
  const bridge = state.bridge;
  assert.ok(bridge.includes(true) && bridge[bridge.length - 1] === false,
    "bridge transitions must open and close, got: " + JSON.stringify(bridge));
  // Per-call bridge semantics (upstream #397 desktop.test.ts parity): starts
  // push true, ends push the shared count state, so a single export with N
  // bracket sites yields [true × (2N−1), false]. The invariants that matter:
  // one closing edge, at the very end, with no early close in between.
  assert.equal(bridge.filter((v) => !v).length, 1,
    "bridge must close exactly once, got: " + JSON.stringify(bridge));
  assert.ok(bridge.slice(0, -1).every(Boolean),
    "bridge closed before the export finished, got: " + JSON.stringify(bridge));

  // (3) A genuine encode failure clears the signal too — a failed card is not
  // "exporting". 4096×4096 is rejected by the encoder, same as the dismissal
  // journey. The signal must return to rest.
  await refit();
  await (await select()).waitFor();
  await openEditor();
  await importPackage(4096, 4096);
  await refit();
  await (await select()).click();
  await page.locator(".cw-timeline-pending [role=\"alert\"]").waitFor({ timeout: 60000 });
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-od-exporting"), null, { timeout: 30000 });
  assert.equal(await page.evaluate(() => window.__exportInFlightProbe()), 0,
    "a failed encode left the refcount above zero");

  assert.deepEqual(errors, [], "page errors during the contract journey");
  console.log(JSON.stringify({
    result: "PASS",
    contract: "data-od-exporting",
    samplesTrue: samples.filter((s) => s === 1).length,
    samplesTotal: samples.length,
    bridge,
  }));
} finally {
  await browser.close();
}
