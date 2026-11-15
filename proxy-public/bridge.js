import {createPageLifecycle} from './page-lifecycle.mjs'; // Ephemeral AI document binding
import {extractPageWithFrames} from './active-context.mjs'; // AI automatic text boundary
import {extractPage} from './page-evidence.mjs'; // AI page evidence boundary
import {extractSelection,extractDocument} from './selection-evidence.mjs'; // Explicit selection boundary
import {resolveLink} from './link-navigation.mjs';
import {watchPage,needsComposer} from './load-watchdog.mjs';
import {activeWorker,controllerReady,registeredWorker} from './worker-startup.mjs';
const host=new URL(location.href),uiOrigin=host.searchParams.get('ui'),id=host.searchParams.get('id');
// BEGIN OPERATIONAL CLIENT GROUPING
const frameParams=new URLSearchParams(location.hash.slice(1));
const grouping=frameParams.get('client');
const clientID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(grouping||'')?grouping:null;
if(location.hash)history.replaceState(null,'',location.pathname+location.search);
// The pinned libcurl transport requires a trailing slash and appends target paths.
const wispEndpoint=new URL(clientID?'/wisp/'+clientID+'/':'/wisp/',location.origin);wispEndpoint.protocol=location.protocol==='https:'?'wss:':'ws:';
// END OPERATIONAL CLIENT GROUPING
const label=document.querySelector('#state');let frame=null, latest=null;
function notify(type,details={}){parent.postMessage({type,id,...details},uiOrigin);}
function validURL(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&u.href.length<=4096?u.href:null;}catch{return null;}}
function failure(message){label.hidden=false;label.textContent=message;notify('error',{message});}
const isolated=host.searchParams.get('isolated')==='1';
if((!isolated&&uiOrigin!=='http://127.0.0.1:8800')||!/^\d{1,5}$/.test(id||''))throw Error('Invalid parent');
function relayCall(operation){
 return new Promise((resolve,reject)=>{
  const nonce=crypto.randomUUID();
  const timer=setTimeout(()=>{removeEventListener('message',reply);reject(Error('Relay authorization timed out.'));},5000);
  function reply(event){
   if(event.source!==parent||event.origin!==uiOrigin||event.data?.type!=='relay-reply'||event.data.nonce!==nonce)return;
   clearTimeout(timer);removeEventListener('message',reply);
   if(event.data.error)reject(Error(event.data.error));else resolve(event.data.ticket);
  }
  addEventListener('message',reply);
  notify('relay-request',{operation,nonce});
 });
}
async function legacyTransport(){
 const {default:LibcurlClient,setRelayWebSocket}=await import('/transport/index.mjs');
 setRelayWebSocket(async endpoint=>{
 if(endpoint!==wispEndpoint.href)throw Error('Unexpected relay endpoint');
 const ticket=await relayCall('ticket');
 if(!/^[a-f0-9]{64}$/.test(ticket||''))throw Error('Invalid relay ticket');
 const url=new URL(endpoint);url.searchParams.set('ticket',ticket);
 return new WebSocket(url);
});
 return new LibcurlClient({wisp:wispEndpoint.href,connections:[8,4,3]});
}
function routeCapability(){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{removeEventListener('message',receive);reject(Error('Isolated route authorization expired.'));},5000);
  function receive(event){
   if(event.source!==parent||event.origin!==uiOrigin||event.data?.id!==id||event.data.action!=='isolate'||
     !/^[a-f0-9]{64}$/.test(event.data.capability||''))return;
   clearTimeout(timer);removeEventListener('message',receive);resolve(event.data.capability);
  }
  addEventListener('message',receive);
  notify('isolate-ready');
 });
}
async function timeout(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('The page reader took too long to start. Reload this tab.')),ms);})]);}finally{clearTimeout(timer);}}
let pendingFixtureNavigation=null,previousDocument=null,failedDocument=null;
const pageLifecycle=createPageLifecycle({notify:state=>notify('document-state',state)});
function startLoading(){failedDocument=null;if(frame)frame.element.style.visibility='';pageLifecycle.invalidate();try{previousDocument=frame?.element.contentDocument;}catch{previousDocument=null;}loading.start();}
const loading=watchPage({onTimeout:()=>failure('This website has not finished becoming usable. Reload this tab or open the direct site. Access checks or unsupported browser features may prevent loading.'),onReady:reported=>{label.hidden=true;if(reported)notify('recovered');}});
function checkUsable(){try{const doc=frame.element.contentDocument;if(!doc||doc===previousDocument||doc.readyState==='loading'||frame.element.contentWindow.location.href==='about:blank')return;
 const current=validURL($scramjet.unrewriteUrl(frame.element.contentWindow.location.href,frame.context));
 if(doc===failedDocument)return;
 if(/^Internal Service Worker Error:|^The page reader session was interrupted\./i.test(doc.body?.textContent?.trimStart()||'')){
  failedDocument=doc;loading.cancel();pageLifecycle.invalidate();frame.element.style.visibility='hidden';
  failure('This website could not be reached. Reload the tab or try again in a moment.');return;
 }
 if(needsComposer(current)&&!doc.querySelector('#prompt-textarea,#mobile-composer-prompt,textarea[placeholder="Ask ChatGPT"]'))return;loading.ready();}catch{}}
