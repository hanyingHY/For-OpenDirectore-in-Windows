// Classic script also works when the preview folder is opened via file://.
(async()=>{
// Public links must come from an actual stable release, not a draft URL or a guessed EXE.
const repo='hanyingHY/For-OpenDirector', base=`https://github.com/${repo}/releases`;
const platform=document.querySelector('#platform'), status=document.querySelector('#status');
const cta=document.querySelector('#download'), notes=document.querySelector('#notes'), language=document.querySelector('#language');
const labels=[...document.querySelectorAll('[data-en]')].map(el=>[el,el.textContent]);
let en=!navigator.language.toLowerCase().startsWith('zh'), state='loading', release;
const ua=navigator.userAgentData?.platform || navigator.platform || '';
// Reduced Windows UA strings can advertise x64 on ARM hardware. Prefer
// reported architecture/bitness; otherwise let the user choose explicitly.
platform.value=/Mac/i.test(ua)?'mac':/Linux/i.test(ua)?'linux':'unknown';
let manual=false;
async function recommend(){
  if(!/Win/i.test(ua)||!navigator.userAgentData?.getHighEntropyValues) return;
  try {
    const {architecture,bitness,wow64}=await navigator.userAgentData.getHighEntropyValues(['architecture','bitness','wow64']);
    if(manual) return;
    if(architecture==='arm') platform.value='arm';
    else if(architecture==='x86' && (bitness==='64'||wow64===true)) platform.value='windows';
    else if(architecture==='x86' && bitness==='32') platform.value='arm';
    render();
  } catch { /* Client hints are optional. Manual selection always works. */ }
}
function render(){
  document.documentElement.lang=en?'en':'zh-CN'; language.textContent=en?'中文':'English'; language.lang=en?'zh-CN':'en';
  for(const [el,zh] of labels) el.textContent=en?el.dataset.en:zh;
  const win=platform.value==='windows', available=win&&release;
  document.querySelector('#preview-access').hidden=!win;
  cta.hidden=notes.hidden=!available;
  const t=(cn,eng)=>en?eng:cn;
  status.textContent=platform.value==='unknown'?t('无法确定架构，请手动选择。','Choose your platform and architecture.'):
    !win?t('本 Windows 发行项目未提供此安装包。','This Windows distribution does not provide that build.'):
    state==='loading'?t('正在核对公开版本…','Checking public releases…'):
    state==='error'?t('无法核对发布状态，请查看公开发布列表。','Release status unavailable. Check the public releases list.'):
    !available?t('尚无公开稳定安装包。预览版与测试见下方说明。','No public stable installer yet. See Preview below for access and test details.'):
    t('Windows x64 稳定版 · ','Stable Windows x64 · ')+release.version;
  if(available){cta.href=release.url; notes.href=release.notes; cta.textContent=t('下载 Windows 安装包 ↓','Download Windows installer ↓');}
  else {cta.removeAttribute('href');notes.removeAttribute('href');}
}
language.onclick=()=>{en=!en;render()};platform.onchange=()=>{manual=true;render()};render();
void recommend();
try {
  const r=await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100`,{signal:AbortSignal.timeout(8000)});
  if(!r.ok) throw Error();
  const candidates=[];
  for(const row of await r.json()){
    const m=/^windows-x64-((0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})-desktop\.(0|[1-9]\d{0,5}))$/.exec(row.tag_name);
    if(!m||row.draft!==false||row.prerelease!==false) continue;
    const name=`OpenDirector-${m[1]}-x64-Setup.exe`, url=`${base}/download/${row.tag_name}/${name}`;
    if(row.assets?.some(a=>a.name===name&&a.browser_download_url===url&&a.state==='uploaded'&&a.size>0))
      candidates.push({url,version:m[1],parts:m.slice(2).map(Number),notes:`${base}/tag/${row.tag_name}`});
  }
  candidates.sort((a,b)=>{for(let i=0;i<4;i++)if(a.parts[i]!==b.parts[i])return b.parts[i]-a.parts[i];return 0});
  release=candidates[0]; state='ready';
} catch {state='error'}
render();
})();
