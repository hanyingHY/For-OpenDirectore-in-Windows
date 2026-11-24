/**
 * Demo driver: drives a real browser session and records every step as PNG
 * frames that are later encoded to MP4. A synthetic cursor is injected into the
 * page so the video shows pointer movement and clicks.
 *
 * The page under test is always the real OpenDirector UI (vite dev server or a
 * packaged build) backed by the real API (fixture or full).
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export class Director {
  constructor({ browser, page, framesDir, ffmpeg, log = console }) {
    this.browser = browser;
    this.page = page;
    this.framesDir = framesDir;
    this.ffmpeg = ffmpeg;
    this.log = log;
    this.index = 0;
    this.pointer = { x: 800, y: 500 };
    rmSync(framesDir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });
  }

  static async launch({ chromium, playwright, framesDir, ffmpeg, viewport = { width: 1600, height: 1000 } }) {
    const browser = await playwright.chromium.launch({
      executablePath: chromium,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
    });
    const context = await browser.newContext({ locale: 'en-US', viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.addInitScript(`
      (() => {
        // Desktop bridge stub: the Web UI switches to the desktop layout when
        // window.opendirectorDesktop exists (same contract as the Electron preload).
        window.opendirectorDesktop = {
          registerSession() {}, setLocale() {}, setTheme() {}, setExporting() {},
          setTaskProgress() {}, notify() {}, showMore() {}, reportActivity() {},
          requestTakeover: async () => ({ ok: true }),
          onOpenTarget() {}, platform: 'win32',
        };
        // Everything DOM-facing waits for the document: at document_start the
        // parser may not have created documentElement/head/body yet.
        const attach = () => {
          document.documentElement.dataset.desktopPlatform = 'win32';
          document.documentElement.dataset.desktopChrome = '';
          const style = document.createElement('style');
        style.textContent = \`
          #demo-cursor { position: fixed; z-index: 2147483647; pointer-events: none;
            width: 22px; height: 22px; margin: 0; border: 0; padding: 0; background: transparent;
            left: 760px; top: 480px; transition: transform .08s ease-out; }
          #demo-cursor svg { width: 100%; height: 100%; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
          #demo-cursor.demo-down { transform: scale(.8); }
          #demo-caption { position: fixed; left: 800px; top: 900px; transform: translateX(-50%);
            z-index: 2147483646; pointer-events: none; background: rgba(12,12,16,.82);
            color: #f5f6fa; font: 500 20px/1.5 "Segoe UI", system-ui, sans-serif;
            padding: 12px 26px; margin: 0; border: 0; border-radius: 12px; max-width: 80%;
            text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,.45); opacity: 0;
            transition: opacity .25s; overflow: visible; }
          #demo-caption.demo-show { opacity: 1; }
        \`;
          document.head.appendChild(style);
          const cursor = document.createElement('div');
          cursor.id = 'demo-cursor';
          cursor.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 2l14 10-6 1 3.5 6.5-2.5 1.5L9.5 14 4 18z" fill="#fff" stroke="#222" stroke-width="1.2"/></svg>';
          document.body.appendChild(cursor);
          const caption = document.createElement('div');
          caption.id = 'demo-caption';
          document.body.appendChild(caption);
          // Popovers join the CSS top layer, so app <dialog> modals cannot cover
          // the synthetic cursor or the caption bar. The top layer stacks
          // later-activated elements on top, so re-show the overlays whenever a
          // dialog opens to keep them above it.
          const lift = () => {
            for (const node of [cursor, caption]) {
              try { if (node.matches(':popover-open')) node.hidePopover(); } catch {}
              try { node.showPopover(); } catch {}
            }
          };
          for (const node of [cursor, caption]) {
            try { node.setAttribute('popover', 'manual'); } catch {}
          }
          lift();
          new MutationObserver(() => {
            if (document.querySelector('dialog[open]')) lift();
          }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
          window.__demoLift = lift;
          window.__demoCaption = caption;
          window.addEventListener('mousemove', event => {
            cursor.style.left = event.clientX + 'px';
            cursor.style.top = event.clientY + 'px';
          }, { capture: true });
          window.addEventListener('mousedown', () => cursor.classList.add('demo-down'), { capture: true });
          window.addEventListener('mouseup', () => cursor.classList.remove('demo-down'), { capture: true });
        };
        if (document.body) attach();
        else window.addEventListener('DOMContentLoaded', attach, { once: true });
      })();
    `);
    return new Director({ browser, page, framesDir, ffmpeg });
  }

  async frame(tag = '') {
    this.index += 1;
    const name = `${String(this.index).padStart(5, '0')}.png`;
    await this.page.screenshot({ path: join(this.framesDir, name) });
    if (tag) this.log.log(`  [${this.index}] ${tag}`);
    return name;
  }

  async caption(text, { frames = 2, holdMs = 600 } = {}) {
    await this.page.evaluate(value => {
      const caption = window.__demoCaption;
      if (!caption) return;
      caption.textContent = value;
      // Explicit viewport anchoring: app CSS may transform ancestors, which
      // relativises position:fixed boxes.
      caption.style.top = `${window.innerHeight - 92}px`;
      caption.style.left = `${Math.round(window.innerWidth / 2)}px`;
      caption.classList.add('demo-show');
    }, text);
    await this.wait(360); // let the fade-in complete before capturing
    await this.frame(`caption: ${text}`);
    for (let i = 1; i < frames; i += 1) {
      await this.wait(holdMs / frames);
    }
  }

  async hideCaption() {
    await this.page.evaluate(() => window.__demoCaption?.classList.remove('demo-show'));
    await this.wait(250);
  }

  async wait(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  async move(x, y, { steps = 6, stepMs = 60 } = {}) {
    const from = { ...this.pointer };
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const px = from.x + (x - from.x) * t;
      const py = from.y + (y - from.y) * t;
      await this.page.mouse.move(px, py);
      await this.wait(stepMs);
    }
    this.pointer = { x, y };
    await this.frame();
  }

  async click(x, y, { frame = true } = {}) {
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    await this.wait(90);
    await this.page.mouse.up();
    await this.wait(140);
    if (frame) await this.frame(`click (${Math.round(x)}, ${Math.round(y)})`);
  }

  async doubleClick(x, y) {
    await this.page.mouse.dblclick(x, y);
    await this.wait(200);
    await this.frame(`dblclick (${Math.round(x)}, ${Math.round(y)})`);
  }

  /** Resolve a visible element by its trimmed text and return its center. */
  async find(text, { role } = {}) {
    // NOTE: page.evaluate accepts exactly ONE argument — bundle them.
    return this.page.evaluate(({ needle, wantRole }) => {
      const leaves = [...document.querySelectorAll('button, a, [role=button], [role=tab], [role=menuitem], [role=option], label, li, h1, h2, h3, strong, span, div')];
      const norm = s => (s || '').replace(/\s+/g, ' ').trim();
      const matches = leaves.filter(el => {
        const text = norm(el.textContent);
        const label = norm(el.getAttribute('aria-label'));
        const title = norm(el.getAttribute('title'));
        // Exact text wins; aria-label/title allow matching icon-only controls
        // ("Add Text" button showing just a "T" glyph).
        const hit = text === needle || label === needle || title === needle
          || (text.length > 0 && text.includes(needle))
          || (label.length > 0 && label.includes(needle));
        if (!hit) return false;
        if (wantRole && el.getAttribute('role') !== wantRole && !el.closest(`[role=${wantRole}]`)) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        const style = getComputedStyle(el);
        return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.2;
      });
      if (!matches.length) return null;
      // Prefer the smallest matching leaf (the actual control).
      const el = matches.sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height) - (b.getBoundingClientRect().width * b.getBoundingClientRect().height))[0];
      const target = el.closest('button, a, [role=button], [role=tab], [role=menuitem], [role=option]') || el;
      const rect = target.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, tag: target.tagName };
    }, { needle: text, wantRole: role ?? null });
  }

  async clickText(text, { timeoutMs = 8000, role, required = true } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = await this.find(text, { role });
      if (found) {
        await this.move(found.x, found.y, { steps: 5 });
        await this.click(found.x, found.y);
        return true;
      }
      await this.wait(250);
    }
    if (required) throw new Error(`clickText: "${text}" not found`);
    return false;
  }

  async hoverText(text, { timeoutMs = 6000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = await this.find(text);
      if (found) {
        await this.move(found.x, found.y, { steps: 5 });
        return true;
      }
      await this.wait(250);
    }
    return false;
  }

  async type(text, { perCharMs = 55 } = {}) {
    await this.page.keyboard.type(text, { delay: perCharMs });
    await this.frame(`type "${text.slice(0, 24)}"`);
  }

  async key(combo) {
    await this.page.keyboard.press(combo);
    await this.wait(160);
    await this.frame(`key ${combo}`);
  }

  async titleCard(title, subtitle = '') {
    await this.page.evaluate(({ title, subtitle }) => {
      document.body.innerHTML = `
        <div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;
          justify-content:center;background:radial-gradient(1200px 700px at 30% 20%, #2a2350 0%, #12121a 55%, #0b0b10 100%);
          color:#f5f6fa;font-family:'Segoe UI',system-ui,sans-serif;text-align:center;padding:60px">
          <div style="font-size:26px;letter-spacing:6px;color:#b7a6ff;text-transform:uppercase;margin-bottom:26px">OpenDirector for Windows</div>
          <h1 style="font-size:64px;font-weight:700;margin:0 0 22px;line-height:1.15">${title}</h1>
          <p style="font-size:26px;color:#c9cde0;max-width:1100px;line-height:1.6;margin:0">${subtitle}</p>
          <div style="margin-top:64px;display:flex;gap:18px;align-items:center;color:#8f95b2;font-size:19px">
            <span style="width:12px;height:12px;border-radius:50%;background:#7c5cff"></span>
            <span>Full functional simulation · 真机全量功能模拟</span>
          </div>
        </div>`;
      // Re-attach the recording overlays wiped by the body swap.
      const cursor = document.createElement('div');
      cursor.id = 'demo-cursor';
      cursor.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 2l14 10-6 1 3.5 6.5-2.5 1.5L9.5 14 4 18z" fill="#fff" stroke="#222" stroke-width="1.2"/></svg>';
      document.body.appendChild(cursor);
      const caption = document.createElement('div');
      caption.id = 'demo-caption';
      document.body.appendChild(caption);
      for (const node of [cursor, caption]) {
        try { node.setAttribute('popover', 'manual'); node.showPopover(); } catch {}
      }
      window.__demoCaption = caption;
      window.addEventListener('mousemove', event => {
        cursor.style.left = event.clientX + 'px';
        cursor.style.top = event.clientY + 'px';
      }, { capture: true });
    }, { title, subtitle });
    await this.wait(400);
    await this.frame(`title: ${title}`);
    await this.frame();
    await this.wait(500);
    await this.frame();
  }

  /** Encode captured frames into an MP4. Returns the output path. */
  encode(outPath, { fps = 9, crf = 20, speed = 1 } = {}) {
    const out = resolve(outPath);
    const files = readdirSync(this.framesDir).filter(name => name.endsWith('.png'));
    if (files.length < 2) throw new Error('not enough frames to encode');
    const effectiveFps = fps * speed;
    const result = spawnSync(this.ffmpeg, [
      '-y', '-framerate', String(effectiveFps), '-i', join(this.framesDir, '%05d.png'),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf),
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
    ], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr?.slice(-800)}`);
    writeFileSync(join(this.framesDir, 'encode.json'), JSON.stringify({ frames: this.index, fps: effectiveFps, out }, null, 2));
    return out;
  }

  async close() {
    await this.browser.close();
  }
}
