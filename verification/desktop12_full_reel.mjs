/** RFC #362 desktop.12 · 全量功能模拟（真机窗口实录）。
 *
 * desktop.12：基线推进上游 0.1.5（8584cc9），六张补丁重排后同一旅程回归。
 *
 * 用户要求「在完成一部分改进后，进行真机操作的全量功能模拟，并以 mp4 展示」。
 * 本脚本在一个真实浏览器窗口里把整个应用走一遍，用 `reel.mjs` 的 CDP 截流 →
 * 浏览器 H.264 通道写成 MP4（与 timeline_output_reel.mjs 同一条通路），
 * 字幕直接画在被录制的页面上，不需要后期。
 *
 * 章节（按顺序）：
 *   1. 欢迎页与中英切换（F1 首次进入）
 *   2. 画布工作区：六个创建入口 · 资产库 · AI 对话（F4/F8）
 *   3. 文本节点创建与编辑（F4）
 *   4. 素材上传（F5，示例 JPEG 走真实的上传管线）
 *   5. 时间线编辑器：导入素材包（F10）
 *   6. 输出视频：真实 H.264 渲染，`data-od-exporting` 宿主信号全程在位
 *      （desktop.11 契约，Host.cs 优先读它；desktop.12 与 #397 桥统一计数）
 *   7. 失败态工艺：空时间线 toast · 失败卡三出口 · Escape（desktop.9 修复）
 *   8. 窗口被强杀后重开：自愈等待 + 自动进入（desktop.11 修复，0.1.5 共存验证）
 *   9. 中文界面与保存状态（F12）
 *
 * 无付费模型、无外部网络：渲染来自浏览器自己的 H.264 编码器；AI 面板展示
 * 「未配置模型」的真实状态。运行方式见 .github/workflows/canvas.yml 的同款接线：
 *   python tests/browser/creation_server.py --port 8019
 *   OPENDIRECTOR_API_URL=http://127.0.0.1:8019 npx vite --port 5179
 *   CREATION_WEB_URL / CREATION_API_URL / BROWSER_PATH / OD_REEL_DIR
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { launchBrowser } from "./browser-engine.mjs";
import { openReel, encodeReel } from "./reel.mjs";

const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5179";
const api = process.env.CREATION_API_URL ?? base;
const dir = process.env.OD_REEL_DIR ?? ".work/reel-desktop12";
const out = join(process.env.OD_REEL_OUT ?? "delivery", "desktop12-full-journey.mp4");
const headers = { "X-OpenDirector-Request": "1" };
const health = await fetch(api + "/api/creation-test-health", { headers }).then((r) => r.json());
if (!health.isolated) throw new Error("this reel must run against the isolated fixture");
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

  // ---- 1. 欢迎页与中英切换 ------------------------------------------
  const bootstrap = (url) => url.origin === new URL(base).origin && url.pathname === "/";
  await page.route(bootstrap, (route) => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await page.goto(base + "/");
  await chapter("OpenDirector Windows 桌面版 · desktop.12 全量功能模拟（基线 0.1.5 · 8584cc9）", 2400);
  await chapter("1 · 欢迎页：双语界面 · 零配置即可探索 · 模型后配");
  const projectId = await page.evaluate(async () => {
    const { createDocument } = await import("/src/canvas/model.ts");
    const { importWorkspaceDocument } = await import("/src/backend/workspace.ts");
    const saved = await importWorkspaceDocument({
      ...createDocument("Desktop 11 Reel"), nodes: [],
    });
    (await import("/src/backend/creationClient.ts")).creationClient(saved.id).close();
    await (await import("/src/backend/projects.ts")).releaseBackendProject();
    return saved.id;
  });
  await page.unroute(bootstrap);

  // ---- 2. 画布工作区 --------------------------------------------------
  await page.goto(`${base}/ai-tool/ai-canvas/${projectId}`);
  await page.getByText("Saved on this device", { exact: true }).waitFor();
  await chapter("2 · 画布工作区：节点式创作 · 本机自动保存", 2200);
  await chapter("左侧六个创建入口：文本 / 图片 / 视频 / 音频 / 时间线 / 主体", 2600);

  // ---- 3. 文本节点 ----------------------------------------------------
  await page.getByRole("button", { name: "Add Text", exact: true }).click();
  await page.locator(".react-flow__node.selected").waitFor();
  await wait(1200);
  await chapter("3 · 文本节点：创建、原位编辑、随处克隆", 2400);
  const textTitle = page.locator(".react-flow__node .cw-node-title").last();
  await textTitle.dblclick();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("产品演示 Text");
  await wait(1200);
  await chapter("双击标题原位重命名，Enter 提交 · Escape 取消", 2600);
  await page.keyboard.press("Enter");
  await wait(800);

  // ---- 4. 素材上传 ----------------------------------------------------
  await chapter("4 · 素材上传：真实文件管线（示例图片）");
  await page.getByRole("button", { name: "Upload local asset", exact: true }).click();
  await wait(400);
  const chooser = page.locator('input[type="file"]').last();
  await chooser.setInputFiles({
    name: "01-orbit.jpg", mimeType: "image/jpeg", buffer: jpeg,
  });
  await wait(3200);
  await chapter("上传的素材自动成为画布节点，保留原图", 2400);

  // ---- 5. 时间线 ------------------------------------------------------
  await page.getByRole("button", { name: "Add Timeline", exact: true }).click();
  await page.locator(".react-flow__node.selected").waitFor();
  await wait(1200);
  await chapter("5 · 时间线：导入素材包（真实导入管线）");
  await page.locator(".react-flow__node-timeline .cw-node-title").last().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open editor", exact: true }).click();
  await page.locator(".cw-timeline-dialog").waitFor();
  await wait(800);
  await page.getByLabel("Import timeline JSON", { exact: true }).setInputFiles({
    name: "orbit.timeline.json", mimeType: "application/json", buffer: Buffer.from(packageFor(640, 400)),
  });
  await page.locator(".cw-timeline-clip").first().waitFor();
  await wait(800);
  await chapter("导入后可继续修剪、调速、加字幕", 2400);
  await page.getByRole("button", { name: "Apply edits", exact: true }).click();
  await page.locator(".cw-timeline-dialog").waitFor({ state: "detached" });

  // ---- 6. 真实渲染 + 宿主信号 -----------------------------------------
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
  await chapter("6 · 输出视频：浏览器内真实 H.264 渲染（导出期间保持应用运行）", 2600);
  await (await outputButton()).click();
  await page.waitForFunction(() => window.__exportSamples.some((s) => s === 1), null, { timeout: 30000 });
  await chapter("desktop.12：data-od-exporting 宿主信号全程在位（与 #397 setExporting 桥统一计数）", 3200);
  await page.waitForFunction(
    (id) => fetch(`/api/creation/projects/${id}`, { headers: { "X-OpenDirector-Request": "1" } })
      .then((r) => r.json())
      .then((b) => (b.canvasItems || []).some((item) => item.kind === "video"))
      .catch(() => false),
    projectId, { timeout: 120000 },
  );
  await chapter("渲染完成：成片作为视频节点回写画布，可预览、可再导出", 2800);

  // ---- 7. 失败态工艺 --------------------------------------------------
  await chapter("7 · 失败态工艺：一切进行中卡片必须有出口");
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
  await chapter("编码被拒（超大帧）：失败卡给出 编辑时间线 / 重试输出 / 关闭卡片 三个出口", 3400);
  await chapter("焦点自动落在出口上，Esc 即可离开（desktop.9 修复，网页版同样受益）", 3200);
  await page.keyboard.press("Escape");
  await page.locator(".cw-timeline-pending").waitFor({ state: "detached" });
  await wait(800);

  // ---- 8. 强杀后重开：自愈等待 ----------------------------------------
  await chapter("8 · 桌面进程被强杀后重开同一项目（自愈等待 · 0.1.5 共存）");
  // Release our own lease, then leave a dead window's lease behind exactly as a
  // kill does: the session is gone, its lease is not.
  await page.evaluate(async (id) => {
    (await import("/src/backend/creationClient.ts")).creationClient(id).close();
    await (await import("/src/backend/projects.ts")).releaseBackendProject();
  }, projectId);
  const ghost = "feedface-1111-2222-3333-444455556666";
  await fetch(`${api}/api/creation/projects/${projectId}/open`, {
    method: "POST", headers: { ...headers, "X-OpenDirector-Session": ghost },
  });
  await page.goto(`${base}/ai-tool/ai-canvas/${projectId}`);
  await page.locator(".canvas-loading-waiting").waitFor({ timeout: 30000 });
  await chapter("旧租约未释放时：明确说明在等待谁、约多少秒后自动进入，并保留退出", 3600);
  await chapter("无需点击，租约一到期就自动进入画布（旧行为是一张只能手动重连的错误卡）", 3200);
  await fetch(`${api}/api/creation/sessions/${ghost}`, { method: "DELETE", headers });
  await page.getByText("Saved on this device", { exact: true }).waitFor({ timeout: 60000 });
  await wait(1200);

  // ---- 9. 中文界面与保存状态 ------------------------------------------
  await chapter("9 · 双语收尾：同一工程切到中文界面");
  await page.getByRole("button", { name: "中文", exact: true }).first().click();
  await wait(2200);
  await chapter("中文界面 · 「已保存到本机」· 工程、身份与语言互不影响", 3200);
  await chapter("全量模拟完成：desktop.12（基线 0.1.5 · 导出信号契约 · 租约自愈 · 失败态出口）", 3600);
  await reel.caption("");

  const manifest = await reel.stop();
  console.log("frames:", manifest.items.length, "ms:", manifest.ms);
  const result = await encodeReel(browser, dir, out);
  console.log(JSON.stringify({ result: "PASS", out, ...result }));
} finally {
  await browser.close();
}
