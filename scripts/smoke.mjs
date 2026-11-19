// Exercise the installed WebView2 process. CDP is enabled by the CI parent only.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
const phase = process.argv[2];
const app = join(process.env.LOCALAPPDATA,'Programs','OpenDirector','app');
const delay = ms => new Promise(r=>setTimeout(r,ms));
let page, stage='attach';
try {
  let browser;
  for(let i=0;i<75&&!browser;i++) {
    try { browser=await chromium.connectOverCDP('http://127.0.0.1:19222',{timeout:1200}); }
    catch { await delay(1000); }
  }
  assert(browser,'Installed WebView2 did not open');
  const context=browser.contexts()[0];
  page=context.pages()[0] || await context.waitForEvent('page');
  await page.waitForURL('http://127.0.0.1:48765/**',{timeout:60000});
  await page.waitForSelector('.cw-workspace',{timeout:60000});
  await page.setViewportSize({width:1440,height:900});
  stage='open';
  const zh=phase==='create';
  if(!zh) assert.equal(await page.evaluate(()=>localStorage.getItem('opendirector.smoke.upgrade')),'preserved','Lost renderer origin storage');
  else await page.evaluate(()=>localStorage.setItem('opendirector.smoke.upgrade','preserved'));
  await page.evaluate(zh=>{localStorage.setItem('opendirector.modelSetup.v1','dismissed');localStorage.setItem('opendirector.locale.v1',zh?'zh-CN':'en-US');},zh);
  await page.reload();
  const saved=()=>page.locator('.cw-save-status').filter({hasText:zh?'已保存到本机':'Saved on this device'}).waitFor({state:'attached',timeout:60000});
  await saved();
  // Legacy builds need no log on a successful launch. Never expect a
  // desktop.4 readiness record from the previous installer in an upgrade test.
  const version=readFileSync(join(app,'VERSION'),'utf8').trim();
  const modern=!/^0\.1\.4-desktop\.[123]$/.test(version);
  let port=48765;
  if(modern){
    const log=readFileSync(join(process.env.LOCALAPPDATA,'OpenDirector/Desktop/desktop.log'),'utf8');
    port=Array.from(log.matchAll(/Local service ready on loopback port (\d+)/g)).at(-1)[1];
  }
  if(modern) { assert.notEqual(+port,48765); assert.match(await page.evaluate(()=>fetch('/__desktop/activity').then(r=>r.text())),/Agent: 0; Generation .*: 0; Tools .*: 0/); }
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`,{headers:{'X-OpenDirector-Request':'1'}})).status,403);
  const nodes=page.locator('.react-flow__node');
  const shell=join(app,'OpenDirector-CLI.exe');
  const projects=()=>JSON.parse(execFileSync(shell,['project','list'],{encoding:'utf8'})).projects;
  async function assertLocked(project) {
    const result=await page.evaluate(async id=>{
      const r=await fetch(`/api/creation/projects/${id}/open-canvas`,{method:'POST',headers:{'X-OpenDirector-Request':'1','X-OpenDirector-Session':crypto.randomUUID(),'Accept-Language':document.documentElement.lang}});
      return [r.status,await r.json()];
    },project);
    assert.equal(result[0],409);assert.equal(result[1].code,'project_open_elsewhere');
    assert.match(result[1].detail,zh?/其他窗口/:/another window/i);
  }
  async function recordWindow(){
    const cdp=await context.newCDPSession(page), frames=[];
    const folder=resolve('.work/frames-'+phase); mkdirSync(folder,{recursive:true});
    cdp.on('Page.screencastFrame',event=>{const f=join(folder,`${frames.length}.jpg`);writeFileSync(f,Buffer.from(event.data,'base64'));frames.push([f,Date.now()]);cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});});
    await cdp.send('Page.startScreencast',{format:'jpeg',quality:85,maxWidth:1440,maxHeight:900});
    return async output=>{
      await delay(900); await cdp.send('Page.stopScreencast');
      assert(frames.length>1,'No captured WebView2 frames');
      const list=frames.map(([f,t],i)=>`file '${f.replaceAll('\\','/')}'\nduration ${Math.min(2,((frames[i+1]?.[1]??(t+1200))-t)/1000)}`).join('\n')+`\nfile '${frames.at(-1)[0].replaceAll('\\','/')}'\n`;
      writeFileSync(join(folder,'frames.txt'),list);
      execFileSync(join(app,'media/ffmpeg.exe'),['-loglevel','error','-y','-safe','0','-f','concat','-i',join(folder,'frames.txt'),'-vf','scale=1440:900,fps=24,format=yuv420p','-c:v','libx264','-movflags','+faststart',output]);
    };
  }
  if(zh) {
    if(version==='0.1.4-desktop.5' && process.env.OD_PREVIOUS_INSTALLER){
      stage='reproduce previous canvas overlap';
      const end=await recordWindow();
      await (await import('../verification/legacy-sidebar.mjs')).legacySidebar(page);
      await end('delivery/windows-sidebar-before.mp4');
    }
    stage='capture';
    const finishCapture=await recordWindow();
    stage='create project';
    await page.getByRole('button',{name:'切换项目',exact:true}).click();
    await page.getByRole('menuitem',{name:'新建画布项目',exact:true}).click();
    const title=page.getByRole('textbox',{name:'项目名称',exact:true});
    await title.fill('Blue Hour · 轨道晨光'); await title.press('Enter'); await saved();
    stage='import image';
    await page.getByLabel('选择本地素材文件',{exact:true}).setInputFiles('examples/01-orbit.jpg');
    await page.locator('img.cw-image-preview').first().waitFor(); await saved();
    const nodeId=await nodes.first().getAttribute('data-id');
    await delay(900); await page.screenshot({path:'delivery/windows-canvas.png'});
    stage='edit video prompt';
    await page.getByRole('button',{name:'添加视频',exact:true}).click();
    const prompt=page.getByRole('textbox',{name:'生成提示词',exact:true});
    await prompt.click(); await page.keyboard.insertText('镜头缓慢推近，晨光沿着行星的边缘升起。');
    await page.locator('.cw-workspace').focus(); await saved(); await delay(1000);
    stage='export canvas';
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'导出画布',exact:true}).click()]);
    await download.saveAs('.work/export.canvas'); assert.equal(readFileSync('.work/export.canvas').subarray(0,2).toString(),'PK');
    const project=projects().find(p=>p.name==='Blue Hour · 轨道晨光'); assert(project); await assertLocked(project.id);
    writeFileSync('.work/check.json',JSON.stringify({project:project.id,nodeId}));
    await finishCapture('delivery/windows-demo.mp4');
  } else {
    stage='verify project after reinstall';
    const {project,nodeId}=JSON.parse(readFileSync('.work/check.json'));
    await page.locator(`.react-flow__node[data-id="${nodeId}"] img.cw-image-preview`).waitFor();
    await assertLocked(project);
    assert.equal(await nodes.count(),2);assert(projects().some(p=>p.id===project));
    await page.screenshot({path:'delivery/windows-reopened-en.png'});
    stage='installed sidebar placement';
    const finishSidebar=await recordWindow();
    await (await import('../verification/sidebar.mjs')).sidebarCheck(page);
    await page.locator(`.react-flow__node[data-id="${nodeId}"] img.cw-image-preview`).waitFor();
    await finishSidebar('delivery/windows-sidebar.mp4');
    // desktop.9 (RFC #362): the timeline output failure card journey gets its own
    // recording so the close/refusal behaviour is reviewable without scrubbing a
    // long workflow capture. One CDP screencast at a time keeps frames honest.
    const finishDismiss=(modern && process.env.OD_VERIFY_RENDER==='1')?await recordWindow():null;
    if(process.env.OD_VERIFY_RENDER==='1') { stage='timeline output failure card and render MP4'; await (await import('../verification/render.mjs')).renderCheck(page,app); }
    if(finishDismiss) await finishDismiss('delivery/windows-timeline-dismiss.mp4');
    const finishCapture=modern?await recordWindow():null;
    stage='installed image editors';
    await (await import('../verification/image-edits.mjs')).imageEdits(page,project,nodeId);
    if(modern){ stage='installed Agent chat'; await (await import('../verification/agent-window.mjs')).agentWindow(page,project); }
    if(finishCapture) await finishCapture('delivery/windows-workflow.mp4');
  }
  process.exit(0);
} catch(e) {
  if(page) { try { await page.screenshot({path:'delivery/windows-diagnostic.png',timeout:4000}); } catch {} }
  console.error('::error::'+phase+'/'+stage+': '+String(e).replaceAll('\n',' '));process.exit(1);
}
