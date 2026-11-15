import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {gunzipSync} from 'node:zlib';
import {startServers} from '../server.mjs';
function request(port,url,headers={}){return new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port,path:url,headers:{Host:`127.0.0.1:${port}`,...headers}},res=>{const chunks=[];res.on('data',data=>chunks.push(data));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));}).on('error',reject);});}
test('actual local servers enforce host, source-file and frame boundaries and stream compressed assets',async()=>{
 const instance=startServers(18800,18801);
 try{
  await Promise.all(instance.servers.map(server=>server.listening?Promise.resolve():once(server,'listening')));
  const page=await request(18800,'/',{'Accept-Encoding':'gzip'});assert.equal(page.status,200);assert.equal(page.headers['content-encoding'],'gzip');assert.match(gunzipSync(page.body).toString(),/PoxeyX1/);
  assert.match(page.headers['content-security-policy'],/frame-src http:\/\/localhost:18801/);
  assert.equal((await request(18800,'/',{Host:'unrelated.example'})).status,403);
  for(const file of ['/package.json','/originals/SHA256-MANIFEST.json','/%2e%2e/server.mjs'])assert.equal((await request(18800,file)).status,404);
  const partial=await request(18800,'/index.html',{Range:'bytes=0-31','Accept-Encoding':'gzip'});
  assert.equal(partial.status,206);assert.equal(partial.body.length,32);assert.equal(partial.headers['content-encoding'],undefined);assert.match(partial.headers['content-range'],/^bytes 0-31\//);
  assert.equal((await request(18800,'/index.html',{Range:'bytes=99999999-'})).status,416);
  assert.equal((await request(18800,'/index.html',{Range:'bytes=0-1,4-5'})).status,416);
  const suffix=await request(18800,'/index.html',{Range:'bytes=-10'});assert.equal(suffix.status,206);assert.equal(suffix.body.length,10);
  assert.equal((await request(18800,'/origin-proof/')).status,404);
  assert.equal((await request(18801,'/origin-proof-config.js',{Host:'localhost:18801'})).status,404);
  const config=await request(18800,'/runtime-config.js');assert.match(config.body.toString(),/http:\/\/localhost:18801/);
  const missed=await request(18801,'/~/sj/missing',{Host:'localhost:18801'});
  assert.equal(missed.status,503);
  assert.equal(missed.headers['cache-control'],'no-store');
  assert.match(missed.body.toString(),/worker did not intercept/);
  const denied=await request(18801,'/wisp/',{Host:'localhost:18801',Origin:'https://unrelated.example',Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':'MTIzNDU2Nzg5MDEyMzQ1Ng=='});assert.equal(denied.status,403);
 }finally{instance.stop();}
});
