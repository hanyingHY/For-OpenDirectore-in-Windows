/** desktop.15 · 批次 B' 真机录屏：首次选择框（左下角、框外收起）、简洁/进阶切换、
 * 系统预设、回复中的画布变更 → 结果卡片 → 「在画布中查看」定位节点。
 * 字幕画在被录制的页面上；编码走 reel.mjs（ffmpeg 按真实帧间隔输出 H.264 mp4）。
 * 环境变量：CREATION_WEB_URL、CREATION_API_URL、LOCALE（zh-CN|en-US）、OD_REEL_DIR、OD_REEL_OUT。 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { launchBrowser } from "./browser-engine.mjs";
import { openReel, encodeReel } from "./reel.mjs";

const LOCALE = process.env.LOCALE === "en-US" ? "en-US" : "zh-CN";
const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5179";
const apiUrl = process.env.CREATION_API_URL ?? "http://127.0.0.1:8019";
const dir = process.env.OD_REEL_DIR ?? ".work/reel-workmode";
const outDir = process.env.OD_REEL_OUT ?? ".work";
const T = LOCALE === "en-US"
  ? {
      saved: "Saved on this device", panel: "AI chat", editor: "Message content", send: "Send message",
      simple: "Simple mode", advanced: "Advanced mode", presets: "Presets & references", preset: "Seaside short",
      presetText: "A seaside short film", addText: "Add Text", chat: "Chat with AI", results: "This round's results",
      view: "View on canvas", advancedPick: "Advanced mode",
    }
  : {
      saved: "已保存到本机", panel: "AI 对话", editor: "消息内容", send: "发送消息",
      simple: "简洁模式", advanced: "进阶模式", presets: "预设与参考图", preset: "海边短片",
      presetText: "一段海边短片", addText: "添加文本", chat: "与 AI 对话", results: "本轮结果",
      view: "在画布中查看", advancedPick: "进阶模式",
    };
const C = LOCALE === "en-US"
  ? {
      picker: "desktop.15 · First run: the choice parks bottom-left, the canvas stays clickable",
      dismiss: "A press outside the card dismisses it — nothing is written, it returns after a reload",
      simple: "Simple mode: the conversation moves to the centre, the canvas dims",
      preset: "System presets fill the draft; a reference image can be attached",
      running: "The reply is running — switching modes never interrupts it",
      midcanvas: "Mid-reply: create a canvas node from the advanced rail…",
      back: "…and back to simple to read the reply",
      card: "Reply complete: the canvas change becomes a result card",
      view: "「View on canvas」 lands in advanced mode with the node selected",
      persist: "After a reload the last explicit choice is remembered; the first-run picker stays gone",
      done: "✓ Simple/advanced, presets, result cards — one flow, no dead ends",
    }
  : {
      picker: "desktop.15 · 首次运行：选择框停在左下角，画布中央保持可点",
      dismiss: "点击框外即收起——不写入偏好，刷新后仍会再问",
      simple: "简洁模式：对话居中，画布减弱",
      preset: "系统预设一键填入草稿，也可附参考图",
      running: "回复运行中——切换模式不打断它",
      midcanvas: "回复中途：从进阶工具栏在画布上建一个节点…",
      back: "…再切回简洁模式阅读回复",
      card: "回复完成：画布上的变更变成结果卡片",
      view: "「在画布中查看」落入进阶模式并选中该节点",
      persist: "刷新后记住的是最后一次明确选择（进阶）；首次选择框不再出现",
      done: "✓ 简洁/进阶、预设、结果卡片——一条完整流程，没有死胡同",
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
const health = await api("/creation-test-health", undefined, "GET");
assert.equal(health.assistantFixture, true);
const projectId = crypto.randomUUID();
await api(`/creation/projects/${projectId}/commands`, {
  type: "project.create", projectId, commandId: crypto.randomUUID(), payload: { name: `${LOCALE === "en-US" ? "Modes" : "模式"} ${projectId.slice(0, 6)}` },
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
    // Remove the stored mode once per context, not on every reload: reloads are part of
    // the journey and must observe the persisted preference.
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
  await note(C.picker, 2200);
  const picker = page.locator(".cw-work-mode-picker");
  await picker.waitFor();

  // ① dismissal: press outside the card
  const vp = page.viewportSize();
  await note(C.dismiss, 1600);
  await page.mouse.click(Math.round(vp.width * 0.75), Math.round(vp.height * 0.75));
  await picker.waitFor({ state: "detached" });
  await note(C.dismiss + " ✓", 800);
  // reload: it returns (nothing was written), then choose simple
  await page.reload();
  await page.getByText(T.saved, { exact: true }).waitFor({ state: "attached" });
  await picker.waitFor();
  await picker.getByRole("button", { name: new RegExp(T.simple) }).click();
  await picker.waitFor({ state: "detached" });

  const workspace = page.locator(".cw-workspace");
  const toggle = page.locator(".cw-mode-toggle");
  const panel = page.getByRole("complementary", { name: T.panel, exact: true });
  const editor = panel.getByRole("textbox", { name: T.editor, exact: true });
  await page.waitForFunction(() => document.querySelector(".cw-workspace")?.classList.contains("cw-simple-mode"));
  if (!(await panel.isVisible())) await page.getByRole("button", { name: T.chat, exact: true }).click();
  await editor.waitFor();
  await until(() => api(path, undefined, "GET"), (value) => !!value.modelSelections.agent, "default model must be saved");
  await note(C.simple, 2200);

  // ② presets fill the draft
  await note(C.preset, 1500);
  await panel.getByRole("button", { name: T.presets, exact: true }).click();
  await panel.getByRole("button", { name: T.preset, exact: true }).click();
  await page.waitForFunction((text) => document.querySelector(".cw-assistant-composer-area")?.textContent?.includes(text), T.presetText);
  await note(C.preset + " ✓", 1000);

  // ③ send; mid-reply switch to advanced, add a node, come back
  await api("/creation-test-assistant-gate", { open: false });
  await editor.fill(T.presetText);
  await panel.getByRole("button", { name: T.send, exact: true }).click();
  await panel.getByText("已收到创作要求。", { exact: false }).waitFor();
  await note(C.running, 1500);
  await toggle.click();
  await page.waitForFunction(() => !document.querySelector(".cw-workspace")?.classList.contains("cw-simple-mode"));
  const nodesBefore = await page.locator(".react-flow__node").count();
  let created = false;
  for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
    await page.getByRole("button", { name: T.addText, exact: true }).click();
    try {
      await page.waitForFunction((before) => document.querySelectorAll(".react-flow__node").length > before, nodesBefore, { timeout: 4000 });
      created = true;
    } catch { /* the doc refresh race can swallow a mid-reply add; click again */ }
  }
  assert.ok(created, "the rail must create a text node during the reply");
  await note(C.midcanvas, 1600);
  await toggle.click();
  await page.waitForFunction(() => document.querySelector(".cw-workspace")?.classList.contains("cw-simple-mode"));
  await note(C.back, 1200);

  // ④ reply completes → result card → view on canvas
  await api("/creation-test-assistant-gate", { open: true });
  await until(() => api(path, undefined, "GET"), (v) => !v.activeTurnId && v.messages.at(-1).status === "complete",
    "the reply with a canvas change must complete");
  const strip = panel.getByRole("region", { name: T.results, exact: true });
  await strip.waitFor();
  await note(C.card, 2000);
  const card = strip.locator(".cw-simple-result");
  assert.equal(await card.count(), 1, "exactly one canvas change happened during the reply");
  await card.getByRole("button", { name: T.view, exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".cw-workspace")?.classList.contains("cw-simple-mode"));
  await page.waitForFunction(() => !!document.querySelector(".react-flow__node.selected"), undefined, { timeout: 15000 });
  assert.equal(await toggle.getAttribute("aria-pressed"), "false", "the card action must land in advanced mode");
  await note(C.view, 2200);

  // ⑤ reload: the last explicit choice (the card action landed in advanced) is remembered,
  // and the first-run picker stays gone.
  await page.reload();
  await page.getByText(T.saved, { exact: true }).waitFor({ state: "attached" });
  assert.equal(await page.locator(".cw-work-mode-picker").count(), 0, "the first-run picker must not return after a choice");
  await page.waitForFunction(() => !document.querySelector(".cw-workspace")?.classList.contains("cw-simple-mode"));
  await note(C.persist, 2000);
  await note(C.done, 2600);

  const manifest = await reel.stop();
  reel = null;
  const name = LOCALE === "en-US" ? "desktop15-work-mode-en.mp4" : "desktop15-work-mode-zh.mp4";
  const encoded = await encodeReel(browser, dir, join(outDir, name));
  assert.equal(pageErrors.length, 0, "page errors: " + pageErrors.join(" | "));
  console.log(JSON.stringify({ result: "PASS", locale: LOCALE, frames: manifest.items.length, ms: manifest.ms, reel: encoded }, null, 1));
} finally {
  if (reel) await reel.stop().catch(() => {});
  await api("/creation-test-assistant-gate", { open: true }).catch(() => {});
  await browser.close();
}
