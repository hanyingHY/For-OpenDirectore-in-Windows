// End-to-end installed-window probe. Only the model responses are a fixture;
// the UI, authenticated transport, native Agent, CLI and project write are real.
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
export async function agentWindow(page, project){
  let calls=0, receipt, fixtureError;
  const server=createServer(async(req,res)=>{try {
    assert.equal(req.headers.authorization,'Bearer fake-test-key');
    assert.match(req.url,/\/chat\/completions$/);
    let raw='';for await(const bytes of req)raw+=bytes;const data=JSON.parse(raw);
    let call;
    if(data.tools?.length){calls++;
      if(calls===1){
        // The model is awaiting a tool decision. Prove the desktop will not
        // present this as an idle process before allowing it to finish.
        const state=await page.evaluate(()=>fetch('/__desktop/activity').then(r=>r.text()));assert.match(state,/Agent: 1;/);
        if(process.env.OD_TEST_HOST_PID) execFileSync('pwsh',['-NoProfile','-File','verification/quit.ps1','-HostId',process.env.OD_TEST_HOST_PID,'-Agents','1'],{timeout:25000,stdio:'inherit'});
        call={name:'bash',arguments:JSON.stringify({command:'opendirector asset write-text --name desktop-plan.md --text "Blue Hour plan"',description:'Save the Blue Hour plan'})};
      } else if(calls===2){const msg=data.messages.find(m=>m.role==='tool'&&m.tool_call_id==='call-1');assert(msg);receipt=JSON.parse(msg.content);assert.equal(receipt.status,'applied');}
    }
    const delta=call?{tool_calls:[{index:0,id:'call-1',type:'function',function:call}]}:{content:'Blue Hour plan saved.'};
    const event=(delta,finish_reason)=>'data: '+JSON.stringify({id:'fixture-'+calls,object:'chat.completion.chunk',created:1,model:'offline-fixture',choices:[{index:0,delta,finish_reason}]})+'\n\n';
    res.writeHead(200,{'Content-Type':'text/event-stream'});res.end(event(delta,null)+event({},call?'tool_calls':'stop')+'data: [DONE]\n\n');
  } catch(err){fixtureError=err;res.writeHead(500);res.end('Fixture expectation failed');}});
  await new Promise((ok,no)=>{server.once('error',no);server.listen(18919,'127.0.0.1',ok)});
  try{
    const catalog=await page.evaluate(async id=>{
      const response=await fetch(`/api/creation/projects/${id}/assistant/skills`,{headers:{'X-OpenDirector-Request':'1'}});
      return [response.status, await response.json()];
    },project);
    assert.equal(catalog[0],200,JSON.stringify(catalog[1]));
    assert(catalog[1].some(skill=>skill.source==='builtin'),'No bundled skills discovered');
    const editor=page.locator('#canvas-assistant [contenteditable="true"]').first();
    if(!await editor.isVisible())await page.locator('.cw-chat-button').click();
    await editor.fill('Save the Blue Hour plan to this project.');
    await page.locator('.cw-assistant-send').click();
    await page.getByText('Blue Hour plan saved.',{exact:true}).first().waitFor({timeout:100000});
    if(fixtureError)throw fixtureError;
    assert.equal(calls,2);assert(receipt.assetId);
    const snapshot=await page.evaluate(async id=>(await fetch('/api/creation/projects/'+id,{headers:{'X-OpenDirector-Request':'1'}})).json(),project);
    assert(snapshot.assets.some(a=>a.id===receipt.assetId&&a.name==='desktop-plan.md'));
    await page.screenshot({path:'delivery/windows-agent-en.png'});
    await editor.press('Escape');
    await page.locator('#canvas-assistant').waitFor({state:'hidden'});
    console.log('PASS: installed chat send → active Agent detected → real CLI write → saved reply and verified project asset');
  }catch(e){
    const detail=(await page.locator('#canvas-assistant').innerText()).slice(-1600);
    throw Error(`Agent fixture calls=${calls}, receipt=${!!receipt}: ${fixtureError??e}; ${detail}`);
  }finally{server.close(); server.closeAllConnections();}
}
