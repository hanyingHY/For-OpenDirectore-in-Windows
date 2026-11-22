/** RFC #362 desktop.13 · B2 second-window conflict (agent run lease).
 *
 * Window 1 starts an Agent reply in project A and holds it. Window 2 (a separate
 * browser context, so a separate window session) opens A while the reply is still
 * running. Expected:
 *  1. window 2 does NOT enter the canvas: it shows the waiting state for
 *     "open in another window" (a live conflict is never masked as recovered);
 *  2. window 1's reply is untouched: it completes and its Agent write is applied;
 *  3. once the run releases its lease, window 2 enters A by itself, with no click.
 *
 * Needs the assistant fixture on the API (--assistant-fixture) and the web app
 * pointing at it. Copy this file, reel.mjs-independent, into upstream tests/ with
 * browser-engine.mjs (as CI does), then:
 *   python tests/browser/creation_server.py --port 8020 --assistant-fixture
 *   OPENDIRECTOR_API_URL=http://127.0.0.1:8020 npx vite --port 5180
 *   CREATION_WEB_URL=http://127.0.0.1:5180 CREATION_API_URL=http://127.0.0.1:8020 \
 *     node tests/agent_lease_second_window.mjs
 */
import assert from "node:assert/strict";
import { launchBrowser } from "./browser-engine.mjs";

const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5180";
const api = process.env.CREATION_API_URL ?? "http://127.0.0.1:8020";
const headers = { "X-OpenDirector-Request": "1", "X-OpenDirector-Session": crypto.randomUUID(), "Content-Type": "application/json" };

async function call(path, value, method) {
  const response = await fetch(api + "/api" + path, {
    headers,
    ...(value ? { method: method ?? "POST", body: JSON.stringify(value) } : {}),
  });
  assert.ok(response.ok, await response.clone().text());
  return response.json();
}
async function until(read, matches, label, ms = 30000) {
  const deadline = Date.now() + ms;
  while (true) {
    const value = await read();
    if (matches(value)) return value;
    assert.ok(Date.now() < deadline, `${label}: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

assert.equal((await call("/creation-test-health", undefined, "GET")).assistantFixture, true,
  "start creation_server.py with --assistant-fixture");
const tag = crypto.randomUUID().slice(0, 8);
const projectA = crypto.randomUUID();
await call(`/creation/projects/${projectA}/commands`, {
  type: "project.create", projectId: projectA, commandId: crypto.randomUUID(), payload: { name: `双窗口 ${tag}` },
});
const path = `/creation/projects/${projectA}/assistant`;
const writeName = `双窗口说明 ${tag}.md`;

const browser = await launchBrowser();
const contexts = [];
try {
  const open = async (locale) => {
    const context = await browser.newContext({ locale, viewport: { width: 1400, height: 900 } });
    contexts.push(context);
    await context.addInitScript((id) => {
      localStorage.setItem("opendirector.lastUnifiedFilesystemProject", id);
      localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
      localStorage.setItem("opendirector.locale.v1", "zh-CN");
    }, projectA);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.route(/\/assistant\/runtimes(?:\?.*)?$/, (route) => route.fulfill({
      json: [{ id: "default", label: "Default", group: "default", modelSource: "settings", available: true,
        status: "ready", modelOverride: false, supportsSkills: true }],
    }));
    await page.goto(base);
    return page;
  };

  // --- window 1: hold an Agent reply in A ------------------------------------
  const first = await open("zh-CN");
  await first.getByText("已保存到本机", { exact: true }).waitFor({ state: "attached" });
  const panel = first.getByRole("complementary", { name: "AI 对话", exact: true });
  if (!(await panel.isVisible())) await first.getByRole("button", { name: "与 AI 对话", exact: true }).click();
  const editor = panel.getByRole("textbox", { name: "消息内容", exact: true });
  await editor.waitFor();
  await call("/creation-test-assistant-gate", { open: false });
  await call("/creation-test-assistant-write", { name: writeName });
  await editor.fill("写一段双窗口的文字说明");
  await panel.getByRole("button", { name: "发送消息", exact: true }).click();
  await panel.getByText("已收到创作要求。", { exact: false }).waitFor();

  // --- window 2: opens A while the reply is live ------------------------------
  const second = await open("zh-CN");
  const waiting = second.locator(".canvas-loading-waiting");
  await waiting.waitFor({ timeout: 30000 });
  const text = (await waiting.innerText()).trim();
  assert.match(text, /其他窗口/, "window 2 must say why it waits: " + text);
  assert.equal(await second.getByText("已保存到本机", { exact: true }).count(), 0,
    "window 2 must not enter the canvas while the run holds A");
  console.log("window 2 waiting:", JSON.stringify(text.replace(/\s+/g, " ")));

  // --- the run finishes; its write must still land --------------------------
  await call("/creation-test-assistant-gate", { open: true });
  const write = await until(
    async () => (await call("/creation-test-health", undefined, "GET")).assistantWrites.find((item) => item.name === writeName),
    Boolean, "the agent write must be attempted",
  );
  assert.notEqual(write.status, "failed", `the agent write was refused: ${write.error}`);
  await until(() => call(path, undefined, "GET"), (value) => !value.activeTurnId && value.messages.at(-1).status === "complete",
    "the reply must complete");
  const assets = await call(`/creation/projects/${projectA}/assets`, undefined, "GET");
  assert.ok(assets.some((asset) => asset.name === writeName), "the written asset must be in project A");

  // --- window 1 closes: its window lease goes (pagehide sends DELETE) --------
  // Window 2 is still refused while window 1 holds A, so it must not enter yet.
  // Once window 1 is gone, window 2 enters by its own retry, or through its explicit
  // Reconnect exit if its ~75 s retry budget has already run out.
  await first.close();
  const entered = second.getByText("已保存到本机", { exact: true });
  const reconnect = second.getByRole("button", { name: "重新连接", exact: true });
  const outcome = await until(
    async () => {
      if (await entered.count()) return "entered";
      // The waiting state also has a Reconnect button; only the error card (no waiting state) is a stall.
      if ((await second.locator(".canvas-loading-waiting").count()) === 0 && (await reconnect.count())) return "error";
      return "waiting";
    },
    (value) => value !== "waiting",
    "window 2 must enter or offer reconnect after window 1 closes", 90000,
  );
  if (outcome === "error") await reconnect.click();
  await entered.waitFor({ state: "attached", timeout: 60000 });
  assert.equal(await second.locator(".canvas-loading-screen").count(), 0, "window 2 must have opened");
  console.log(JSON.stringify({ result: "PASS", journey: "agent-lease-second-window", write: write.status, window2: outcome }));
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
}
