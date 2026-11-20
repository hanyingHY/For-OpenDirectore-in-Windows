// Exercise the real editors in the installed window and read the service's
// committed editable documents, not just the flattened preview image.
import assert from 'node:assert/strict';
export async function imageEdits(page,project,nodeId){
  const button=name=>page.getByRole('button',{name,exact:true});
  const saved=()=>page.getByText('Saved on this device',{exact:true}).waitFor();
  const edit=async()=>{
    await page.locator('.cw-workspace').focus(); await page.keyboard.press('Escape'); await page.keyboard.press('Shift+1');
    await page.locator(`.react-flow__node[data-id="${nodeId}"] .cw-node-title`).click({button:'right'});
    await page.getByRole('menuitem',{name:'Edit image',exact:true}).click();
  };
  const snapshot=()=>page.evaluate(async id=>{
    const r=await fetch('/api/creation/projects/'+id,{headers:{'X-OpenDirector-Request':'1'}}); if(!r.ok)throw Error('Cannot read project after edit');return r.json();
  },project);
  // desktop.5 stored the Blue Hour video directly over its image. Opening
  // an authored project must not silently move it. Use the real recovery UI
  // when needed rather than force-clicking through the covering card.
  const overlap=()=>page.locator('.react-flow__node').evaluateAll(ns=>{
    const boxes=ns.map(n=>n.getBoundingClientRect());
    return boxes.some((a,i)=>boxes.slice(0,i).some(b=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom));
  });
  if(await overlap()){
    await page.locator('.cw-workspace').focus(); await page.keyboard.press('Control+a');
    await button('Auto arrange').click(); await saved();
    assert.equal(await overlap(),false,'Explicit recovery failed on upgraded project');
  }
  await edit();
  const ratio=page.getByRole('combobox',{name:'Crop ratio'});
  await ratio.selectOption('16:9'); await button('Apply edits').click(); await ratio.waitFor({state:'hidden'}); await saved();
  assert.ok((await snapshot()).editorDocuments.some(d=>d.kind==='image_crop'&&d.data.options.aspect==='16:9'));
  await edit(); await button('Layer studio').click(); await button('Text').click();
  const text=page.getByLabel('Layer text content',{exact:true}); await text.fill('BLUE HOUR');
  await button('Apply to canvas').click(); await page.locator('.lb-dialog').waitFor({state:'detached'});await saved();
  await page.reload(); await saved();
  const doc=(await snapshot()).editorDocuments.find(d=>d.kind==='layers');
  assert.ok(doc?.data.layers.some(l=>l.content.text==='BLUE HOUR'),'Editable text layer missing after reload');
  console.log('PASS: project-owned image → crop → editable title layer → save and reopen via real local API');
}
