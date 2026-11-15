// Manual Safari and in-app browser QA. Test-only endpoints wrap the real gateway.
import http from 'node:http';
import path from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {startServers,root} from '../server.mjs';
import {createLocalGateway} from '../isolation/local-gateway.mjs';
import {localCertificateIssuer} from '../isolation/local-certificates.mjs';
import {startLocalDNS} from '../isolation/local-dns.mjs';

const fixtureA='https://native-a.example';
const fixtureB='https://native-b.example';
const marker=randomUUID().slice(0,8);
const upstream=http.createServer((req,res)=>{
 if(req.headers.host==='native-a.example'&&req.url==='/redirect'){
  res.writeHead(302,{Location:fixtureB+'/landed',
   'Set-Cookie':'redirect_owner=fixture; Secure; HttpOnly; SameSite=Lax'});
  return res.end();
 }
 res.setHeader('Content-Type','text/html');
 const escapedCookie=req.headers.cookie?'CREDENTIAL PRESENT':'NO FOREIGN CREDENTIAL';
 res.end('<!doctype html><title>Native upstream fixture</title><h1>'+
  (req.headers.host==='native-b.example'?'Redirect destination B: '+escapedCookie:'Fixture A')+'</h1>'+
  '<a href="'+fixtureA+'/redirect">Redirect through A to B</a>');
});
upstream.listen(0,'127.0.0.1');
await once(upstream,'listening');
const directory=process.env.POXEY_LOCAL_TLS_DIRECTORY;
if(!directory||!path.isAbsolute(directory)||directory===root||directory.startsWith(root+path.sep))throw Error('Private TLS directory required');
const port=8843;
const gateway=await createLocalGateway({port,arcadeRoot:root,issue:await localCertificateIssuer(directory),
 brokerOptions:{
  resolve:async host=>{
   if(!['native-a.example','native-b.example'].includes(host))throw Error('Fixture hosts only');
   return '93.184.215.14';
  },
  dial(_secure,options,reply){
   return http.request({...options,hostname:'127.0.0.1',port:upstream.address().port},reply);
  }
 }
});
const productionServer=gateway.server;
const html=(res,body)=>res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store',
 'Origin-Agent-Cluster':'?1','X-Content-Type-Options':'nosniff'}).end('<!doctype html>'+body);