let startupPhase='authorizing local relay';
try{
 const proof=isolated?(await import('/isolation-config.js')).default:host.searchParams.get('origin-proof')==='1'?(await import('/origin-proof-config.js')).default:null;
 if(isolated&&(proof.uiOrigin!==uiOrigin||!proof.isolated))throw Error('Invalid isolated shell');
 const capability=isolated?await routeCapability():frameParams.get('workspace');
 if(!proof?.broker)await relayCall('session');
 startupPhase='registering page worker';
 const serviceWorker=navigator.serviceWorker;
 const workerURL=new URL('/sw.js?scope=pages',location.href).href;
 const registered=await timeout(serviceWorker.register(workerURL,{scope:'/~/sj/',updateViaCache:'none'}),15000);
 startupPhase='waiting for the page worker to activate';
 const registration=await registeredWorker(registered);
 const transport=proof?.broker?new (await import('/fixture-transport.mjs')).FixtureTransport(capability,{isolated}):await legacyTransport();
 const controller=new $scramjetController.Controller({serviceworker:activeWorker(registration),transport});
 navigator.serviceWorker.addEventListener('message',event=>{
  if(!event.data?.$controller$swrevive || event.source!==registration.active)return;
  if(event.data.poxeyPrefix && !frame?.prefix.startsWith(event.data.poxeyPrefix))return;
  // The upstream five-second revival guard can outlive a backgrounded iframe.
  // A routing request is already waiting, so recover its port immediately.
  controller.serviceWorkerController=event.source;
  controller.setupMessagePort();
 });
 startupPhase='connecting page engine';await controllerReady(controller,registration);frame=controller.createFrame(document.querySelector('#page'),{plugins:[]});
 const handoffs=new Map();
 function browserNavigation(request){
  return request.mode==='navigate'&&request.rawDestination==='iframe'&&
   request.rawUrl.origin===location.origin&&request.rawUrl.pathname.startsWith(frame.prefix);
 }
 function rememberHandoff(request,url,redirect){
  if(!url||!browserNavigation(request))return;
  if(handoffs.size>=16)handoffs.delete(handoffs.keys().next().value);
  handoffs.set(request.rawUrl.href,{url,redirect,expires:performance.now()+5000});
 }
 if(isolated)$scramjet.Tap.tap(frame.hooks.fetch.intercept,({request,parsed},props)=>{
  if(parsed.url.origin===proof.upstream||!['http:','https:'].includes(parsed.url.protocol))return;
  if(request.mode!=='navigate'&&['GET','HEAD'].includes(request.method)&&
    !['document','iframe','frame','worker','sharedworker','serviceworker'].includes(request.rawDestination))return;
  if(request.method==='GET')rememberHandoff(request,validURL(parsed.url.href),false);
  props.response={status:409,statusText:'Cross-site request blocked',body:'Cross-site request requires its own isolated route.',
   headers:$scramjet.ScramjetHeaders.fromRawHeaders([['Content-Type','text/plain; charset=utf-8'],['Cache-Control','no-store']])};
 });
 if(proof?.broker)$scramjet.Tap.tap(frame.hooks.fetch.preresponse,({request,parsed},{response})=>{
  const index=response.rawHeaders.findIndex(([name])=>name.toLowerCase()==='x-poxey-fixture-location');
  if(index<0)return;
  const [,value]=response.rawHeaders.splice(index,1)[0],url=validURL(value);
  if(isolated){rememberHandoff(request,url,true);return;}
  if(request.mode==='navigate'&&request.rawDestination==='iframe'&&request.method==='GET'&&
     parsed.url.href===pendingFixtureNavigation&&url&&new URL(url).origin!==proof.upstream){
   pendingFixtureNavigation=null;
   notify('origin-proof-navigate',{url,redirect:true});
  }
 });
 function update(){
  checkUsable();
  try{if([previousDocument,failedDocument].includes(frame.element.contentDocument))return;
   const url=validURL($scramjet.unrewriteUrl(frame.element.contentWindow.location.href,frame.context));if(!url)return;
   const title=frame.element.contentDocument.title.slice(0,160);const next=JSON.stringify({url,title});if(next!==latest){if(latest&&JSON.parse(latest).url!==url)pageLifecycle.invalidate();latest=next;notify('navigation',{url,title});}
  }catch{}
 }
 frame.element.addEventListener('load',()=>{
  pendingFixtureNavigation=null;pageLifecycle.invalidate();
  if(isolated){
   try{
    const arrived=frame.element.contentWindow.location.href,handoff=handoffs.get(arrived);
    handoffs.clear();
    if(handoff&&handoff.expires>performance.now()){
     loading.cancel();frame.element.style.visibility='hidden';
     notify('origin-proof-navigate',{url:handoff.url,redirect:handoff.redirect});
     return;
    }
   }catch{}
  }
  checkUsable();update();
  try{frame.element.contentDocument.addEventListener('click',event=>{
   if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
   const link=event.target.closest?.('a[href]');if(!link||link.hasAttribute('download'))return;
   const current=validURL($scramjet.unrewriteUrl(frame.element.contentWindow.location.href,frame.context));
   const url=resolveLink(link.getAttribute('href'),current,location.origin,value=>$scramjet.unrewriteUrl(value,frame.context));
   if(!url)return;
   // Preserve real hyperlink destinations when a proxied site's JS navigation
   // handler produces an invalid target. Keep normal clicks inside this tab.
   event.preventDefault();event.stopImmediatePropagation();
   if(proof&&(proof.broker||new URL(url).origin!==proof.upstream)){notify('origin-proof-navigate',{url});return;}
   startLoading();frame.go(url);
  },true);}catch{}
 });
 window.addEventListener('message',async event=>{
  if(proof&&!isolated&&event.data?.type==='origin-proof-site-message'){notify('origin-proof-message',{actualOrigin:event.origin});return;}
  if(proof&&!isolated&&event.data?.type==='origin-proof-wrong-target'){notify('origin-proof-wrong-delivery');return;}
  if(event.source!==parent||event.origin!==uiOrigin||event.data?.id!==id)return;
  const message=event.data;
  try{
   if(message.action==='navigate'){const url=validURL(message.url);if(!url||proof&&new URL(url).origin!==proof.upstream)return;label.hidden=false;label.textContent='Loading page…';if(proof?.broker)latest=null;startLoading();pendingFixtureNavigation=proof?.broker?url:null;frame.go(url);}
   // BEGIN AI PAGE EVIDENCE
   else if(message.action==='stop-context'){pageLifecycle.destroy();}
   else if(['read-page','read-context'].includes(message.action)&&typeof message.requestId==='string'&&/^[a-f0-9-]{36}$/.test(message.requestId)&&typeof message.question==='string'&&message.question.length<=600){
    try{update();const doc=frame.element.contentDocument,url=validURL($scramjet.unrewriteUrl(frame.element.contentWindow.location.href,frame.context));if(!doc||!url||doc===previousDocument||doc===failedDocument||doc.readyState==='loading')throw Error('The selected page has not finished loading. No page text was shared.');const result=message.action==='read-context'?extractPageWithFrames(doc,{url,question:message.question,allowDocuments:message.allowDocuments===true,resolveFrameURL:child=>validURL($scramjet.unrewriteUrl(child.contentWindow.location.href,frame.context))}):{evidence:extractPage(doc,{url,question:message.question}),document:doc,documentURL:url};const evidence=result.evidence,binding=pageLifecycle.capture(result.document,result.documentURL);notify('page-evidence',{requestId:message.requestId,evidence:{...evidence,...binding}});}catch(error){notify('page-evidence',{requestId:message.requestId,error:String(error.message||'Page extraction failed').slice(0,220)});}
   }
   else if(['read-selection','read-document'].includes(message.action)&&typeof message.requestId==='string'&&/^[a-f0-9-]{36}$/.test(message.requestId)){
    try{update();const doc=frame.element.contentDocument,url=validURL($scramjet.unrewriteUrl(frame.element.contentWindow.location.href,frame.context));if(!doc||!url||doc===previousDocument||doc===failedDocument||doc.readyState==='loading')throw Error('The selected editor is not ready or is inaccessible.');const evidence=(message.action==='read-document'?extractDocument:extractSelection)(doc,{url});notify('selection-evidence',{requestId:message.requestId,evidence:{...evidence,...pageLifecycle.capture(doc,url)}});}catch(error){notify('selection-evidence',{requestId:message.requestId,error:String(error.message||'Selection failed').slice(0,220)});}
   }
   // END AI PAGE EVIDENCE
   else if(proof&&!isolated&&message.action==='origin-proof-check'){
    const results={};
    const other=parent.frames[message.otherIndex], foreign=new URL(message.otherOrigin);
    const denied=read=>{try{read();return false;}catch(error){return error.name==='SecurityError';}};
    results.dom=denied(()=>other.document);
    results.cookie=denied(()=>other.document.cookie);
    results.storage=denied(()=>other.localStorage);
    results.sessionStorage=denied(()=>other.sessionStorage);
    const ownKey='poxey-origin-proof:'+clientID;
    sessionStorage.setItem(ownKey,location.origin);
    results.ownTemporaryStorage=sessionStorage.getItem(ownKey)===location.origin;
    sessionStorage.removeItem(ownKey);
    try{await fetch(foreign.origin+'/origin-proof-config.js',{credentials:'include'});results.credentialedReadDenied=false;}catch{results.credentialedReadDenied=true;}
    results.indexedDB=denied(()=>other.indexedDB);
    try{await navigator.serviceWorker.getRegistration(foreign.origin+'/~/sj/');results.workerDenied=false;}catch(error){results.workerDenied=error.name==='SecurityError';}
    results.workerOwn=new URL(registration.scope).origin===location.origin;
    results.upstream=validURL($scramjet.unrewriteUrl(frame.element.contentWindow.location.href,frame.context));
    results.cookieText=frame.element.contentDocument.querySelector('#cookie-result')?.textContent;
    results.physicalOrigin=new URL(frame.element.src).origin;
    notify('origin-proof-result',{results});
    other.postMessage({type:'origin-proof-site-message',from:location.origin},foreign.origin);
    other.postMessage({type:'origin-proof-wrong-target'},location.origin);
   }
   else if(['back','forward','reload'].includes(message.action)){startLoading();frame[message.action]();}
  }catch{failure('The page could not be opened. Try reloading or choose another website.');}
 });
 const timer=setInterval(update,1000);window.addEventListener('pagehide',()=>{clearInterval(timer);loading.cancel();pageLifecycle.destroy();},{once:true});notify('ready');
}catch(error){failure((error.message||'The isolated page runtime is unavailable.')+' ('+startupPhase+')');}
