// Runs on the production bundle through an installed WebView. No Vite imports,
// fake export handlers, test HTTP routes, provider accounts or paid API calls.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
export async function renderCheck(page, app) {
  const src='data:image/jpeg;base64,'+readFileSync('examples/01-orbit.jpg').toString('base64');
  const resource={id:'reference',kind:'image',title:'Orbit',src,mimeType:'image/jpeg',width:960,height:600};
  // The H.264 level limits make 4096×4096 impossible for any compliant encoder,
  // so this reaches the failure card without a model, a network or a long encode.
  const packageFor=(width,height)=>JSON.stringify({format:'opendirector-editable-timeline',version:1,timeUnit:'seconds',
    timeline:{fps:24,width,height,importedAssets:[],tracks:[{id:'visual',kind:'visual',title:'Orbit',muted:false,
      clips:[{id:'dawn',resource,inPoint:0,outPoint:1.5,speed:1,volume:1,muted:false}]}]}});
  const importPackage=async(width,height)=>{
    await page.getByLabel('Import timeline JSON',{exact:true}).setInputFiles({name:'orbit.timeline.json',mimeType:'application/json',buffer:Buffer.from(packageFor(width,height))});
    await page.locator('.cw-timeline-clip').first().waitFor();
  };
  const refit=async()=>{await page.locator('.cw-workspace').focus();await page.keyboard.press('Shift+1');};
  // Selecting through the title is what a user does, and it re-measures the
  // selection toolbar: upstream hides it while the node's rect is off-screen, so
  // a click that follows a camera pan or a closed editor needs it first.
  const output=async()=>{
    await node.locator('.cw-node-title').click();
    const bar=page.locator('.cw-selection-toolbar');
    await bar.waitFor();
    await bar.getByRole('button',{name:'Output video',exact:true}).click();
  };

  await page.getByRole('button',{name:'Add Timeline',exact:true}).click();
  const node=page.locator('.react-flow__node.selected');
  await node.locator('.cw-node-title').waitFor();

  // desktop.8 regression (RFC #362). (1) A timeline with nothing on it cannot
  // encode one frame: the request is answered with the project's own toast and
  // never opens the overlay whose single action re-failed forever.
  await output();
  await page.locator('.cw-toast').filter({hasText:'Add media to the timeline first'}).first().waitFor();
  assert.equal(await page.locator('.cw-timeline-pending').count(),0,'an empty timeline left an output card behind');

  // (2) A real encoder rejection must offer a way out besides retrying into it.
  await node.locator('.cw-node-title').click({button:'right'});
  await page.getByRole('menuitem',{name:'Open editor',exact:true}).click();
  await importPackage(4096,4096);
  await page.getByRole('button',{name:'Apply edits',exact:true}).click();
  await page.locator('.cw-timeline-dialog').waitFor({state:'detached'});
  await refit();
  await output();
  const stuck=page.locator('.cw-timeline-pending');
  await stuck.locator('[role="alert"]').waitFor();
  assert.match(await stuck.locator('[role="alert"]').innerText(),/cannot encode H\.264 at this size/);
  for (const name of ['Edit timeline','Retry output','Close card'])
    await stuck.getByRole('button',{name,exact:true}).waitFor();
  await page.screenshot({path:'delivery/windows-timeline-failed.png'});
  await stuck.getByRole('button',{name:'Close card',exact:true}).click();
  await stuck.waitFor({state:'detached'});

  // (3) Closing released the hook: the same timeline still renders for real, so
  // the shipped MP4 check below runs through the state a dismissal left behind.
  // The failed run panned the camera away from the node, so fit the document first.
  await refit();
  await node.locator('.cw-node-title').click({button:'right'});
  await page.getByRole('menuitem',{name:'Open editor',exact:true}).click();
  await importPackage(640,400);
  await page.getByRole('button',{name:'Render MP4',exact:true}).click();
  const button=page.getByRole('button',{name:'Download MP4',exact:true});
  try { await button.waitFor({timeout:75000}); }
  catch(e) { throw Error(`No MP4: ${(await page.locator('.cw-timeline-dialog').innerText()).slice(-1600)} (${e.name})`); }
  await page.screenshot({path:'delivery/windows-timeline.png'});
  const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);
  await download.saveAs('delivery/timeline-export.mp4');
  const info=JSON.parse(execFileSync(join(app,'media','ffprobe.exe'),['-v','error','-show_streams','-show_format','-of','json','delivery/timeline-export.mp4']));
  const video=info.streams.find(s=>s.codec_type==='video');
  assert.equal(video.codec_name,'h264'); assert.equal(video.width,640); assert.equal(video.height,400); assert(Math.abs(Number(info.format.duration)-1.5)<0.2);
}
