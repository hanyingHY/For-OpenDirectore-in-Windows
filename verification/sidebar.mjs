// Production DOM only: measure rendered cards (not icons or editor popovers),
// then compare IDs and document positions after closing and reopening the view.
import assert from 'node:assert/strict';
export async function sidebarCheck(page) {
  const button = name => page.getByRole('button',{name,exact:true});
  const count = n => page.waitForFunction(n => document.querySelectorAll('.react-flow__node').length===n,n);
  const saved = () => page.getByText('Saved on this device',{exact:true}).waitFor();
  const fit = async () => {
    await page.locator('.cw-workspace').focus();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+1');
    await page.waitForTimeout(450); // let the fit-view transition finish before capturing
  };
  const geometry = () => page.locator('.react-flow__node').evaluateAll(nodes => {
    const boxes=nodes.map(n=>n.getBoundingClientRect());
    for(let i=0;i<boxes.length;i++){
      const a=boxes[i]; if(!a.width||!a.height)throw Error('Empty card');
      for(const b of boxes.slice(0,i))if(Math.min(a.right,b.right)>Math.max(a.left,b.left)+0.01 && Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+0.01) throw Error('Intersecting cards: '+nodes[i].dataset.id);
    }
    return Object.fromEntries(nodes.map(n=>[n.dataset.id,n.style.transform]));
  });
  await button('Switch project').click();
  const prior = await page.getByRole('menuitemradio',{checked:true}).getAttribute('title');
  await page.getByRole('menuitem',{name:'New canvas project',exact:true}).click();
  const title=page.getByRole('textbox',{name:'Project name',exact:true});
  await title.fill('Canvas placement check'); await title.press('Enter'); await saved(); await count(0);
  let total=0;
  for(const kind of ['Text','Image','Video','Audio','Timeline','Subject','Text','Text','Timeline','Image','Video','Subject']) {
    await button('Add '+kind).click(); await count(++total); await geometry();
    if(total===6)await fit();
  }
  await fit(); await saved();
  await button('Add Video').click(); await count(++total); await saved(); const before=await geometry();
  await button('Undo').click(); await count(total-1);
  await button('Redo').click(); await count(total); await saved();
  assert.deepEqual(await geometry(),before,'Redo changed geometry');
  await page.reload(); await saved(); await count(total); await fit();
  assert.deepEqual(await geometry(),before,'Reload changed geometry');
  await page.screenshot({path:'delivery/windows-sidebar.png'});
  await page.waitForTimeout(900);
  await button('Switch project').click();
  await page.getByRole('menuitemradio',{name:prior,exact:true}).click(); await saved();
  console.log('PASS: six sidebar tools; 13 actual cards; 78 non-intersecting pairs; undo/redo and persisted coordinates');
}
