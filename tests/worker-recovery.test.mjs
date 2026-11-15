import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const scope={self:{},Date,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(new URL('../proxy-public/route-recovery.js',import.meta.url),'utf8'),scope);
test('cold worker waits for recovered controller instead of falling through to HTTP 404',async()=>{
 let ready=false,revivals=0;
 assert.equal(await scope.self.PoxeyRouteRecovery(()=>ready,async()=>{revivals++;setTimeout(()=>{ready=true;},30);},300),true);
 assert.equal(revivals,1);
});
test('missing controller has a bounded failure rather than an endless wait',async()=>{
 const start=Date.now();assert.equal(await scope.self.PoxeyRouteRecovery(()=>false,async()=>{},50),false);assert.ok(Date.now()-start<500);
});
test('stalled controller revival is included in the recovery deadline',async()=>{
 const start=Date.now();assert.equal(await scope.self.PoxeyRouteRecovery(()=>false,()=>new Promise(()=>{}),50),false);assert.ok(Date.now()-start<500);
});
test('failed revival is contained and ready controllers skip revival',async()=>{
 assert.equal(await scope.self.PoxeyRouteRecovery(()=>false,async()=>{throw Error('gone');},50),false);
 assert.equal(await scope.self.PoxeyRouteRecovery(()=>true,()=>{throw Error('must not run');},50),true);
});
test('a cold route worker can recover through its bridge outside the worker scope',async()=>{
 const origin='http://localhost:8801';
 let fetchHandler,response,ready=false;
 const revived=[];
 const client=(id,url)=>({url,postMessage(message){revived.push([id,message]);ready=true;}});
 vm.runInNewContext(fs.readFileSync(new URL('../proxy-public/sw.js',import.meta.url),'utf8'),{
  URL,Response,location:{origin},importScripts(){},
  addEventListener(type,handler){if(type==='fetch')fetchHandler=handler;},
  PoxeyRouteRecovery:scope.self.PoxeyRouteRecovery,
  $scramjetController:{shouldRoute:()=>ready,route:()=>new Response('proxied document')},
  clients:{matchAll({includeUncontrolled,type}){
   assert.equal(includeUncontrolled,true);
   assert.equal(type,'window');
   return [client('bridge',origin+'/?id=1'),client('site',origin+'/~/sj/old'),client('unrelated','http://127.0.0.1:8800/?id=1')];
  }}
 });
 fetchHandler({request:{url:origin+'/~/sj/controller/new'},respondWith(value){response=value;}});
 assert.equal(await (await response).text(),'proxied document');
 assert.deepEqual(revived.map(([id])=>id),['bridge']);
});

test('simultaneous cold requests revive each controller once without replacing active ports',async()=>{
 const origin='http://localhost:8801';
 const ready=new Set(['/~/sj/warm/']);
 const revived=[];
 let handler;
 vm.runInNewContext(fs.readFileSync(new URL('../proxy-public/sw.js',import.meta.url),'utf8'),{
  URL,Response,location:{origin},importScripts(){},
  addEventListener(type,callback){if(type==='fetch')handler=callback;},
  PoxeyRouteRecovery:scope.self.PoxeyRouteRecovery,
  $scramjetController:{
   shouldRoute:event=>[...ready].some(prefix=>new URL(event.request.url).pathname.startsWith(prefix)),
   route:()=>new Response('proxied')
  },
  clients:{matchAll:async()=>[{url:origin+'/?id=1',postMessage(message){
   revived.push(message.poxeyPrefix);
   setTimeout(()=>ready.add(message.poxeyPrefix),30);
  }}]}
 });
 const request=path=>new Promise(resolve=>handler({request:{url:origin+path},respondWith:resolve}));
 const responses=await Promise.all([
  request('/~/sj/a/frame/document'),request('/~/sj/a/frame/style.css'),
  request('/~/sj/b/frame/document'),request('/~/sj/warm/frame/document')
 ]);
 assert.deepEqual(revived.sort(),['/~/sj/a/','/~/sj/b/']);
 assert.ok(responses.every(response=>response.status===200));
});
