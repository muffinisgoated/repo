import test from 'node:test';import assert from 'node:assert/strict';
import {boundedWispSend} from '../wisp-reliability.mjs';
const channel=()=>({send_buffer_size:1024,ws:{OPEN:1,readyState:1,bufferedAmount:0,send(){},close(){this.readyState=3;}}});
test('Wisp sends retain normal fast path and reject already disconnected peers',async()=>{const c=channel();await boundedWispSend(c,new Uint8Array([1]));c.ws.readyState=3;await assert.rejects(boundedWispSend(c,new Uint8Array([1])),/closed/);});
test('closed websocket with retained buffered bytes stops the pending send',async()=>{const c=channel();c.ws.bufferedAmount=2048;const task=boundedWispSend(c,new Uint8Array([1]),{timeoutMs:200,pollMs:5});setTimeout(()=>c.ws.readyState=3,10);await assert.rejects(task,/closed/);});
test('stalled Wisp send closes peer at deadline instead of polling forever',async()=>{const c=channel();c.ws.bufferedAmount=2048;const start=Date.now();await assert.rejects(boundedWispSend(c,new Uint8Array([1]),{timeoutMs:30,pollMs:5}),/timed out/);assert.equal(c.ws.readyState,3);assert.ok(Date.now()-start<500);});
test('slow receiver resumes below the unchanged low-water threshold',async()=>{const c=channel();c.ws.bufferedAmount=2048;setTimeout(()=>c.ws.bufferedAmount=400,10);await boundedWispSend(c,new Uint8Array([1]),{timeoutMs:200,pollMs:5});assert.equal(c.ws.readyState,1);assert.equal(c.send_buffer_size,1024);});
test('pinned upstream send reproduces retained-buffer hang after close',async()=>{
 const {server}=await import('@mercuryworkshop/wisp-js/server');const fake=channel().ws;fake.bufferedAmount=40*1024*1024;
 const upstream=new server.ServerConnection(fake,'/');let done=false;const pending=upstream.ws.send(new Uint8Array([1])).then(()=>done=true);fake.readyState=3;
 await new Promise(r=>setTimeout(r,25));assert.equal(done,false);fake.bufferedAmount=0;await pending;
});
