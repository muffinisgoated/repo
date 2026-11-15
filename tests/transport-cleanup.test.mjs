import test from 'node:test';
import assert from 'node:assert/strict';
import {SafeTCPSocket} from '../security.mjs';
test('closing during DNS resolution prevents a later connection',async()=>{
 let release;const socket=new SafeTCPSocket('example.com',443,{resolve:()=>new Promise(resolve=>release=resolve)});
 const connected=socket.connect();socket.close();release('93.184.215.14');
 await assert.rejects(connected,/closed/);assert.equal(socket.socket,null);
});
test('closed sockets cannot reconnect or send data',async()=>{
 const socket=new SafeTCPSocket('example.com',443);socket.close();
 await assert.rejects(socket.connect(),/closed/);await assert.rejects(socket.send(Buffer.from('test')),/closed/);
});
