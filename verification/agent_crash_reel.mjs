/** desktop.14 · A-1 真机全量旅程录屏：Agent 回复中途强杀后端 → 重启 → 中断可见 → 新回复完成。
 * 字幕直接画在被录制的页面上。环境变量同 agent_crash_recovery.mjs，另加 OD_REEL_OUT。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { launchBrowser } from "./browser-engine.mjs";
import { openReel, encodeReel } from "./reel.mjs";

const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5179";
const apiUrl = process.env.CREATION_API_URL ?? "http://127.0.0.1:8019";
const dir = process.env.OD_REEL_DIR ?? ".work/reel-crash";
const outDir = process.env.OD_REEL_OUT ?? ".work";
const headers = { "X-OpenDirector-Request": "1", "X-OpenDirector-Session": crypto.randomUUID() };
async function api(path, value, method) {
  const response = await fetch(apiUrl + "/api" + path, {
    headers: { ...headers, "Content-Type": "application/json" },
    ...(value ? { method: method ?? "POST", body: JSON.stringify(value) } : {}),
  });
  assert.ok(response.ok, await response.clone().text());
  return response.json();
}
async function until(read, matches, label, ms = 20000) {
  const deadline = Date.now() + ms;
  while (true) {
    const value = await read();
    if (matches(value)) return value;
    assert.ok(Date.now() < deadline, `${label}: ${JSON.stringify(value)?.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}
const health = await api("/creation-test-health", undefined, "GET");
assert.equal(health.isolated, true);
assert.equal(health.assistantFixture, true);
const tag = crypto.randomUUID().slice(0, 8);
const projectId = crypto.randomUUID();
await api(`/creation/projects/${projectId}/commands`, {
  type: "project.create", projectId, commandId: crypto.randomUUID(), payload: { name: `强杀演示 ${tag}` },
});
const path = `/creation/projects/${projectId}/assistant`;

const browser = await launchBrowser();
let reel = null;
try {
  const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 1500, height: 950 } });
  await context.addInitScript((id) => {
    localStorage.setItem("opendirector.lastUnifiedFilesystemProject", id);
    localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
    localStorage.setItem("opendirector.locale.v1", "zh-CN");
  }, projectId);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(/\/assistant\/runtimes(?:\?.*)?$/, (route) => route.fulfill({
    json: [{ id: "default", label: "Default", group: "default", modelSource: "settings", available: true,
      status: "ready", modelOverride: false, supportsSkills: true }],
  }));
  reel = await openReel(page, { dir, size: { width: 1500, height: 950 } });
  const note = async (text, ms = 1600) => { await reel.caption(text); await page.waitForTimeout(ms); };

  await page.goto(base);
  await page.getByText("已保存到本机", { exact: true }).waitFor({ state: "attached" });
  await note("desktop.14 · A-1：Agent 回复中途强杀后端，重启后的状态", 2000);
  const panel = page.getByRole("complementary", { name: "AI 对话", exact: true });
  const editor = panel.getByRole("textbox", { name: "消息内容", exact: true });
  if (!(await panel.isVisible())) await page.getByRole("button", { name: "与 AI 对话", exact: true }).click();
  await editor.waitFor();
  await until(() => api(path, undefined, "GET"), (value) => !!value.modelSelections.agent, "default model must be saved");
  await note("① 工程已打开，右侧是 AI 对话");

  await api("/creation-test-assistant-gate", { open: false });
  await editor.fill("写一段海边短片的文字说明");
  await panel.getByRole("button", { name: "发送消息", exact: true }).click();
  await panel.getByText("已收到创作要求。", { exact: false }).waitFor();
  await note("② Agent 正在回复（模型输出暂停在这里）");
  const midRun = await api(path, undefined, "GET");
  assert.ok(midRun.activeTurnId, "the run must be active before the kill");

  await note("③ 后端进程被强制结束（SIGKILL），模拟崩溃", 1500);
  execFileSync("kill", ["-9", process.env.OD_API_PID]);
  await until(async () => { try { await fetch(apiUrl + "/api/health", { headers, signal: AbortSignal.timeout(1000) }); return false; } catch { return true; } },
    Boolean, "backend must be down");
  execFileSync("bash", ["-c", process.env.OD_API_START]);
  await until(() => fetch(apiUrl + "/api/health", { headers }).then((r) => r.ok).catch(() => false), Boolean, "backend must come back", 60000);
  await note("④ 后端已重启；旧窗口的租约在等待到期后自动释放", 2000);

  await page.reload();
  await note("⑤ 窗口重新打开工程：旧租约未释放，显示等待态（无需点击，到期后自动进入）", 2500);
  await page.getByText("已保存到本机", { exact: true }).waitFor({ state: "attached", timeout: 120000 });
  if (!(await panel.isVisible())) await page.getByRole("button", { name: "与 AI 对话", exact: true }).click();
  await panel.getByText("回复已中断", { exact: false }).first().waitFor({ timeout: 30000 });
  await note("⑥ 未完成的回复显示「回复已中断」，没有残留的「思考中」", 2600);

  await api("/creation-test-assistant-gate", { open: true });
  await editor.fill("再写一句话");
  await panel.getByRole("button", { name: "发送消息", exact: true }).click();
  await until(() => api(path, undefined, "GET"), (value) => value.messages.at(-1).status !== "streaming" && !value.activeTurnId, "the new reply must finish");
  await panel.getByText("已收到创作要求。", { exact: false }).last().waitFor();
  await note("⑦ 新消息正常完成：重启后的运行不受旧会话影响", 2400);
  await note("✓ 强杀 → 重启 → 中断可见 → 继续使用，全程无报错", 2800);

  const manifest = await reel.stop();
  reel = null;
  const encoded = await encodeReel(browser, dir, join(outDir, "desktop14-crash-recovery.mp4"));
  assert.equal(pageErrors.length, 0, "page errors: " + pageErrors.join(" | "));
  console.log(JSON.stringify({ frames: manifest.items.length, ms: manifest.ms, reel: encoded }, null, 1));
} finally {
  if (reel) await reel.stop().catch(() => {});
  await api("/creation-test-assistant-gate", { open: true }).catch(() => {});
  await browser.close();
}