gateway.server=(handler,upgrade)=>productionServer((req,res,authority)=>{
 const url=new URL(req.url,gateway.uiOrigin);
 if(authority==='shell'&&url.pathname==='/__native-qa'){
  return html(res,`<title>Native isolation checks</title><h1>Native isolation checks</h1>
<pre id="result">Running…</pre><script type="module">
const post=(endpoint,headers)=>fetch('/api/isolation/'+endpoint,{method:'POST',headers});
const workspace=(await (await post('workspace',{'X-Poxey-Workspace-Request':'1'})).json()).workspace;
async function allocate(id,url){
 const response=await post('route',{'X-Poxey-Workspace':workspace,'X-Poxey-Tab':id,
  'X-Poxey-Navigation':'1','X-Poxey-Destination':url});
 return (await response.json()).origin;
}
const a=await allocate('1',${JSON.stringify(fixtureA)}),b=await allocate('2',${JSON.stringify(fixtureB)});
const out=document.querySelector('#result');
function addFrame(origin,resource){
 const frame=document.createElement('iframe');frame.src=origin+resource;
 document.body.append(frame);return frame;
}
const foreign=addFrame(b,'/__native-peer');
let attacker;
addEventListener('message',e=>{
 if(e.source===foreign.contentWindow&&e.origin===b&&e.data==='ready'){
  attacker=addFrame(a,'/__native-probe?peer='+encodeURIComponent(b));
 }
 if(e.source===attacker?.contentWindow&&e.origin===a)out.textContent=JSON.stringify(e.data,null,2);
});
const link=document.createElement('a');
link.href=a+'/__native-probe?peer='+encodeURIComponent(b)+'&top=1';
link.textContent='Run native cookie positive control as a top-level page';
document.body.append(link);
</script>`);
 }
 if(authority?.route&&url.pathname==='/__native-peer'){
  return html(res,`<title>Separate site B</title><p>Separate site B</p>
<script>parent.postMessage('ready',${JSON.stringify(gateway.uiOrigin)});</script>`);
 }
 if(authority?.route&&url.pathname==='/__native-credentials'){
  return res.writeHead(200,{'Cache-Control':'no-store'}).end(req.headers.cookie||'no cookie');
 }
 if(authority?.route&&url.pathname==='/__native-probe'){
  const peer=url.searchParams.get('peer');
  if(!/^https:\/\/r-[a-f0-9-]+\.test:8843$/.test(peer||'')||!gateway.hasName(new URL(peer).hostname))return res.writeHead(400).end();
  return html(res,`<title>Native route checks</title><pre id="report">Running…</pre><script type="module">
const peer=${JSON.stringify(peer)}, key=${JSON.stringify('poxeyqa_'+marker)};
const report={};
const securityError=f=>{try{f();return false;}catch(e){return e.name==='SecurityError';}};
const rejects=async f=>{try{await f();return false;}catch(e){return e.name==='SecurityError';}};
const {serviceWorker:sw}=navigator;
const topLevel=parent===window;
if(!topLevel){
 const target=parent.frames[0];
 for(const [label,read] of Object.entries({
   foreignDOM:()=>target.document, foreignCookies:()=>target.document.cookie,
   foreignLocalStorage:()=>target.localStorage, foreignSessionStorage:()=>target.sessionStorage,
   foreignIndexedDB:()=>target.indexedDB
 }))report[label]=securityError(read);
}
try{localStorage.setItem(key,'local');report.ownLocalStorage=localStorage.getItem(key)==='local';localStorage.removeItem(key);}catch(e){report.ownLocalStorage=e.name;}
try{sessionStorage.setItem(key,'session');report.ownSessionStorage=sessionStorage.getItem(key)==='session';sessionStorage.removeItem(key);}catch(e){report.ownSessionStorage=e.name;}
document.cookie=key+'=host; Secure; SameSite=Strict';
document.cookie=key+'_domain=foreign; Domain=test; Secure; SameSite=None';
report.ownCookie=(await (await fetch('/__native-credentials')).text()).includes(key+'=host');
report.parentDomainCookieRejected=!(await (await fetch('/__native-credentials')).text()).includes(key+'_domain=');
document.cookie=key+'=; Max-Age=0; Secure; SameSite=Strict';
report.foreignCredentialedReadDenied=await (async()=>{
 try{await fetch(peer+'/__native-credentials',{credentials:'include'});return false;}catch(e){return e.name==='TypeError';}
})();
try{
 const registration=await sw.register('/sw.js?scope=pages',{scope:'/~/sj/',updateViaCache:'none'});
 report.ownWorker=registration.scope===location.origin+'/~/sj/';
 report.rootWorkerDenied=await rejects(()=>sw.register('/sw.js?scope=pages',{scope:'/'}));
 report.foreignScopeDenied=await rejects(()=>sw.register('/sw.js?scope=pages',{scope:peer+'/~/sj/'}));
 report.foreignScriptDenied=await rejects(()=>sw.register(peer+'/sw.js?scope=pages',{scope:'/~/sj/'}));
 report.foreignLookupDenied=await rejects(()=>sw.getRegistration(peer+'/~/sj/'));
 await registration.unregister();
}catch(e){report.ownWorker=e.name;}
document.querySelector('#report').textContent=JSON.stringify(report,null,2);
if(!topLevel)parent.postMessage(report,${JSON.stringify(gateway.uiOrigin)});
</script>`);
 }
 return handler(req,res,authority);
},upgrade);
const dns=await startLocalDNS(8853,gateway.hasName);
const running=startServers(port,8801,{},{localIsolation:gateway,gameOrigins:false});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{
 dns.close();running.stop();upstream.closeAllConnections();upstream.close();
});
console.log(gateway.uiOrigin+'/__native-qa');
console.log('Normal shell redirect target: '+fixtureA+'/redirect');
