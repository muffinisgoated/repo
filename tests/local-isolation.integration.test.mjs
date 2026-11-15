import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {WebSocket,WebSocketServer} from 'ws';
import {createLocalGateway} from '../isolation/local-gateway.mjs';
import {answerLocalDNS} from '../isolation/local-dns.mjs';
import {initializeLocalCA,localCertificateIssuer} from '../isolation/local-certificates.mjs';
import {randomUUID} from 'node:crypto';
import {root,startServers} from '../server.mjs';

const fixtureA='https://site-a.example';
const fixtureB='https://site-b.example';
const tcpPort=async()=>{
 const server=net.createServer();
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 const {port}=server.address();
 await new Promise(resolve=>server.close(resolve));
 return port;
};

test('local DNS answers active .test names and rejects recursive and malformed questions',()=>{
 function query(host,type=1){
  const header=Buffer.from('123401000001000000000000','hex');
  const name=host.split('.').flatMap(label=>[label.length,...Buffer.from(label)]);
  return Buffer.concat([header,Buffer.from([...name,0,0,type,0,1])]);
 }
 const known=host=>host==='shell.test';
 const a=answerLocalDNS(query('shell.test'),known);
 assert.equal(a.readUInt16BE(6),1);
 assert.deepEqual([...a.subarray(-4)],[127,0,0,1]);
 assert.equal(answerLocalDNS(query('shell.test',28),known).readUInt16BE(6),0);
 assert.equal(answerLocalDNS(query('unknown.test'),known).readUInt16BE(2)&15,3);
 assert.equal(answerLocalDNS(query('other.example'),known),undefined);
 assert.equal(answerLocalDNS(Buffer.from([0,1]),known),undefined);
});

