/** RFC #362 desktop.11: a fresh window waits out a dead window's lease.
 *
 * Reopening a project within ~60 s of an ungraceful window close (app crash,
 * killed browser tab, VM snapshot) used to answer with a hard error card —
 * "This project is open in another window" — needing a manual reload the user
 * can only answer by waiting anyway. Three sandbox sessions tripped over this
 * while doing unrelated work: it is the top papercut on reopen.
 *
 * The lease holder is usually already gone; the lease just has not expired.
 * The workspace init now retries quietly every 3 s (up to ~75 s) when — and
 * only when — the refusal is project_open_elsewhere on a fresh window. While
 * waiting, the loading screen says what is happening with a countdown and
 * keeps Reconnect / Back to canvas home as explicit exits (the failure-state
 * rule: every in-progress state has a way out). If the lease really belongs to
 * a live window, retries exhaust and the original error card shows: a genuine
 * conflict is never masked. Lease semantics are unchanged — no takeover, no
 * shortened lease.
 *
 * Journey:
 *  1. a project is opened by a "foreign" session id (exactly what a previous
 *     window leaves behind when it is killed without its release);
 *  2. a fresh window navigating to that project must show the waiting state
 *     with the countdown and both exits — not a spinner forever, not a dead
 *     error card;
 *  3. once the foreign lease is released (what expiry does in production), the
 *     same window must enter the canvas BY ITSELF within one retry interval,
 *     with no click at all.
 *
 * Runs against the pinned upstream tree with the patches applied, using the
 * same dev server + isolated creation fixture as tests/timeline_output_dismiss.mjs.
 * Lives in verification/ and is copied to tests/.
 */
import assert from "node:assert/strict";
import { launchBrowser } from "./browser/engine.mjs";

const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5179";
const api = process.env.CREATION_API_URL ?? base;
const headers = { "X-OpenDirector-Request": "1" };
const health = await fetch(api + "/api/creation-test-health", { headers }).then((r) => r.json());
assert.equal(health.isolated, true);

const browser = await launchBrowser();
try {
  // --- seed a project through the real workspace modules -----------------
  const seed = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const bootstrap = (url) => url.origin === new URL(base).origin && url.pathname === "/";
  await seed.route(bootstrap, (route) => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await seed.goto(base + "/");
  const projectId = await seed.evaluate(async () => {
    const { createDocument } = await import("/src/canvas/model.ts");
    const { importWorkspaceDocument } = await import("/src/backend/workspace.ts");
    const saved = await importWorkspaceDocument({
      ...createDocument("Lease recovery " + crypto.randomUUID().slice(0, 8)), nodes: [],
    });
    (await import("/src/backend/creationClient.ts")).creationClient(saved.id).close();
    await (await import("/src/backend/projects.ts")).releaseBackendProject();
    return saved.id;
  });
  await seed.close();

  // --- the dead window's lease: acquired, never released ----------------
  const ghost = "feedface-1111-2222-3333-444455556666";
  const opened = await fetch(`${api}/api/creation/projects/${projectId}/open`, {
    method: "POST",
    headers: { ...headers, "X-OpenDirector-Session": ghost },
  });
  assert.equal(opened.status, 200, "the foreign lease must be accepted while it is fresh");

  // --- a fresh window: wait out loud, then enter by itself ---------------
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.setDefaultTimeout(120000);
  await page.addInitScript(() => {
    localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
    localStorage.setItem("opendirector.locale.v1", "en-US");
    window.__clickedAnything = 0;
    for (const type of ["click", "mousedown", "keydown"]) {
      document.addEventListener(type, () => (window.__clickedAnything += 1), true);
    }
  });
  await page.goto(`${base}/ai-tool/ai-canvas/${projectId}`);

  // (1) The waiting state: countdown + both exits, no dead spinner.
  const waiting = page.locator(".canvas-loading-waiting");
  await waiting.waitFor({ timeout: 30000 });
  const text = (await waiting.innerText()).trim();
  assert.match(text, /open in another window/i, "the wait must say why: " + text);
  assert.match(text, /about \d+ seconds/i, "the wait must carry a countdown: " + text);
  assert.ok(await waiting.getByRole("button", { name: "Reconnect", exact: true }).count(),
    "the wait must keep an explicit reconnect exit");
  assert.ok(await waiting.locator('a[href="/"]').count(),
    "the wait must keep an explicit way back home");
  console.log("waiting state shown:", JSON.stringify(text.replace(/\s+/g, " ")));

  // (2) Release the dead lease (what time does in production) and require
  // the canvas to open itself — zero user input on the path.
  const released = await fetch(`${api}/api/creation/sessions/${ghost}`, {
    method: "DELETE", headers,
  });
  assert.ok(released.status === 204 || released.status === 200,
    "releasing a dead lease must be possible: " + released.status);
  await page.getByText("Saved on this device", { exact: true }).waitFor({ timeout: 60000 });
  assert.equal(await page.locator(".canvas-loading-screen").count(), 0,
    "the canvas must have opened by itself");
  assert.equal(await page.evaluate(() => window.__clickedAnything), 0,
    "the recovery path must not require a click");

  console.log(JSON.stringify({ result: "PASS", journey: "open-elsewhere-autoretry", entered: "without interaction" }));
} finally {
  await browser.close();
}
