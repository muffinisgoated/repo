import {fixtureRelayKey,ticketedWisp} from './relay-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';
import {WebSocket} from 'ws';import {startServers} from '../server.mjs';import {packet} from '@mercuryworkshop/wisp-js/server';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await pause(10);}assert.fail('cleanup deadline exceeded');}
async function connect(app,key){const ws=new WebSocket(ticketedWisp(app,key,'ws://localhost:18901/wisp/'),{origin:'http://localhost:18901'});const first=once(ws,'message');await once(ws,'open');const [bytes]=await first;const p=packet.WispPacket.parse_all(new packet.WispBuffer(new Uint8Array(bytes)));assert.equal(p.type,3);return ws;}
test('actual Wisp websocket reconnect, bounded concurrent peers, private-target denial and cleanup',async()=>{
 const app=startServers(18900,18901);let peers=[];const key=fixtureRelayKey(app);
 try{
 await Promise.all(app.servers.map(s=>s.listening?Promise.resolve():once(s,'listening')));
 for(let i=0;i<3;i++){const ws=await connect(app,key);assert.equal(app.diagnostics().webSockets,1);ws.terminate();await until(()=>app.diagnostics().webSockets===0);}
 peers=await Promise.all([connect(app,key),connect(app,key),connect(app,key)]);assert.equal(app.diagnostics().webSockets,3);
 const ws=peers[0];const reply=once(ws,'message');ws.send(new packet.WispPacket({type:1,stream_id:1,payload:new packet.ConnectPayload({stream_type:1,hostname:'127.0.0.1',port:80})}).serialize().bytes);
 const [bytes]=await reply;const denied=packet.WispPacket.parse_all(new packet.WispBuffer(new Uint8Array(bytes)));assert.equal(denied.type,4);
 for(const p of peers)p.terminate();await until(()=>app.diagnostics().webSockets===0);
 }finally{for(const p of peers)p.terminate();app.stop();}
});
