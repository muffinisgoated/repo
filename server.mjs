import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {createBetaArcade} from './beta-arcade/routes.mjs';
import {createGameLab} from './game-lab/routes.mjs';
import {ArcadeMonitor} from './arcade-telemetry/monitor.mjs';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {server as wisp,logging} from '@mercuryworkshop/wisp-js/server';
import {resolvePublicHost,SafeTCPSocket} from './security.mjs';
import {WebSocketServer} from 'ws';
import {capacityLimits,TokenBucket} from './capacity.mjs';
import {ConnectedClients,connectionClient,PRESENCE_PING_MS} from './connected-clients.mjs';
import {ActiveSessions,sessionActivity} from './sessions.mjs';
import {createVisitorAnalytics,visitorRoutes} from './analytics/visitors.mjs';
import {createMonitoring} from './monitoring.mjs';
import {managedConnection} from './wisp-capacity.mjs';
import {installWispReliability} from './wisp-reliability.mjs';
import {createAIRuntime} from './features-backend/runtime.mjs';
import {createRelayAdmission,relayRequest} from './relay-admission.mjs';
import {createUpstreamHTTP} from './isolation/upstream-http.mjs';
import {serveFixtureHTTP} from './isolation/fixture-http-route.mjs';
import {createOriginRegistry} from './isolation/origin-registry.mjs';
import {startRelayOperator} from './relay-operator.mjs';
installWispReliability(wisp);
export const root=path.dirname(fileURLToPath(import.meta.url));
export function publicFile(base,raw) {
  try {const part=decodeURIComponent(raw.split('?')[0]);if(part.includes('\\')||part.includes('\0')||part.split('/').includes('..'))return null;const realBase=fs.realpathSync(base),file=fs.realpathSync(path.join(base,part==='/'?'index.html':part));return file.startsWith(realBase+path.sep)&&fs.statSync(file).isFile()?file:null;}catch{return null;}
}
export function startServers(port=8800,proxyPort=8801,overrides={},options={}) {
  const sessions=new ActiveSessions(),connectedClients=new ConnectedClients();const presenceTimer=setInterval(()=>connectedClients.sweep(),PRESENCE_PING_MS);presenceTimer.unref();
  const limits=capacityLimits(overrides),metrics=createMonitoring(),budget={streams:0,queued:0},httpRate=new TokenBucket(limits.httpPerSecond,limits.httpBurst);let httpActive=0;
  const isolated=options.localIsolation;
  const uiOrigin=isolated?.uiOrigin||`http://127.0.0.1:${port}`,proxyOrigin=`http://localhost:${proxyPort}`;
  const arcadeOrigin=isolated?.arcade?.origin||proxyOrigin;
  const betaArcade=isolated?.arcade?.beta||createBetaArcade({root,uiOrigin,proxyOrigin});
  const gameLab=createGameLab({directory:options.gameLabDirectory,uiOrigin,proxyOrigin,root});
  // BEGIN TUNNEL UNITY RUNTIME
  const localUnity=createGameLab({directory:options.localUnityDirectory,uiOrigin,proxyOrigin:arcadeOrigin,root,prefix:'/arcade-unity/',ownerPage:false,parentOrigin:arcadeOrigin,manifestName:'runtime-manifest.json',ancestorOrigins:[uiOrigin,arcadeOrigin]});
  // END TUNNEL UNITY RUNTIME
  const ai=createAIRuntime({directory:options.aiDirectory,origin:uiOrigin});
  const visitors=createVisitorAnalytics(options.analyticsDirectory),handleVisitors=visitorRoutes({store:visitors,origin:uiOrigin});
  Object.assign(wisp.options,{allow_direct_ip:false,allow_private_ips:false,allow_loopback_ips:false,allow_udp_streams:false,port_whitelist:[80,443],stream_limit_per_host:limits.streamsPerHost,stream_limit_total:limits.streamsPerConnection,parse_real_ip:false,dns_method:resolvePublicHost,dns_ttl:30000});
  logging.set_level(logging.NONE);
  const proof=options.originProof;
  const proxyRoutes=[{origin:proxyOrigin,site:proof?.sites[0]},
    ...(proof?[{origin:`http://127.0.0.1:${proof.secondaryPort}`,site:proof.sites[1]}]:[])];
  const originRegistry=proof?createOriginRegistry():null;
  if(proof)for(const route of proxyRoutes)route.binding=originRegistry.allocate('local-proof',route.site.upstream,{fixtureOrigin:route.origin});
  const fixtureRoutes=proof?.fixtureHTTP?Object.fromEntries(proxyRoutes.map(route=>[route.binding.upstream,route.origin])):null;
  const fixtureWorkspaces=new Map();
  function pruneFixtureWorkspaces(now) {
    for(const [token,workspace] of fixtureWorkspaces)if(workspace.expires<=now)fixtureWorkspaces.delete(token);
  }
  function openFixtureWorkspace() {
    pruneFixtureWorkspaces(Date.now());
    if(fixtureWorkspaces.size>=32)return null;
    const token=randomBytes(32).toString('hex'),registry=createOriginRegistry();
    const routes=new Map(proxyRoutes.map(route=>[route.origin,
      registry.allocate(token,route.binding.upstream,{fixtureOrigin:route.origin})]));
    const expires=Math.min(...Array.from(routes.values(),route=>route.expires));
    const broker=createUpstreamHTTP({...proof.fixtureHTTP,registry});
    fixtureWorkspaces.set(token,{routes,broker,expires});
    return token;
  }
  const relay=createRelayAdmission();
  const operator=options.relayOperator?startRelayOperator(relay.approve):null;
  operator?.on('error',()=>console.error('Local relay approval service unavailable.'));
  const sockets=new Set(),wispPeers=new Map();let starts=[];
  function releaseSocket(socket){
    wispPeers.delete(socket);
    if(sockets.delete(socket)){metrics.gauge('webSockets',-1);metrics.add('wsClosed');}
  }
  const idleWispTimer=setInterval(()=>{
    const now=Date.now();
    pruneFixtureWorkspaces(now);
    for(const peer of wispPeers.values())if(peer.idleFor(now)>=60000)peer.ws.close(1000,'Idle transport');
  },15000);
  idleWispTimer.unref();
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.wasm':'application/wasm','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};
  function requestHandler(isProxy,gameHandler=null,route=null,arcadeHost=false) {return (req,res)=>{
    metrics.add('httpRequests');
    const count=chunk=>{if(req.method!=='HEAD'&&chunk!=null)metrics.add('httpBodyBytes',typeof chunk==='string'?Buffer.byteLength(chunk):chunk.byteLength);};
    const write=res.write,endResponse=res.end;res.write=function(chunk,...args){count(chunk);return write.call(this,chunk,...args);};res.end=function(chunk,...args){if(typeof chunk!=='function')count(chunk);return endResponse.call(this,chunk,...args);};
    const begun=performance.now();let ended=false,reserved=false;
    const finish=cancelled=>{if(ended)return;ended=true;if(reserved){httpActive--;metrics.gauge('http',-1);}metrics.http(performance.now()-begun);if(cancelled){metrics.add('httpCancelled');metrics.add('httpFailures');}else if(res.statusCode>=400)metrics.add('httpFailures');};res.once('finish',()=>finish(false));res.once('close',()=>finish(!res.writableFinished));
    const expected=gameHandler?new URL(gameHandler.origin).host:isProxy?new URL(route.origin).host:new URL(uiOrigin).host;
    const reporting=!isProxy&&!gameHandler&&req.url==='/api/session/activity';
    const visitorRoute=!isProxy&&!gameHandler&&['/api/analytics/summary','/api/analytics/visit'].includes(req.url);
    const relaySession=!isProxy&&!gameHandler&&req.url==='/api/relay/session';
    const ticketRoute=!isProxy&&!gameHandler&&/^\/api\/relay\/ticket\/(?:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}|ungrouped)$/.test(req.url);
    const isolationAPI=isolated&&!isProxy&&!gameHandler&&['/api/isolation/workspace','/api/isolation/route','/api/isolation/close','/api/isolation/tab-close'].includes(req.url);
    const isolationBroker=isolated&&isProxy&&!arcadeHost&&(req.url==='/isolated-http'||req.url==='/isolated-ws-ticket');
    const fixtureClose=fixtureRoutes&&!isProxy&&!gameHandler&&req.url==='/api/isolated-fixture/close';
    const fixtureHTTP=fixtureRoutes&&isProxy&&req.url.startsWith('/origin-proof-http?');
    const aiRoute=!isProxy&&!gameHandler&&['/api/assistant/capabilities','/api/assistant/session','/api/assistant/chat','/api/assistant/usage'].includes(req.url);
    if(req.headers.host!==expected||(!['GET','HEAD'].includes(req.method)&&!((reporting||visitorRoute||aiRoute||relaySession||ticketRoute||fixtureHTTP||fixtureClose||isolationAPI||isolationBroker)&&req.method==='POST'))){res.writeHead(403);res.end();return;}
    if(httpActive>=limits.httpConcurrent||!httpRate.take()){metrics.add('httpOverloads');metrics.add('rateLimits');res.writeHead(503,{'Retry-After':'1'});res.end('Local service busy. Try again shortly.');return;}httpActive++;reserved=true;metrics.gauge('http',1);
    if(gameHandler){gameHandler.handle(req,res);return;}
    const pathname=req.url.split('?')[0];
    const arcadeAsset=arcadeHost&&pathname.startsWith('/arcade/games/');
    if(arcadeHost&&!arcadeAsset&&!pathname.startsWith('/arcade-unity/')&&
      !/^\/arcade\/(?:host\.(?:html|mjs|css)|host-config\.js|saves\.mjs|catalog\.json)$/.test(pathname)){
      res.writeHead(404,{'Cache-Control':'no-store'}).end();return;
    }
    if(isProxy&&(arcadeHost||!isolated)&&req.url==='/arcade/host-config.js'){
      res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff'});
      return res.end('export default '+JSON.stringify({uiOrigin,https:Boolean(arcadeHost),gameSuffix:arcadeHost?isolated.contentSuffix:null})+';');
    }
    if(isolationAPI){void isolated.shellRequest(req,res);return;}
    if(isolationBroker){void isolated.contentRequest(req,res,route);return;}
    if(isolated&&isProxy&&!arcadeHost){
      res.setHeader('Origin-Agent-Cluster','?1');
      if(req.url.split('?')[0]!=='/')res.setHeader('Cross-Origin-Resource-Policy','same-origin');
      if(req.url==='/isolation-config.js'){
        const config={uiOrigin,upstream:route.route.upstream,broker:true,isolated:true};
        res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store',
          'Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff'});
        return res.end('export default '+JSON.stringify(config)+';');
      }
      if(req.url==='/sw.js?scope=pages'){
        res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
          'Service-Worker-Allowed':'/~/sj/'});
        return res.end('self.POXEY_ISOLATED_SHELL='+JSON.stringify(uiOrigin)+';\n'+fs.readFileSync(path.join(root,'proxy-public/sw.js'),'utf8'));
      }
      if(!/^\/(?:$|bridge\.(?:js|css)$|[a-z-]+\.mjs$|(?:controller|scramjet)\/[a-z.-]+$|route-recovery\.js$|~\/sj\/)/.test(req.url.split('?')[0])){
        res.writeHead(404,{'Cache-Control':'no-store'}).end();return;
      }
    }
    if(proof&&!isProxy&&proof.serve(req,res,proxyRoutes))return;
    if(proof&&isProxy&&originRegistry.resolveHost(req.headers.host)!==route.binding){res.writeHead(403).end();return;}
    if(fixtureClose){
      const token=req.headers['x-poxey-fixture-workspace'];
      if(req.method!=='POST'||req.headers.origin!==uiOrigin||
        !['same-origin',undefined].includes(req.headers['sec-fetch-site'])||
        req.headers['transfer-encoding']||Number(req.headers['content-length']||0)!==0||
        !fixtureWorkspaces.has(token)){res.writeHead(403).end();return;}
      fixtureWorkspaces.delete(token);res.writeHead(204,{'Cache-Control':'no-store'}).end();return;
    }
    if(fixtureHTTP){
      const workspace=fixtureWorkspaces.get(req.headers['x-poxey-fixture-workspace']);
      if(!workspace||workspace.expires<=Date.now()){res.writeHead(403,{'Cache-Control':'no-store'}).end();return;}
      void serveFixtureHTTP(req,res,{broker:workspace.broker,route:workspace.routes.get(route.origin)});return;
    }
    if(proof&&isProxy&&req.url==='/origin-proof-config.js'){
      res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(`export default ${JSON.stringify({upstream:route.site.upstream,broker:Boolean(fixtureRoutes)})};`);return;
    }
    if(betaArcade.handle(req,res,isProxy))return;
    if(req.url==='/arcade/catalog.json'){try{const base=JSON.parse(fs.readFileSync(path.join(root,'public/arcade/catalog.json'))),data=JSON.stringify([...base,...betaArcade.catalog]);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(503).end();}return;}
    if(gameLab(req,res,isProxy))return;
    // BEGIN TUNNEL UNITY ROUTE
    if(localUnity(req,res,isProxy))return;
    // END TUNNEL UNITY ROUTE
    if(visitorRoute){handleVisitors(req,res);return;}
    if(relaySession||ticketRoute){
      if(fixtureRoutes||isolated){res.writeHead(403).end();return;}
      const key=ticketRoute?req.url.split('/').at(-1):null;
      const client=key&&key!=='ungrouped'?connectionClient('/wisp/'+key+'/'):null;
      const scope=ticketRoute&&proof?req.headers['x-poxey-relay-origin']:null;
      const binding=proof&&proxyRoutes.find(route=>route.origin===scope)?.binding;
      if(ticketRoute&&proof&&!originRegistry.authorize('local-proof',binding?.id)){res.writeHead(403).end();return;}
      relayRequest(req,res,{admission:relay,origin:uiOrigin,client,scope:binding?.id||null});return;
    }
    if(aiRoute){void ai.handle(req,res).catch(()=>{if(!res.headersSent)res.writeHead(503,{'Cache-Control':'no-store'});res.end();});return;}
    if(reporting){sessionActivity(req,res,{sessions,origin:uiOrigin});return;}
    if(!isProxy&&req.url==='/runtime-config.js'){
      if((fixtureRoutes||isolated)&&!['same-origin',undefined].includes(req.headers['sec-fetch-site'])){
        res.writeHead(403,{'Cache-Control':'no-store'}).end();return;
      }
      const fixtureWorkspace=fixtureRoutes&&req.method==='GET'?openFixtureWorkspace():null;
      res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store',
        'Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff'});
      res.end(`window.POXEY_RUNTIME=${JSON.stringify({proxyOrigin:isolated?null:proxyOrigin,arcadeOrigin:isolated?isolated.arcade?.origin||null:proxyOrigin,uiOrigin,contentSuffix:isolated?.contentSuffix,fixtureRoutes,fixtureWorkspace,isolated:Boolean(isolated)})};`);return;
    }
    const baseline=!isProxy&&req.url==='/baseline.html';
    if(baseline&&isolated?.production){res.writeHead(404).end();return;}
    if(isProxy&&req.url.startsWith('/~/sj/')){
      res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
      res.end(req.method==='HEAD'?undefined:'The page worker did not intercept this request. Reload this tab.');
      return;
    }
    const file=arcadeAsset?publicFile(path.join(root,'proxy-public/arcade/games'),req.url.slice('/arcade/games'.length)):baseline?path.join(root,'originals/PoxeyX1-Web.html'):publicFile(path.join(root,isProxy?'proxy-public':'public'),req.url);
    if(!file){res.writeHead(404);res.end('Not found');return;}
    const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=(), display-capture=(), usb=()','Cache-Control':file.endsWith('.html')?'no-store':/\.(?:js|mjs|css)$/.test(file)?'no-store':'public, max-age=3600'};
    headers['Content-Security-Policy']=isProxy?`frame-ancestors ${uiOrigin}; object-src 'none'${isolated&&!arcadeHost?"; frame-src 'self'; connect-src 'self'; base-uri 'none'":""}`:baseline?"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; object-src 'none'":`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src ${isolated?isolated.frameSources:proxyRoutes.map(route=>route.origin).join(' ')}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
    if(arcadeHost){
      headers['Origin-Agent-Cluster']='?1';
      if(arcadeAsset&&file.endsWith('.html'))headers['Content-Type']='text/plain; charset=utf-8';
    }
    const size=fs.statSync(file).size;let start=0,end=size-1,status=200;
    headers['Accept-Ranges']='bytes';
    if(req.headers.range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}
      start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
      end=match[1]?(match[2]?Math.min(size-1,Number(match[2])):size-1):size-1;
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return;}
      status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
    }
    const compress=status===200&&/\.(?:html|js|mjs|css|json|svg)$/.test(file)&&/\bgzip\b/.test(req.headers['accept-encoding']||'');
    if(compress){headers['Content-Encoding']='gzip';headers.Vary='Accept-Encoding';}else headers['Content-Length']=Math.max(0,end-start+1);
    res.writeHead(status,headers);if(req.method==='HEAD'){res.end();return;}
    const stream=fs.createReadStream(file,{start,end:Math.max(0,end)}),encoder=compress?zlib.createGzip():null;
    // Client cancellation must release file descriptors and compression work.
    res.once('close',()=>{stream.destroy();encoder?.destroy();});
    stream.on('error',()=>res.destroy());if(encoder)stream.pipe(encoder).on('error',()=>res.destroy()).pipe(res);else stream.pipe(res);
  };}
  const serve=(...args)=>http.createServer(requestHandler(...args));
  const shellHandler=requestHandler(false);
  const arcadeHost=isolated?.arcade&&requestHandler(true,null,{origin:arcadeOrigin},true);
  const gameHandlers=new Map();
  for(const {handler} of isolated?.arcade?.beta.origins||[])gameHandlers.set(handler,requestHandler(false,handler));
  const main=isolated?isolated.server((req,res,authority)=>{
    if(authority==='shell')return shellHandler(req,res);
    if(authority==='arcade')return arcadeHost(req,res);
    if(gameHandlers.has(authority))return gameHandlers.get(authority)(req,res);
    return requestHandler(true,null,{...authority,origin:authority.route.origin})(req,res);
  },(req,socket,head)=>arcade.upgrade(req,socket,head,uiOrigin)):serve(false);
  const proxies=isolated?[]:proxyRoutes.map(route=>({route,server:serve(true,null,route)}));
  const arcade=new ArcadeMonitor({catalog:options.arcadeCatalog||path.join(root,'public/arcade/catalog.json'),directory:options.arcadeDirectory,extraGames:options.arcadeCatalog?[]:betaArcade.catalog});
  if(!isolated)main.on('upgrade',(req,socket,head)=>arcade.upgrade(req,socket,head,uiOrigin));
  const wsServer=new WebSocketServer({noServer:true,maxPayload:limits.messageBytes,perMessageDeflate:false});
  for(const {route,server} of proxies)server.on('upgrade',(req,socket,head)=>{
    const deny=()=>{metrics.add('wsRejected');socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');};
    if(fixtureRoutes)return deny();
    if(req.headers.host!==new URL(route.origin).host||req.headers.origin!==route.origin)return deny();
    const target=/^(\/wisp\/(?:[a-f0-9-]{36}\/)?)\?ticket=([a-f0-9]{64})$/.exec(req.url);
    if(!target)return deny();
    let clientID;
    try{clientID=connectionClient(target[1]);}catch{return deny();}
    const binding=proof?originRegistry.resolveHost(req.headers.host):null;
    if(proof&&binding!==route.binding)return deny();
    const grant=relay.consume(target[2],clientID,binding?.id||null);
    if(!grant)return deny();
    starts=starts.filter(time=>Date.now()-time<60000);
    if(starts.length<limits.upgradesPerMinute&&sockets.size>=limits.webSockets){
      const now=Date.now();
      const idle=[...wispPeers.entries()].map(([socket,peer])=>({socket,peer,idleFor:peer.idleFor(now)}))
        .filter(entry=>entry.idleFor>=5000).sort((a,b)=>b.idleFor-a.idleFor)[0];
      if(idle){idle.peer.ws.terminate();releaseSocket(idle.socket);}
    }
    if(sockets.size>=limits.webSockets||starts.length>=limits.upgradesPerMinute){metrics.add('wsRejected');metrics.add('rateLimits');socket.end('HTTP/1.1 503 Service Unavailable\r\nRetry-After: 1\r\nConnection: close\r\n\r\n');return;}
    starts.push(Date.now());sockets.add(socket);metrics.gauge('webSockets',1);
    const transferGuard=setInterval(()=>{if(socket.bytesRead+socket.bytesWritten>limits.connectionBytes){metrics.add('rateLimits');socket.destroy();}},1000);transferGuard.unref();
    const expiration=setTimeout(()=>socket.destroy(),Math.max(0,Math.min(grant.expires,binding?.expires??Infinity)-Date.now()));expiration.unref();
    socket.once('close',()=>{clearTimeout(expiration);clearInterval(transferGuard);releaseSocket(socket);});
    try{wsServer.handleUpgrade(req,socket,head,ws=>{metrics.add('wsOpened');connectedClients.add(ws,clientID);const peer=managedConnection(ws,{limits,metrics,budget,Socket:route.site?.Socket,destination:binding?.upstream,wispVersion:req.headers['sec-websocket-protocol']&&wisp.options.wisp_version===2?2:1});wispPeers.set(socket,{ws,idleFor:peer.idleFor});});}catch{metrics.add('wsFailures');socket.destroy();}
  });
  const servers=[main,...proxies.map(({server})=>server)];for(const server of servers)server.on('error',error=>{console.error('Local server error:',error.message);stop();process.exitCode=1;});
  if(port===8800&&proxyPort===8801&&options.gameOrigins!==false)for(const {game,handler} of betaArcade.origins){const server=serve(false,handler);server.on('error',()=>{game.disabled=true;game.beta.originUnavailable=true;arcade.mtime=null;console.error('Game origin unavailable: '+game.id);});servers.push(server);server.listen(Number(new URL(handler.origin).port),'127.0.0.1');}
  for(const server of servers){server.maxConnections=128;server.headersTimeout=10000;server.requestTimeout=15000;server.keepAliveTimeout=5000;server.on('drop',()=>metrics.add('httpOverloads'));server.on('connection',socket=>{metrics.gauge('acceptedTcp',1);socket.once('close',()=>metrics.gauge('acceptedTcp',-1));});}
  main.listen(port,isolated?.production?(options.bindAddress||'127.0.0.1'):'127.0.0.1');for(const [index,{server}] of proxies.entries())server.listen(index?proof.secondaryPort:proxyPort,'127.0.0.1');
  function stop(){isolated?.close();fixtureWorkspaces.clear();originRegistry?.revokeWorkspace('local-proof');operator?.close();clearInterval(idleWispTimer);arcade.close();clearInterval(presenceTimer);connectedClients.close();visitors.close();sessions.clear();for(const socket of sockets)socket.destroy();for(const server of servers){server.closeAllConnections();server.close();}wsServer.close();metrics.close();ai.close();}
  return {servers,stop,uiOrigin,proxyOrigin,relay,diagnostics:()=>({webSockets:sockets.size}),monitoring:()=>{const snapshot=metrics.snapshot(),aiSnapshot=ai.snapshot();if(aiSnapshot.available)delete snapshot.unavailable.ai;return {...snapshot,ai:aiSnapshot,arcade:arcade.snapshot(),sessions:sessions.snapshot(),proxyClients:connectedClients.snapshot(),visitors:visitors.snapshot(),service:{listenersReady:servers.every(server=>server.listening)}};},limits};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const running=startServers(8800,8801,{}, {relayOperator:true,localUnityDirectory:path.join(root,'local-games/tunnel-rush'),arcadeDirectory:path.join(root,'arcade-telemetry/.state'),aiDirectory:path.join(root,'features-backend/.state'),analyticsDirectory:process.env.POXEY_VISITOR_ANALYTICS==='off'?null:path.join(root,'analytics/.state')});console.log(`PoxeyX1 Web Edition: ${running.uiOrigin}\nSeparate page runtime: ${running.proxyOrigin}\nLocal development only.`);
  process.on('SIGINT',running.stop);process.on('SIGTERM',running.stop);
}
