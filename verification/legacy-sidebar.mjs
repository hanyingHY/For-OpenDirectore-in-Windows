import assert from 'node:assert/strict';
// Capture the actual previous install on the disposable upgrade-test account.
// This branch never runs in the shipped application or edits a user's project.
export async function legacySidebar(page){
  const nodes=page.locator('.react-flow__node');
  assert.equal(await nodes.count(),0);
  for(const label of ['文本','图片','视频','音频','时间线','主体','文本']){
    await page.getByRole('button',{name:'添加'+label,exact:true}).click();
    await page.waitForTimeout(300);
  }
  assert.equal(await nodes.count(),7);
  const intersections=()=>nodes.evaluateAll(ns=>{
    const boxes=ns.map(n=>n.getBoundingClientRect());
    return boxes.reduce((sum,a,i)=>sum+boxes.slice(0,i).filter(b=>Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)).length,0);
  });
  const pairs=await intersections(); assert.ok(pairs>0,'Previous build did not reproduce reported defect');
  await page.waitForTimeout(1100);
  await page.locator('.cw-workspace').focus(); await page.keyboard.press('Control+a');
  await page.getByRole('button',{name:'自动排列',exact:true}).click();
  await page.locator('.cw-workspace').focus(); await page.keyboard.press('Shift+1');
  await page.waitForTimeout(850);
  assert.equal(await intersections(),0,'Explicit recovery left cards intersecting');
  console.log(`Reproduced ${pairs}/21 overlapping pairs on desktop.5; explicit Auto arrange recovered layout`);
}
