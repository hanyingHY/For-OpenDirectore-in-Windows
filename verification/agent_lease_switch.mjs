/** B2 journey: a background Agent turn must not depend on the window lease.
 *
 * Start a reply in project A, switch this window to project B while the reply
 * is held, then let the reply finish. The Agent's own write (asset.writeText
 * through the run's session) must land in A. Before the fix the window's
 * switch releases the lease the run writes with, so the write is rejected with
 * 409 and the run reports a false failure.
 *
 * Start creation_server.py with --assistant-fixture before running this check.
 * Set EXPECT=fail to record the current (pre-fix) behaviour instead.
 */
import assert from "node:assert/strict";
import { launchBrowser } from "./engine.mjs";

const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5179";
const expectFail = process.env.EXPECT === "fail";
const headers = {
  "X-OpenDirector-Request": "1",
  "X-OpenDirector-Session": crypto.randomUUID(),
};
async function api(path, value, method) {
  const response = await fetch(base + "/api" + path, {
    headers: { ...headers, "Content-Type": "application/json" },
    ...(value ? { method: method ?? "POST", body: JSON.stringify(value) } : {}),
  });
  assert.ok(response.ok, await response.clone().text());
  return response.json();
}
async function until(read, matches, label) {
  const deadline = Date.now() + 15000;
  while (true) {
    const value = await read();
    if (matches(value)) return value;
    assert.ok(Date.now() < deadline, `${label}: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const health = await api("/creation-test-health", undefined, "GET");
assert.equal(health.isolated, true);
assert.equal(health.assistantFixture, true);
const create = async (name) => {
  const projectId = crypto.randomUUID();
  await api(`/creation/projects/${projectId}/commands`, {
    type: "project.create",
    projectId,
    commandId: crypto.randomUUID(),
    payload: { name },
  });
  return projectId;
};
const tag = crypto.randomUUID().slice(0, 8);
const nameA = `租约 A ${tag}`,
  nameB = `租约 B ${tag}`;
const projectA = await create(nameA);
await create(nameB);
const path = `/creation/projects/${projectA}/assistant`;
const writeName = `Agent 写入 ${tag}.md`;

const browser = await launchBrowser();
try {
  const page = await browser.newPage({
    locale: "zh-CN",
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(/\/assistant\/runtimes(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: [
        {
          id: "default",
          label: "Default",
          group: "default",
          modelSource: "settings",
          available: true,
          status: "ready",
          modelOverride: false,
          supportsSkills: true,
        },
      ],
    }),
  );
  await page.addInitScript((id) => {
    localStorage.setItem("opendirector.lastUnifiedFilesystemProject", id);
    localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
    localStorage.setItem("opendirector.locale.v1", "zh-CN");
  }, projectA);
  await page.goto(base);
  await page.getByText("已保存到本机", { exact: true }).waitFor({ state: "attached" });
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
  await until(
    () => api(path, undefined, "GET"),
    (value) => !!value.modelSelections.agent,
    "Default model must be saved",
  );

  // Hold the reply after its first sentence, and arm the Agent write.
  await api("/creation-test-assistant-gate", { open: false });
  await api("/creation-test-assistant-write", { name: writeName });
  await editor.fill("写一段海边短片的文字说明");
  await panel.getByRole("button", { name: "发送消息", exact: true }).click();
  await panel.getByText("已收到创作要求。", { exact: false }).waitFor();

  // The window moves to project B while the run is still going.
  await switchTo(nameB);
  await until(
    () => page.evaluate(() => localStorage.getItem("opendirector.lastUnifiedFilesystemProject")),
    (id) => id && id !== projectA,
    "Project B must open",
  );
  await page.waitForTimeout(500);

  // Release the reply: the run now performs its own write, then finishes.
  await api("/creation-test-assistant-gate", { open: true });
  const write = await until(
    async () => (await api("/creation-test-health", undefined, "GET")).assistantWrites.find((item) => item.name === writeName),
    Boolean,
    "The agent write must be attempted",
  );
  const done = await until(
    () => api(path, undefined, "GET"),
    (value) => value.messages.at(-1).status !== "streaming" && !value.activeTurnId,
    "Reply must finish",
  );
  const assets = await api(`/creation/projects/${projectA}/assets`, undefined, "GET");
  const landed = assets.some((asset) => asset.name === writeName);
  console.log(JSON.stringify({ write, reply: done.messages.at(-1).status, landed }));

  if (expectFail) {
    assert.equal(write.status, "failed", "pre-fix: the write must fail with a stale lease");
    assert.equal(write.code, "operation_rejected");
    assert.equal(landed, false);
    console.log("agent lease switch: reproduced");
  } else {
    assert.notEqual(write.status, "failed", `agent write must not fail: ${write.error}`);
    assert.ok(landed, "agent write must land in project A");
    assert.equal(done.messages.at(-1).status, "complete");
    console.log("agent lease switch ok");
  }
  assert.deepEqual(errors, []);
} finally {
  await api("/creation-test-assistant-gate", { open: true }).catch(() => {});
  await browser.close();
}
