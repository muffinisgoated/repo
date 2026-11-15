import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import {startServers} from '../server.mjs';
import {createRelayAdmission} from '../relay-admission.mjs';

test('relay tickets are scoped, short-lived, single use, and invalid after approval expiry', () => {
 let at = 0;
 const relay = createRelayAdmission({now:()=>at});
 const request = relay.authorize(null), client = randomUUID();
 assert.equal(relay.issue(request.key, client), null);
 assert.equal(relay.approve(request.code), true);
 assert.equal(relay.approve(request.code), false);
 const ticket = relay.issue(request.key, client);
 assert.equal(relay.consume(ticket, randomUUID()), null);
 assert.ok(relay.consume(ticket, client));
 assert.equal(relay.consume(ticket, client), null);
 const expiresSoon = relay.issue(request.key, client);
 at += 20_001;
 assert.equal(relay.consume(expiresSoon, client), null);
 at += 2 * 60 * 60_000;
 assert.equal(relay.issue(request.key, client), null);
});

test('loopback HTTP approval and Wisp reject public mint, origin forgery, scope substitution and replay', {timeout:5000}, async () => {
 const app = startServers(0,0), peers = [];
 try {
  await Promise.all(app.servers.map(server=>once(server,'listening')));
  const ui = 'http://127.0.0.1:'+app.servers[0].address().port;
  const proxy = 'ws://127.0.0.1:'+app.servers[1].address().port;
  const client = randomUUID(), ticketPath='/api/relay/ticket/'+client;
  const post = (path,cookie='',origin=app.uiOrigin)=>new Promise((resolve,reject)=>{
   const request=http.request(ui+path,{method:'POST',headers:{Host:'127.0.0.1:0',Origin:origin,Cookie:cookie,'X-Poxey-Relay':'1'}},res=>{
    let body='';
    res.setEncoding('utf8');
    res.on('data',chunk=>{body+=chunk;});
    res.once('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(body||'null')}));
   });
   request.on('error',reject);
   request.end();
  });
  const handshake = (path,origin=app.proxyOrigin)=>new Promise(resolve=>{
   const peer = new WebSocket(proxy+path,{headers:{Host:'localhost:0',Origin:origin}});
   peers.push(peer);
   peer.on('error',()=>{});
   peer.once('message',()=>resolve(101));
   peer.once('unexpected-response',(_req,res)=>{res.resume();resolve(res.statusCode);peer.terminate();});
  });
  assert.equal(await handshake('/wisp/'),403);
  assert.equal((await post(ticketPath)).status,403);
  const pending = await post('/api/relay/session');
  assert.equal(pending.status,428);
  const setCookie=pending.headers['set-cookie'][0];
  assert.match(setCookie,/HttpOnly; SameSite=Strict; Path=\/api\/relay\//);
  const cookie=setCookie.split(';')[0];
  assert.equal((await post(ticketPath,cookie)).status,403);
  const {code}=pending.body;
  assert.equal(app.relay.approve(code),true);
  assert.equal((await post(ticketPath,cookie,'https://untrusted.example')).status,403);
  const response=await post(ticketPath,cookie);
  assert.equal(response.status,200);
  assert.equal(response.headers['cache-control'],'no-store');
  const {ticket}=response.body;
  const suffix='/?ticket='+ticket, allowed='/wisp/'+client+suffix;
  assert.equal(await handshake(allowed,'https://untrusted.example'),403);
  assert.equal(await handshake('/wisp/'+randomUUID()+suffix),403);
  assert.equal(await handshake(allowed),101);
  assert.equal(await handshake(allowed),403);
  assert.equal(app.diagnostics().webSockets,1);
 } finally {
  for(const peer of peers)peer.terminate();
  app.stop();
 }
});

test('per-origin fixture relay tickets cannot move between proxy origins',()=>{
 const relay=createRelayAdmission(),pending=relay.authorize(null),client=randomUUID();
 relay.approve(pending.code);
 const a='http://localhost:8801',b='http://127.0.0.1:18937';
 const ticket=relay.issue(pending.key,client,a);
 assert.equal(relay.consume(ticket,client,b),null);
 assert.equal(relay.consume(ticket,client),null);
 assert.ok(relay.consume(ticket,client,a));
 assert.equal(relay.consume(ticket,client,a),null);
});
