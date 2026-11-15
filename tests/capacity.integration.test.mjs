import {fixtureRelayKey,ticketedWisp} from './relay-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {once} from 'node:events';import {WebSocket} from 'ws';import {startServers} from '../server.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await pause(10);}assert.fail('cleanup did not complete');};
const get=(path='/')=>new Promise(resolve=>http.get('http://127.0.0.1:18920'+path,res=>{res.resume();res.once('end',()=>resolve(res.statusCode));}));
const open=(app,key)=>new Promise(resolve=>{const ws=new WebSocket(ticketedWisp(app,key,'ws://localhost:18921/wisp/'),{origin:'http://localhost:18921'});ws.once('message',()=>resolve({ws,status:101}));ws.once('error',()=>{});ws.once('unexpected-response',(_r,res)=>{res.resume();resolve({ws,status:res.statusCode});ws.terminate();});});
test('real admission rejects overload/oversized messages and recovers; metrics stay internal',async()=>{
 const app=startServers(18920,18921,{webSockets:2,messageBytes:1024,httpBurst:4,httpPerSecond:1});let peers=[];const key=fixtureRelayKey(app);
 try{await Promise.all(app.servers.map(s=>s.listening?Promise.resolve():once(s,'listening')));
  assert.equal(await get('/monitoring'),404);assert.equal(await get('/admin'),404);
  assert.equal(await get(),200);assert.equal(await get(),200);assert.equal(await get(),503);
  peers=await Promise.all([open(app,key),open(app,key)]);assert.ok(peers.every(p=>p.status===101));assert.equal((await open(app,key)).status,503);
  const closed=once(peers[0].ws,'close');peers[0].ws.send(Buffer.alloc(2048));assert.equal((await closed)[0],1009);await wait(()=>app.diagnostics().webSockets===1);
  const replacement=await open(app,key);peers.push(replacement);assert.equal(replacement.status,101);
  for(const p of peers)p.ws.terminate();await wait(()=>app.diagnostics().webSockets===0);
  const s=app.monitoring();assert.equal(s.counters.httpRequests,5);assert.equal(s.counters.httpOverloads,1);assert.equal(s.counters.wsOpened,3);assert.equal(s.counters.wsRejected,1);assert.equal(s.active.webSockets,0);assert.equal(s.active.streams,0);assert.equal(s.active.queuedBytes,0);assert.ok(s.counters.wsFailures>=1);
 }finally{for(const p of peers)p.ws.terminate();app.stop();}
});
test('actual body-byte counters exclude HEAD and never retain request secrets',async()=>{
 const app=startServers(18922,18923);
 try{await Promise.all(app.servers.map(s=>s.listening?Promise.resolve():once(s,'listening')));let expected=0;
  for(const [path,method]of [['/runtime-config.js','GET'],['/index.html?fixture-private=do-not-retain','GET'],['/index.html','HEAD']]){
   expected+=await new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:18922,path,method,headers:{Cookie:'fixture=do-not-retain'}},res=>{assert.equal(res.statusCode,200);let bytes=0;res.on('data',b=>bytes+=b.length);res.on('end',()=>resolve(bytes));});req.on('error',reject);req.end();});
  }
  const s=app.monitoring();assert.equal(s.counters.httpBodyBytes,expected);assert.equal(s.counters.httpRequests,3);assert.equal(s.service.listenersReady,true);assert.doesNotMatch(JSON.stringify(s),/do-not-retain|fixture-private|Cookie/);
 }finally{app.stop();}assert.equal(app.monitoring().service.listenersReady,false);
});

test('a full Wisp relay reclaims an aged empty peer and admits a new browser',async()=>{
 const app=startServers(18924,18925,{webSockets:2});
 const peers=[],key=fixtureRelayKey(app);
 const openPeer=()=>new Promise((resolve,reject)=>{
  const ws=new WebSocket(ticketedWisp(app,key,'ws://localhost:18925/wisp/'),{origin:'http://localhost:18925'});
  ws.once('message',()=>{peers.push(ws);resolve(ws);});
  ws.once('error',reject);
 });
 try{
  await Promise.all(app.servers.map(s=>s.listening?Promise.resolve():once(s,'listening')));
  const oldest=await openPeer();await pause(5100);
  const recent=await openPeer(),closed=once(oldest,'close');
  await openPeer();await closed;
  assert.equal(recent.readyState,WebSocket.OPEN);
  assert.equal(app.diagnostics().webSockets,2);
  assert.equal(app.monitoring().counters.wsClosed,1);
 }finally{for(const peer of peers)peer.terminate();app.stop();}
});
