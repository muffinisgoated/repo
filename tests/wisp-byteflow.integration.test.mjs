// Explicit synthetic loopback service; never injects a socket into the app's
// public route. Production uses SafeTCPSocket and its unchanged DNS/IP checks.
import test from 'node:test';import assert from 'node:assert/strict';import net from 'node:net';import {once} from 'node:events';import {WebSocket,WebSocketServer} from 'ws';
import {Readable} from 'node:stream';
import {server as wisp,packet,logging} from '@mercuryworkshop/wisp-js/server';import {managedConnection} from '../wisp-capacity.mjs';import {capacityLimits} from '../capacity.mjs';import {createMonitoring} from '../monitoring.mjs';import {installWispReliability} from '../wisp-reliability.mjs';
installWispReliability(wisp);logging.set_level(logging.NONE);
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function until(f){for(let i=0;i<200;i++){if(f())return;await pause(10);}assert.fail('fixture cleanup deadline');}
const send=(ws,type,id,payload)=>ws.send(new packet.WispPacket({type,stream_id:id,payload}).serialize().bytes);
const connect=(ws,id)=>send(ws,1,id,new packet.ConnectPayload({stream_type:1,hostname:'fixture.example',port:443}));
function receive(ws,match){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{finish();reject(Error('packet deadline'));},2000);function finish(){clearTimeout(timer);ws.off('message',on);}function on(bytes){const p=packet.WispPacket.parse_all(new packet.WispBuffer(new Uint8Array(bytes)));if(match(p)){finish();resolve(p);}}ws.on('message',on);});}
async function fixture(overrides={},destination=null){
 const metrics=createMonitoring(),budget={streams:0,queued:0},limits=capacityLimits(overrides),tcpPeers=new Set(),sessions=new Set();
 const tcp=net.createServer(s=>{tcpPeers.add(s);s.on('data',b=>{if(b.toString()==='BULK'){const chunk=Buffer.alloc(8192,7);Readable.from((function*(){for(let i=0;i<512;i++)yield chunk;})()).pipe(s);}else s.write(b);});s.on('error',()=>{});s.on('close',()=>tcpPeers.delete(s));});tcp.listen(0,'127.0.0.1');await once(tcp,'listening');
 class FixtureSocket{
  constructor(host,port){assert.equal(host,'fixture.example');assert.equal(port,443);this.hostname=host;this.closed=false;}
  async connect(){this.socket=net.connect(tcp.address().port,'127.0.0.1');await once(this.socket,'connect');this.iterator=this.socket[Symbol.asyncIterator]();}
  async recv(){const v=await this.iterator.next();return v.done?null:v.value;}
  async send(b){await new Promise((resolve,reject)=>this.socket.write(b,e=>e?reject(e):resolve()));}
  close(){this.closed=true;this.socket?.destroy();}pause(){}resume(){}
 }
 Object.assign(wisp.options,{allow_direct_ip:false,allow_private_ips:false,allow_loopback_ips:false,allow_udp_streams:false,port_whitelist:[80,443],stream_limit_per_host:8,stream_limit_total:32,dns_method:async host=>{assert.equal(host,'fixture.example');return '8.8.8.8';}});
 const wss=new WebSocketServer({host:'127.0.0.1',port:0,maxPayload:limits.messageBytes,perMessageDeflate:false});await once(wss,'listening');wss.on('connection',ws=>{const s=managedConnection(ws,{limits,metrics,budget,Socket:FixtureSocket,destination});sessions.add(s);s.running.finally(()=>sessions.delete(s));});
 const open=async()=>{const ws=new WebSocket('ws://127.0.0.1:'+wss.address().port);const ready=receive(ws,p=>p.type===3);await once(ws,'open');await ready;return ws;};
 return {metrics,limits,tcpPeers,sessions,open,async stop(){for(const ws of wss.clients)ws.terminate();for(const s of tcpPeers)s.destroy();await Promise.all([...sessions].map(s=>s.running));await new Promise(r=>wss.close(r));await new Promise(r=>tcp.close(r));metrics.close();}};
}
test('actual TCP byte flow, global stream rejection and disconnect cleanup',async()=>{
 const f=await fixture({streamsGlobal:2});const peers=[];
 try{const a=await f.open(),b=await f.open();peers.push(a,b);connect(a,1);connect(b,1);await until(()=>f.metrics.snapshot().active.tcp===2);
  const rejected=receive(a,p=>p.type===4&&p.stream_id===2);connect(a,2);await rejected;assert.equal(f.metrics.snapshot().active.streams,2);
  for(let i=0;i<16;i++){const data=Buffer.alloc(8192,i),reply=receive(a,p=>p.type===2);send(a,2,1,new packet.DataPayload({data:new packet.WispBuffer(data)}));const echoed=await reply;assert.deepEqual(Buffer.from(echoed.payload.data.bytes),data);}
  for(const ws of peers)ws.terminate();await until(()=>f.metrics.snapshot().active.tcp===0&&f.metrics.snapshot().active.streams===0);assert.equal(f.metrics.snapshot().active.queuedBytes,0);assert.equal(f.metrics.snapshot().counters.streamRejected,1);
 }finally{for(const ws of peers)ws.terminate();await f.stop();}
});
test('burst producer is closed at bounded queues instead of retaining unawaited producers',async()=>{
 const f=await fixture({messageBytes:16384,queueBytes:131072,queueItems:32,streamQueueBytes:32768,queuedBytesPerConnection:262144,queuedBytesGlobal:524288});let ws;
 try{ws=await f.open();const closed=once(ws,'close');connect(ws,1);for(let i=0;i<100;i++)send(ws,2,1,new packet.DataPayload({data:new packet.WispBuffer(new Uint8Array(8192))}));await closed;await until(()=>f.metrics.snapshot().active.streams===0&&f.metrics.snapshot().active.tcp===0);const s=f.metrics.snapshot();assert.ok(s.counters.queueOverflows>=1);assert.ok(s.peaks.queuedBytes<=f.limits.queuedBytesPerConnection);assert.equal(s.active.queuedBytes,0);
 }finally{ws?.terminate();await f.stop();}
});

