import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {WebSocket} from 'ws';
import {createLocalGateway} from '../isolation/local-gateway.mjs';
import {loadProductionConfig} from '../isolation/production-config.mjs';
import {root,startServers} from '../server.mjs';

test('production TLS ingress gates access and invalidates old routes across expiry and restart',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'poxey-prod-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 // Reserved example shell names and a known PSL entry. Every socket is sent to loopback.
 const shell='shell.example.com',arcade='arcade.example.net',suffix='github.io';
 const caKey=path.join(directory,'ca.key'),caPath=path.join(directory,'ca.pem');
 const key=path.join(directory,'leaf.key'),cert=path.join(directory,'leaf.pem');
 const csr=path.join(directory,'leaf.csr'),ext=path.join(directory,'extensions');
 const openssl=args=>execFileSync('openssl',args,{stdio:'ignore'});
 openssl(['req','-x509','-newkey','rsa:2048','-noenc','-subj','/CN=Test CA','-days','1','-keyout',caKey,'-out',caPath]);
 openssl(['req','-newkey','rsa:2048','-noenc','-subj','/CN=Unused','-keyout',key,'-out',csr]);
 await writeFile(ext,`basicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:${shell},DNS:${arcade},DNS:*.${suffix}\n`);
 openssl(['x509','-req','-in',csr,'-CA',caPath,'-CAkey',caKey,'-CAcreateserial','-days','1','-extfile',ext,'-out',cert]);
 const tokenFile=path.join(directory,'token'),token=randomBytes(32).toString('base64url');
 await writeFile(tokenFile,token,{mode:0o600});
 const listener=net.createServer().listen(0,'127.0.0.1');
 await once(listener,'listening');
 const {port}=listener.address();
 await new Promise(resolve=>listener.close(resolve));
 const env={POXEY_HTTPS_PORT:String(port),POXEY_SHELL_HOSTNAME:shell,POXEY_ARCADE_HOSTNAME:arcade,
  POXEY_CONTENT_SUFFIX:suffix,POXEY_TLS_KEY_FILE:key,POXEY_TLS_CERT_FILE:cert,POXEY_ACCESS_TOKEN_FILE:tokenFile};
 await assert.rejects(loadProductionConfig({...env,POXEY_CONTENT_SUFFIX:'example.org'},root),/public suffix/);
 await assert.rejects(loadProductionConfig({...env,POXEY_ARCADE_HOSTNAME:'games.example.com'},root),/separate registrable/);
 await assert.rejects(loadProductionConfig({...env,POXEY_SHELL_HOSTNAME:'another.example.org'},root),/cover all/);
 await assert.rejects(loadProductionConfig({...env,POXEY_TLS_KEY_FILE:''},root),/absolute paths/);
 const config=await loadProductionConfig(env,root),ca=await readFile(caPath);
 const authorization='Basic '+Buffer.from('poxey:'+token).toString('base64');
 const origin=`https://${shell}:${port}`;
 const upstream=http.createServer((req,res)=>{
  if(req.headers.host==='example.org')res.setHeader('Set-Cookie','session=a; Secure; HttpOnly; SameSite=Lax');
  res.end(req.headers.cookie||'empty');
 }).listen(0,'127.0.0.1');
 await once(upstream,'listening');
 t.after(()=>{upstream.closeAllConnections();upstream.close();});
 const brokerOptions={resolve:async()=> '93.184.215.14',dial(_secure,options,onResponse){
  return http.request({...options,hostname:'127.0.0.1',port:upstream.address().port},onResponse);
 }};
 let now=Date.now(),app;
 t.after(()=>app?.stop());
 async function start(){
  const gateway=await createLocalGateway({...config,arcadeRoot:root,brokerOptions,now:()=>now});
  app=startServers(port,8801,{},{localIsolation:gateway,bindAddress:config.bindAddress,gameOrigins:false});
  await once(app.servers[0],'listening');
  assert.equal(app.servers.length,1);
  return gateway;
 }
 function request(host,resource,{method='GET',headers={}}={}){
  return new Promise((resolve,reject)=>{
   const req=https.request({hostname:'127.0.0.1',port,servername:host,ca,agent:false,method,path:resource,
    headers:{Host:host+':'+port,...headers}},res=>{
    let body='';res.setEncoding('utf8');res.on('data',data=>body+=data);
    res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));
   });
   req.on('error',reject);req.end();
  });
 }
 const post=(resource,headers={},auth=authorization)=>request(shell,resource,{
  method:'POST',headers:{Origin:origin,Authorization:auth,...headers}
 });
 const open=()=>post('/api/isolation/workspace',{'X-Poxey-Workspace-Request':'1'});
 const allocate=(workspace,destination='https://example.org/',tab='1')=>post('/api/isolation/route',{'X-Poxey-Workspace':workspace,
  'X-Poxey-Tab':tab,'X-Poxey-Navigation':'1','X-Poxey-Destination':destination});
 const broker=(route,url)=>request(new URL(route.origin).hostname,'/isolated-http',{
  method:'POST',headers:{Origin:route.origin,'X-Poxey-Route-Capability':route.capability,
   'X-Poxey-Isolated-HTTP':'1','X-Poxey-Upstream-URL':url,'X-Poxey-Upstream-Method':'GET'}
 });
 const gateway=await start();
 assert.equal((await request(shell,'/')).status,401);
 assert.equal((await post('/api/isolation/workspace',{'X-Poxey-Workspace-Request':'1'},'')).status,401);
 const page=await request(shell,'/',{headers:{Authorization:authorization}});
 assert.equal(page.status,200);
 assert.ok(page.headers['content-security-policy'].includes(`https://*.${suffix}:${port} https://${arcade}:${port}`));
 assert.equal((await post('/api/relay/session')).status,403);
 const raw=new WebSocket(`wss://127.0.0.1:${port}/wisp/`,{servername:shell,ca,origin,
  headers:{Host:shell+':'+port,Authorization:authorization}});
 await assert.rejects(once(raw,'open'),/403/);
 const workspace=JSON.parse((await open()).body).workspace;
 const route=JSON.parse((await allocate(workspace)).body);
 const host=new URL(route.origin).hostname;
 const catalog=JSON.parse((await request(arcade,'/arcade/catalog.json')).body);
 assert.equal(catalog.filter(game=>!game.disabled).length,35);
 const beta=catalog.find(game=>!game.disabled&&game.type==='beta-local');
 const gameHost=new URL(beta.runtimeOrigin).hostname;
 assert.ok(gameHost.endsWith('.'+suffix));
 assert.equal((await request(gameHost,'/index.beta.html',{method:'HEAD'})).status,200);
 const first=await broker(route,'https://example.org/');
 assert.equal(first.status,200);
 assert.equal(first.headers['set-cookie'],undefined);
 assert.equal((await broker(route,'https://example.org/')).body,'session=a');
 const foreign=JSON.parse((await allocate(workspace,'https://example.net/','2')).body);
 assert.equal((await broker(foreign,'https://example.net/')).body,'empty');
 assert.equal((await broker(route,'https://example.net/')).status,502);
 assert.match(host,/^r-[a-f0-9-]{36}\.github\.io$/);
 assert.equal((await request(host,'/sw.js?scope=pages')).headers['service-worker-allowed'],'/~/sj/');
 assert.equal((await request(host,'/',{headers:{Host:shell+':'+port}})).status,421);
 assert.equal((await request(host,'/api/assistant/capabilities')).status,404);
 await assert.rejects(request('unassigned.'+suffix,'/'));
 now+=30*60_000+1;
 gateway.prune();
 await assert.rejects(request(host,'/'));
 assert.equal((await allocate(workspace)).status,410);
 const restartKey=JSON.parse((await open()).body).workspace;
 const restartHost=new URL(JSON.parse((await allocate(restartKey)).body).origin).hostname;
 const closed=once(app.servers[0],'close');
 app.stop();app=null;
 await closed;
 await start();
 await assert.rejects(request(restartHost,'/'));
 assert.equal((await allocate(restartKey)).status,410);
 const fresh=JSON.parse((await open()).body).workspace;
 assert.notEqual(new URL(JSON.parse((await allocate(fresh)).body).origin).hostname,restartHost);
});
