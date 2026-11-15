import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {mountArcade} from '../public/arcade/ui.mjs';
import {repairPolytrack} from '../tools/milestone2/prepare-polytrack.mjs';
import {repairMoto} from '../tools/milestone2/prepare-moto.mjs';
import {repairMX} from '../tools/milestone2/prepare-mx.mjs';

test('MX repair changes only the reproduced invalid DOM API and preserves recovered source',()=>{
 const source=fs.readFileSync('local-games/gn-beta/packages/gn-116/Build/bike1.loader.js','utf8');
 assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'ef1ce6d55e280c88543bb36883b615ce14609861f0a827f633d5fa3024e4f594');
 const repaired=repairMX(source);assert.equal(repaired,source.replace('document.create("script")','document.createElement("script")'));
 assert.equal(repaired,fs.readFileSync('local-games/gn-stage86/packages/gn-116/Build/bike1.loader.js','utf8'));
 assert.throws(()=>repairMX('unrecognized loader'),/Unexpected/);
});

test('PolyTrack repair preserves recovered source and binds a native worker before immediate simulation calls',()=>{
 const file='local-games/gn-beta/packages/gn-123/main.bundle.js',original=fs.readFileSync(file),hash=crypto.createHash('sha256').update(original).digest('hex');
 assert.equal(hash,'3bf36324aeb3a96d11167b85a4c7b8fae5e3aed24ff3c162333f16f8e71db26b');
 const repaired=repairPolytrack(original.toString());
 assert.equal(repaired,fs.readFileSync('local-games/gn-stage86/packages/gn-123/main.bundle.js','utf8'));
 assert.match(repaired,/new Worker\(new URL\('simulation_worker.bundle.js', import.meta.url\)\)/);
 assert.doesNotMatch(repaired,/fetch\('simulation_worker.bundle.js'\)/);
 const suffix='            dispose() {\n                CL(this, kL';assert.equal(repaired.slice(repaired.indexOf(suffix)),original.toString().slice(original.toString().indexOf(suffix)));
 assert.throws(()=>repairPolytrack('Unrecognized engine'),/Unexpected/);
});

test('Moto entry supplies the original engine content mount without altering the engine or adding an SDK mock',()=>{
 const html='<html><body><script src="motox3m.min.js"></script></body></html>',fixed=repairMoto(html);
 assert.equal((fixed.match(/id="content"/g)||[]).length,1);
 assert.equal(repairMoto(fixed),fixed);
 assert.match(fixed,/<div id="content"><\/div>.*<script src="motox3m.min.js"/s);
 assert.match(fs.readFileSync('local-games/gn-stage86/packages/gn-124/index.beta.html','utf8'),/id="content"/);
 assert.doesNotMatch(fixed,/SDK|success|adFinished/);
});

test('changed package metadata agrees with installed files and preserves the original eleven catalog rows',()=>{
 const specs=JSON.parse(fs.readFileSync('public/arcade/beta-catalog.json')),installed=JSON.parse(fs.readFileSync('local-games/gn-stage86/installed.json'));
 for(const id of ['gn-123','gn-124']){
  const pack=installed.games.find(p=>p.id===id),spec=specs.find(g=>g.id===id);
  assert.equal(pack.packageHash,spec.packageHash);
  for(const name of id==='gn-123'?['main.bundle.js']:['index.beta.html']){
   const f=pack.files.find(f=>f.path===name),file='local-games/gn-stage86/packages/'+id+'/'+name;
   assert.equal(fs.statSync(file).size,f.bytes);
   assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),f.sha256);
  }
 }
 assert.equal(JSON.parse(fs.readFileSync('public/arcade/catalog.json')).length,11);
});

test('blocked dependencies remain visible diagnostics without fabricating a fatal engine exception',()=>{
 const handlers=new Map(),messages=[];
 vm.runInNewContext(fs.readFileSync('proxy-public/arcade/beta-diagnostics.js','utf8'),{URL,location:{href:'http://poxey-game-118.localhost:10118/index.beta.html?token=11111111-1111-4111-8111-111111111111'},parent:{postMessage:m=>messages.push(m)},addEventListener:(name,fn)=>handlers.set(name,fn)});
 handlers.get('securitypolicyviolation')({violatedDirective:'connect-src',blockedURI:'https://api.uca.cloud.unity3d.com/v1/events?secret=hidden'});
 assert.equal(messages[0].event,'warning');assert.match(messages[0].detail,/Blocked game dependency/);assert.doesNotMatch(messages[0].detail,/secret|hidden/);
 handlers.get('error')({message:'Actual engine exception',filename:'engine.js',lineno:3,colno:4});
 assert.equal(messages[1].event,'error');assert.match(messages[1].detail,/Actual engine exception/);
 handlers.get('error')({target:{src:'https://account.y8.com/api/user_data/autologin'}});assert.equal(messages[2].event,'warning');assert.match(messages[2].detail,/resource did not load/);
});

test('dependency warnings stay in About; a real failure cancels the generic load timeout',async()=>{
 const dom=new JSDOM('<body><main id="root"></main>',{url:'http://127.0.0.1:8800/'}),w=dom.window;
 const keys=['window','document','location','localStorage','addEventListener','removeEventListener','fetch','setTimeout','clearTimeout'],prior=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const originalSet=setTimeout,originalClear=clearTimeout;let cleared=false;const loadTimer={};
 const game=JSON.parse(fs.readFileSync('public/arcade/beta-catalog.json')).find(g=>g.id==='gn-118');
 w.POXEY_RUNTIME={proxyOrigin:'http://localhost:8801'};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 const values={window:w,document:w.document,location:w.location,localStorage:w.localStorage,addEventListener:w.addEventListener.bind(w),removeEventListener:w.removeEventListener.bind(w),fetch:async()=>({json:async()=>[game]}),setTimeout:(fn,ms)=>ms===45000?loadTimer:originalSet(fn,ms),clearTimeout:id=>id===loadTimer?(cleared=true):originalClear(id)};
 for(const k of keys)Object.defineProperty(globalThis,k,{value:values[k],configurable:true,writable:true});
 let ui;
 try{ui=mountArcade(w.document.querySelector('#root'),{onExit(){}});await new Promise(r=>originalSet(r,0));w.document.querySelector('[aria-label="Play Solar Smash"]').click();const frame=w.document.querySelector('iframe'),token=new URL(frame.src).searchParams.get('token');
 const send=(type,detail)=>w.dispatchEvent(new w.MessageEvent('message',{source:frame.contentWindow,origin:'http://localhost:8801',data:{arcade:true,token,type,beta:true,detail}}));
 send('document-loaded');send('warning','Blocked optional dependency');assert.equal(w.document.querySelector('#arcade-status').hidden,true);
 w.document.querySelector('#arcade-info').click();assert.match(w.document.querySelector('dialog pre').textContent,/dependency-warning|Blocked optional dependency/);
 cleared=false;send('error','Real engine failure');assert.equal(cleared,true);assert.match(w.document.querySelector('#arcade-status').textContent,/Real engine failure/);
 }finally{ui?.destroy();dom.window.close();for(const k of keys){if(prior.get(k))Object.defineProperty(globalThis,k,prior.get(k));else delete globalThis[k];}}
});