test('paused real WebSocket consumer resumes a 4MiB TCP transfer and releases resources',async()=>{
 const f=await fixture();let ws;
 try{ws=await f.open();connect(ws,1);await until(()=>f.metrics.snapshot().active.tcp===1);
  let total=0;const complete=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('bulk transfer deadline')),3000);ws.on('message',bytes=>{const p=packet.WispPacket.parse_all(new packet.WispBuffer(new Uint8Array(bytes)));if(p.type===2){total+=p.payload.data.bytes.byteLength;if(total>=4194304){clearTimeout(timer);resolve();}}});});
  ws.pause();send(ws,2,1,new packet.DataPayload({data:new packet.WispBuffer(Buffer.from('BULK'))}));await pause(100);ws.resume();await complete;assert.equal(total,4194304);ws.terminate();await until(()=>f.metrics.snapshot().active.streams===0&&f.metrics.snapshot().active.tcp===0);assert.equal(f.metrics.snapshot().active.queuedBytes,0);
 }finally{ws?.terminate();await f.stop();}
});

test('destination interruption releases its stream slot without closing the whole client',async()=>{
 const f=await fixture();let ws;
 try{ws=await f.open();connect(ws,1);await until(()=>f.metrics.snapshot().active.tcp===1);for(const s of f.tcpPeers)s.destroy();await until(()=>f.metrics.snapshot().active.streams===0&&[...f.sessions].every(s=>Object.keys(s.conn.streams).length===0));assert.equal(ws.readyState,WebSocket.OPEN);connect(ws,2);await until(()=>f.metrics.snapshot().active.tcp===1);ws.terminate();await until(()=>f.metrics.snapshot().active.streams===0);
 }finally{ws?.terminate();await f.stop();}
});

test('inactive destination connections time out and release all reservations',async()=>{
 const f=await fixture({tcpIdleMs:30});let ws;
 try{ws=await f.open();connect(ws,1);await until(()=>f.metrics.snapshot().active.tcp===1);await until(()=>f.metrics.snapshot().counters.tcpTimeouts===1&&f.metrics.snapshot().active.streams===0);assert.equal(f.metrics.snapshot().active.tcp,0);assert.equal(ws.readyState,WebSocket.OPEN);
 }finally{ws?.terminate();await f.stop();}
});

test('a valid Wisp connection cannot open a stream outside its origin binding',async()=>{
 const f=await fixture({},'https://fixture.example');let ws;
 try{
  ws=await f.open();
  for(const [host,port] of [['sibling.example',443],['fixture.example',80]]){
   const denied=receive(ws,p=>p.type===4&&p.stream_id===1);
   send(ws,1,1,new packet.ConnectPayload({stream_type:1,hostname:host,port}));
   await denied;
  }
  assert.equal(f.metrics.snapshot().counters.streamOpened,0);
  connect(ws,2);
  await until(()=>f.metrics.snapshot().active.tcp===1);
 }finally{ws?.terminate();await f.stop();}
});
