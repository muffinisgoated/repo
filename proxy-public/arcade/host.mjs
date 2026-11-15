import {cleanSave,storageScript} from './saves.mjs';
import hostConfig from './host-config.js';
const params=new URL(location.href).searchParams,id=params.get('game'),token=params.get('token'),ui=params.get('ui');
const temporary=params.get('temporary')==='1';
const message=document.querySelector('#message');let child,timer,viewportObserver;
function send(type,detail={}){parent.postMessage({arcade:true,id,token,type,...detail},hostConfig.uiOrigin);}
try{
 if(ui!==hostConfig.uiOrigin||!/^[a-f0-9-]{36}$/.test(token||'')||!/^[a-z0-9-]{1,40}$/.test(id||''))throw Error('Invalid Arcade session');
 const catalog=await fetch('./catalog.json',{cache:'no-store'}).then(r=>r.json());const game=catalog.find(g=>g.id===id&&g.type!=='builtin');if(!game||game.disabled===true)throw Error('Game package is unavailable');
 // BEGIN TUNNEL UNITY VALIDATION
 const unity=game.type==='unity-local';
 const beta=game.type==='beta-local';let betaFailed=false;
 if(beta&&(game.releaseStatus!=='beta-local'||game.verified!==false||game.beta?.localOnly!==true||game.url!==`/arcade-beta/runtime/${game.id}/index.beta.html`))throw Error('Invalid local Beta game');
 if(unity&&(game.id!=='tunnel-rush'||game.url!=='/arcade-unity/runtime/tunnel-rush'))throw Error('Invalid Unity game');
 // END TUNNEL UNITY VALIDATION
 const gameHost=game.id==='local-slope'?'slope':Number(game.id.slice(3));
 const expectedOrigin=hostConfig.https?`https://game-${gameHost}.${hostConfig.gameSuffix||'test'}${location.port?':'+location.port:''}`:(game.id==='local-slope'?'http://poxey-game-slope.localhost:12001':`http://poxey-game-${Number(game.id.slice(3))}.localhost:${10000+Number(game.id.slice(3))}`);
 const isolated=beta&&game.runtimeOrigin===expectedOrigin;if(beta&&game.runtimeOrigin&&!isolated)throw Error('Invalid game origin');
 const url=new URL(isolated?'/index.beta.html':game.url,isolated?game.runtimeOrigin:location.origin);if(game.type==='hosted'&&url.protocol!=='https:')throw Error('HTTPS required');
 if(game.type==='local'&&(!url.pathname.startsWith('/arcade/games/')||url.origin!==location.origin))throw Error('Invalid local game');
 child=document.createElement('iframe');child.title=game.name;
 // Local game code receives an opaque origin. Publisher frames retain their own
 // origin for legitimate assets/saves, separate from the browser shell.
 child.setAttribute('sandbox',isolated?'allow-scripts allow-same-origin allow-pointer-lock':(game.type==='local'||game.type==='unity-local'||beta)?'allow-scripts allow-pointer-lock':'allow-scripts allow-same-origin allow-pointer-lock allow-forms');
 child.allow='fullscreen; gamepad';child.allowFullscreen=true;child.referrerPolicy='no-referrer';
 child.onload=()=>{if(game.type==='unity-local'||beta&&betaFailed)return;if(beta)child.focus();message.hidden=true;send('document-loaded');};
 child.onerror=()=>{message.hidden=false;message.textContent='The game could not be loaded.';send('error');};
 if(game.type==='local'){
  let saved=Object.create(null);try{if(!temporary)saved=cleanSave(JSON.parse(localStorage.getItem('poxey-game-'+id)||'{}'))||saved;}catch{}
  if(temporary){
   const value=await new Promise(resolve=>{
    const listener=e=>{if(e.source!==parent||e.origin!==ui||e.data?.action!=='save-state'||e.data.token!==token)return;finish(e.data.value);};
    const finish=value=>{clearTimeout(deadline);removeEventListener('message',listener);resolve(value);};
    const deadline=setTimeout(()=>finish(null),700);
    addEventListener('message',listener);send('load-state');
   });
   saved=cleanSave(value)||saved;
  }
  const html=await fetch(url).then(r=>{if(!r.ok)throw Error('Local game files are unavailable');return r.text();});
  const policy=`default-src 'none'; script-src ${location.origin} 'unsafe-inline'; style-src ${location.origin} 'unsafe-inline'; img-src ${location.origin} data: blob:; font-src ${location.origin} data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri ${location.origin}`;
  child.srcdoc=html.replace(/<head[^>]*>/i,match=>match+'<base href="'+new URL('./',url).href+'"><meta http-equiv="Content-Security-Policy" content="'+policy+'">'+storageScript(saved,token));
  let writes=0,minute=Date.now();addEventListener('message',e=>{if(e.source!==child?.contentWindow||e.origin!=='null'||e.data?.type!=='arcade-save'||e.data.token!==token)return;if(Date.now()-minute>60000){minute=Date.now();writes=0;}if(++writes>200)return;const value=cleanSave(e.data.value);if(value&&temporary){send('save-state',{value});return;}if(value)try{localStorage.setItem('poxey-game-'+id,JSON.stringify(value));send('save-persisted');}catch{}});
 }else if(!unity&&!beta)child.src=url.href;
 if(beta){url.searchParams.set('token',token);const ready=await fetch(url.href,{method:'HEAD',cache:'no-store'});if(!ready.ok)throw Error('The local Beta package is unavailable.');addEventListener('message',e=>{if(e.source!==child?.contentWindow||e.origin!==(isolated?game.runtimeOrigin:'null')||e.data?.betaGame!==true||e.data.token!==token)return;if(e.data.event==='warning'){send('warning',{beta:true,detail:typeof e.data.detail==='string'?e.data.detail.slice(0,700):''});}if(e.data.event==='error'){betaFailed=true;clearTimeout(timer);message.hidden=false;message.textContent='Beta runtime error. Retry or return to Library.';send('error',{beta:true,detail:typeof e.data.detail==='string'?e.data.detail.slice(0,700):''});}});child.src=url.href;}
 // BEGIN TUNNEL UNITY LAUNCH
 if(unity){url.searchParams.set('token',token);const ready=await fetch(url.href,{method:'HEAD',cache:'no-store'});if(!ready.ok)throw Error('Local Unity files are unavailable. Restore the private runtime package.');child.src=url.href;addEventListener('message',e=>{if(e.source!==child?.contentWindow||e.origin!=='null'||e.data?.lab!==true||e.data.token!==token)return;if(['runtime-initialized','load-progress-complete'].includes(e.data.event)){clearTimeout(timer);message.hidden=true;send('document-loaded');}if(e.data.event==='runtime-error'){message.hidden=false;message.textContent='The Unity game could not start. Return to Library or retry.';send('error');}});}
 // END TUNNEL UNITY LAUNCH
 const stage=document.querySelector('#stage');stage.append(child);
 // Fit a publisher's fixed-size embed as a complete rectangle, including its
 // required UI. Never inspect, crop or rewrite the publisher document.
 if(game.viewport){
  const {width,height}=game.viewport;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<320||width>1920||height<240||height>1200)throw Error('Invalid game viewport');
  child.style.cssText=`position:absolute;width:${width}px;height:${height}px;transform-origin:top left`;
  const fit=()=>{const scale=Math.min(1,stage.clientWidth/width,stage.clientHeight/height);child.style.transform=`scale(${scale})`;child.style.left=Math.floor((stage.clientWidth-width*scale)/2)+'px';child.style.top=Math.floor((stage.clientHeight-height*scale)/2)+'px';};
  viewportObserver=new ResizeObserver(fit);viewportObserver.observe(stage);fit();
 }
 timer=setTimeout(()=>{message.hidden=false;message.textContent='Still loading? Return to the Library or retry. A publisher or network restriction may prevent this game from starting.';send('slow');},45000);
 // An iframe load is not proof of interactive gameplay.
 child.addEventListener('load',()=>clearTimeout(timer),{once:true});
 addEventListener('message',e=>{if(e.source!==parent||e.origin!==ui||e.data?.token!==token)return;if(e.data.action==='unload'){clearTimeout(timer);viewportObserver?.disconnect();child.remove();child=null;}});
 addEventListener('pagehide',()=>{clearTimeout(timer);viewportObserver?.disconnect();child?.remove();},{once:true});
}catch(error){message.textContent=error.message;send('error');}
