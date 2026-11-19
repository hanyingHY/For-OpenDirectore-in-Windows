/** RFC #362 Windows desktop — full functional simulation of the shipped UI.
 *
 * Drives the same React/Vite renderer the WebView2 desktop shell embeds (the
 * distribution compiles this exact tree with patches/canvas-placement.patch,
 * patches/bundled-agent.patch and patches/timeline-output-dismiss.patch) through
 * a complete creation journey, recording every frame to an mp4:
 *
 *   1. first-run canvas and project creation
 *   2. the timeline creation entry in the director toolbox
 *   3. desktop.8 fix (1): an empty timeline is refused with the project toast
 *      「请先向时间线加入素材。」 — no failure card is ever opened
 *   4. timeline editor: import an editable package with a real JPEG clip
 *   5. output video for real: render → publish → the video node lands on canvas
 *   6. desktop.8 fix (2): a genuine encoder failure (4096×4096) offers
 *      编辑时间线 / 重试输出 / 关闭卡片, and 关闭卡片 actually leaves
 *   7. export the project as a .canvas document
 *   8. bilingual switch 中文 → EN → 中文, preserving the project
 *
 * Deterministic and offline: the isolated creation fixture serves assets and
 * publication; no model account, no provider request, no paid call.
 *
 * Usage (dev server + isolated fixture, see .github/workflows/canvas.yml):
 *   cp verification/web_full_simulation.mjs verification/web_recorder.mjs <upstream>/tests/
 *   cd <upstream> && BROWSER_PATH=... PLAYWRIGHT_MODULE=... \
 *     CREATION_WEB_URL=http://127.0.0.1:5179 CREATION_API_URL=http://127.0.0.1:8019 \
 *     FFMPEG_PATH=... node tests/web_full_simulation.mjs
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { launchBrowser } from "./browser/engine.mjs";
import { ffmpegPath, startRecording } from "./web_recorder.mjs";

const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5179";
const api = process.env.CREATION_API_URL ?? base;
const headers = { "X-OpenDirector-Request": "1" };
const ffmpeg = ffmpegPath();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.env.OD_SIM_OUT_DIR ?? "delivery";

const jpeg = (() => {
  for (const path of ["../examples/01-orbit.jpg", "examples/01-orbit.jpg"]) {
    try {
      return "data:image/jpeg;base64," + readFileSync(path).toString("base64");
    } catch {}
  }
  throw new Error("no example JPEG to build the timeline clip from");
})();

const packageFor = (width, height) =>
  JSON.stringify({
    format: "opendirector-editable-timeline",
    version: 1,
    timeUnit: "seconds",
    timeline: {
      fps: 24,
      width,
      height,
      importedAssets: [],
      tracks: [
        {
          id: "visual",
          kind: "visual",
          title: "Orbit",
          muted: false,
          clips: [
            {
              id: "clip",
              inPoint: 0,
              outPoint: 1.5,
              speed: 1,
              volume: 1,
              muted: false,
              resource: { id: "orbit", kind: "image", title: "Orbit", src: jpeg, mimeType: "image/jpeg", width: 960, height: 600 },
            },
          ],
        },
      ],
    },
  });

const browser = await launchBrowser();
const shots = (process.env.OD_SIM_OUT_DIR ?? "delivery") + "/sim-shots";
mkdirSync(shots, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (process.env.OD_SIM_DEBUG)
    page.on("console", (m) => console.log("[console:" + m.type() + "]", m.text().slice(0, 400)));
  if (process.env.OD_SIM_DEBUG) {
    page.on("response", (r) => {
      if (/commands|uploads/.test(r.url()) && r.request().method() !== "GET")
        console.log("[net]", r.status(), r.request().method(), r.url().replace(base, ""));
    });
    page.on("request", (r) => {
      if (/commands|uploads/.test(r.url()) && r.method() !== "GET")
        console.log("[net=>]", r.method(), r.url().replace(base, ""));
    });
  }
  await page.addInitScript(() => {
    localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
    localStorage.setItem("opendirector.locale.v1", "zh-CN");
  });
  await page.goto(base + "/");
  await page.getByText("已保存到本机", { exact: true }).waitFor();

  const stop = await startRecording(page, `${out}/web-full-simulation.mp4`, ffmpeg);
  const saved = () => page.getByText("已保存到本机", { exact: true }).waitFor({ timeout: 60000 });
  const refit = async () => {
    await page.locator(".cw-workspace").focus();
    await page.keyboard.press("Shift+1");
    await delay(400);
  };
  const selectTitle = async (nth = -1) => {
    await page.locator(".react-flow__node .cw-node-title").nth(nth).click();
    const bar = page.locator(".cw-selection-toolbar");
    await bar.waitFor();
    return bar;
  };
  const projectVideos = async () => {
    const body = await fetch(`${api}/api/creation/projects/${projectId}`, { headers }).then((r) => r.json());
    return (body.canvasItems || []).filter((item) => item.kind === "video").length;
  };

  // ---- 1. project creation -------------------------------------------------
  const projectName = "Windows 全量验收 · 蓝调时刻 " + crypto.randomUUID().slice(0, 4);
  await page.getByRole("button", { name: "切换项目", exact: true }).click();
  await page.getByRole("menuitem", { name: "新建画布项目", exact: true }).click();
  await page.getByRole("textbox", { name: "项目名称", exact: true }).fill(projectName);
  await page.getByRole("textbox", { name: "项目名称", exact: true }).press("Enter");
  // The save indicator is a persistent status, not a completion event: wait for
  // the new name in the header and then for the service to list the project.
  await page.getByText(projectName, { exact: false }).first().waitFor({ timeout: 30000 });
  const projectId = await (async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const body = await fetch(`${api}/api/creation/projects`, { headers }).then((r) => r.json());
      const found = (body.projects || []).find((p) => p.name === projectName);
      if (found) return found.id;
      await delay(500);
    }
    throw new Error("the created project is missing from the project list");
  })();
  await saved();
  await page.screenshot({ path: `${shots}/01-project.png` });

  // ---- 2. a timeline from the director toolbox -----------------------------
  await page.getByRole("button", { name: "添加时间线", exact: true }).click();
  await page.locator(".react-flow__node.selected .cw-node-title").waitFor();
  await page.screenshot({ path: `${shots}/02-timeline-node.png` });

  // ---- 3. desktop.8 fix (1): empty timeline is refused with the toast ------
  await (await selectTitle()).getByRole("button", { name: "输出视频", exact: true }).click();
  await page.locator(".cw-toast").filter({ hasText: "请先向时间线加入素材" }).first().waitFor({ timeout: 20000 });
  assert.equal(await page.locator(".cw-timeline-pending").count(), 0, "an empty timeline opened a failure card");
  await page.screenshot({ path: `${shots}/03-empty-refused-toast.png` });
  await delay(2200); // linger: the refusal is answered where it was asked

  // ---- 4. timeline editor: import a real clip ------------------------------
  await page.locator(".react-flow__node .cw-node-title").last().click({ button: "right" });
  await page.getByRole("menuitem", { name: "打开编辑器", exact: true }).click();
  await page.locator(".cw-timeline-dialog").waitFor();
  await page.getByLabel("导入时间线 JSON", { exact: true }).setInputFiles({
    name: "orbit.timeline.json",
    mimeType: "application/json",
    buffer: Buffer.from(packageFor(640, 400)),
  });
  await page.locator(".cw-timeline-clip").first().waitFor();
  await page.screenshot({ path: `${shots}/04-editor-clip.png` });
  await page.getByRole("button", { name: "应用编辑", exact: true }).click();
  await page.locator(".cw-timeline-dialog").waitFor({ state: "detached" });
  await saved();

  // ---- 5. output video for real -------------------------------------------
  await refit();
  await (await selectTitle()).getByRole("button", { name: "输出视频", exact: true }).click();
  const pending = page.locator(".cw-timeline-pending");
  await pending.waitFor();
  await page.screenshot({ path: `${shots}/05-rendering.png` });
  // render → publish → done: the virtual card leaves, the real video node stays
  {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const gone = await page.evaluate(() => !document.querySelector(".cw-timeline-pending"));
      if (gone) break;
      const snapshot = await page.evaluate(() => {
        const node = document.querySelector(".cw-timeline-pending");
        return {
          alert: (node?.querySelector('[role="alert"]')?.innerText || "").trim().slice(0, 200),
          label: (node?.innerText || "").trim().slice(0, 200),
        };
      });
      console.log("pending card:", JSON.stringify(snapshot));
      await delay(10000);
    }
    assert.equal(
      await page.evaluate(() => !document.querySelector(".cw-timeline-pending")),
      true,
      "the output card never finished",
    );
  }
  await delay(1200);
  assert.ok((await projectVideos()) >= 1, "render finished without a published video node");
  await refit();
  await page.screenshot({ path: `${shots}/06-video-published.png` });
  await delay(1800); // linger: the rendered video is a node on the canvas

  // ---- 6. desktop.8 fix (2): a real encode failure is closable -------------
  await page.screenshot({ path: `${shots}/06b-before-second-timeline.png` });
  const sideEntries = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => b.offsetParent !== null)
      .map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim())
      .filter(Boolean),
  );
  await page.getByRole("button", { name: "添加时间线", exact: true }).click({ timeout: 15000 }).catch(async (e) => {
    console.error("VISIBLE BUTTONS:", JSON.stringify(sideEntries));
    throw e;
  });
  await page.locator(".react-flow__node.selected .cw-node-title").waitFor();
  await page.locator(".react-flow__node .cw-node-title").last().click({ button: "right" });
  await page.getByRole("menuitem", { name: "打开编辑器", exact: true }).click();
  await page.locator(".cw-timeline-dialog").waitFor();
  await page.getByLabel("导入时间线 JSON", { exact: true }).setInputFiles({
    name: "huge.timeline.json",
    mimeType: "application/json",
    buffer: Buffer.from(packageFor(4096, 4096)),
  });
  await page.locator(".cw-timeline-clip").first().waitFor();
  await page.getByRole("button", { name: "应用编辑", exact: true }).click();
  await page.locator(".cw-timeline-dialog").waitFor({ state: "detached" });
  await saved();
  await refit();
  await (await selectTitle()).getByRole("button", { name: "输出视频", exact: true }).click();
  await pending.locator('[role="alert"]').waitFor({ timeout: 60000 });
  for (const name of ["编辑时间线", "重试输出", "关闭卡片"])
    await pending.getByRole("button", { name, exact: true }).waitFor();
  await page.screenshot({ path: `${shots}/07-failed-card-closable.png` });
  await delay(2600); // linger: three ways out of a failed render
  await pending.getByRole("button", { name: "关闭卡片", exact: true }).click();
  await pending.waitFor({ state: "detached" });
  await page.screenshot({ path: `${shots}/08-card-closed.png` });
  await delay(1800); // linger: the card is gone for good

  // ---- 7. export the project ----------------------------------------------
  await refit();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出画布", exact: true }).click();
  const [file] = await Promise.all([download]);
  mkdirSync(out, { recursive: true });
  const canvasPath = `${out}/web-sim-project.canvas`;
  await file.saveAs(canvasPath);
  // The suggestion name differs across shells; the bytes must be a canvas document.
  const exported = readFileSync(canvasPath);
  assert.ok(exported.length > 256, "the exported canvas is suspiciously small");
  const sniff = exported.subarray(0, 2).toString() === "PK" ? "zip" : exported.subarray(0, 1).toString();
  assert.ok(sniff === "zip" || sniff === "{", "unexpected canvas container: " + sniff);
  writeFileSync(`${shots}/export-name.txt`, `${file.suggestedFilename()} (${sniff}, ${exported.length} bytes)`);
  await page.screenshot({ path: `${shots}/09-exported.png` });

  // ---- 8. bilingual switch -------------------------------------------------
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByText("Saved on this device", { exact: true }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${shots}/10-english.png` });
  await delay(1800); // linger: English UI with the same project
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page.getByText("已保存到本机", { exact: true }).waitFor({ timeout: 30000 });
  await refit();
  await page.screenshot({ path: `${shots}/11-final-zh.png` });

  assert.deepEqual(errors, [], "page errors during the simulation: " + errors.join(" | "));
  const result = await stop();
  console.log(`full simulation recorded: ${result.frames} frames -> ${result.output}`);
  console.log("STAGES OK: project, timeline, empty refusal, editor import, render, closable failure, export, bilingual");
} finally {
  await browser.close();
}
