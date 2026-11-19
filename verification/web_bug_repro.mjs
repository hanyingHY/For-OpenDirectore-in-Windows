/** RFC #362 desktop.8 — reproduce the reported defect on the pinned upstream UI.
 *
 * On a timeline with no clip, "Output video" runs an encode that cannot produce
 * one frame and leaves a failure card that reports 「请先向时间线加入素材。」 with
 * a single action, "Retry output", which fails identically forever. The card is
 * a virtual node: not selectable, deletable or focusable, with double-click,
 * Enter, F2 and the context menu captured — Escape never reaches it.
 *
 * This journey runs against the UNPATCHED upstream tree (no
 * patches/timeline-output-dismiss.patch) and records the stuck card as the
 * before-evidence. The patched behaviour is verification/web_full_simulation.mjs.
 *
 * Usage (dev server + isolated fixture, see .github/workflows/canvas.yml):
 *   cp verification/web_bug_repro.mjs verification/web_recorder.mjs <upstream>/tests/
 *   cd <upstream> && BROWSER_PATH=... PLAYWRIGHT_MODULE=... \
 *     CREATION_WEB_URL=http://127.0.0.1:5179 FFMPEG_PATH=... node tests/web_bug_repro.mjs
 */
import assert from "node:assert/strict";
import { launchBrowser } from "./browser/engine.mjs";
import { ffmpegPath, startRecording } from "./web_recorder.mjs";

const base = process.env.CREATION_WEB_URL ?? "http://127.0.0.1:5179";
const ffmpeg = ffmpegPath();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.env.OD_SIM_OUT_DIR ?? "delivery";

const browser = await launchBrowser();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  page.setDefaultTimeout(25000);
  await page.addInitScript(() => {
    localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
    localStorage.setItem("opendirector.locale.v1", "zh-CN");
  });
  await page.goto(base + "/");
  await page.getByText("已保存到本机", { exact: true }).waitFor();

  const stop = await startRecording(page, `${out}/web-bug-repro-unclosable-card.mp4`, ffmpeg);

  // Fresh project, then a timeline straight from the creation sidebar.
  await page.getByRole("button", { name: "切换项目", exact: true }).click();
  await page.getByRole("menuitem", { name: "新建画布项目", exact: true }).click();
  const projectName = "复现 · 无法关闭的失败卡片 " + crypto.randomUUID().slice(0, 4);
  await page.getByRole("textbox", { name: "项目名称", exact: true }).fill(projectName);
  await page.getByRole("textbox", { name: "项目名称", exact: true }).press("Enter");
  await page.getByText(projectName, { exact: false }).first().waitFor({ timeout: 30000 });
  await page.getByText("已保存到本机", { exact: true }).waitFor();

  await page.getByRole("button", { name: "添加时间线", exact: true }).click();
  await page.locator(".react-flow__node.selected .cw-node-title").waitFor();

  // The reported trigger: output an empty timeline.
  await page.locator(".react-flow__node .cw-node-title").last().click();
  const toolbar = page.locator(".cw-selection-toolbar");
  await toolbar.waitFor();
  await toolbar.getByRole("button", { name: "输出视频", exact: true }).click();

  const card = page.locator(".cw-timeline-pending");
  await card.locator('[role="alert"]').waitFor();
  const alert = (await card.locator('[role="alert"]').innerText()).trim();
  assert.match(alert, /请先向时间线加入素材/, "unexpected failure text: " + alert);
  const actions = await card.locator("button").allInnerTexts();
  assert.deepEqual(
    actions.map((s) => s.trim()).filter(Boolean),
    ["重试输出"],
    "the pre-fix card must show exactly the one action it is stuck with",
  );

  // Every escape a user would try — none of them can leave the card.
  await page.locator(".cw-workspace").focus();
  await page.keyboard.press("Escape");
  await delay(700);
  await page.keyboard.press("Delete");
  await delay(700);
  await card.click({ button: "right" });
  await delay(700);
  await page.keyboard.press("Escape");
  await delay(500);
  assert.equal(await card.count(), 1, "some escape path unexpectedly closed the card");
  await page.screenshot({ path: `${out}/web-bug-unclosable-card.png` });

  // The only offered action loops into the same failure.
  await card.getByRole("button", { name: "重试输出", exact: true }).click();
  await card.locator('[role="alert"]').waitFor();
  assert.equal(await card.count(), 1);

  await delay(3000); // let the recording linger on the stuck state
  const result = await stop();
  console.log(`bug reproduced and recorded: ${result.frames} frames -> ${result.output}`);
} finally {
  await browser.close();
}
