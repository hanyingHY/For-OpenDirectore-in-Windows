import chromium from '@sparticuz/chromium';
import { chromium as pw } from 'playwright-core';
const out = '/tmp/b1/ui/frames';
const b = await pw.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto('http://127.0.0.1:8000/', { waitUntil: 'load', timeout: 60000 });
await p.waitForTimeout(12000);
if (await p.getByText('Explore first').count()) { await p.getByText('Explore first').first().click(); console.log('clicked Explore first'); }
await p.waitForTimeout(12000);
await p.screenshot({ path: '/tmp/b1/ui/0-canvas.png' });
const chatBtn = p.getByRole('button', { name: /Chat with AI/ }).first();
if (await chatBtn.count()) { await chatBtn.click().catch(()=>{}); await p.waitForTimeout(3000); console.log('opened chat'); }
const input = p.getByRole('textbox', { name: 'Message content' }).first();
console.log('inputs', await p.locator('[contenteditable="true"], textarea').count());
await input.waitFor({ timeout: 30000 });
await input.click();
await input.fill('请用一句话介绍蓝调时刻。');
let n = 0;
const snap = async () => { await p.screenshot({ path: `${out}/f${String(n++).padStart(4,'0')}.png` }); };
for (let i = 0; i < 4; i++) { await snap(); await p.waitForTimeout(400); }
await p.getByRole('button', { name: /Send message/ }).first().click();
const started = Date.now();
let last = '';
while ((Date.now() - started) < 75000) {
  await snap();
  const text = await p.evaluate(() => document.body.innerText);
  const hit = (text.match(/模型服务[^\n]*|did not respond[^\n]*|未自动重试[^\n]*|not retried[^\n]*/g) || []).join(' || ');
  if (hit !== last) { console.log(`t=${((Date.now()-started)/1000).toFixed(0)}s ${hit || '(none)'}`); last = hit; }
  await p.waitForTimeout(800);
}
for (let i = 0; i < 4; i++) { await snap(); await p.waitForTimeout(400); }
await p.screenshot({ path: '/tmp/b1/ui/final.png' });
console.log('frames', n);
await b.close();