test('normal isolated shell and broker enforce TLS, workspace, credentials and WebSocket grants',async t=>{
 const scratch=await mkdtemp(path.join(tmpdir(),'poxey-gateway-test-'));
 t.after(()=>rm(scratch,{recursive:true,force:true}));
 const directory=path.join(scratch,'ca');
 await initializeLocalCA(directory);
 const ca=await readFile(path.join(directory,'root.pem'));
 const received=[];
 const fixture=http.createServer((req,res)=>{
  received.push({host:req.headers.host,cookie:req.headers.cookie,path:req.url,origin:req.headers.origin});
  if(req.url==='/redirect'||req.url==='/converted'){
   res.writeHead(req.url==='/redirect'?307:303,{Location:fixtureB+'/'}).end();return;
  }
  if(req.url==='/cors'){
   res.setHeader('Access-Control-Allow-Origin',fixtureA);
   res.setHeader('Access-Control-Expose-Headers','X-Public');
   res.setHeader('X-Public','visible');
   res.setHeader('X-Private','not exposed');
   res.setHeader('Set-Cookie','foreign=synthetic; Secure; HttpOnly');
  }
  if(req.url==='/seed'){
   res.setHeader('Service-Worker-Allowed','/');
   res.setHeader('Set-Cookie',['owner=synthetic; Path=/; Secure; HttpOnly; SameSite=Strict',
    'lax=synthetic; Path=/; Secure; HttpOnly; SameSite=Lax']);
  }
  res.end('Ordinary route fixture rendered by upstream');
 });
 const peerServer=new WebSocketServer({noServer:true});
 fixture.on('upgrade',(req,socket,head)=>{
  received.push({host:req.headers.host,cookie:req.headers.cookie,path:req.url});
  peerServer.handleUpgrade(req,socket,head,peer=>peer.on('message',(data,binary)=>peer.send(data,{binary})));
 });
 fixture.listen(0,'127.0.0.1');
 await once(fixture,'listening');
 t.after(()=>{for(const peer of peerServer.clients)peer.terminate();peerServer.close();fixture.closeAllConnections();fixture.close();});
 const port=await tcpPort();
 let now=Date.now();
 const gateway=await createLocalGateway({port,arcadeRoot:root,now:()=>now,issue:await localCertificateIssuer(directory),
  brokerOptions:{resolve:async()=> '93.184.215.14',dial(_secure,options,onResponse){
   assert.equal(options.hostname,'93.184.215.14');
   assert.ok(options.rejectUnauthorized);
   return http.request({...options,hostname:'127.0.0.1',port:fixture.address().port},onResponse);
  }},
  socketOptions:{resolve:async()=> '93.184.215.14',connect(target,protocols,options){
   assert.equal(target.hostname,'site-a.example');
   assert.equal(options.followRedirects,false);
   return new WebSocket('ws://127.0.0.1:'+fixture.address().port+target.pathname,protocols,options);
  }}
 });
 const running=startServers(port,8801,{}, {localIsolation:gateway,gameOrigins:false,localUnityDirectory:path.join(root,'local-games/tunnel-rush')});
 await once(running.servers[0],'listening');
 t.after(()=>running.stop());
 const shell=running.uiOrigin;
 function request(origin,resource,{method='GET',headers={},host,sni}={}){
  const authority=new URL(origin);
  return new Promise((resolve,reject)=>{
   const req=https.request({hostname:'127.0.0.1',port,servername:sni||authority.hostname,ca,agent:false,
    path:resource,method,headers:{Host:host||authority.host,...headers}},res=>{
    let output='';res.setEncoding('utf8');res.on('data',part=>output+=part);
    res.on('end',()=>resolve({status:res.statusCode,output,headers:res.headers}));
   });
   req.on('error',reject);req.end();
  });
 }
 async function workspace(){
  const result=await request(shell,'/runtime-config.js');
  assert.equal(result.status,200);
  assert.equal(result.headers['cross-origin-resource-policy'],'same-origin');
  const config=JSON.parse(result.output.slice('window.POXEY_RUNTIME='.length,-1));
  assert.equal(config.proxyOrigin,null);
  assert.equal(config.arcadeOrigin,gateway.arcade.origin);
  assert.equal(config.isolatedWorkspace,undefined);
  assert.equal((await request(shell,'/api/isolation/workspace',{method:'POST',
   headers:{Origin:'https://site-a.example','X-Poxey-Workspace-Request':'1'}})).status,403);
  const opened=await request(shell,'/api/isolation/workspace',{method:'POST',
   headers:{Origin:shell,'X-Poxey-Workspace-Request':'1'}});
  assert.equal(opened.status,200);
  return JSON.parse(opened.output).workspace;
 }
 const routeHeaders=(key,tab,version)=>({Origin:shell,'X-Poxey-Workspace':key,
  'X-Poxey-Tab':String(tab),'X-Poxey-Navigation':String(version)});
 const allocate=(key,destination,tab,version,source='')=>request(shell,'/api/isolation/route',{
  method:'POST',headers:{...routeHeaders(key,tab,version),'X-Poxey-Destination':destination,'X-Poxey-Source':source}
 });
 const capabilityHeader=(route)=>({Origin:route.origin,'X-Poxey-Route-Capability':route.capability});
 function proxy(route,url,headers={},method='GET') {
  return request(route.origin,'/isolated-http',{method:'POST',
   headers:{...capabilityHeader(route),'X-Poxey-Isolated-HTTP':'1','X-Poxey-Upstream-URL':url,'X-Poxey-Upstream-Method':method,...headers}});
 }
 await t.test('Arcade has a dedicated launcher and serves all 35 catalog entries on vetted origins',async()=>{
  const arcade=gateway.arcade.origin;
  const response=await request(arcade,'/arcade/host.html');
  assert.equal(response.status,200);
  assert.ok(response.headers['content-security-policy'].includes('frame-ancestors '+shell));
  assert.match((await request(arcade,'/arcade/host-config.js')).output,/"https":true/);
  assert.match((await request(arcade,'/arcade/games/dino/index.html')).headers['content-type'],/^text\/plain/);
  const tunnel=await request(arcade,'/arcade-unity/runtime/tunnel-rush?token='+randomUUID(),{method:'HEAD'});
  assert.equal(tunnel.status,200);
  assert.match(tunnel.headers['content-security-policy'],/sandbox allow-scripts allow-pointer-lock/);
  for(const resource of ['/runtime-config.js','/sw.js?scope=pages','/isolated-http','/api/assistant/capabilities','/arcade/host.html.extra']){
   assert.equal((await request(arcade,resource)).status,404,resource);
  }
  assert.equal((await request(arcade,'/arcade/host.html',{host:new URL(shell).host})).status,421);
  const games=JSON.parse((await request(arcade,'/arcade/catalog.json')).output);
  const shellGames=JSON.parse((await request(shell,'/arcade/catalog.json')).output);
  assert.deepEqual(games,shellGames);
  assert.equal(games.filter(game=>!game.disabled).length,35);
  const beta=games.filter(game=>game.type==='beta-local'&&!game.disabled);
  assert.equal(beta.length,24);
  assert.equal(new Set(beta.map(game=>game.runtimeOrigin)).size,beta.length);
  for(const game of beta){
   const asset=await request(game.runtimeOrigin,'/index.beta.html',{method:'HEAD',headers:{Origin:arcade}});
   assert.equal(asset.status,200,game.id);
   assert.equal(asset.headers['access-control-allow-origin'],arcade);
  }
  const game=beta[0].runtimeOrigin;
  assert.match((await request(game,'/diagnostics.js')).output,/https:\/\/arcade\.test:/);
  assert.equal((await request(game,'/index.beta.html',{headers:{Origin:beta[1].runtimeOrigin}})).status,403);
  assert.equal((await request(game,'/arcade/host.html')).status,404);
  assert.equal((await request(game,'/api/assistant/capabilities')).status,404);
  const endpoint='/arcade-presence/'+randomUUID()+'/';
  const monitor=socket({origin:shell},[],endpoint);
  await once(monitor,'open');
  monitor.close();
  await once(monitor,'close');
  await assert.rejects(once(socket({origin:arcade},[],endpoint),'open'));
  await assert.rejects(once(socket({origin:shell},[],'/wisp/'),'open'));
 });

 const one=await workspace(),two=await workspace();
 const a=JSON.parse((await allocate(one,fixtureA+'/seed',1,1)).output);
 const b=JSON.parse((await allocate(one,fixtureB+'/',2,1)).output);
 const other=JSON.parse((await allocate(two,fixtureA+'/',1,1)).output);
 assert.notEqual(a.origin,b.origin);
 assert.notEqual(a.origin,other.origin);
 assert.match(new URL(a.origin).hostname,/^r-[a-f0-9-]+\.test$/);
 assert.equal((await request(a.origin,'/?isolated=1')).status,200);
 const worker=await request(a.origin,'/sw.js?scope=pages');
 assert.equal(worker.status,200);
 assert.equal(worker.headers['service-worker-allowed'],'/~/sj/');
 assert.equal((await request(a.origin,'/api/assistant/capabilities')).status,404);
 assert.equal((await request(a.origin,'/arcade/host.html')).status,404);
 assert.equal((await request(a.origin,'/',{host:new URL(shell).host})).status,421);
 await assert.rejects(request('https://unassigned.test:'+port,'/'));
 assert.equal((await proxy(a,fixtureA+'/premature')).status,403);
 const seeded=await proxy(a,fixtureA+'/seed');
 assert.equal(seeded.status,200);
 assert.match(seeded.output,/Ordinary route fixture/);
 assert.doesNotMatch(seeded.headers['x-poxey-upstream-response']?Buffer.from(seeded.headers['x-poxey-upstream-response'],'base64').toString():'',/synthetic|set-cookie|service-worker-allowed/i);
 assert.equal((await proxy(a,fixtureA+'/')).status,200);
 assert.match(received.at(-1).cookie,/owner=synthetic/);
 assert.equal((await proxy(b,fixtureB+'/')).status,200);
 assert.equal(received.at(-1).cookie,undefined);
 assert.equal((await proxy(other,fixtureA+'/')).status,200);
 assert.equal(received.at(-1).cookie,undefined);
 assert.equal((await proxy(a,fixtureB+'/')).status,502);
 const cors=await proxy(a,fixtureB+'/cors');
 assert.equal(cors.status,200);
 assert.equal(received.at(-1).origin,fixtureA);
 assert.equal(received.at(-1).cookie,undefined);
 const corsHeaders=Buffer.from(cors.headers['x-poxey-upstream-response'],'base64').toString();
 assert.match(corsHeaders,/X-Public/i);
 assert.doesNotMatch(corsHeaders,/X-Private|Set-Cookie/i);
 assert.equal((await proxy(a,fixtureB+'/cors',{},'POST')).status,502);
 assert.equal((await proxy(b,fixtureB+'/')).status,200);
 assert.equal(received.at(-1).cookie,undefined);
 assert.equal((await proxy(a,fixtureA+'/',{Origin:b.origin})).status,403);
 assert.equal((await proxy(other,fixtureA+'/',{'X-Poxey-Route-Capability':a.capability})).status,403);
 assert.equal((await proxy(a,fixtureA+'/redirect',{},'POST')).status,409);
 const converted=await proxy(a,fixtureA+'/converted',{},'POST');
 assert.equal(Buffer.from(converted.headers['x-poxey-fixture-location'],'base64').toString(),fixtureB+'/');
 const redirect=await proxy(a,fixtureA+'/redirect');
 assert.equal(Buffer.from(redirect.headers['x-poxey-fixture-location'],'base64').toString(),fixtureB+'/');
 assert.equal((await allocate(one,fixtureA+'/',1,1)).status,409);
 const aAgain=JSON.parse((await allocate(one,fixtureA+'/',1,2,fixtureB)).output);
 assert.equal(aAgain.origin,a.origin);
 assert.equal((await proxy(a,fixtureA+'/')).status,403);
 assert.equal((await proxy(aAgain,fixtureA+'/')).status,200);
 assert.equal(received.at(-1).cookie,'lax=synthetic');

 const ticket=target=>request(aAgain.origin,'/isolated-ws-ticket',{method:'POST',
  headers:{...capabilityHeader(aAgain),'X-Poxey-WebSocket-URL':target}});
 assert.equal((await ticket('wss://site-b.example/echo')).status,403);
 function socket(route,offered,path='/isolated-ws'){
  const name=new URL(route.origin);
  return new WebSocket('wss://'+name.host+path,offered,{ca,origin:route.origin,agent:false,
   lookup(_host,options,done){if(options.all)done(null,[{address:'127.0.0.1',family:4}]);else done(null,'127.0.0.1',4);}});
 }
 const expiring=await ticket('wss://site-a.example/echo');
 assert.equal(expiring.status,200);
 now+=10_001;
 const expired=socket(aAgain,['poxey-route.v1',JSON.parse(expiring.output).token]);
 await assert.rejects(once(expired,'open'));
 const refreshed=JSON.parse((await ticket('wss://site-a.example/echo')).output).token;
 const wrong=socket(b,['poxey-route.v1',refreshed]);
 await assert.rejects(once(wrong,'open'));
 const raw=socket(aAgain,[],'/wisp/');
 await assert.rejects(once(raw,'open'));
 const peer=socket(aAgain,['poxey-route.v1',refreshed]);
 assert.equal(JSON.parse(String((await once(peer,'message'))[0])).protocol,'');
 const echoed=once(peer,'message');
 peer.send('echo');
 assert.equal(String((await echoed)[0]),'echo');
 const replay=socket(aAgain,['poxey-route.v1',refreshed]);
 await assert.rejects(once(replay,'open'));
 const closed=once(peer,'close');
 assert.equal((await request(shell,'/api/isolation/tab-close',{method:'POST',headers:routeHeaders(one,1,3)})).status,204);
 await closed;
 assert.equal((await proxy(aAgain,fixtureA+'/')).status,403);
 now+=31*60_000;
 gateway.prune();
 await assert.rejects(request(other.origin,'/'));
});
