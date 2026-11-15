import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {patchWispTransport} from '../scripts/patch-wisp-transport.mjs';

test('rejected Wisp upgrade notifies all pending streams and allows a fresh handshake',()=>{
 const bundle=patchWispTransport(readFileSync(new URL('../node_modules/@mercuryworkshop/libcurl-transport/dist/index.mjs',import.meta.url),'utf8'));
 const start=bundle.indexOf('  class WispConnection extends EventTarget');
 const end=bundle.indexOf('\n  }',bundle.indexOf('    get readyState()',bundle.indexOf('  class WispWebSocket',start)))+4;
 const peers=[];
 class Socket extends EventTarget { constructor(){super();peers.push(this);} }
 const context={EventTarget,Event,WebSocket:Socket,CloseEvent:Event};
 const Client=vm.runInNewContext(bundle.slice(start,end)+'\nWispWebSocket',context);
 const connect=()=>new Client('ws://localhost:8801/wisp/example.com:443');
 const a=connect(),b=connect();
 assert.equal(peers.length,1);
 const errors=[];
 a.onerror=()=>errors.push('first');
 b.onerror=()=>errors.push('second');
 peers[0].dispatchEvent(new Event('error'));
 assert.deepEqual(errors,['first','second']);
 assert.equal(a.readyState,a.CLOSED);
 assert.equal(b.readyState,b.CLOSED);
 const c=connect();
 peers[0].dispatchEvent(new Event('close'));
 const d=connect();
 assert.equal(peers.length,2);
 assert.equal(c.connection,d.connection);
});
