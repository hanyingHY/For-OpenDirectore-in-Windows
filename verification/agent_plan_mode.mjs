/** desktop.15 · A3 计划/执行模式旅程（verification/agent_plan_mode.mjs）。
 * 运行前需先启动隔离 API：creation_server.py --assistant-fixture --root <opendirector-creation-*>，以及 Vite 5179。
 * 环境变量：CREATION_WEB_URL、CREATION_API_URL、LOCALE（zh-CN|en-US，默认 zh-CN）。
 * 1) 默认执行模式：发送后服务端记录 mode=build，写入资产成功。
 * 2) 切到计划：用户消息带「计划」徽章，服务端记录 mode=plan；武装一次资产写入，
 *    网关真实拒绝（plan_readonly），写入计数不变。
 * 3) 切回执行：同样的写入成功，模式徽章只属于计划轮。 */
import assert from "node:assert/strict";
/** Launch Chromium for the verification (PLAYWRIGHT_MODULE / BROWSER_PATH select the build). */
async function launchBrowser() {
  const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core");
  const executablePath = process.env.BROWSER_PATH;
  return playwright.chromium.launch({
    headless: true,
    ...(process.env.SLOWMO ? { slowMo: Number(process.env.SLOWMO) } : {}),
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

const LOCALE = process.env.LOCALE === "en-US" ? "en-US" : "zh-CN";
const T = LOCALE === "en-US"
  ? { saved: "Saved on this device", panel: "AI chat", editor: "Message content", send: "Send message", pick: "^Advanced mode", openChat: "Chat with AI",
      modeGroup: "Agent mode", plan: "Plan", build: "Build", badge: "Plan" }
  : { saved: "已保存到本机", panel: "AI 对话", editor: "消息内容", send: "发送消息", pick: "^进阶模式", openChat: "与 AI 对话",
      modeGroup: "Agent 模式", plan: "计划", build: "执行", badge: "计划" };
const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5179";
const apiUrl = process.env.CREATION_API_URL ?? "http://127.0.0.1:8019";
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
// The fixture counters are global across journeys; every assertion is an increment.
const modesBefore = health.assistantModes.length;
const refusalsBefore = health.planRefusals.length;
const projectId = crypto.randomUUID();
await api(`/creation/projects/${projectId}/commands`, {
  type: "project.create", projectId, commandId: crypto.randomUUID(), payload: { name: `模式 ${projectId.slice(0, 6)}` },
});
const path = `/creation/projects/${projectId}/assistant`;

const browser = await launchBrowser();
try {
  const context = await browser.newContext({
    locale: LOCALE,
    viewport: { width: 1440, height: 900 },
    ...(process.env.RECORD_DIR ? { recordVideo: { dir: process.env.RECORD_DIR, size: { width: 1440, height: 900 } } } : {}),
  });
  await context.addInitScript(([id, loc]) => {
    if (!sessionStorage.getItem("od-mode-seeded")) {
      localStorage.removeItem("opendirector.work-mode.v1");
      sessionStorage.setItem("od-mode-seeded", "1");
    }
    localStorage.setItem("opendirector.lastUnifiedFilesystemProject", id);
    localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
    localStorage.setItem("opendirector.locale.v1", loc);
  }, [projectId, LOCALE]);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/\/assistant\/runtimes(?:\?.*)?$/, (route) => route.fulfill({
    json: [{ id: "default", label: "Default", group: "default", modelSource: "settings", available: true,
      status: "ready", modelOverride: false, supportsSkills: true }],
  }));
  await page.goto(base);
  await page.getByText(T.saved, { exact: true }).waitFor({ state: "attached" });
  const picker = page.locator(".cw-work-mode-picker");
  await picker.waitFor();
  await picker.getByRole("button", { name: new RegExp(T.pick) }).click();
  await picker.waitFor({ state: "detached" });
  const panel = page.getByRole("complementary", { name: T.panel, exact: true });
  const editor = panel.getByRole("textbox", { name: T.editor, exact: true });
  await until(() => api(path, undefined, "GET"), (value) => !!value.modelSelections.agent, "default model must be saved");
  if (!(await editor.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: T.openChat, exact: true }).click();
  }
  await editor.waitFor();
  const modes = page.getByRole("radiogroup", { name: T.modeGroup, exact: true });
  const planRadio = modes.getByRole("radio", { name: T.plan, exact: true });
  const buildRadio = modes.getByRole("radio", { name: T.build, exact: true });
  await modes.waitFor();

  // 1 · build is the default: the turn is recorded as build and a write succeeds.
  assert.equal(await planRadio.getAttribute("aria-checked"), "false");
  assert.equal(await buildRadio.getAttribute("aria-checked"), "true");
  await editor.fill("总结一下当前画布");
  await panel.getByRole("button", { name: T.send, exact: true }).click();
  await until(() => api("/creation-test-health", undefined, "GET"), (v) => v.assistantModes.length === modesBefore + 1 && v.assistantModes.at(-1) === "build",
    "turn 1 must be recorded as build");
  await until(() => api(path, undefined, "GET"), (v) => !v.activeTurnId && v.messages.length && v.messages.at(-1).status === "complete",
    "the build reply must complete");
  await api("/creation-test-assistant-write", { name: "build-note.txt" });
  await editor.fill("把上面的说明存成素材");
  await panel.getByRole("button", { name: T.send, exact: true }).click();
  await until(() => api("/creation-test-health", undefined, "GET"), (v) => v.assistantWrites.some((w) => w.name === "build-note.txt" && w.status === "applied"),
    "the build write must succeed");
  await until(() => api(path, undefined, "GET"), (v) => !v.activeTurnId && v.messages.length && v.messages.at(-1).status === "complete",
    "the second build reply must complete");

  // 2 · plan mode: the user message carries the badge and the server refuses writes.
  await planRadio.click();
  assert.equal(await planRadio.getAttribute("aria-checked"), "true");
  assert.equal(await buildRadio.getAttribute("aria-checked"), "false");
  const writesBefore = (await api("/creation-test-health", undefined, "GET")).assistantWrites.length;
  await api("/creation-test-assistant-write", { name: "plan-note.txt" });
  await editor.fill("只做分析，不要改动任何内容");
  await panel.getByRole("button", { name: T.send, exact: true }).click();
  const refusal = await until(() => api("/creation-test-health", undefined, "GET"),
    (v) => v.planRefusals.length > refusalsBefore, "plan turn must refuse the armed write");
  const last = refusal.planRefusals.at(-1);
  assert.equal(last.mode, "plan");
  assert.equal(last.code, "plan_readonly");
  // The gateway carries the Chinese detail; the UI maps it per locale (assistantToolText).
  assert.match(last.error, /计划模式为只读/);
  assert.equal(last.name, "plan-note.txt");
  await until(() => api("/creation-test-health", undefined, "GET"), (v) => v.assistantModes.length === modesBefore + 3 && v.assistantModes.at(-1) === "plan",
    "turn 3 must be recorded as plan");
  await until(() => api(path, undefined, "GET"), (v) => !v.activeTurnId && v.messages.length && v.messages.at(-1).status === "complete",
    "the plan reply must complete despite the refusal");
  const writesAfter = (await api("/creation-test-health", undefined, "GET")).assistantWrites.length;
  assert.equal(writesAfter, writesBefore, "plan mode must not write the armed asset");
  assert.equal((await api("/creation-test-health", undefined, "GET")).planRefusals.length, refusalsBefore + 1);
  const badge = panel.locator(".cw-assistant-plan-badge");
  assert.equal(await badge.count(), 1, "exactly the plan turn shows the badge");
  assert.equal((await badge.textContent()).trim(), T.badge);
  const saved = await api(path, undefined, "GET");
  assert.equal(saved.messages.filter((m) => m.role === "user").at(-1).mode, "plan");

  // 3 · back to build: the same write succeeds and the badge stays on the plan turn only.
  await buildRadio.click();
  assert.equal(await buildRadio.getAttribute("aria-checked"), "true");
  await api("/creation-test-assistant-write", { name: "build-note-2.txt" });
  await editor.fill("现在可以写入了");
  await panel.getByRole("button", { name: T.send, exact: true }).click();
  await until(() => api("/creation-test-health", undefined, "GET"), (v) => v.assistantWrites.some((w) => w.name === "build-note-2.txt" && w.status === "applied"),
    "the second build write must succeed");
  await until(() => api(path, undefined, "GET"), (v) => !v.activeTurnId && v.messages.length && v.messages.at(-1).status === "complete",
    "the final build reply must complete");
  assert.equal(await badge.count(), 1, "the badge must stay on the plan turn only");
  assert.deepEqual(errors, []);
  const finalHealth = await api("/creation-test-health", undefined, "GET");
  console.log(`agent_plan_mode ${LOCALE}: PASS (modes=${JSON.stringify(finalHealth.assistantModes.slice(modesBefore))}, refusals=${finalHealth.planRefusals.length - refusalsBefore})`);
} finally {
  await browser.close();
}
