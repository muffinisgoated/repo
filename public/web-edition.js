import {createArcadeTelemetry} from './arcade/telemetry.mjs';
import {createSessionPreferences,createTemporaryWallpaperStore} from './features/temporary-session.mjs';
import {revealSetting} from './features/settings-scroll.mjs';
import {createBrowserAccent,mountBrowserAccent,createBrowserPalette,mountBrowserPalette} from './features/browser-appearance.mjs';
import {createTabAppearance,mountTabAppearance} from './features/tab-appearance.mjs';
import {createProxyClient} from './features/proxy-client.mjs';
import {mountSettingsControls} from './features/settings-controls.mjs';
import {focusPageSharing} from './features/page-settings.mjs';
import {createPageReader} from './features/page-context.mjs';
import {mountAssistantSizing} from './features/assistant-panel.mjs';
/* PoxeyX1 Web Edition. Browser shell, logo, CSS and wallpapers sourced from the
 * owner's supplied UI archive. Browser data stays local; no cloud credentials
 * are bundled. Proxy networking is maintained separately. */
'use strict';
let arcadeUI=null,arcadeLoad=0;const proxyClient=createProxyClient();
import {resolveAddress,readPreferences} from './navigation.mjs';
import {BrowserStore} from './features/store.mjs';
import {showLibrary} from './features/library.mjs';
import {validateWallpaper} from './features/custom-wallpapers.mjs';
import {createAssistant} from './features/assistant-ui.mjs';
const storage=createSessionPreferences(window);
const featureStorage=storage;
const arcadeState=new Map();
const arcadeStorage={getItem:key=>arcadeState.get(key)??null,setItem:(key,value)=>arcadeState.set(key,value)};
const arcadeSaves=new Map();
const arcadeTelemetry=createArcadeTelemetry({clientID:proxyClient.clientID});
addEventListener('pagehide',event=>{if(event.persisted)arcadeTelemetry.suspend();else arcadeTelemetry.destroy();});
addEventListener('pageshow',event=>{if(event.persisted)arcadeTelemetry.resume();});
const prefs=readPreferences(storage),browserStore=new BrowserStore(storage,{temporary:true}),webFrames=new Map();
const wallpaperStore=createTemporaryWallpaperStore();
let activeCustom=null,activeWallpaperURL=null,wallpaperEpoch=0,wallpaperQueue=Promise.resolve(),customControls=null,settingsControls=null,settingsGeneration=0;
let assistant=null;const exportURLs=new Set();
const aiSettings=()=>browserStore.settings;
function savePreferences(){return featureStorage.setItem('poxey-web-recovery-v1',JSON.stringify({wallpaper,theme:document.body.dataset.theme||'black'}));}

