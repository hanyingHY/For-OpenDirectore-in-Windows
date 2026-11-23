/** desktop.14 · A1 简洁/进阶模式旅程（verification/work_mode.mjs）。
 * 运行前需先启动隔离 API：creation_server.py --assistant-fixture --root <opendirector-creation-*>，以及 Vite 5179。
 * 环境变量：CREATION_WEB_URL、CREATION_API_URL、LOCALE（zh-CN|en-US，默认 zh-CN）；
 * 录制用：RECORD_DIR（输出 webm 目录）、SLOWMO（毫秒，放慢操作便于观看）。
 * 1) 默认进阶；切到简洁：对话居中、侧栏隐藏、画布减弱且不可点击。
 * 2) 回复进行中切回进阶：运行中的回复不中断，完成后写入结果保留。
 * 3) 再切到简洁并刷新：偏好保持。 */
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
  ? { saved: "Saved on this device", panel: "AI chat", editor: "Message content", send: "Send message", pick: "^Advanced mode", presets: "Presets & references", preset: "Seaside short", presetText: "A seaside short film" }
  : { saved: "已保存到本机", panel: "AI 对话", editor: "消息内容", send: "发送消息", pick: "^进阶模式", presets: "预设与参考图", preset: "海边短片", presetText: "一段海边短片" };
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
  // A2: first run asks once; choosing advanced keeps the rest of the journey on the default path.
  const picker = page.locator(".cw-work-mode-picker");
  await picker.waitFor();
  await picker.getByRole("button", { name: new RegExp(T.pick) }).click();
  await picker.waitFor({ state: "detached" });
  const workspace = page.locator(".cw-workspace");
  const toggle = page.locator(".cw-mode-toggle");
  const panel = page.getByRole("complementary", { name: T.panel, exact: true });
  const editor = panel.getByRole("textbox", { name: T.editor, exact: true });
  await until(() => api(path, undefined, "GET"), (value) => !!value.modelSelections.agent, "default model must be saved");

  // 1 · default is advanced; simple centres the conversation and dims the canvas.
  assert.equal(await toggle.getAttribute("aria-pressed"), "false");
  assert.equal(await workspace.evaluate((el) => el.classList.contains("cw-simple-mode")), false);
  await toggle.click();
  await page.waitForFunction(() => document.querySelector(".cw-workspace")?.classList.contains("cw-simple-mode"));
  assert.equal(await toggle.getAttribute("aria-pressed"), "true");
  await editor.waitFor();
  // A2 · simple mode presets (desktop.14): a system preset fills the composer draft.
  await panel.getByRole("button", { name: T.presets, exact: true }).click();
  await panel.getByRole("button", { name: T.preset, exact: true }).click();
  await page.waitForFunction((text) => document.querySelector(".cw-assistant-composer-area")?.textContent?.includes(text), T.presetText);
  const box = await panel.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) < 4, `panel must be centred: ${JSON.stringify(box)}`);
  assert.equal(await page.locator(".cw-side-panel").count(), 0);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".react-flow")).opacity) < 0.5);
  const opacity = await page.locator(".react-flow").first().evaluate((el) => getComputedStyle(el).opacity);

  // 2 · switching back to advanced while a reply runs must not interrupt it.
  await api("/creation-test-assistant-gate", { open: false });
  await editor.fill("写一段海边短片的文字说明");
  await panel.getByRole("button", { name: T.send, exact: true }).click();
  await panel.getByText("已收到创作要求。", { exact: false }).waitFor();
  await toggle.click();
  await page.waitForFunction(() => !document.querySelector(".cw-workspace")?.classList.contains("cw-simple-mode"));
  const mid = await api(path, undefined, "GET");
  assert.ok(mid.activeTurnId, "the reply must still be running after switching modes");
  await api("/creation-test-assistant-gate", { open: true });
  await until(() => api(path, undefined, "GET"), (v) => !v.activeTurnId && v.messages.at(-1).status === "complete",
    "the reply must complete after the mode switch");

  // 3 · simple again, then reload: the preference survives.
  await toggle.click();
  await page.waitForFunction(() => document.querySelector(".cw-workspace")?.classList.contains("cw-simple-mode"));
  await page.reload();
  await page.getByText(T.saved, { exact: true }).waitFor({ state: "attached" });
  assert.equal(await page.locator(".cw-work-mode-picker").count(), 0, "the first-run picker must not return after a choice");
  await page.waitForFunction(() => document.querySelector(".cw-workspace")?.classList.contains("cw-simple-mode"));
  assert.equal(await page.evaluate(() => localStorage.getItem("opendirector.work-mode.v1")), "simple");
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(JSON.stringify({ result: "PASS", journey: "work-mode", opacity: Number(opacity), panelX: Math.round(box.x) }));
} finally {
  await api("/creation-test-assistant-gate", { open: true }).catch(() => {});
  await browser.close();
}
