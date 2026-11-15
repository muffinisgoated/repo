import {randomBytes} from 'node:crypto';
import https from 'node:https';
import {parse as parseDomain} from 'tldts';
import {createOriginRegistry} from './origin-registry.mjs';
import {createUpstreamHTTP} from './upstream-http.mjs';
import {serveBrokerHTTP} from './fixture-http-route.mjs';
import {shellName} from './local-certificates.mjs';
import {createLocalWebSockets} from './local-websockets.mjs';
import {TokenBucket} from '../capacity.mjs';
import {arcadeName,prepareLocalArcade} from './local-arcade.mjs';

const hex=/^[a-f0-9]{64}$/;
const secret=()=>randomBytes(32).toString('hex');
const maxWorkspaces=24;

export async function createLocalGateway({port,issue,arcadeRoot,production,now=Date.now,brokerOptions={},socketOptions={}}) {
 if(!Number.isInteger(port)||port<(production?1:1024)||port>65535)throw Error('Invalid local HTTPS port');
 const contentSuffix=production?.contentSuffix||'test';
 const originFor=name=>`https://${name}${port===443?'':':'+port}`;
 const shellHostname=production?.shellHostname||shellName;
 const uiOrigin=originFor(shellHostname),uiHost=new URL(uiOrigin).host;
 const arcadeOrigin=originFor(production?.arcadeHostname||arcadeName);
 const gameOrigin=id=>originFor(`game-${id==='local-slope'?'slope':Number(id.slice(3))}.${contentSuffix}`);
 const registry=createOriginRegistry({originForId:id=>originFor(`r-${id}.${contentSuffix}`),now});
 const broker=createUpstreamHTTP({...brokerOptions,registry});
 const shell=await issue(new URL(uiOrigin).hostname);
 const arcade=arcadeRoot?await prepareLocalArcade({root:arcadeRoot,uiOrigin,origin:arcadeOrigin,gameOrigin,issue}):null;
 const frameSources=`https://*.${contentSuffix}${port===443?'':':'+port} ${arcadeOrigin}`;
 const sockets=createLocalWebSockets({...socketOptions,now,cookie:broker.socketCookie,
  allowed:route=>Boolean(routeFor(new URL(route.origin).hostname))});
 const workspaces=new Map(),bindings=new Map();
 const allocations=new TokenBucket(1,8);
 let issuing=0;

 const respond=(res,status,value)=>{
  res.writeHead(status,{'Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin',
   'X-Content-Type-Options':'nosniff','Content-Type':'application/json'});
  res.end(value&&JSON.stringify(value));
 };
 function closeWorkspace(key) {
  const workspace=workspaces.get(key);
  if(!workspace)return;
  clearTimeout(workspace.expiration);
  workspace.cancel.abort();
  registry.revokeWorkspace(key);
  broker.releaseWorkspace(key);
  for(const id of workspace.routes)bindings.delete(id);
  workspaces.delete(key);
 }
 function prune() {
  sockets.prune();
  for(const [key,workspace] of workspaces)if(workspace.expires<=now())closeWorkspace(key);
 }
 function openWorkspace() {
  prune();
  if(workspaces.size>=maxWorkspaces)return null;
  const key=secret();
  const expiration=setTimeout(()=>closeWorkspace(key),30*60_000);
  expiration.unref();
  workspaces.set(key,{expires:now()+30*60_000,expiration,routes:new Set(),tabs:new Map(),cancel:new AbortController()});
  return key;
 }
 function routeFor(host) {
  if(typeof host!=='string')return null;
  const route=registry.resolveHost(port===443?host:host+':'+port);
  const workspace=route&&workspaces.get(route.workspace);
  const binding=route&&bindings.get(route.id);
  return workspace?.expires>now()&&binding?.certificate?{route,binding,workspace}:null;
 }
 function allowAuthority(req) {
  const name=req.socket.servername;
  const hosts=req.headersDistinct?.host||[req.headers.host];
  if(hosts.length!==1)return null;
  if(name===shellHostname&&hosts[0]===uiHost)return 'shell';
  if(!name||hosts[0]!==(port===443?name:name+':'+port))return null;
  return arcade?.hosts.get(name)?.authority||routeFor(name);
 }
 function server(handler,shellUpgrade) {
  const result=https.createServer({key:shell.key,cert:shell.cert,minVersion:'TLSv1.2',
   handshakeTimeout:5000,
   SNICallback(host,done) {
    const context=host===shellHostname?shell.context:arcade?.hosts.get(host)?.certificate.context||routeFor(host)?.binding.certificate.context;
    done(context?null:Error('Unknown local TLS authority'),context);
   }},(req,res)=>{
    const authority=allowAuthority(req);
    if(!authority){respond(res,421);return;}
    if(authority==='shell'&&production&&!production.authorized(req)){
    res.writeHead(401,{'WWW-Authenticate':'Basic realm="PoxeyX1", charset="UTF-8"','Cache-Control':'no-store'}).end();
    return;
   }
   handler(req,res,authority);
   });
  result.maxConnections=128;
  result.requestTimeout=15000;
  result.headersTimeout=10000;
  result.on('upgrade',(req,socket,head)=>{
   const authority=allowAuthority(req);
   if(authority==='shell'&&shellUpgrade&&(!production||production.authorized(req)))return shellUpgrade(req,socket,head);
   if(!authority?.route)return socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
   sockets.upgrade(req,socket,head,authority.route);
  });
  return result;
 }
 function navigate(origin,value) {
  try{
   const target=new URL(value);
   if(target.href.length>4096)return null;
   const source=origin&&new URL(origin);
   const site=url=>parseDomain(url.hostname,{allowPrivateDomains:true}).domain||url.hostname;
   const cookieContext=source&&source.protocol===target.protocol&&site(source)===site(target)?
    'same-site':'cross-site-navigation';
   target.hash='';
   return {url:target.href,cookieContext};
  }catch{return null;}
 }
 async function shellRequest(req,res) {
  if(req.method!=='POST'||req.headers.origin!==uiOrigin||
     !['same-origin',undefined].includes(req.headers['sec-fetch-site'])||
     req.headers['transfer-encoding']||Number(req.headers['content-length']||0)!==0)return respond(res,403);
  prune();
  if(req.url==='/api/isolation/workspace'){
   if(req.headers['x-poxey-workspace-request']!=='1')return respond(res,403);
   const key=openWorkspace();
   return key?respond(res,200,{workspace:key}):respond(res,429);
  }
  const key=req.headers['x-poxey-workspace'],workspace=workspaces.get(key);
  if(!workspace)return respond(res,hex.test(key||'')?410:403);
  if(req.url==='/api/isolation/close'){closeWorkspace(key);return respond(res,204);}
  const tab=req.headers['x-poxey-tab'],navigation=Number(req.headers['x-poxey-navigation']);
  if(!/^[1-9][0-9]{0,4}$/.test(tab||'')||!Number.isSafeInteger(navigation)||navigation<1)return respond(res,400);
  const previous=workspace.tabs.get(tab);
  if(previous?previous.version>=navigation:workspace.tabs.size>=128)return respond(res,409);
  if(previous?.grant){previous.grant.cancel.abort();previous.binding.grants.delete(previous.capability);}
  const selectedTab={version:navigation};
  workspace.tabs.set(tab,selectedTab);
  if(req.url==='/api/isolation/tab-close')return respond(res,204);
  const selected=navigate(req.headers['x-poxey-source'],req.headers['x-poxey-destination']);
  if(!selected)return respond(res,400);
  let route;
  try {route=registry.allocate(key,selected.url);}
  catch{return respond(res,403);}
  let binding=bindings.get(route.id);
  if(!binding){
   if(issuing>=4||!allocations.take())return respond(res,429);
   issuing++;
   binding={certificate:null,signing:issue(new URL(route.origin).hostname),grants:new Map()};
   bindings.set(route.id,binding);
   workspace.routes.add(route.id);
   try{binding.certificate=await binding.signing;}
   catch{bindings.delete(route.id);return respond(res,503);}
   finally{issuing--;}
  }else if(!binding.certificate){
   try{await binding.signing;}catch{return respond(res,503);}
  }
  if(workspaces.get(key)!==workspace||workspace.tabs.get(tab)!==selectedTab||workspace.expires<=now()||registry.authorize(key,route.id)!==route)return respond(res,403);
  for(const [token,grant] of binding.grants)if(grant.expires<=now())binding.grants.delete(token);
  if(binding.grants.size>=24)return respond(res,429);
  const capability=secret();
  const grant={...selected,expires:Math.min(route.expires,workspace.expires),
   pending:true,inFlight:false,cancel:new AbortController()};
  Object.assign(selectedTab,{grant,binding,capability});
  binding.grants.set(capability,grant);
  return respond(res,200,{origin:route.origin,capability});
 }

 async function contentRequest(req,res,authority) {
  const {route,binding,workspace}=authority;
  const capability=req.headers['x-poxey-route-capability'];
  const grant=binding.grants.get(capability);
  if(!grant||!hex.test(capability||'')||grant.expires<=now())return respond(res,403);
  if(req.url==='/isolated-ws-ticket'){
   if(req.method!=='POST'||req.headers.origin!==route.origin||
      !['same-origin',undefined].includes(req.headers['sec-fetch-site'])||grant.pending||
      req.headers['transfer-encoding']||Number(req.headers['content-length']||0)!==0)return respond(res,403);
   let protocols;
   try{protocols=JSON.parse(req.headers['x-poxey-websocket-protocols']||'[]');}catch{return respond(res,400);}
   const token=sockets.issue({route,url:req.headers['x-poxey-websocket-url'],protocols,
    signal:AbortSignal.any([workspace.cancel.signal,grant.cancel.signal])});
   return token?respond(res,200,{token}):respond(res,403);
  }
  return serveBrokerHTTP(req,res,{broker,route,allowConvertedRedirect:true,headerDestination:true,publicCORS:true,workspaceSignal:AbortSignal.any([workspace.cancel.signal,grant.cancel.signal]),
   authorize({url,method}) {
    if(grant.cancel.signal.aborted)return null;
    if(!grant.pending)return 'same-site';
    if(method!=='GET'||url!==grant.url||grant.inFlight)return null;
    grant.inFlight=true;
    return grant.cookieContext;
   },
   complete({upstream,method,url}) {
    if(!grant.pending||!grant.inFlight||method!=='GET'||url!==grant.url)return;
    grant.inFlight=false;
    if(upstream?.redirect?.origin===route.upstream) {
     const next=new URL(upstream.redirect.url);
     next.hash='';
     grant.url=next.href;
    }else if(upstream&& !upstream.redirect)grant.pending=false;
   }});
 }
 return {uiOrigin,contentSuffix,frameSources,production:Boolean(production),arcade,server,shellRequest,contentRequest,closeWorkspace,prune,
  hasName:hostname=>hostname===shellHostname||arcade?.hosts.has(hostname)||Boolean(routeFor(hostname)),
  close(){sockets.close();for(const key of workspaces.keys())closeWorkspace(key);}};
}