const $ = id => document.getElementById(id);
const icon = n => `<svg><use href="#i-${n}"></use></svg>`;
const wallpapers = [{"name":"Cosmic Drift","src":"onboarding/wallpapers/cosmic-drift.svg"},{"name":"Alpine Dawn","src":"onboarding/wallpapers/alpine-dawn.svg"},{"name":"Tokyo Afterglow","src":"onboarding/wallpapers/tokyo-afterglow.svg"},{"name":"Neon Arcade","src":"onboarding/wallpapers/neon-arcade.svg"},{"name":"Silk Ribbons","src":"onboarding/wallpapers/aurora.svg"},{"name":"Rainforest Cascade","src":"onboarding/wallpapers/rainforest-cascade.jpg"},{"name":"Lunar Earthrise","src":"onboarding/wallpapers/lunar-earthrise.jpg"},{"name":"Lantern Lane","src":"onboarding/wallpapers/lantern-lane.jpg"},{"name":"Seaside Railway","src":"onboarding/wallpapers/seaside-railway.jpg"},{"name":"Underwater Light","src":"onboarding/wallpapers/underwater-light.jpg"},{"name":"Desert Dunes","src":"onboarding/wallpapers/desert-dunes.jpg"},{"name":"Northern Lights","src":"onboarding/wallpapers/northern-lights.jpg"},{"name":"Fern & Dew","src":"onboarding/wallpapers/fern-dew.jpg"},{"name":"Paper Folds","src":"onboarding/wallpapers/paper-folds.svg"},{"name":"Ink Circle","src":"onboarding/wallpapers/ink-circle.svg"},{"name":"Balance","src":"onboarding/wallpapers/balance.svg"},{"name":"Andromeda","src":"onboarding/wallpapers/andromeda.svg"},{"name":"Blue Hour","src":"onboarding/wallpapers/blue-hour.svg"},{"name":"Blue Ridge","src":"onboarding/wallpapers/blue-ridge.svg"},{"name":"Cloud Nine","src":"onboarding/wallpapers/cloud-nine.svg"},{"name":"Electric Blue","src":"onboarding/wallpapers/electric-blue.svg"},{"name":"Emerald Peaks","src":"onboarding/wallpapers/emerald-peaks.svg"},{"name":"Forest Lake","src":"onboarding/wallpapers/forest-lake.svg"},{"name":"Golden Valley","src":"onboarding/wallpapers/golden-valley.svg"},{"name":"Ink","src":"onboarding/wallpapers/ink.svg"},{"name":"Laser Grid","src":"onboarding/wallpapers/laser-grid.svg"},{"name":"Lavender Fields","src":"onboarding/wallpapers/lavender-fields.svg"},{"name":"Lunar Blue","src":"onboarding/wallpapers/lunar-blue.svg"},{"name":"Metropolis","src":"onboarding/wallpapers/metropolis.svg"},{"name":"Midnight Orbit","src":"onboarding/wallpapers/midnight-orbit.svg"},{"name":"Minimal Sand","src":"onboarding/wallpapers/minimal-sand.svg"},{"name":"Moss","src":"onboarding/wallpapers/moss.svg"},{"name":"Night Windows","src":"onboarding/wallpapers/night-windows.svg"},{"name":"Ocean Mist","src":"onboarding/wallpapers/ocean-mist.svg"},{"name":"Paper Hills","src":"onboarding/wallpapers/paper-hills.svg"},{"name":"Petal Sky","src":"onboarding/wallpapers/petal-sky.svg"},{"name":"Pixel Sunset","src":"onboarding/wallpapers/pixel-sunset.svg"},{"name":"Prism","src":"onboarding/wallpapers/prism.svg"},{"name":"Quiet Dunes","src":"onboarding/wallpapers/quiet-dunes.svg"},{"name":"Rainy Evening","src":"onboarding/wallpapers/rainy-evening.svg"},{"name":"Rose Garden","src":"onboarding/wallpapers/rose-garden.svg"},{"name":"Sakura","src":"onboarding/wallpapers/sakura.svg"},{"name":"Silk","src":"onboarding/wallpapers/silk.svg"},{"name":"Soft Sunrise","src":"onboarding/wallpapers/soft-sunrise.svg"},{"name":"Solar Bloom","src":"onboarding/wallpapers/solar-bloom.svg"},{"name":"Still Water","src":"onboarding/wallpapers/still-water.svg"},{"name":"Ultraviolet","src":"onboarding/wallpapers/ultraviolet.svg"}];
let wallpaper=prefs.wallpaper, tabs=[{id:1,title:'New Tab',view:'home',input:''}], current=1,nextId=2,activeView='home';
const maxTabs=12;
const isPhone=()=>window.matchMedia('(max-width: 700px)').matches;
function toast(s){let el=$('web-toast'); if(!el){el=document.createElement('div');el.id='web-toast';el.className='web-popover';document.body.append(el);}el.textContent=s;el.hidden=false;clearTimeout(el.timer);el.timer=setTimeout(()=>el.hidden=true,4200)}
function currentTab(){return tabs.find(t=>t.id===current)}
function activateTab(id){let t=tabs.find(t=>t.id===id);if(!t)return;current=id;activeView=t.view;assistant?.sourceChanged();renderTabs();renderView();savePreferences();updateBrowserStatus();}
function newTab(){if(tabs.length>=maxTabs)return toast('Maximum 12 tabs in this preview.');const t={id:nextId++,title:'New Tab',view:'home',input:''};tabs.push(t);activateTab(t.id);return t;}
function closeTab(id){
 if(isolated){
  const tab=tabs.find(item=>item.id===id);
  if(tab&&isolatedWorkspace)void fetch('/api/isolation/tab-close',{method:'POST',keepalive:true,
   headers:{'X-Poxey-Workspace':isolatedWorkspace,'X-Poxey-Tab':String(id),
    'X-Poxey-Navigation':String((tab.isolatedVersion||0)+1)}}).catch(()=>{});
 }
 const entry=webFrames.get(id);if(entry){clearTimeout(entry.timer);entry.element.remove();webFrames.delete(id);}tabs=tabs.filter(t=>t.id!==id);if(!tabs.length){tabs=[{id:nextId++,title:'New Tab',view:'home',input:''}]}activateTab(tabs.some(t=>t.id===current)?current:tabs.at(-1).id)}
