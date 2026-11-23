/** desktop.15 · 批次 D' 真机录屏：Plan/Build 执行模式。
 * 计划模式=服务端只读强制：武装一次资产写入，网关真实拒绝（plan_readonly）；
 * 用户消息带「计划」徽章；切回执行后同样的写入成功。
 * 字幕画在被录制的页面上；编码走 reel.mjs（ffmpeg 按真实帧间隔输出 H.264 mp4）。
 * 环境变量：CREATION_WEB_URL、CREATION_API_URL、LOCALE（zh-CN|en-US）、OD_REEL_DIR、OD_REEL_OUT。 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { launchBrowser } from "./browser-engine.mjs";
import { openReel, encodeReel } from "./reel.mjs";

const LOCALE = process.env.LOCALE === "en-US" ? "en-US" : "zh-CN";
const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5179";
const apiUrl = process.env.CREATION_API_URL ?? "http://127.0.0.1:8019";
const dir = process.env.OD_REEL_DIR ?? ".work/reel-agentmode";
const outDir = process.env.OD_REEL_OUT ?? ".work";
const T = LOCALE === "en-US"
  ? {
      saved: "Saved on this device", panel: "AI chat", editor: "Message content", send: "Send message",
      pick: "^Advanced mode", chat: "Chat with AI", modeGroup: "Agent mode", plan: "Plan", build: "Build",
    }
  : {
      saved: "已保存到本机", panel: "AI 对话", editor: "消息内容", send: "发送消息",
      pick: "^进阶模式", chat: "与 AI 对话", modeGroup: "Agent 模式", plan: "计划", build: "执行",
    };
const C = LOCALE === "en-US"
  ? {
      open: "desktop.15 · Plan/Build: the Agent's execution mode, enforced by the server",
      toolbar: "The composer toolbar carries the mode control; Build is the default",
      toplan: "Switch to Plan: the Agent analyzes read-only, writes are refused server-side",
      plansend: "A plan turn — the user message carries the Plan badge",
      refusal: "A write armed for this turn was refused by the real gateway (plan_readonly) ✓",
      tobuild: "Back to Build: the same write now succeeds",
      buildsend: "Build turn: the asset is written through the normal lease path",
      done: "✓ Plan to inspect, Build to act — one toggle, no dead ends",
    }
  : {
      open: "desktop.15 · 计划/执行模式：Agent 的执行方式，由服务端强制",
      toolbar: "输入区工具栏带模式控件；默认为执行模式",
      toplan: "切换到计划：Agent 只读分析，写入被服务端拒绝",
      plansend: "计划轮次——用户消息带「计划」徽章",
      refusal: "为本轮武装的写入被真实网关拒绝（plan_readonly）✓",
      tobuild: "切回执行：同样的写入现在成功",
      buildsend: "执行轮次：资产通过正常租约路径写入",
      done: "✓ 计划用于分析，执行用于落地——一个开关，没有死胡同",
    };
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
const health0 = await api("/creation-test-health", undefined, "GET");
assert.equal(health0.assistantFixture, true);
const modesBefore = health0.assistantModes.length;
const writesBefore = health0.assistantWrites.length;
const refusalsBefore = health0.planRefusals.length;
const projectId = crypto.randomUUID();
await api(`/creation/projects/${projectId}/commands`, {
  type: "project.create", projectId, commandId: crypto.randomUUID(),
  payload: { name: `${LOCALE === "en-US" ? "Plan reel" : "计划录屏"} ${projectId.slice(0, 6)}` },
});
const path = `/creation/projects/${projectId}/assistant`;

const browser = await launchBrowser();
let reel = null;
try {
  const context = await browser.newContext({
    locale: LOCALE,
    viewport: { width: 1500, height: 950 },
  });
  await context.addInitScript(([id, loc]) => {
    if (!sessionStorage.getItem("od-reel-mode-seeded")) {
      localStorage.removeItem("opendirector.work-mode.v1");
      sessionStorage.setItem("od-reel-mode-seeded", "1");
    }
    localStorage.setItem("opendirector.lastUnifiedFilesystemProject", id);
    localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
    localStorage.setItem("opendirector.locale.v1", loc);
  }, [projectId, LOCALE]);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(/\/assistant\/runtimes(?:\?.*)?$/, (route) => route.fulfill({
    json: [{ id: "default", label: "Default", group: "default", modelSource: "settings", available: true,
      status: "ready", modelOverride: false, supportsSkills: true }],
  }));
  reel = await openReel(page, { dir, size: { width: 1500, height: 950 } });
  const note = async (text, ms = 1800) => { await reel.caption(text); await page.waitForTimeout(ms); };

  await page.goto(base);
  await page.getByText(T.saved, { exact: true }).waitFor({ state: "attached" });
  const picker = page.locator(".cw-work-mode-picker");
  await picker.waitFor();
  await note(C.open, 2200);
  await picker.getByRole("button", { name: new RegExp(T.pick) }).click();
  await picker.waitFor({ state: "detached" });
  const panel = page.getByRole("complementary", { name: T.panel, exact: true });
  const editor = panel.getByRole("textbox", { name: T.editor, exact: true });
  if (!(await editor.isVisible().catch(() => false))) await page.getByRole("button", { name: T.chat, exact: true }).click();
  await editor.waitFor();
  await until(() => api(path, undefined, "GET"), (value) => !!value.modelSelections.agent, "default model must be saved");
  const modes = page.getByRole("radiogroup", { name: T.modeGroup, exact: true });
  const planRadio = modes.getByRole("radio", { name: T.plan, exact: true });
  const buildRadio = modes.getByRole("radio", { name: T.build, exact: true });
  await modes.waitFor();
  await note(C.toolbar, 2200);
  assert.equal(await buildRadio.getAttribute("aria-checked"), "true");

  // ① switch to plan and run a plan turn with an armed write → real refusal
  await planRadio.click();
  await note(C.toplan, 2000);
  await api("/creation-test-assistant-write", { name: "plan-reel-note.txt" });
  await editor.fill(LOCALE === "en-US" ? "Analyze the canvas only. Do not change anything." : "只分析画布，不要改动任何内容。");
  await panel.getByRole("button", { name: T.send, exact: true }).click();
  await note(C.plansend, 1600);
  await until(() => api("/creation-test-health", undefined, "GET"),
    (v) => v.planRefusals.length > refusalsBefore, "the plan turn must refuse the armed write");
  const refusal = (await api("/creation-test-health", undefined, "GET")).planRefusals.at(-1);
  assert.equal(refusal.code, "plan_readonly");
  assert.equal(refusal.mode, "plan");
  await until(() => api("/creation-test-health", undefined, "GET"),
    (v) => v.assistantModes.length === modesBefore + 1 && v.assistantModes.at(-1) === "plan", "plan turn recorded");
  await until(() => api(path, undefined, "GET"), (v) => !v.activeTurnId && v.messages.length && v.messages.at(-1).status === "complete",
    "the plan reply must complete");
  const badge = panel.locator(".cw-assistant-plan-badge");
  await badge.waitFor();
  assert.equal((await badge.textContent()).trim(), T.plan);
  await note(C.refusal, 2400);

  // ② back to build: the same write succeeds through the lease path
  await buildRadio.click();
  await note(C.tobuild, 1800);
  await api("/creation-test-assistant-write", { name: "build-reel-note.txt" });
  await editor.fill(LOCALE === "en-US" ? "Save the summary as an asset now." : "现在把总结存成素材。");
  await panel.getByRole("button", { name: T.send, exact: true }).click();
  await until(() => api("/creation-test-health", undefined, "GET"),
    (v) => v.assistantWrites.some((w) => w.name === "build-reel-note.txt" && w.status === "applied"), "the build write must succeed");
  await until(() => api("/creation-test-health", undefined, "GET"),
    (v) => v.assistantModes.length === modesBefore + 2 && v.assistantModes.at(-1) === "build", "build turn recorded");
  await until(() => api(path, undefined, "GET"), (v) => !v.activeTurnId && v.messages.length && v.messages.at(-1).status === "complete",
    "the build reply must complete");
  await note(C.buildsend, 1800);
  const writes = (await api("/creation-test-health", undefined, "GET")).assistantWrites.length;
  assert.equal(writes, writesBefore + 1, "exactly the build write landed");
  assert.equal(await badge.count(), 1, "the badge stays on the plan turn only");
  assert.deepEqual(pageErrors, []);
  await note(C.done, 2400);
  const manifest = await reel.stop();
  reel = null;
  const name = LOCALE === "en-US" ? "desktop15-agent-mode-en.mp4" : "desktop15-agent-mode-zh.mp4";
  const encoded = await encodeReel(browser, dir, join(outDir, name));
  assert.equal(pageErrors.length, 0, "page errors: " + pageErrors.join(" | "));
  console.log(JSON.stringify({ result: "PASS", locale: LOCALE, frames: manifest.items.length, ms: manifest.ms, reel: encoded }, null, 1));
} finally {
  if (reel) await reel.stop().catch(() => {});
  await browser.close();
}
