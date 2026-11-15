// Manual-command acceptance driver: real local Wisp sockets, no browser automation,
// analytics events, provider calls or persistent client identities.
import fs from 'node:fs';
import readline from 'node:readline';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import {packet} from '@mercuryworkshop/wisp-js/server';
const target=new URL('../reports/final-ai/connected-clients-live.json',import.meta.url),events=[],peers=new Map(),ids={a:randomUUID(),b:randomUUID(),stale:randomUUID()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function metrics(){const m=JSON.parse(fs.readFileSync(new URL('../reports/stage4/live-monitoring.json',import.meta.url)));assert.ok(Date.now()-Date.parse(m.timestamp)<15000,'Collector must be fresh');return {clients:m.proxyClients?.connectedClients,wisp:m.active.webSockets,reported:m.sessions.activeSessions,unattributed:m.proxyClients?.unattributedConnections,aiCalls:m.ai.budget.calls,aiTokens:m.ai.budget.accountedTokens};}
async function record(label,expected){let m;for(let i=0;i<120;i++){m=metrics();if(!expected||Object.entries(expected).every(([k,v])=>m[k]===v))break;await sleep(100);}if(expected)for(const[k,v]of Object.entries(expected))assert.equal(m[k],v,label+': '+k);const event={at:new Date().toISOString(),label,...m};events.push(event);fs.writeFileSync(target,JSON.stringify({kind:'Real local Wisp protocol clients; not rendered browser windows',events},null,2));console.log(JSON.stringify(event));return m;}
async function open(name,group,{autoPong=true}={}){const ws=new WebSocket('ws://localhost:8801/wisp/'+(group?ids[group]+'/':''),{origin:'http://localhost:8801',autoPong});ws.on('error',()=>{});const first=once(ws,'message');await once(ws,'open');const[bytes]=await first;assert.equal(packet.WispPacket.parse_all(new packet.WispBuffer(new Uint8Array(bytes))).type,3);peers.set(name,ws);return ws;}
function close(name){peers.get(name)?.terminate();peers.delete(name);}
async function traffic(){const ws=peers.get('a1');assert.ok(ws,'Open a first');const send=(type,payload)=>ws.send(new packet.WispPacket({type,stream_id:1,payload}).serialize().bytes);const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(Error('Public HTTP request deadline')),12000);let text='';function done(error){clearTimeout(timer);ws.off('message',on);error?reject(error):resolve(text);}function on(bytes){const p=packet.WispPacket.parse_all(new packet.WispBuffer(new Uint8Array(bytes)));if(p.stream_id!==1)return;if(p.type===2){text+=Buffer.from(p.payload.data.bytes).toString();if(text.includes('Example Domain'))done();}else if(p.type===4)done(Error('Public stream closed before expected content'));}ws.on('message',on);send(1,new packet.ConnectPayload({stream_type:1,hostname:'example.com',port:80}));send(2,new packet.DataPayload({data:new packet.WispBuffer(Buffer.from('GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n'))}));});assert.match(result,/HTTP\/1\.[01] 200/);assert.match(result,/Example Domain/);await record('Public HTTP Example Domain content received through real Wisp TCP stream');}
const commands={
 zero:()=>record('No test clients',{clients:0,wisp:0,reported:0}),
 a:async()=>{await open('a1','a');await record('One grouped client',{clients:1,wisp:1,reported:0});},
 same:async()=>{await open('a2','a');await record('Two connections belonging to same client',{clients:1,wisp:2,reported:0});},
 other:async()=>{await open('b1','b');await record('Separate client',{clients:2,wisp:3,reported:0});},
 closeA:async()=>{close('a1');close('a2');await record('First client disconnected',{clients:1,wisp:1,reported:0});},
 reconnect:async()=>{await open('b2','b');close('b1');await record('Remaining client reconnects without inflation',{clients:1,wisp:1,reported:0});},
 legacy:async()=>{await open('legacy',null);await record('Legacy client has an honest unknown exact total',{clients:null,wisp:2,unattributed:1,reported:0});},
 unlegacy:async()=>{close('legacy');await record('Legacy removed, exact grouping restored',{clients:1,wisp:1,reported:0});},
 all:async()=>{for(const name of peers.keys())close(name);await record('All test clients disconnected',{clients:0,wisp:0,reported:0});},
 stale:async()=>{const ws=await open('stale','stale',{autoPong:false});const began=Date.now();await record('Unresponsive peer initially connected',{clients:1,wisp:1,reported:0});await Promise.race([once(ws,'close'),sleep(65000).then(()=>{throw Error('Stale connection did not expire');})]);peers.delete('stale');await record('Unresponsive peer expired after '+((Date.now()-began)/1000).toFixed(2)+' seconds',{clients:0,wisp:0,reported:0});},
 traffic,
 snapshot:()=>record('Native Admin comparison snapshot'),
};
console.log('Ready: zero, a, traffic, same, other, closeA, reconnect, legacy, unlegacy, all, stale, snapshot, quit');
for await(const line of readline.createInterface({input:process.stdin})){const cmd=line.trim();if(cmd==='quit')break;try{assert.ok(commands[cmd],'Unknown command');await commands[cmd]();}catch(error){console.error('FAIL:',error.message);events.push({at:new Date().toISOString(),label:cmd,error:error.message});fs.writeFileSync(target,JSON.stringify({events},null,2));}}
for(const ws of peers.values())ws.terminate();
