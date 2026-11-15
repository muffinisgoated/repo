import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {once} from 'node:events';
import {WebSocket, WebSocketServer} from 'ws';
import {MessageChannel, MessagePort} from 'node:worker_threads';
import {isPublicIP, resolvePublicHost, SafeTCPSocket} from '../security.mjs';
import {patchController} from '../scripts/patch-controller.mjs';

test('egress denies non-global, transition, scoped and ambiguous addresses before TCP', async () => {
 for (const address of ['4000::1', '::7f00:1', '::ffff:127.0.0.1', '2606:4700::1111%en0',
   '64:ff9b::7f00:1', '2002:7f00:1::1', '198.18.0.1', '127.1', '0x7f000001'])
  assert.equal(isPublicIP(address), false, address);
 assert.equal(isPublicIP('2606:4700::1111'), true);
 await assert.rejects(resolvePublicHost('fixture.example', async () => [
  {address:'8.8.8.8'}, {address:'4000::1'}
 ]), /Private destination denied/);
 const socket = new SafeTCPSocket('fixture.example', 443, {resolve:async () => '127.0.0.1'});
 await assert.rejects(socket.connect(), /Private destination denied/);
 assert.equal(socket.socket, null);
});

test('worker rejects forged owners and cross-controller transport and requests', async () => {
 const raw = fs.readFileSync(new URL('../node_modules/@mercuryworkshop/scramjet-controller/dist/controller.sw.js', import.meta.url), 'utf8');
 const listeners = new Map(), origin = 'http://localhost:8801';
 const env = {URL, Response, MessageChannel, MessagePort, setTimeout:() => 0, console,
  clients:{get:async () => sibling}, self:{location:{origin}}, addEventListener(type, handler){
   if(!listeners.has(type))listeners.set(type, []);
   listeners.get(type).push(handler);
  }
 };
 vm.runInNewContext(patchController(raw, 'sw'), env);
 const bridge = {id:'bridge-a', type:'window', url:origin+'/?ui=http%3A%2F%2F127.0.0.1%3A8800&id=1'};
 const id = 'faba5137-1ead-4025-82cf-4eeaab409528';
 const prefix = '/~/sj/'+id+'/';
 const page = {id:'page-a', type:'window', url:origin+prefix+'page'};
 const sibling = {...page,id:'page-b',url:origin+'/~/sj/another/page'};
 const posted = [];
 function port(){return {postMessage(data){posted.push(data);}, close(){this.closed=true;}};}
 function send(source, data, ports){for(const handler of listeners.get('message'))handler({source,data,ports});}
 const original = port();
 const init = {$controller$init:{id,prefix}};
 const routes = () => env.$scramjetController.shouldRoute({request:{url:page.url}});
 send(page, init, [port()]);
 send(bridge, {$controller$init:{id,prefix:'/~/sj/'}}, [port()]);
 assert.equal(routes(), false);
 send(bridge, init, [original]);
 assert.equal(routes(), true);
 assert.equal(posted.length, 1);
 send({...bridge,id:'bridge-b'}, init, [port()]);
 assert.equal(original.closed, undefined);
 assert.equal(posted.length, 1);
 const transport = port(), attach = {$sw$initRemoteTransport:{port:transport,prefix:origin+prefix}};
 send(sibling, attach, [transport]);
 send(page, attach, [port()]);
 assert.equal(posted.length, 1);
 send(page, attach, [transport]);
 assert.equal(posted.length, 2);
 const denied=await env.$scramjetController.route({clientId:sibling.id,request:{url:page.url}});
 assert.equal(denied.status,403);
 assert.equal(posted.length,2);
 send(bridge, init, [port()]);
 assert.equal(original.closed, true);
});

test('an unread WebSocket peer cannot grow its automatic pong queue past the upstream cap', {timeout:5000}, async () => {
 const server = new WebSocketServer({host:'127.0.0.1', port:0, perMessageDeflate:false});
 let client;
 try {
  await once(server, 'listening');
  const connected = once(server, 'connection');
  client = new WebSocket('ws://127.0.0.1:'+server.address().port);
  const [peer] = await connected;
  await once(client, 'open');
  let pendingWrites = 0;
  // Model a stalled write callback without allocating a flood or saturating the Mac.
  peer.pong = () => { pendingWrites++; };
  const ended = once(peer, 'close');
  for(let i=0;i<61;i++)client.ping('fixture');
  await ended;
  assert.equal(pendingWrites, 60);
 } finally {
  client?.terminate();
  for(const peer of server.clients)peer.terminate();
  await new Promise(resolve => server.close(resolve));
 }
});
