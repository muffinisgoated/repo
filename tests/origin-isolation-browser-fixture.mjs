// Manual browser fixture. No production route, credentials, or external network.
import http from 'node:http';
const port = 18931;
const a = 'http://127.0.0.1:'+port;
const b = 'http://localhost:'+port;
const base = '/isolation/';

function runFixture(own, other, role) {
 const output = document.querySelector('pre');
 const show = (name, value) => { output.textContent += name+': '+value+'\n'; };
 const denied = async (name, action) => {
  try { await action(); show(name,'FAIL'); }
  catch(error) { show(name,error.name==='SecurityError'?'PASS':'UNAVAILABLE '+error.name); }
 };
 async function run() {
  const cookie = 'fixture_'+role;
  document.cookie = cookie+'=synthetic; Path=/isolation/; SameSite=Strict';
  show('own cookie',document.cookie.includes(cookie+'=synthetic')?'PASS':'UNAVAILABLE');
  show('foreign cookie absent',!document.cookie.includes('fixture_'+(role==='A'?'B':'A')+'=')?'PASS':'FAIL');
  localStorage.setItem('role',role);
  show('own local storage',localStorage.getItem('role')===role?'PASS':'FAIL');
  if(navigator.serviceWorker) {
   const registration = await navigator.serviceWorker.register('fixture-sw.js');
   show('own worker origin',new URL(registration.installing?.scriptURL||registration.active?.scriptURL||registration.waiting.scriptURL).origin===own?'PASS':'FAIL');
   await denied('foreign worker registration',()=>navigator.serviceWorker.getRegistration(other+'/isolation/'));
  } else show('worker','UNAVAILABLE');
  const child=document.createElement('iframe');
  child.title='Other controlled origin';
  let blocked=false;
  addEventListener('message',event=>{
   if(event.source!==child.contentWindow||event.data!=='forged-privileged-command'||blocked)return;
   blocked=true;
   show('foreign privileged message rejected',event.origin!==own&&event.origin===other?'PASS':'FAIL');
  });
  child.addEventListener('load',async()=>{
   await denied('foreign document',()=>child.contentWindow.document);
   await denied('foreign cookies',()=>child.contentWindow.document.cookie);
   await denied('foreign local storage',()=>child.contentWindow.localStorage);
   await denied('foreign IndexedDB',()=>child.contentWindow.indexedDB);
   if(!blocked)show('foreign privileged message','waiting');
  },{once:true});
  child.src=other+'/isolation/child';
  document.body.append(child);
 }
 run().catch(error=>show('fixture error',error.name));
}

const app=http.createServer((req,res)=>{
 const own=req.headers.host==='127.0.0.1:'+port?a:req.headers.host==='localhost:'+port?b:null;
 if(!own){res.writeHead(403).end();return;}
 const other=own===a?b:a, role=own===a?'A':'B';
 const head={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(req.url===base+'fixture-sw.js'){
  res.writeHead(200,{...head,'Content-Type':'text/javascript'}).end("self.addEventListener('install',()=>self.skipWaiting())");
 }else if(req.url===base+'child'){
  res.writeHead(200,{...head,'Content-Type':'text/html'}).end('<!doctype html><title>Controlled child</title><script>parent.postMessage("forged-privileged-command",'+JSON.stringify(other)+')</script>');
 }else if(req.url===base){
  res.writeHead(200,{...head,'Content-Type':'text/html'}).end('<!doctype html><title>Isolation fixture '+role+'</title><h1>Controlled origin '+role+'</h1><pre></pre><script>('+runFixture.toString()+')('+JSON.stringify(own)+','+JSON.stringify(other)+','+JSON.stringify(role)+')</script>');
 }else res.writeHead(404,head).end();
});
app.listen(port,'127.0.0.1',()=>console.log(a+base+'\n'+b+base));
