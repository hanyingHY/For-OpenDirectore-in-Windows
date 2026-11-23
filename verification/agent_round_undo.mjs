/** desktop.16 · E1 回合审阅与撤销旅程（verification/agent_round_undo.mjs）。
 * 运行前需先启动隔离 API：creation_server.py --assistant-fixture --root <opendirector-creation-*>，以及 Vite 5179。
 * 环境变量：CREATION_WEB_URL、CREATION_API_URL、LOCALE（zh-CN|en-US，默认 zh-CN）、RECORD_DIR、SLOWMO。
 * 1) Agent 一个回合通过真实工具网关写入两张便签（canvas.show）；账本记录两条。
 * 2) 回复完成后，回复下方出现「本轮修改 2 项」与「撤销本轮修改」。
 * 3) 撤销两步确认；两条修改均变为 undone，界面给出撤销结果。 */
import assert from "node:assert/strict";
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
      summary: "2 change(s) this round", undo: "Undo this round", confirmUndo: "Confirm undo", undone: "Undid 2 change(s) from this round." }
  : { saved: "已保存到本机", panel: "AI 对话", editor: "消息内容", send: "发送消息", pick: "^进阶模式", openChat: "与 AI 对话",
      summary: "本轮修改 2 项", undo: "撤销本轮修改", confirmUndo: "确认撤销", undone: "已撤销本轮 2 项修改。" };
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
const projectId = crypto.randomUUID();
await api(`/creation/projects/${projectId}/commands`, {
  type: "project.create", projectId, commandId: crypto.randomUUID(), payload: { name: `撤销 ${projectId.slice(0, 6)}` },
});
const path = `/creation/projects/${projectId}/assistant`;
const notes = ["便签甲", "便签乙"];

const browser = await launchBrowser();
try {
  const context = await browser.newContext({
    locale: LOCALE,
    viewport: { width: 1440, height: 900 },
    ...(process.env.RECORD_DIR ? { recordVideo: { dir: process.env.RECORD_DIR, size: { width: 1440, height: 900 } } } : {}),
  });
  await context.addInitScript(([id, loc]) => {
    if (!sessionStorage.getItem("od-round-seeded")) {
      localStorage.removeItem("opendirector.work-mode.v1");
      sessionStorage.setItem("od-round-seeded", "1");
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

  // 1 · one Agent turn writes two canvas notes through the real gateway.
  for (const note of notes) await api("/creation-test-assistant-write", { name: `canvas:${note}` });
  await editor.fill("把两张便签放到画布上");
  await panel.getByRole("button", { name: T.send, exact: true }).click();
  const turn = await until(() => api(path, undefined, "GET"),
    (value) => !value.activeTurnId && value.messages.length >= 2 && value.messages.at(-1).status === "complete",
    "the agent turn must complete");
  const turnId = turn.messages.at(-2).id;
  const changes = await until(() => api(`${path}/turns/${turnId}/changes`, undefined, "GET"),
    (value) => value.items.length === 2, "the round ledger must record both writes");
  assert.deepEqual(changes.items.map((item) => item.state), ["applied", "applied"]);

  // 2 · the review sits under the reply with the count and the undo entry.
  const summary = panel.getByText(T.summary, { exact: true });
  await summary.waitFor();
  const undoButton = panel.getByRole("button", { name: T.undo, exact: true });
  await undoButton.click();
  // 3 · two-step confirmation, then the undo runs newest first.
  await panel.getByRole("button", { name: T.confirmUndo, exact: true }).click();
  await panel.getByText(T.undone, { exact: true }).waitFor();
  const after = await until(() => api(`${path}/turns/${turnId}/changes`, undefined, "GET"),
    (value) => value.items.every((item) => item.state === "undone"), "both writes must be undone");
  assert.equal(after.undoable, 0);
  assert.equal(await undoButton.count(), 0, "the undo entry is gone once the round is undone");
  assert.deepEqual(errors, [], `page errors: ${errors.join(" | ")}`);
  console.log(`agent_round_undo ${LOCALE}: PASS (writes=${changes.items.length}, undone=${after.items.length})`);
} finally {
  await browser.close();
}
