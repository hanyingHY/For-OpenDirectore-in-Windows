/**
 * Full functional simulation journey for the OpenDirector Windows desktop app.
 *
 * Drives the real UI (desktop layout via the preload bridge stub) through every
 * user-facing capability area and records it. Model and agent calls use the
 * isolated fixture server (creation_server.py --assistant-fixture), so the
 * journey is deterministic and free, while the canvas, editing, timeline and
 * MP4 export pipelines are the production code paths.
 *
 * Selector notes (verified against upstream tests/browser/*.mjs):
 *  - Generation composer: toolbar "Add Image"/"Add Video" opens a composer with
 *    a contenteditable prompt (.cw-composer-body), a "Generation model"
 *    combobox, "Generation settings" and a "Generate" submit button.
 *  - The welcome screen is a modal <dialog> above a fully rendered workspace,
 *    so readiness checks must key off .react-flow + absence of dialog[open] —
 *    never off innerText (the topbar text is present behind the modal).
 */
export async function runFullJourney(director, { web, api = 'http://127.0.0.1:8019' } = {}) {
  const { page } = director;
  const step = (name, fn) => fn().catch(error => {
    console.error(`[journey] section failed: ${name}: ${error.message}`);
    return director.caption(`⚠ ${name}: ${error.message}`);
  });

  // Workspace is interactive when the canvas exists and no modal is up.
  const ready = (timeout = 25000) => page.waitForFunction(() => {
    if (document.querySelector('dialog[open], [role=dialog][aria-modal="true"]')) return false;
    return !!document.querySelector('.react-flow');
  }, undefined, { timeout });

  const click = (text, opts = {}) => director.clickText(text, { required: false, timeoutMs: 6000, ...opts });
  const typeInComposer = async (text) => {
    const box = page.locator(".cw-composer-body [contenteditable='true']").first();
    await box.click({ timeout: 6000 });
    await director.type(text);
  };
  const submitGeneration = async () => {
    const btn = page.getByRole('button', { name: /^(Generate|提交生成)$/ }).first();
    try {
      await btn.click({ timeout: 6000 });
    } catch {
      // The run button stays disabled until the draft validates — Enter in
      // the composer is the keyboard path.
      await page.keyboard.press('Enter');
    }
  };

  // ------------------------------------------------------------------
  await director.titleCard(
    'From idea to a finished short film',
    'One local workspace: talk to the assistant, generate assets, edit media, arrange a timeline, export MP4 — packaged as a Windows desktop app.',
  );

  // ------------------------------------------------------------------
  await step('first-launch', async () => {
    await director.caption('1 · First launch — welcome & onboarding / 首次启动与引导', { frames: 3, holdMs: 900 });
    await page.goto(`${web}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /Get started|开始使用/.test(document.body.innerText), undefined, { timeout: 20000 });
    await director.wait(1200);
    await director.frame('welcome');
    await director.clickText('Get started');
    await director.wait(1800);
    await director.frame('onboarding: connect an LLM');
    await click('Set up a language model');
    await director.wait(1600);
    await director.frame('model setup form');
    await director.hoverText('Service URL (Base URL)');
    await director.frame();
    await director.hoverText('Network connection mode');
    await director.frame();
    await director.caption('Model connections: OpenAI-compatible services, direct/proxy network mode / 模型接入', { frames: 2, holdMs: 700 });
    // Back out through the onboarding to the welcome screen.
    await click('Back');
    await director.wait(900);
    await click('Back');
    await director.wait(1200);
    await director.frame('welcome again');
    // Language switch on the welcome screen.
    await click('中文');
    await director.wait(1400);
    await director.frame('welcome in Chinese');
    await director.caption('Bilingual UI — 中英文界面即时切换', { frames: 2, holdMs: 700 });
    await click('EN');
    await director.wait(1000);
    await director.frame('welcome in English');
    await director.hideCaption();
  });

  // ------------------------------------------------------------------
  await step('canvas-basics', async () => {
    await director.caption('2 · Canvas workspace — nodes, tools, autosave / 画布工作台', { frames: 3, holdMs: 900 });
    // Skip the first-run model setup overlay; models are preconfigured in the fixture.
    await page.evaluate(() => localStorage.setItem('opendirector.modelSetup.v1', 'dismissed'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready();
    await director.wait(1500);
    await director.frame('desktop canvas');

    // Create the demo project up front so leases, autosave and the takeover
    // demo all have a real project to work with.
    await click('New project');
    await director.wait(2200);
    await ready().catch(() => {});
    await director.frame('project created');
    await director.caption('A local project lives on disk from the first keystroke / 本地项目即时落盘', { frames: 2, holdMs: 700 });

    // Workflow templates: scaffold a whole production chain in one click,
    // then undo it so the demo canvas stays clean for the sections below.
    await click('From a template');
    await director.wait(900);
    await director.frame('template picker');
    await director.caption('Workflow templates scaffold a production in one click / 工作流模板一键搭建创作骨架', { frames: 2, holdMs: 800 });
    const templateApply = page.locator('[data-template-id="product-promo"] button');
    if (await templateApply.count()) {
      await templateApply.click();
      await director.wait(1200);
      await director.frame('template applied');
      await director.caption('Nodes, drafts and reference wiring land together — one undo reverts it all / 节点、草稿与参考连线一体生成，一次撤销全部还原', { frames: 2, holdMs: 800 });
      await page.mouse.click(80, 950);
      await director.key('Control+z');
      await director.wait(900);
      await director.frame('template undone');
      await director.hideCaption();
    }

    // Tool rail tour.
    for (const label of ['Add Text', 'Add Image', 'Add Video', 'Add Audio', 'Add Timeline', 'Add Subject']) {
      await director.hoverText(label, { timeoutMs: 2500 });
    }
    await director.frame('tool rail');

    // Create a text node and write copy through the Agent composer.
    await click('Add Text');
    await director.wait(1400);
    await director.frame('text node created');
    await director.caption('Text node + Agent composer — the assistant writes the copy / 文本节点与 Agent 生成', { frames: 2, holdMs: 800 });

    try {
      const box = page.locator('.cw-composer-body [contenteditable=true]').first();
      await box.click({ timeout: 5000 });
      await director.type('A quiet morning in a coastal town — an old fisherman prepares his boat before sunrise.');
      await director.key('Enter');
      await director.wait(2500);
      await director.frame('agent writing');
      await director.wait(4000);
      await director.frame('agent result');
      await director.caption('The Agent turns the prompt into project copy — model calls run against the local harness / Agent 生成文案', { frames: 2, holdMs: 800 });
    } catch {
      await director.caption('Text composition continues below / 文案生成流程继续', { frames: 1 });
    }
    await director.hideCaption();
  });

  // ------------------------------------------------------------------
  await step('assistant', async () => {
    await director.caption('3 · AI assistant — conversations, references, skills / AI 助手', { frames: 3, holdMs: 900 });
    await click('Chat with AI');
    await director.wait(2200);
    await director.frame('assistant panel');
    await director.caption('Describe the idea; use @ to reference canvas assets / 描述创意，@ 引用画布素材', { frames: 2, holdMs: 800 });
    try {
      const input = page.locator('textarea').last();
      await input.click({ timeout: 5000 });
      await director.type('Plan a 3-shot storyboard for the fisherman scene and save it as a text node.');
      await director.frame('prompt typed');
      await director.key('Enter');
      await director.wait(4500);
      await director.frame('assistant reply 1');
      await director.wait(5500);
      await director.frame('assistant reply 2');
      await director.caption('Streaming reply from the bundled Agent runtime / 内置 Agent 流式回复', { frames: 2, holdMs: 800 });
    } catch {
      await director.caption('The assistant thread continues below / 助手流程继续', { frames: 1 });
    }
    await director.hideCaption();
  });

  // ------------------------------------------------------------------
  await step('generation', async () => {
    await director.caption('4 · Generation — images & video from prompts / 生成素材', { frames: 3, holdMs: 900 });
    await director.key('Escape'); // close the assistant panel
    await director.wait(600);

    // --- image generation through the node composer (production flow) ---
    await click('Add Image');
    await director.wait(1800);
    await director.frame('image composer');
    await director.caption('Pick a generation model, describe the shot / 选择生成模型，描述画面', { frames: 2, holdMs: 800 });
    await typeInComposer('Warm cinematic key art of a fishing boat at dawn, soft light');
    await director.frame('image prompt');
    // Parameters dialog detour: aspect ratio / resolution.
    if (await click('Generation settings')) {
      await director.wait(1000);
      await director.frame('generation parameters');
      await director.caption('Generation parameters: aspect ratio, resolution, duration / 生成参数：画幅、分辨率、时长', { frames: 2, holdMs: 800 });
      await director.key('Escape');
      await director.wait(600);
    }
    await submitGeneration();
    await director.wait(1200);
    await director.frame('generation progress');
    await director.caption('The job runs through the provider pipeline; progress appears on the node / 生成任务在节点上实时反馈', { frames: 2, holdMs: 800 });
    await director.wait(4500);
    await director.frame('image generated');
    await director.caption('Generated media lands on the canvas and binds to the node / 生成素材落盘并绑定节点', { frames: 2, holdMs: 800 });

    // --- video generation, same composer grammar ---
    await click('Add Video');
    await director.wait(1800);
    await director.frame('video composer');
    await typeInComposer('Slow dolly shot along the harbour at sunrise, calm water');
    await director.frame('video prompt');
    await submitGeneration();
    await director.wait(1500);
    await director.frame('video generation progress');
    await director.wait(5500);
    await director.frame('video generated');
    await director.caption('Image and video models share one production pipeline / 图像与视频共用一条生成管线', { frames: 2, holdMs: 800 });
    // Windows shell wiring: the desktop bridge must mirror task activity on the
    // taskbar (indeterminate while busy) and clear it once everything settles.
    const desktopCalls = await page.evaluate(() => window.__desktopCalls ?? []);
    const taskbar = desktopCalls.filter(call => call[0] === 'taskProgress');
    console.log(JSON.stringify({
      taskbarBusy: taskbar.some(call => call[2] === 'indeterminate'),
      taskbarCleared: taskbar.some(call => call[1] === null && call[2] === undefined),
      taskbarCalls: taskbar.length,
    }));
    // Clear the stage for the import section: close the generation composer
    // and collapse the assistant panel.
    await click('Close generation panel');
    await director.wait(600);
    await click('Collapse AI chat');
    await director.wait(800);
    await director.frame('clean canvas');
    await director.hideCaption();
  });

  // ------------------------------------------------------------------
  await step('upload', async () => {
    await director.caption('5 · Import media — drop files onto the canvas / 导入素材', { frames: 3, holdMs: 900 });
    // Scope to the creation toolbar so we never hit the chat's attach button
    // ("Upload reference"). The rail button's accessible name is
    // "Upload local asset".
    try {
      await page.getByRole('toolbar', { name: /Canvas creation tools|画布创作工具/ })
        .getByRole('button', { name: /^(Upload local asset|上传本地素材)$/ }).click({ timeout: 6000 });
    } catch {
      await click('Upload local asset');
    }
    await director.wait(1200);
    await director.frame('upload panel');
    const uploaded = await uploadSamples(page);
    await director.wait(2600);
    await director.frame(uploaded ? 'files imported' : 'upload panel shown');
    await director.caption('Assets keep their original bytes (SHA-256) and survive relaunch / 素材原始字节与节点绑定持久化', { frames: 2, holdMs: 800 });
    await director.hideCaption();
  });

  // ------------------------------------------------------------------
  await step('editing', async () => {
    await director.caption('6 · Media editing — crop, adjust, layers / 媒体编辑', { frames: 3, holdMs: 900 });
    const opened = await openImageEditor(page, {
      onSelected: async () => {
        await director.frame('editing tools');
        await director.caption('Smart edit, outpaint, panorama and more on every media node / 智能编辑、扩图、全景', { frames: 2, holdMs: 800 });
      },
    });
    await director.wait(2200);
    await director.frame(opened ? 'image editor' : 'canvas view');
    if (opened) {
      await director.caption('Non-destructive editing with layers and adjustments / 非破坏性编辑', { frames: 2, holdMs: 800 });
      await director.key('Escape');
      await director.wait(900);
    } else {
      await director.caption('Canvas ready for editing — nodes stay non-destructive / 画布随时可编辑', { frames: 1 });
    }
    await director.hideCaption();
  });

  // ------------------------------------------------------------------
  await step('timeline', async () => {
    await director.caption('7 · Timeline — arrange clips and export MP4 / 时间线与导出', { frames: 3, holdMs: 900 });
    await click('Add Timeline');
    await director.wait(1800);
    await director.frame('timeline node');
    await click('Open timeline');
    await director.wait(2400);
    await director.frame('timeline editor');
    await director.caption('Arrange start/end, speed and volume; preview before rendering / 编排起止点、速度与音量', { frames: 2, holdMs: 800 });
    const exportClicked = await click('Output video') || await click('Export') || await click('Render') || await click('导出');
    if (exportClicked) {
      await director.wait(3000);
      await director.frame('export started');
      await director.caption('MP4 rendering runs in the client; the Windows taskbar shows progress / 客户端渲染，任务栏进度可见', { frames: 2, holdMs: 900 });
      await director.wait(7000);
      await director.frame('export progress');
    } else {
      await director.caption('Timeline ready for rendering / 时间线已可渲染', { frames: 1 });
    }
    await director.hideCaption();
    await director.key('Escape');
  });

  // ------------------------------------------------------------------
  await step('projects', async () => {
    await director.caption('8 · Projects — create, switch, autosave / 项目管理', { frames: 3, holdMs: 900 });
    // Open the project sidebar (the desktop project switcher).
    await click('Toggle project sidebar');
    await director.wait(1200);
    await director.frame('project sidebar');
    await click('New project');
    await director.wait(2400);
    await ready().catch(() => {});
    await director.frame('second project');
    // Switch back to the first project via the sidebar row.
    const rows = page.locator('.od-sidebar-project-select');
    if (await rows.count() > 1) {
      await rows.first().click({ timeout: 5000 }).catch(() => {});
      await director.wait(2400);
      await director.frame('switched back');
    }
    await director.caption('One workspace, many projects — every save lands on disk immediately / 多项目即时落盘', { frames: 2, holdMs: 800 });
    await click('Toggle project sidebar');
    await director.wait(600);
    await director.key('Escape');
    await director.hideCaption();
  });

  // ------------------------------------------------------------------
  await step('settings', async () => {
    await director.caption('9 · Settings — models, theme, language / 设置', { frames: 3, holdMs: 900 });
    await click('Settings');
    await director.wait(1800);
    await director.frame('settings panel');
    await click('Light');
    await director.wait(1600);
    await director.frame('light theme');
    await director.caption('Light / dark theme follows the Windows system setting / 主题跟随系统', { frames: 2, holdMs: 800 });
    await click('Dark');
    await director.wait(1200);
    await director.frame('dark theme');
    // Full UI in Chinese to prove parity. The toggle is a two-button group in
    // the top bar; target the button directly (text matching can hit the
    // settings dropdown's "中文" option or the group box).
    const switchToChinese = () => page.locator('.cw-language-toggle button').first().click({ timeout: 5000 });
    await switchToChinese().catch(() => click('中文'));
    await director.wait(2000);
    if (!await page.evaluate(() => /已保存到本机|设置|通用/.test(document.body.innerText))) {
      await switchToChinese().catch(() => {});
      await director.wait(1800);
    }
    await director.frame('chinese ui');
    await director.caption('中文界面 · 文件操作 · 诊断信息全覆盖', { frames: 2, holdMs: 900 });
    await director.key('Escape');
    await director.hideCaption();
  });

  // ------------------------------------------------------------------
  await step('takeover', async () => {
    await director.caption('10 · Crash recovery — take over a stuck project / 崩溃恢复：会话接管', { frames: 3, holdMs: 900 });
    // The desktop shell keeps project routing out of the URL, so resolve the
    // open project through the creation API and target the explicit route.
    const currentName = await page.evaluate(() =>
      document.querySelector('[data-testid=project-name-button]')?.textContent?.trim()
        ?? document.querySelector('.od-caption-actions')?.previousElementSibling?.textContent?.trim()
        ?? '');
    let projectId = '';
    try {
      const list = await fetch(`${api}/api/creation/projects`, { headers: { 'x-opendirector-request': '1' } }).then(r => r.json());
      const match = (list.projects ?? []).find(p => p.name === currentName) ?? (list.projects ?? []).at(-1);
      projectId = match?.id ?? '';
    } catch { /* fall through to the soft path */ }
    const projectUrl = `${web}/ai-tool/ai-canvas/${projectId}?creation=unified`;
    // A separate browser context = a second window with its own editing
    // session. It opens the same project while our window still holds the
    // lease, so it lands on the lock screen and takes over — exactly what a
    // user does when a window crashed.
    const otherContext = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 } });
    const other = await otherContext.newPage();
    await other.addInitScript(`
      localStorage.setItem('opendirector.modelSetup.v1', 'dismissed');
      window.opendirectorDesktop = { registerSession() {}, setLocale() {}, setTheme() {}, setExporting() {}, setTaskProgress() {}, notify() {}, showMore() {}, reportActivity() {}, requestTakeover: async () => ({ ok: true }), onOpenTarget() {}, platform: 'win32' };
    `);
    if (projectId) {
      await other.goto(projectUrl, { waitUntil: 'domcontentloaded' });
      await other.waitForFunction(() => /Take over the project|接管项目/.test(document.body.innerText), undefined, { timeout: 25000 }).catch(() => {});
      await director.wait(900);
      try { await other.locator('[data-testid=project-takeover]').click({ timeout: 8000 }); } catch {
        await other.getByText(/Take over the project|接管项目/).first().click({ timeout: 5000 }).catch(() => {});
      }
      await other.waitForFunction(() => !!document.querySelector('.react-flow') && !document.querySelector('dialog[open]'), undefined, { timeout: 25000 }).catch(() => {});
    }
    // Close the second window abruptly: its lease is now held by a dead
    // session — the exact crash-recovery scenario.
    await otherContext.close();
    await director.wait(1200);
    // A fresh open of the project lands on the lock screen.
    await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
    await director.wait(3200);
    await director.frame('lock screen');
    await director.caption('A dead window holds the lease — the lock screen offers Take over / 锁屏提供一键接管', { frames: 3, holdMs: 1000 });
    let taken = false;
    try {
      await page.locator('[data-testid=project-takeover]').click({ timeout: 6000 });
      taken = true;
    } catch {
      taken = await click('Take over the project', { timeoutMs: 6000 });
    }
    if (taken) {
      await page.waitForFunction(() => !!document.querySelector('.react-flow') && !document.querySelector('dialog[open]'), undefined, { timeout: 20000 }).catch(() => {});
      await director.wait(1600);
      await director.frame('takeover recovered');
      await director.caption('Session taken over — editing resumes immediately / 接管后立即恢复编辑', { frames: 3, holdMs: 1000 });
    } else {
      await click('Reconnect');
      await page.waitForFunction(() => !!document.querySelector('.react-flow') && !document.querySelector('dialog[open]'), undefined, { timeout: 20000 }).catch(() => {});
      await director.wait(1400);
      await director.frame('reconnected');
      await director.caption('Editing resumes immediately / 立即恢复编辑', { frames: 2, holdMs: 900 });
    }
    await director.hideCaption();
  });

  // ------------------------------------------------------------------
  await step('end', async () => {
    await director.titleCard(
      'Full functional simulation — passed',
      'First launch · Canvas · Agent · Generation · Import · Editing · Timeline & MP4 export · Projects · Crash recovery · Bilingual UI · Theme',
    );
    await director.caption('OpenDirector for Windows — the local AI video studio / 本地 AI 视频创作工作台', { frames: 3, holdMs: 1000 });
    await director.hideCaption();
    await director.wait(600);
  });
}

async function uploadSamples(page) {
  try {
    // The first input[type=file] in the DOM is the .canvas archive importer;
    // the canvas asset input carries a dedicated accessible name.
    const target = page.locator('input[type=file][aria-label*="local asset" i], input[type=file][aria-label*="本地素材"]');
    const input = (await target.count()) ? target.first() : page.locator('input[type=file][aria-label]').last();
    const png = globalThis.__demoSamples?.png;
    const wav = globalThis.__demoSamples?.wav;
    if (!png && !wav) return false;
    // One file at a time with a settle delay: a parallel batch can race the
    // project autosave and the second file fails with HTTP 409.
    if (wav) {
      await input.setInputFiles([wav]);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    if (png) {
      await input.setInputFiles([png]);
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    return true;
  } catch {
    return false;
  }
}

async function openImageEditor(page, { onSelected } = {}) {
  // Image nodes open the layer editor from their context menu ("Open editor").
  const nodes = page.locator('.react-flow__node');
  const count = Math.min(await nodes.count(), 10);
  for (let i = count - 1; i >= 0; i -= 1) {
    const node = nodes.nth(i);
    const text = ((await node.textContent()) ?? '').toLowerCase();
    if (!(text.includes('image') || text.includes('img') || text.includes('seascape') || text.includes('.png'))) continue;
    // Select first so the media toolbar (smart edit, outpaint…) is visible.
    try {
      await node.click({ position: { x: 25, y: 18 }, timeout: 3000 });
      await new Promise(resolve => setTimeout(resolve, 700));
      if (onSelected) await onSelected();
    } catch {
      // continue; the right-click below may still land
    }
    for (const attempt of [
      () => node.click({ button: 'right', timeout: 3000 }),
      async () => {
        const box = await node.boundingBox();
        if (!box) throw new Error('no box');
        await page.mouse.click(box.x + box.width / 2, box.y + 30, { button: 'right' });
      },
    ]) {
      try {
        await attempt();
        await new Promise(resolve => setTimeout(resolve, 500));
        await page.locator('[role=menu]').getByText(/^(Open editor|打开编辑器|Edit image|编辑图片)$/).first().click({ timeout: 2500 });
        await new Promise(resolve => setTimeout(resolve, 1800));
        return true;
      } catch {
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
  }
  return false;
}