function renderTabs(){const strip=$('horizontal-tabs');strip.replaceChildren();
 for(const t of tabs){const b=document.createElement('button');b.type='button';b.className='tab-button'+(t.id===current?' active':'');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(t.id===current));b.tabIndex=t.id===current?0:-1;b.innerHTML='<span class="tab-dot" aria-hidden="true"></span><span class="tab-label"></span><span class="close-tab" aria-label="Close tab">×</span>';b.querySelector('.tab-label').textContent=t.title;
 const glyph=b.querySelector('.tab-dot');
 if(t.view==='web'){
  try{glyph.textContent=new URL(t.input).hostname.replace(/^www\./,'').charAt(0).toUpperCase();}catch{}
 }else glyph.innerHTML=icon({home:'home',arcade:'grid',conversations:'sparkle',settings:'settings'}[t.view]||'external');const close=b.querySelector('.close-tab');close.setAttribute('role','button');close.tabIndex=0;close.setAttribute('aria-label','Close tab '+t.title);close.onclick=e=>{e.stopPropagation();closeTab(t.id)};close.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();closeTab(t.id);}};b.onclick=()=>activateTab(t.id);
 b.onkeydown=event=>{
  if(event.target!==b||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const index=tabs.indexOf(t);
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+tabs.length+(event.key==='ArrowLeft'?-1:1))%tabs.length;
  activateTab(tabs[next].id);
  strip.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
 };
 strip.append(b)}
 const selected=strip.querySelector('[aria-selected="true"]');
 if(selected&&strip.scrollWidth>strip.clientWidth)strip.scrollLeft=Math.max(0,selected.offsetLeft-strip.offsetLeft-(strip.clientWidth-selected.offsetWidth)/2);
 const vertical=$('vertical-tabs');vertical.replaceChildren();for(const t of tabs){const b=document.createElement('button');b.className='rail-tab'+(t.id===current?' active':'');b.type='button';b.textContent=t.title;b.onclick=()=>activateTab(t.id);vertical.append(b)}
 const address=$('address');address.value=currentTab()?.view==='web'?(currentTab().input||''):'';
}
function goView(v){const t=currentTab();if(!t)return;t.view=v;t.title={home:'New Tab',arcade:'Arcade',web:'Website',conversations:'Conversations',settings:'Settings'}[v]||'New Tab';activateTab(t.id);}
function clearOverlay(){settingsControls?.destroy();settingsControls=null;settingsGeneration++;customControls?.destroy();customControls=null;arcadeLoad++;arcadeUI?.destroy();arcadeUI=null;$('arcade').hidden=true;document.body.classList.remove('arcade-open');for(const child of $('browser-container').children)child.hidden=true;$('browser-container').style.display='';$('utility-drawer').hidden=true;
 }
function renderView(){clearOverlay();if(activeView==='arcade'){showArcade();return;}if(activeView==='web'){showWebMessage();return;}renderHome();if(activeView==='conversations')openAI();if(activeView==='settings')showSettings();}
function wallpaperSrc(i=wallpaper){return activeWallpaperURL||wallpapers[i]?.src||null}
function applyWallpaper(i){if(!Number.isInteger(i)||i< -1||i>=wallpapers.length)return;wallpaper=i;
 savePreferences();
 const source=wallpaperSrc();
 $('home-pane')?.querySelector('.atelier-home')?.classList.toggle('has-wallpaper',Boolean(source));
 for(const s of document.querySelectorAll('.wallpaper-scene')){s.style.backgroundImage=source?`url("${source}")`:'none';s.style.backgroundSize='cover';s.style.backgroundPosition='center'}
 for(const c of document.querySelectorAll('.wallpaper-caption'))c.textContent=activeCustom?.name||wallpapers[i]?.name||'';
 for(const e of document.querySelectorAll('[data-wallpaper]'))e.classList.toggle('selected',!activeCustom&&Number(e.dataset.wallpaper)===i);
}
function releaseActiveWallpaper(){if(activeWallpaperURL)URL.revokeObjectURL(activeWallpaperURL);activeWallpaperURL=null;activeCustom=null;}
function wallpaperChange(job){wallpaperEpoch++;const work=wallpaperQueue.then(job);wallpaperQueue=work.catch(()=>{});return work;}
async function selectCustomWallpaper(record){return wallpaperChange(async()=>{await validateWallpaper(record.blob);await wallpaperStore.select(record.id);releaseActiveWallpaper();activeCustom=record;activeWallpaperURL=URL.createObjectURL(record.blob);storage.setItem('poxey-custom-wallpaper-mode','custom');applyWallpaper(wallpaper);});}
async function selectBuiltinWallpaper(index){return wallpaperChange(async()=>{let warning='';try{await wallpaperStore.select(null);}catch{warning='Custom storage is unavailable; this choice may be session-only.';}releaseActiveWallpaper();storage.setItem('poxey-custom-wallpaper-mode','builtin');applyWallpaper(index);if(warning)toast(warning);});}
async function removeCustomWallpaper(record){return wallpaperChange(async()=>{const wasActive=await wallpaperStore.remove(record.id);if(wasActive||activeCustom?.id===record.id){releaseActiveWallpaper();storage.setItem('poxey-custom-wallpaper-mode','builtin');applyWallpaper(wallpaper);}});}
async function restoreCustomWallpaper(){if(storage.getItem('poxey-custom-wallpaper-mode')==='builtin')return;const epoch=wallpaperEpoch;try{const record=await wallpaperStore.active();if(!record||epoch!==wallpaperEpoch)return;await validateWallpaper(record.blob);if(epoch!==wallpaperEpoch)return;releaseActiveWallpaper();activeCustom=record;activeWallpaperURL=URL.createObjectURL(record.blob);applyWallpaper(wallpaper);}catch{if(storage.getItem('poxey-custom-wallpaper-mode')==='custom')toast('Your custom wallpaper could not be restored. Check browser storage.');}}
function renderHome(){let pane=$('home-pane');if(!pane){pane=document.createElement('div');pane.id='home-pane';pane.className='home-pane';$('browser-container').append(pane);}pane.hidden=false;pane.innerHTML=`<section class="newtab atelier-home"><div class="wallpaper-scene" aria-hidden="true"></div><div class="home-vignette"></div>
 <div class="atelier-home-content"><h1 class="home-greeting" id="web-greeting"></h1><div class="home-time"><p class="home-date" id="web-date"></p><div class="home-clock" id="web-clock"></div></div>
 <form class="atelier-search" id="web-search-form" role="search">${icon('search')}<input class="home-search" aria-label="Search or enter a website" placeholder="Search or enter a website" autocomplete="off"><kbd>↵</kbd><button type="submit" aria-label="Go">${icon('forward')}</button></form>
 <div class="atelier-shortcuts"><button class="shortcut" data-go="arcade"><span class="shortcut-icon">${icon('grid')}</span><span>Arcade</span></button><button class="shortcut" data-go="conversations"><span class="shortcut-icon">${icon('sparkle')}</span><span>Conversations</span></button><button class="shortcut" data-go="settings"><span class="shortcut-icon">${icon('settings')}</span><span>Settings</span></button><button class="shortcut" data-go="web"><span class="shortcut-icon">${icon('external')}</span><span>Browse</span></button></div>
 <p class="web-home-hint">Web Edition preview · Local development · Isolated webpage runtime</p>
 </div><div class="home-footer"><span class="wallpaper-caption"></span><button type="button" class="customize-home" id="customize-home">${icon('settings')} Customize</button></div></section>`;
 applyWallpaper(wallpaper);updateClock();$('customize-home').onclick=showSettings;
 $('web-search-form').onsubmit=e=>{e.preventDefault();visit(pane.querySelector('.home-search').value)};
 for(const b of pane.querySelectorAll('[data-go]'))b.onclick=()=>goView(b.dataset.go);
}
function updateClock(){const d=new Date();const clock=$('web-clock'),date=$('web-date'),g=$('web-greeting');if(clock)clock.textContent=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});if(date)date.textContent=d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});if(g)g.textContent=d.getHours()<12?'Good morning.':d.getHours()<17?'Good afternoon.':'Good evening.';}
const isolated=window.POXEY_RUNTIME?.isolated===true;
let isolatedWorkspace,openingWorkspace;
async function temporaryIsolationWorkspace(){
 if(isolatedWorkspace)return isolatedWorkspace;
 if(!openingWorkspace)openingWorkspace=(async()=>{
  const response=await fetch('/api/isolation/workspace',{method:'POST',cache:'no-store',
   signal:AbortSignal.timeout(5000),headers:{'X-Poxey-Workspace-Request':'1'}});
  if(!response.ok)throw Error('No temporary workspace');
  const {workspace}=await response.json();
  if(!/^[a-f0-9]{64}$/.test(workspace||''))throw Error('Invalid temporary workspace');
  return isolatedWorkspace=workspace;
 })();
 try{return await openingWorkspace;}finally{openingWorkspace=null;}
}
if(isolated)addEventListener('pagehide',event=>{
 if(!event.persisted&&isolatedWorkspace)void fetch('/api/isolation/close',{method:'POST',keepalive:true,
  headers:{'X-Poxey-Workspace':isolatedWorkspace}}).catch(()=>{});
});
const fixtureRoutes=new URL(location.href).searchParams.get('isolated-fixtures')==='1'?
 window.POXEY_RUNTIME?.fixtureRoutes||{}:null;
