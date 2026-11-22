/** RFC #362 desktop.13 · B2 real-window simulation (agent run lease).
 *
 * In one browser window: start an Agent reply in project A, switch the window to
 * project B while the reply is still running, let the reply finish, then come back
 * to A. The reply's own Agent write must land in A, and the reply must complete.
 *
 * Recorded with reel.mjs: CDP screencast → the browser's H.264 encoder → MP4, with
 * captions drawn into the page under test. Copy this file, reel.mjs and
 * browser-engine.mjs into upstream tests/ (as canvas.yml does), then run with the
 * assistant fixture services:
 *   python tests/browser/creation_server.py --port 8020 --assistant-fixture
 *   OPENDIRECTOR_API_URL=http://127.0.0.1:8020 npx vite --port 5180
 *   CREATION_WEB_URL=http://127.0.0.1:5180 CREATION_API_URL=http://127.0.0.1:8020 \
 *     OD_REEL_OUT=<dir> node tests/agent_lease_reel.mjs
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { launchBrowser } from "./browser-engine.mjs";
import { openReel, encodeReel } from "./reel.mjs";

const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5180";
const api = process.env.CREATION_API_URL ?? "http://127.0.0.1:8020";
const outDir = process.env.OD_REEL_OUT ?? "delivery";
const dir = process.env.OD_REEL_DIR ?? join(outDir, "..", ".work", "reel-agent-lease");
const headers = { "X-OpenDirector-Request": "1", "X-OpenDirector-Session": crypto.randomUUID() };

async function call(path, value, method) {
  const response = await fetch(api + "/api" + path, {
    headers: { ...headers, "Content-Type": "application/json" },
    ...(value ? { method: method ?? "POST", body: JSON.stringify(value) } : {}),
  });
  assert.ok(response.ok, await response.clone().text());
  return response.json();
}
async function until(read, matches, label) {
  const deadline = Date.now() + 20000;
  while (true) {
    const value = await read();
    if (matches(value)) return value;
    assert.ok(Date.now() < deadline, `${label}: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

assert.equal((await call("/creation-test-health", undefined, "GET")).assistantFixture, true,
  "start creation_server.py with --assistant-fixture");
const tag = crypto.randomUUID().slice(0, 8);
const nameA = `灯光工程 ${tag}`, nameB = `分镜工程 ${tag}`;
const create = async (name) => {
  const projectId = crypto.randomUUID();
  await call(`/creation/projects/${projectId}/commands`, {
    type: "project.create", projectId, commandId: crypto.randomUUID(), payload: { name },
  });
  return projectId;
};
const projectA = await create(nameA);
await create(nameB);
const path = `/creation/projects/${projectA}/assistant`;
const writeName = `海边短片说明 ${tag}.md`;

const browser = await launchBrowser();
let reel = null;
try {
  const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 1500, height: 950 } });
  await context.addInitScript((id) => {
    localStorage.setItem("opendirector.lastUnifiedFilesystemProject", id);
    localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
    localStorage.setItem("opendirector.locale.v1", "zh-CN");
  }, projectA);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(/\/assistant\/runtimes(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: [{ id: "default", label: "Default", group: "default", modelSource: "settings", available: true,
        status: "ready", modelOverride: false, supportsSkills: true }],
    }),
  );
  reel = await openReel(page, { dir, size: { width: 1500, height: 950 } });
  const note = async (text, ms = 1600) => {
    await reel.caption(text);
    await page.waitForTimeout(ms);
  };

  // The caption overlay lives in the page: draw captions only after navigation, or the first one is wiped.
  await page.goto(base);
  await page.getByText("已保存到本机", { exact: true }).waitFor({ state: "attached" });
  await note("desktop.13 · B2：Agent 回复与窗口的项目切换解耦", 1800);
  const panel = page.getByRole("complementary", { name: "AI 对话", exact: true });
  const editor = panel.getByRole("textbox", { name: "消息内容", exact: true });
  const show = async () => {
    if (!(await panel.isVisible()))
      await page.getByRole("button", { name: "与 AI 对话", exact: true }).click();
    await editor.waitFor();
  };
  const switchTo = async (name) => {
    await page.getByRole("button", { name: "切换项目", exact: true }).click();
    await page.getByRole("menuitemradio", { name, exact: true }).click();
  };
  await show();
  await until(() => call(path, undefined, "GET"), (value) => !!value.modelSelections.agent, "model must be saved");
  await note(`① 窗口打开工程「${nameA}」，右侧是 AI 对话`);

  // Hold the reply after its first sentence, and arm the Agent's write.
  await call("/creation-test-assistant-gate", { open: false });
  await call("/creation-test-assistant-write", { name: writeName });
  await editor.fill("写一段海边短片的文字说明");
  await panel.getByRole("button", { name: "发送消息", exact: true }).click();
  await panel.getByText("已收到创作要求。", { exact: false }).waitFor();
  await note("② Agent 正在工程 A 中回复（模型输出暂停在这里）");

  await note("③ 窗口切换到工程 B，A 的回复还在运行", 1200);
  await switchTo(nameB);
  await until(
    () => page.evaluate(() => localStorage.getItem("opendirector.lastUnifiedFilesystemProject")),
    (id) => id && id !== projectA,
    "project B must open",
  );
  await note("④ 现在窗口停在工程 B；A 的回复由自己的运行租约持有，不依赖窗口", 2200);

  await call("/creation-test-assistant-gate", { open: true });
  const write = await until(
    async () => (await call("/creation-test-health", undefined, "GET")).assistantWrites.find((item) => item.name === writeName),
    Boolean,
    "the agent write must be attempted",
  );
  assert.notEqual(write.status, "failed", `the agent write was refused: ${write.error}`);
  await note(`⑤ 回复继续，并在工程 A 中写入「${writeName}」：已写入`, 2400);
  await until(() => call(path, undefined, "GET"), (value) => !value.activeTurnId && value.messages.at(-1).status === "complete",
    "the reply must complete");

  await switchTo(nameA);
  await show();
  await panel.getByText("已收到创作要求。这是隔离测试回复。", { exact: true }).waitFor();
  const assets = await call(`/creation/projects/${projectA}/assets`, undefined, "GET");
  assert.ok(assets.some((asset) => asset.name === writeName), "the written asset must be in project A");
  await note("⑥ 回到工程 A：回复已完成，Agent 写入的文件在 A 中", 2600);
  await note("✓ 切换工程不中断回复，Agent 写入不被拒绝（修复前：写入被拒，回复却显示完成）", 2800);

  const manifest = await reel.stop();
  reel = null;
  const encoded = await encodeReel(browser, dir, join(outDir, "desktop13-agent-lease.mp4"));
  assert.equal(pageErrors.length, 0, "page errors during the reel: " + pageErrors.join(" | "));
  console.log(JSON.stringify({ frames: manifest.items.length, ms: manifest.ms, write, reel: encoded }, null, 1));
} finally {
  if (reel) await reel.stop().catch(() => {});
  await call("/creation-test-assistant-gate", { open: true }).catch(() => {});
  await browser.close();
}
