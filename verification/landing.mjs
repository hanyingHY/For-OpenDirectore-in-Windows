// Offline DOM harness for release selection. No network or GitHub privileges.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=await readFile(new URL('../delivery/landing.js',import.meta.url),'utf8');
const base='https://github.com/hanyingHY/For-OpenDirectore-in-Windows/releases';
function row(n,overrides={}) {
  const tag_name=`windows-x64-0.1.4-desktop.${n}`, name=`OpenDirector-0.1.4-desktop.${n}-x64-Setup.exe`;
  return {tag_name,draft:false,prerelease:false,assets:[{name,state:'uploaded',size:100,browser_download_url:`${base}/download/${tag_name}/${name}`}],...overrides};
}
async function run(rows, platform, ua, hints) {
  const nodes=new Map();
  const document={documentElement:{},querySelectorAll:()=>[],querySelector(sel){if(!nodes.has(sel)) nodes.set(sel,{removeAttribute(attr){delete this[attr]}});return nodes.get(sel)}};
  await vm.runInNewContext(code,{document,AbortSignal,navigator:{language:'en-US',platform,userAgent:ua,userAgentData:hints&&{platform,getHighEntropyValues:async()=>hints}},fetch:async()=>({ok:rows!==null,json:async()=>rows})});
  return Object.fromEntries(nodes);
}
const bad=row(100);bad.assets[0].browser_download_url='https://example.org';
let n=await run([row(2),row(20,{draft:true}),row(19,{prerelease:true}),row(12,{assets:[]}),row('0999'),row(25,{draft:undefined}),bad,row(10)],'Win32','Win64; x64',{architecture:'x86',bitness:'64'});
assert.equal(n['#platform'].value,'windows');assert.equal(n['#download'].href,row(10).assets[0].browser_download_url);assert(!n['#download'].hidden);
n['#platform'].value='mac';n['#platform'].onchange();assert(n['#download'].hidden);n['#language'].onclick();assert.match(n['#status'].textContent,/未提供/);
assert.equal(n['#download'].href,undefined);assert(n['#preview-access'].hidden);
for(const [hints,want] of [[undefined,'unknown'],[{architecture:'arm',bitness:'64'},'arm'],[{architecture:'x86',bitness:'32',wow64:true},'windows']]) {
  n=await run([],'Windows','Win64; x64',hints);assert.equal(n['#platform'].value,want);
}
for(const rows of [[],null]){n=await run(rows,'Win32','unknown');assert.equal(n['#platform'].value,'unknown');n['#platform'].value='windows';n['#platform'].onchange();assert(n['#download'].hidden);assert.match(n['#status'].textContent,rows?/No public/:/unavailable/)}
console.log('PASS: public installer identity, version ordering, language, detection fallback and unavailable states');