if(fixtureRoutes&&window.POXEY_RUNTIME?.fixtureWorkspace)addEventListener('pagehide',event=>{
 if(event.persisted)return;
 void fetch('/api/isolated-fixture/close',{method:'POST',keepalive:true,
  headers:{'X-Poxey-Fixture-Workspace':window.POXEY_RUNTIME.fixtureWorkspace}}).catch(()=>{});
});
const proxyOriginFor=url=>isolated?null:fixtureRoutes?fixtureRoutes[new URL(url).origin]:window.POXEY_RUNTIME?.proxyOrigin;
function visit(v,tab=currentTab(),historyAction='push'){
 try{v=resolveAddress(v,browserStore.settings.searchEngine);}catch(error){toast(error.message);return;}
 const origin=proxyOriginFor(v);
 let entry=webFrames.get(tab.id);
 if(entry&&(isolated||entry.failed||entry.origin!==origin)){
  entry.element.remove();clearTimeout(entry.timer);webFrames.delete(tab.id);entry=null;
 }
 if((fixtureRoutes||isolated)&&historyAction!=='replace')tab.fixtureRedirects=0;
 if((fixtureRoutes||isolated)&&historyAction!=='traverse'){
  const history=tab.isolatedHistory??={urls:[],index:-1};
  if(historyAction==='replace'&&history.index>=0)history.urls[history.index]=v;
  else if(history.urls[history.index]!==v){
   history.urls.splice(history.index+1);
   history.urls.push(v);
   if(history.urls.length>100)history.urls.shift();
   history.index=history.urls.length-1;
  }
 }
 if(isolated)tab.isolatedSource=historyAction==='replace'?'':tab.committedUpstream||'';
 tab.view='web';tab.title=v.length>26?v.slice(0,24)+'…':v;tab.input=v;
 if(entry?.ready&&!entry.failed){
  // Invalidate page context before navigating on the existing controller.
  entry.documentAvailable=false;
  entry.note.hidden=true;
  entry.iframe.contentWindow.postMessage({id:String(tab.id),action:'navigate',url:v},entry.origin);
 }
 if(current===tab.id){assistant?.sourceChanged();activateTab(tab.id);}
}
function showWebMessage(){
 const tab=currentTab();
 if(!tab.input){goView('home');return;}
 const origin=proxyOriginFor(tab.input);
 let entry=webFrames.get(tab.id);
 if(entry){entry.element.hidden=false;return;}
 const section=document.createElement('section');section.className='web-tab-panel';
 const note=document.createElement('p');note.className='web-load-note';note.textContent='Starting isolated page reader…';
 if(isolated){
  section.append(note);$('browser-container').append(section);
  entry={element:section,note,ready:false};
  webFrames.set(tab.id,entry);
  const destination=tab.input,version=tab.isolatedVersion=(tab.isolatedVersion||0)+1;
  void (async()=>{
   try{
    let response;
    for(let attempt=0;attempt<2;attempt++){
     const workspace=await temporaryIsolationWorkspace();
     if(webFrames.get(tab.id)!==entry)return;
     response=await fetch('/api/isolation/route',{method:'POST',cache:'no-store',signal:AbortSignal.timeout(10000),
      headers:{'X-Poxey-Workspace':workspace,'X-Poxey-Destination':destination,'X-Poxey-Tab':String(tab.id),'X-Poxey-Navigation':String(version),'X-Poxey-Source':tab.isolatedSource||''}});
     if(response.status!==410)break;
     if(isolatedWorkspace===workspace)isolatedWorkspace=null;
    }
    if(!response.ok)throw Error('Isolated route denied');
    const route=await response.json(),url=new URL(route.origin);
    if(url.protocol!=='https:'||!/^r-[a-f0-9-]{36}$/.test(url.hostname.split('.')[0])||
      url.hostname.split('.').slice(1).join('.')!==(window.POXEY_RUNTIME.contentSuffix||'test')||url.port!==location.port||
      url.origin!==route.origin||!/^[a-f0-9]{64}$/.test(route.capability||''))throw Error('Invalid route');
    if(webFrames.get(tab.id)!==entry||tab.input!==destination)return;
    mountWebFrame(tab,section,note,route.origin,route.capability);
   }catch{
    if(webFrames.get(tab.id)===entry){
     entry.failed=true;note.textContent='This destination could not be opened in an isolated route. Try reloading the tab.';
    }
   }
  })();
  return;
 }
 if(!origin){
  note.textContent=fixtureRoutes?'This destination has no isolated route in the local test build.':
   'The page reader is not configured. Start this project with npm start.';
  section.append(note);$('browser-container').append(section);
  webFrames.set(tab.id,{element:section,failed:true});
  return;
 }
 mountWebFrame(tab,section,note,origin);
}
function mountWebFrame(tab,section,note,origin,capability){
 const iframe=document.createElement('iframe');iframe.title=tab.title;iframe.className='web-page-frame';iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-pointer-lock');iframe.allow='autoplay; fullscreen; encrypted-media; gamepad';iframe.referrerPolicy='no-referrer';const bridgeURL=new URL(proxyClient.frameURL(origin,location.origin,tab.id));
 if(isolated)bridgeURL.searchParams.set('isolated','1');
 if(fixtureRoutes){
  bridgeURL.searchParams.set('origin-proof','1');
  const fragment=new URLSearchParams(bridgeURL.hash.slice(1));
  const workspace=window.POXEY_RUNTIME.fixtureWorkspace;
  if(workspace)fragment.set('workspace',workspace);
  bridgeURL.hash=fragment.toString();
 }
 iframe.src=bridgeURL.href;
 section.append(note,iframe);if(!section.isConnected)$('browser-container').append(section);
 const entry={element:section,iframe,note,origin,capability,upstream:new URL(tab.input).origin,ready:false,timer:setTimeout(()=>{entry.failed=true;note.hidden=false;note.textContent='The page reader did not start. Reload this tab. A blocked or rate-limited website may require waiting or another site.';},35000)};webFrames.set(tab.id,entry);
}
window.addEventListener('message',event=>{
 if(!event.data || typeof event.data!=='object')return;
 const id=Number(event.data.id),entry=webFrames.get(id),tab=tabs.find(t=>t.id===id);
 if(!entry?.iframe || !tab || event.origin!==entry.origin || event.source!==entry.iframe.contentWindow)return;
 if(isolated&&event.data.type==='isolate-ready'){
  if(entry.capability){
   event.source.postMessage({id:String(id),action:'isolate',capability:entry.capability},event.origin);
   entry.capability=null;
  }
  return;
 }
 if((fixtureRoutes||isolated)&&event.data.type==='origin-proof-navigate'){
  if(!entry.ready||current!==id||typeof event.data.url!=='string')return;
  if(event.data.redirect===true){
   tab.fixtureRedirects=(tab.fixtureRedirects||0)+1;
   if(tab.fixtureRedirects>10){entry.note.hidden=false;entry.note.textContent='Too many isolated redirects.';return;}
   visit(event.data.url,tab,'replace');
  }else visit(event.data.url,tab);
  return;
 }
 if(event.data.type==='relay-request'){
  if(fixtureRoutes||isolated)return;
  const {operation,nonce}=event.data;
  if(!/^[a-f0-9-]{36}$/.test(nonce||'')||!['session','ticket'].includes(operation))return;
  const endpoint=operation==='session'?'/api/relay/session':'/api/relay/ticket/'+(proxyClient.clientID||'ungrouped');
  const source=event.source, origin=event.origin;
  void (async()=>{
   let result;
   try{
    const response=await fetch(endpoint,{method:'POST',headers:{'X-Poxey-Relay':'1'},cache:'no-store',signal:AbortSignal.timeout(4000)});
    const data=await response.json();
    result=response.ok?{ticket:data.ticket}:response.status===428&&/^[a-f0-9]{24}$/.test(data.code||'')?
     {error:'Authorize local browsing in Terminal: node relay-operator.mjs '+data.code+' . Then reload this PoxeyX1 tab.'}:
     {error:'Relay authorization expired or is unavailable. Reload this PoxeyX1 tab.'};
   }catch{result={error:'The local relay approval service could not be reached.'};}
   if(webFrames.get(id)===entry&&entry.iframe.contentWindow===source)source.postMessage({type:'relay-reply',nonce,...result},origin);
  })();
 }
 else if(event.data.type==='ready'){clearTimeout(entry.timer);entry.ready=true;entry.failed=false;entry.note.hidden=true;entry.iframe.contentWindow.postMessage({id:String(id),action:'navigate',url:tab.input},event.origin);}
 else if(event.data.type==='document-state'){
  if(/^[a-f0-9-]{36}$/.test(event.data.documentID||'')&&Number.isSafeInteger(event.data.documentRevision)&&event.data.documentRevision>=0){entry.documentID=event.data.documentID;entry.documentRevision=event.data.documentRevision;entry.documentAvailable=event.data.documentAvailable===true;assistant?.sourceChanged();}
 }else if(event.data.type==='navigation'){
  try{const target=resolveAddress(event.data.url);if(fixtureRoutes||isolated){if(new URL(target).origin!==entry.upstream)return;tab.committedUpstream=entry.upstream;const history=tab.isolatedHistory;if(history?.urls[history.index]===tab.input)history.urls[history.index]=target;}tab.input=target;tab.title=String(event.data.title||new URL(tab.input).hostname).slice(0,160);assistant?.sourceChanged();if(current===id)renderTabs();browserStore.recordVisit(tab.input,event.data.title);savePreferences();updateBrowserStatus();}catch{}
 }else if(event.data.type==='recovered'){entry.note.hidden=true;}else if(event.data.type==='error'){clearTimeout(entry.timer);entry.failed=!entry.ready;entry.note.hidden=false;entry.note.textContent=String(event.data.message||'Page reader unavailable').slice(0,250);try{const link=document.createElement('a');link.href=resolveAddress(tab.input);link.target='_blank';link.rel='noopener noreferrer';link.textContent=' Open direct site';entry.note.append(link);}catch{}}
});
function pageAction(action){
 const tab=currentTab(),entry=webFrames.get(current);
 if((fixtureRoutes||isolated)&&action!=='reload'){
  const history=tab.isolatedHistory,offset=action==='back'?-1:1;
  const target=history?.urls[history.index+offset];
  if(!target){toast('This tab has no page navigation yet.');return;}
  history.index+=offset;visit(target,tab,'traverse');
 }else if(isolated&&tab?.input)visit(tab.input,tab,'traverse');
 else if(entry?.ready)entry.iframe.contentWindow.postMessage({id:String(current),action},entry.origin);
 else if(action==='reload'){if(entry){clearTimeout(entry.timer);entry.element.remove();webFrames.delete(current);}renderView();}
 else toast('This tab has no page navigation yet.');
}
function openAI(){if(document.body.classList.contains('arcade-open')){goView('conversations');return;}$('ai-panel').hidden=false;document.body.classList.add('ai-open');assistant.open();}
function closeAI(){assistant?.cancelSelectionPreview();$('ai-panel').hidden=true;document.body.classList.remove('ai-open','ai-workspace')}
function aiNoop(){assistant.send();}
function drawer(title){settingsControls?.destroy();settingsControls=null;settingsGeneration++;customControls?.destroy();customControls=null;$('utility-drawer').hidden=false;$('utility-drawer').dataset.view=title.toLowerCase();$('drawer-eyebrow').textContent='POXEYX1';$('drawer-title').textContent=title;return {title:$('drawer-title'),body:$('drawer-content')};}
function openLibrary(view='Bookmarks'){showLibrary({store:browserStore,drawer,onOpen:url=>{if(newTab())visit(url);},onExport:exportBookmarks,onSettings:showSettings},view);}
function exportBookmarks(text){const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));exportURLs.add(url);const a=document.createElement('a');a.href=url;a.download='PoxeyX1-Bookmarks.json';document.body.append(a);a.click();a.remove();setTimeout(()=>{URL.revokeObjectURL(url);exportURLs.delete(url);},30000);toast('Bookmark export requested. Your browser confirms whether the file is saved.');}
function toggleBookmark(){const tab=currentTab();if(tab?.view!=='web'||!tab.input)return openLibrary('Bookmarks');try{const existing=browserStore.bookmarks.find(b=>{const a=new URL(b.url),c=new URL(tab.input);a.hash='';c.hash='';return a.href===c.href;});if(existing){browserStore.removeBookmark(existing.id);toast('Bookmark removed.');}else{browserStore.addBookmark(tab.input,tab.title);toast('Bookmark saved on this device.');}updateBrowserStatus();}catch(error){toast(error.message);}}
function updateBrowserStatus(){$('status-right').textContent='Temporary session';$('btn-bookmark').setAttribute('aria-pressed',String(browserStore.isBookmarked(currentTab()?.input||'')));}
let settingsScroll=0;
async function showSettings(){const {body}=drawer('Settings'),generation=settingsGeneration;body.textContent='Loading settings…';let settingsHTML,mountCustomWallpapers;try{[{settingsHTML},{mountCustomWallpapers}]=await Promise.all([import('./features/settings-ui.mjs'),import('./features/wallpaper-ui.mjs')]);}catch{if(generation===settingsGeneration)body.textContent='Settings could not be loaded. Try again.';return;}if(generation!==settingsGeneration)return;body.innerHTML=settingsHTML({temporary:true});
 try{settingsControls=mountSettingsControls({root:body,store:browserStore,temporary:true,onChange:(key,value)=>{
 if(['cloudAI','pageAI','documentAI'].includes(key)&&!value)assistant?.permissionsChanged();
 if(key==='cloudAI'&&!$('ai-panel').hidden)void assistant?.open();
 if(key==='researchAI'&&!value)assistant?.stop();
 }});}catch(error){body.textContent='Settings controls could not be initialized. '+(/^Settings could not initialize: missing [a-z-]+$/.test(error.message)?error.message+'. ':'')+'No permissions were changed. Close this panel and try again.';return;}
 for(const [id,view]of[['settings-bookmarks','Bookmarks'],['settings-history','History']])$(id).onclick=()=>openLibrary(view);
 const themeButtons=body.querySelectorAll('[data-appearance]');
 const syncTheme=()=>themeButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.appearance===document.body.dataset.theme)));
 for(const button of body.querySelectorAll('[data-settings-jump]')){
  button.onclick=()=>{
   const section=$(button.dataset.settingsJump);
   revealSetting(body,section);
   section?.querySelector('h3')?.focus({preventScroll:true});
  };
 }
 const refreshAccent=mountBrowserAccent(body,browserAccent);
 const refreshTabControls=mountTabAppearance(body.querySelector('.tab-appearance'),tabAppearance);
 const refreshPalette=mountBrowserPalette(body,browserPalette,()=>{
  const accentSaved=browserAccent.save(''),tabsSaved=tabAppearance.save({});
  document.body.dataset.theme='black';
  const themeSaved=savePreferences();
  tabAppearance.apply();syncTheme();refreshTabControls();refreshAccent();
  return accentSaved&&tabsSaved&&themeSaved;
 });
 syncTheme();
 for(const button of themeButtons)button.onclick=()=>{
  document.body.dataset.theme=button.dataset.appearance;
  savePreferences();
  tabAppearance.apply();
  syncTheme();
  refreshTabControls();refreshPalette();
 };
 const grid=$('web-wallpapers');
 const solid=document.createElement('button');solid.type='button';solid.className='web-card solid-wallpaper';solid.dataset.wallpaper='-1';solid.textContent='No wallpaper';solid.onclick=()=>{void selectBuiltinWallpaper(-1).catch(e=>toast(e.message));};grid.append(solid);
 wallpapers.forEach((w,i)=>{const b=document.createElement('button');b.type='button';b.className='web-card';b.dataset.wallpaper=i;const img=document.createElement('img');img.src=w.src;img.alt='';img.loading='lazy';const title=document.createElement('strong');title.textContent=w.name;b.append(img,title);b.onclick=()=>{void selectBuiltinWallpaper(i).catch(e=>toast(e.message));};grid.append(b);});applyWallpaper(wallpaper);
 body.scrollTop=settingsScroll;
 customControls=mountCustomWallpapers($('custom-wallpaper-settings'),{store:wallpaperStore,temporary:true,activeID:()=>activeCustom?.id,onApply:selectCustomWallpaper,onRemove:removeCustomWallpaper,onReset:()=>selectBuiltinWallpaper(-1)});
}
async function showArcade(){const generation=arcadeLoad;closeAI();document.body.classList.add('arcade-open');$('arcade').hidden=false;try{const {mountArcade}=await import('./arcade/ui.mjs');if(generation!==arcadeLoad||activeView!=='arcade')return;arcadeUI=mountArcade($('arcade'),{onExit:()=>goView('home'),storage:arcadeStorage,saves:arcadeSaves,telemetry:arcadeTelemetry,temporary:true});}catch{if(generation===arcadeLoad)$('arcade').textContent='Arcade could not be opened. Use a new tab to return to browsing.';}}
// Actual desktop shell controls
$('top-new-tab').onclick=newTab;$('side-new-tab').onclick=newTab;
$('nav-back').onclick=()=>pageAction('back');$('nav-forward').onclick=()=>pageAction('forward');$('nav-reload').onclick=()=>activeView==='web'?pageAction('reload'):renderView();
$('btn-arcade').onclick=()=>goView('arcade');$('btn-ai').onclick=()=>{$('ai-panel').hidden?openAI():closeAI()};$('rail-open-workspace').onclick=()=>goView('conversations');
$('btn-settings').onclick=showSettings;$('drawer-close').onclick=()=>{if($('utility-drawer').dataset.view==='settings')settingsScroll=$('drawer-content').scrollTop;settingsControls?.destroy();settingsControls=null;settingsGeneration++;customControls?.destroy();customControls=null;$('utility-drawer').hidden=true;$('btn-settings').focus();};
$('utility-drawer').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();$('drawer-close').click();}});
$('ai-close').onclick=closeAI;$('ai-expand').setAttribute('aria-pressed','false');$('ai-expand').onclick=()=>{document.body.classList.toggle('ai-workspace');$('ai-expand').setAttribute('aria-pressed',String(document.body.classList.contains('ai-workspace')));openAI()};const releaseAssistantSizing=mountAssistantSizing({panel:$('ai-panel'),handle:$('ai-resize'),storage});addEventListener('pagehide',e=>{if(!e.persisted)releaseAssistantSizing();});$('ai-send').onclick=aiNoop;
$('ai-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if($('ai-send').dataset.busy!=='true')aiNoop()}});
$('ai-history').onclick=()=>assistant.history();

$('btn-bookmark').onclick=toggleBookmark;$('btn-library').onclick=()=>openLibrary('Bookmarks');$('btn-history').onclick=()=>openLibrary('History');
$('address').addEventListener('keydown',e=>{if(e.key==='Enter')visit(e.currentTarget.value)});
$('quick-popover-close').onclick=()=>$('quick-popover').hidden=true;
function handleShortcut(e){const command=e.ctrlKey||e.metaKey,alt=e.altKey&&!command;const key=e.key.toLowerCase();let action=null;if((command||alt)&&!e.shiftKey){if(key==='t')action=newTab;else if(key==='w')action=()=>closeTab(current);else if(key==='l')action=()=>{$('address').focus();$('address').select();};else if(key==='r')action=()=>activeView==='web'?pageAction('reload'):renderView();}if(alt&&key==='b'||command&&e.shiftKey&&key==='b')action=()=>openLibrary('Bookmarks');if(alt&&key==='h'||command&&key==='y')action=()=>openLibrary('History');if((e.ctrlKey&&e.key==='Tab')||(alt&&['PageUp','PageDown'].includes(e.key)))action=()=>{const index=tabs.findIndex(t=>t.id===current),step=e.shiftKey||e.key==='PageUp'?-1:1;activateTab(tabs[(index+step+tabs.length)%tabs.length].id);};if(action){e.preventDefault();if(!e.repeat)action();return true;}return false;}
window.addEventListener('keydown',e=>{handleShortcut(e)});
$('onboarding').hidden=true;
$('status-left').innerHTML='<span class="status-dot"></span> Web Edition · Local development';
$('status-right').hidden=false;
document.body.dataset.theme=prefs.theme;
const browserPalette=createBrowserPalette(featureStorage,document.body);
const browserAccent=createBrowserAccent(featureStorage,document.body);
const tabAppearance=createTabAppearance({storage:featureStorage,body:document.body});

const pageReader=createPageReader({getTab:currentTab,getEntry:id=>webFrames.get(id),getSettings:aiSettings,origin:()=>window.POXEY_RUNTIME?.proxyOrigin});assistant=createAssistant({getSettings:aiSettings,getPageContext:(question,options)=>pageReader.read(question,options),validatePageContext:context=>pageReader.isCurrent(context),revalidatePageContext:(context,question,options)=>pageReader.verify(context,question,options),stopPageContext:()=>pageReader.stop(),getActiveSource:()=>({tabID:String(currentTab()?.id||''),url:currentTab()?.input,title:currentTab()?.title}),getSelectedText:options=>pageReader.readSelection(options),onOpenSettings:async setting=>{await showSettings();focusPageSharing(document.getElementById('drawer-content'),setting||'feature-page-ai');}});closeAI();activateTab(current);void restoreCustomWallpaper();setInterval(()=>{if(!document.hidden&&activeView==='home')updateClock();},30000);addEventListener('visibilitychange',()=>{if(!document.hidden)updateClock();});addEventListener('pagehide',()=>{assistant.dispose();for(const url of exportURLs)URL.revokeObjectURL(url);});

// Back/forward cache retains the live Settings DOM and its handlers.
addEventListener('pagehide',event=>{if(event.persisted)return;customControls?.destroy();customControls=null;releaseActiveWallpaper();});
