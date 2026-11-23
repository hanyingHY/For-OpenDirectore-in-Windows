/** RFC #362 desktop.15 · 全量功能模拟（真机窗口实录）。
 *
 * desktop.15：工作模式（简洁/进阶）、系统预设与参考图、结果卡片、
 * Agent 计划/执行模式（服务端强制）织入同一旅程；基线推进至
 * desktop.14/d9d8903 之后的 10 补丁链。
 *
 * 用户要求「在完成一部分改进后，进行真机操作的全量功能模拟，并以 mp4 展示」。
 * 本脚本在一个真实浏览器窗口里把整个应用走一遍，用 `reel.mjs` 的 CDP 截流 →
 * ffmpeg 按真实帧间隔输出 H.264 MP4，字幕直接画在被录制的页面上。
 *
 * 章节（按顺序）：
 *   1. 欢迎页与 desktop.15 主题
 *   2. 工作模式首次选择框（B'-1：左下角、框外收起、进阶路径）
 *   3. 画布工作区：文本节点原位编辑 + 素材上传真实管线
 *   4. 简洁模式：系统预设一键填草稿 + 附参考图；回复运行中切回进阶不打断
 *   5. 回复中途在画布建节点 → 结果卡片 → 「在画布中查看」定位（B'-3）
 *   6. Agent 计划/执行模式（D'）：计划徽章 + 网关真实拒绝 + 执行写入成功
 *   7. 时间线：导入素材包（真实导入管线）
 *   8. 输出视频：浏览器内真实 H.264 渲染，data-od-exporting 宿主信号全程在位
 *   9. 失败态工艺（三出口 + Escape）与双语收尾
 *
 * 无付费模型、无外部网络：AI 回复来自隔离 fixture；渲染来自 ffmpeg/libx264。
 * 运行方式见 .github/workflows/canvas.yml 的同款接线：
 *   python tests/browser/creation_server.py --port 8019 --assistant-fixture
 *   OPENDIRECTOR_API_URL=http://127.0.0.1:8019 npx vite --port 5179
 *   CREATION_WEB_URL / CREATION_API_URL / BROWSER_PATH / OD_REEL_DIR / OD_REEL_OUT
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { launchBrowser } from "./browser-engine.mjs";
import { openReel, encodeReel } from "./reel.mjs";

const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5179";
const api = process.env.CREATION_API_URL ?? "http://127.0.0.1:8019";
const dir = process.env.OD_REEL_DIR ?? ".work/reel-desktop15";
const outDir = process.env.OD_REEL_OUT ?? "delivery";
const headers = { "X-OpenDirector-Request": "1", "X-OpenDirector-Session": crypto.randomUUID() };
async function apiCall(path, value, method) {
  const response = await fetch(api + "/api" + path, {
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
import assert from "node:assert/strict";

const health = await apiCall("/creation-test-health", undefined, "GET");
assert.equal(health.isolated, true);
assert.equal(health.assistantFixture, true);
const modesBefore = health.assistantModes.length;
const writesBefore = health.assistantWrites.length;
const refusalsBefore = health.planRefusals.length;
const jpeg = await readFile(join(import.meta.dirname, "..", "examples", "01-orbit.jpg"));

const packageFor = (width, height) => JSON.stringify({
  format: "opendirector-editable-timeline", version: 1, timeUnit: "seconds",
  timeline: {
    fps: 24, width, height, importedAssets: [],
    tracks: [{
      id: "visual", kind: "visual", title: "Orbit", muted: false,
      clips: [{
        id: "clip", inPoint: 0, outPoint: 1, speed: 1, volume: 1, muted: false,
        resource: {
          id: "orbit", kind: "image", title: "Orbit",
          src: "data:image/jpeg;base64," + jpeg.toString("base64"),
          mimeType: "image/jpeg", width: 960, height: 600,
        },
      }],
    }],
  },
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.addInitScript(() => {
    localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
    localStorage.setItem("opendirector.locale.v1", "en-US");
    window.__exportSamples = [];
    document.addEventListener("DOMContentLoaded", () => {
      setInterval(() => window.__exportSamples.push(
        document.documentElement.hasAttribute("data-od-exporting") ? 1 : 0), 250);
    });
  });
  const reel = await openReel(page, { dir, size: { width: 1500, height: 950 } });
  const chapter = async (text, hold = 1600) => { await reel.caption(text); await wait(hold); };

  // ---- 1. 欢迎页与主题 ------------------------------------------------
  const bootstrap = (url) => url.origin === new URL(base).origin && url.pathname === "/";
  await page.route(bootstrap, (route) => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await page.goto(base + "/");
  await chapter("OpenDirector Windows 桌面版 · desktop.15 全量功能模拟（工作模式 · 结果卡片 · Agent 计划/执行）", 2600);
  const projectId = await page.evaluate(async () => {
    const { createDocument } = await import("/src/canvas/model.ts");
    const { importWorkspaceDocument } = await import("/src/backend/workspace.ts");
    const saved = await importWorkspaceDocument({
      ...createDocument("Desktop 15 Reel"), nodes: [],
    });
    (await import("/src/backend/creationClient.ts")).creationClient(saved.id).close();
    await (await import("/src/backend/projects.ts")).releaseBackendProject();
    return saved.id;
  });
  await page.unroute(bootstrap);

  // ---- 2. 工作模式首次选择框（B'-1） -----------------------------------
  await page.goto(`${base}/ai-tool/ai-canvas/${projectId}`);
  await page.getByText("Saved on this device", { exact: true }).waitFor();
  await chapter("2 · 工作模式首次选择：简洁/进阶（B'-1）", 2200);
  const picker = page.locator(".cw-work-mode-picker");
  await picker.waitFor();
  await chapter("选择框停在左下角，画布中央保持可点；点击框外即收起（不写入偏好）", 2600);
  {
    const vp = page.viewportSize();
    const inside = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".cw-work-mode-picker"),
      [Math.round(vp.width * 0.75), Math.round(vp.height * 0.75)]);
    assert.equal(inside, false);
  }
  await page.mouse.click(Math.round(page.viewportSize().width * 0.75), Math.round(page.viewportSize().height * 0.75));
  await picker.waitFor({ state: "detached" });
  await page.reload();
  await page.getByText("Saved on this device", { exact: true }).waitFor();
  await picker.waitFor();
  await chapter("刷新后再次出现——未写入偏好就保留默认；现在选择「进阶模式」", 2400);
  await picker.getByRole("button", { name: /^Advanced mode/ }).click();
  await picker.waitFor({ state: "detached" });

  // ---- 3. 文本节点 + 素材上传 ------------------------------------------
  await chapter("3 · 画布工作区：节点式创作 · 本机自动保存", 2200);
  await page.getByRole("button", { name: "Add Text", exact: true }).click();
  await page.locator(".react-flow__node.selected").waitFor();
  await wait(1000);
  const textTitle = page.locator(".react-flow__node .cw-node-title").last();
  await textTitle.dblclick();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("产品演示 Text");
  await page.keyboard.press("Enter");
  await wait(900);
  await chapter("文本节点：双击标题原位重命名（F4）", 2200);
  await chapter("素材上传：真实文件管线（示例图片自动成为画布节点）", 2200);
  await page.getByRole("button", { name: "Upload local asset", exact: true }).click();
  await wait(400);
  await page.locator('input[type="file"]').last().setInputFiles({
    name: "01-orbit.jpg", mimeType: "image/jpeg", buffer: jpeg,
  });
  await wait(3200);
  await chapter("上传的素材保留原图并生成节点（F5）", 2200);

  // ---- 4. 简洁模式：预设 + 参考图；运行中切回进阶 ------------------------
  const panel = page.getByRole("complementary", { name: "AI chat", exact: true });
  const editor = panel.getByRole("textbox", { name: "Message content", exact: true });
  if (!(await editor.isVisible().catch(() => false))) await page.getByRole("button", { name: "Chat with AI", exact: true }).click();
  await editor.waitFor();
  await until(() => apiCall(`/creation/projects/${projectId}/assistant`, undefined, "GET"),
    (v) => !!v.modelSelections.agent, "default model must be saved");
  await chapter("4 · 简洁模式：对话居中、画布减弱、系统预设一键成稿（B'-2）", 2400);
  const toggle = page.locator(".cw-mode-toggle");
  await toggle.click();
  await page.waitForFunction(() => document.querySelector(".cw-workspace")?.classList.contains("cw-simple-mode"));
  await wait(900);
  await panel.getByRole("button", { name: "Presets & references", exact: true }).click();
  await panel.getByRole("button", { name: "Seaside short", exact: true }).click();
  await page.waitForFunction((text) => document.querySelector(".cw-assistant-composer-area")?.textContent?.includes(text), "A seaside short film");
  await chapter("系统预设直接填入草稿，也可上传参考图（参考图走待插入管线）", 2600);
  await apiCall("/creation-test-assistant-gate", { open: false });
  await editor.fill("A seaside short film");
  await panel.getByRole("button", { name: "Send message", exact: true }).click();
  await panel.getByText("已收到创作要求。", { exact: false }).waitFor();
  await chapter("回复运行中——切回进阶模式不打断它（A2 契约）", 2200);
  await toggle.click();
  await page.waitForFunction(() => !document.querySelector(".cw-workspace")?.classList.contains("cw-simple-mode"));
  await apiCall("/creation-test-assistant-gate", { open: true });
  await until(() => apiCall(`/creation/projects/${projectId}/assistant`, undefined, "GET"),
    (v) => !v.activeTurnId && v.messages.length && v.messages.at(-1).status === "complete", "the preset reply must complete");

  // ---- 5. 回复中建节点 → 结果卡片 → 在画布中查看（B'-3） -----------------
  // Result cards render in simple mode (that is where the reply is read), so the
  // whole card chapter runs there; "View on canvas" jumps back to advanced.
  await chapter("5 · 结果卡片：回复中的画布变更自动变卡片（B'-3）", 2200);
  await toggle.click();
  await page.waitForFunction(() => document.querySelector(".cw-workspace")?.classList.contains("cw-simple-mode"));
  await panel.getByRole("button", { name: "New conversation", exact: true }).click();
  await editor.waitFor();
  const pendingCancel = page.getByRole("button", { name: "Cancel pending references", exact: true });
  await pendingCancel.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
  if (await pendingCancel.isVisible().catch(() => false)) await pendingCancel.click();
  const nodesBeforeCard = await page.locator(".react-flow__node").count();
  await apiCall("/creation-test-assistant-gate", { open: false });
  await editor.fill("Add one more shot while writing");
  await panel.getByRole("button", { name: "Send message", exact: true }).click();
  await panel.getByText("已收到创作要求。", { exact: false }).waitFor();
  await chapter("回复运行中：从进阶工具栏在画布上添加一个文本节点…", 2200);
  let created = false;
  for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
    await page.getByRole("button", { name: "Add Text", exact: true }).click();
    try {
      await page.waitForFunction((before) => document.querySelectorAll(".react-flow__node").length > before, nodesBeforeCard, { timeout: 4000 });
      created = true;
    } catch { /* the mid-reply doc refresh race can swallow one add; click again */ }
  }
  assert.ok(created, "the rail must create a text node during the reply");
  await apiCall("/creation-test-assistant-gate", { open: true });
  await until(() => apiCall(`/creation/projects/${projectId}/assistant`, undefined, "GET"),
    (v) => !v.activeTurnId && v.messages.length && v.messages.at(-1).status === "complete", "the card reply must complete");
  const strip = panel.getByRole("region", { name: "This round's results", exact: true });
  await strip.waitFor();
  const card = strip.locator(".cw-simple-result");
  assert.ok(await card.count() >= 1, "the reply must produce a result card");
  await chapter("回复完成：本轮变更成为「本轮结果」卡片，一键「View on canvas」", 2400);
  await strip.getByRole("button", { name: "View on canvas", exact: true }).first().click();
  await page.waitForFunction(() => !document.querySelector(".cw-workspace")?.classList.contains("cw-simple-mode"));
  await page.locator(".react-flow__node.selected").waitFor({ timeout: 15000 });
  await wait(1200);
  await chapter("跳到进阶模式并选中该节点——卡片不是死胡同（A1 验收）", 2400);

  // ---- 6. Agent 计划/执行模式（D'） -------------------------------------
  await chapter("6 · Agent 计划/执行模式：服务端强制只读（D'）", 2400);
  if (!(await editor.isVisible().catch(() => false))) await page.getByRole("button", { name: "Chat with AI", exact: true }).click();
  await editor.waitFor();
  const modes = page.getByRole("radiogroup", { name: "Agent mode", exact: true });
  const planRadio = modes.getByRole("radio", { name: "Plan", exact: true });
  const buildRadio = modes.getByRole("radio", { name: "Build", exact: true });
  await modes.waitFor();
  assert.equal(await buildRadio.getAttribute("aria-checked"), "true");
  await chapter("输入区工具栏新增 Plan/Build 控件，默认执行模式", 2200);
  await planRadio.click();
  await apiCall("/creation-test-assistant-write", { name: "d15-plan-note.txt" });
  await editor.fill("Analyze the canvas only. Do not change anything.");
  await panel.getByRole("button", { name: "Send message", exact: true }).click();
  await until(() => apiCall("/creation-test-health", undefined, "GET"),
    (v) => v.planRefusals.length > refusalsBefore, "the plan turn must refuse the armed write");
  const refusal = (await apiCall("/creation-test-health", undefined, "GET")).planRefusals.at(-1);
  assert.equal(refusal.code, "plan_readonly");
  await until(() => apiCall(`/creation/projects/${projectId}/assistant`, undefined, "GET"),
    (v) => !v.activeTurnId && v.messages.length && v.messages.at(-1).status === "complete", "the plan reply must complete");
  const badge = panel.locator(".cw-assistant-plan-badge");
  await badge.waitFor();
  assert.equal((await badge.textContent()).trim(), "Plan");
  await chapter("计划轮：用户消息带「Plan」徽章；武装写入被真实网关拒绝（plan_readonly）", 2800);
  await buildRadio.click();
  await apiCall("/creation-test-assistant-write", { name: "d15-build-note.txt" });
  await editor.fill("Save the summary as an asset now.");
  await panel.getByRole("button", { name: "Send message", exact: true }).click();
  await until(() => apiCall("/creation-test-health", undefined, "GET"),
    (v) => v.assistantWrites.some((w) => w.name === "d15-build-note.txt" && w.status === "applied"), "the build write must succeed");
  await until(() => apiCall(`/creation/projects/${projectId}/assistant`, undefined, "GET"),
    (v) => !v.activeTurnId && v.messages.length && v.messages.at(-1).status === "complete", "the build reply must complete");
  await chapter("切回执行：同样的写入通过正常租约路径成功落地", 2600);

  // ---- 7. 时间线导入 ----------------------------------------------------
  await chapter("7 · 时间线：导入素材包（真实导入管线，F10）", 2200);
  await page.getByRole("button", { name: "Add Timeline", exact: true }).click();
  await page.locator(".react-flow__node.selected").waitFor();
  await wait(1000);
  await page.locator(".react-flow__node-timeline .cw-node-title").last().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open editor", exact: true }).click();
  await page.locator(".cw-timeline-dialog").waitFor();
  await wait(800);
  await page.getByLabel("Import timeline JSON", { exact: true }).setInputFiles({
    name: "orbit.timeline.json", mimeType: "application/json", buffer: Buffer.from(packageFor(640, 400)),
  });
  await page.locator(".cw-timeline-clip").first().waitFor();
  await wait(800);
  await chapter("导入后可继续修剪、调速、加字幕", 2200);
  await page.getByRole("button", { name: "Apply edits", exact: true }).click();
  await page.locator(".cw-timeline-dialog").waitFor({ state: "detached" });

  // ---- 8. 真实渲染 + 宿主信号 -------------------------------------------
  const seeEverything = async () => {
    await page.getByRole("button", { name: /Zoom options/ }).first().click();
    await page.locator(".cw-zoom-menu input[type=number]").fill("8");
    await page.keyboard.press("Enter");
    await wait(600);
    await page.mouse.click(20, 20);
    await wait(300);
  };
  const outputButton = async () => {
    try {
      await page.locator(".react-flow__node-timeline .cw-node-title").last().click({ timeout: 4000 });
    } catch {
      await seeEverything();
      await page.locator(".react-flow__node-timeline .cw-node-title").last().click({ timeout: 15000 });
    }
    const toolbar = page.locator(".cw-selection-toolbar:visible");
    await toolbar.waitFor();
    return toolbar.getByRole("button", { name: "Output video", exact: true });
  };
  await chapter("8 · 输出视频：浏览器内真实 H.264 渲染（导出期间保持应用运行）", 2600);
  await (await outputButton()).click();
  await page.waitForFunction(() => window.__exportSamples.some((s) => s === 1), null, { timeout: 30000 });
  await chapter("desktop.15：data-od-exporting 宿主信号全程在位（任务栏进度与完成闪烁共用同一契约）", 3200);
  await page.waitForFunction(
    (id) => fetch(`/api/creation/projects/${id}`, { headers: { "X-OpenDirector-Request": "1" } })
      .then((r) => r.json())
      .then((b) => (b.canvasItems || []).some((item) => item.kind === "video"))
      .catch(() => false),
    projectId, { timeout: 120000 },
  );
  await chapter("渲染完成：成片作为视频节点回写画布，可预览、可再导出", 2600);

  // ---- 9. 失败态工艺 + 双语收尾 ------------------------------------------
  await chapter("9 · 失败态工艺：一切进行中卡片必须有出口", 2200);
  await seeEverything();
  await page.locator(".react-flow__node-timeline .cw-node-title").last().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open editor", exact: true }).click();
  await page.locator(".cw-timeline-dialog").waitFor();
  await page.getByLabel("Import timeline JSON", { exact: true }).setInputFiles({
    name: "huge.timeline.json", mimeType: "application/json", buffer: Buffer.from(packageFor(4096, 4096)),
  });
  await page.locator(".cw-timeline-clip").first().waitFor();
  await page.getByRole("button", { name: "Apply edits", exact: true }).click();
  await page.locator(".cw-timeline-dialog").waitFor({ state: "detached" });
  await (await outputButton()).click();
  await page.locator(".cw-timeline-pending [role=\"alert\"]").waitFor({ timeout: 60000 });
  await chapter("编码被拒（超大帧）：失败卡给出 编辑时间线 / 重试输出 / 关闭卡片 三个出口", 3200);
  await page.keyboard.press("Escape");
  await page.locator(".cw-timeline-pending").waitFor({ state: "detached" });
  await wait(600);
  await page.getByRole("button", { name: "中文", exact: true }).first().click();
  await wait(2000);
  await chapter("双语收尾：同一工程切到中文界面，「已保存到本机」", 2600);
  await chapter("全量模拟完成：desktop.15（工作模式 · 预设参考 · 结果卡片 · 计划/执行 · 渲染宿主契约）", 3400);
  await reel.caption("");

  const manifest = await reel.stop();
  console.log("frames:", manifest.items.length, "ms:", manifest.ms);
  const result = await encodeReel(browser, dir, join(outDir, "desktop15-full-journey.mp4"));
  assert.ok((await apiCall("/creation-test-health", undefined, "GET")).assistantWrites.length === writesBefore + 1);
  console.log(JSON.stringify({ result: "PASS", out: join(outDir, "desktop15-full-journey.mp4"), ...result }));
} finally {
  await browser.close();
}
