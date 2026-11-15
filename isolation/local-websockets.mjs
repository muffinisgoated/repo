import {randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {WebSocket,WebSocketServer} from 'ws';
import {upstreamOrigin} from './origin-registry.mjs';
import {isPublicIP,resolvePublicHost} from '../security.mjs';

const protocol='poxey-route.v1';
const tokenPattern=/^[a-f0-9]{64}$/;
const legalProtocol=/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const maxPayload=1024*1024,maxQueue=2*maxPayload;

export function createLocalWebSockets({now=Date.now,resolve=resolvePublicHost,cookie,allowed,
 connect=(url,protocols,options)=>new WebSocket(url,protocols,options)}){
 const grants=new Map(),connections=new Map();
 const browserServer=new WebSocketServer({noServer:true,maxPayload,perMessageDeflate:false,
  handleProtocols:offered=>offered.has(protocol)?protocol:false});

 function prune(){
  for(const [key,grant] of grants)if(grant.expires<=now()||grant.signal.aborted)grants.delete(key);
 }
 function issue({route,signal,url,protocols}){
  prune();
  let target,httpURL;
  try {
   target=new URL(url);
   if(target.href.length>4096||!['ws:','wss:'].includes(target.protocol)||target.hash)return null;
   httpURL=new URL(target.href);
   httpURL.protocol=target.protocol==='wss:'?'https:':'http:';
   if(upstreamOrigin(httpURL.href)!==route.upstream)return null;
  }catch{return null;}
  if(grants.size>=64||signal.aborted||!Array.isArray(protocols)||protocols.length>8||
    protocols.some(value=>typeof value!=='string'||value.length>128||!legalProtocol.test(value))||
    new Set(protocols).size!==protocols.length)return null;
  const token=randomBytes(32).toString('hex');
  grants.set(token,{route,signal,target,httpURL,protocols,expires:now()+10000});
  return token;
 }
 function upgrade(req,socket,head,route){
  const deny=()=>socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  if(req.url!=='/isolated-ws'||req.headers.origin!==route.origin)return deny();
  const parts=req.headers['sec-websocket-protocol']?.split(',').map(value=>value.trim())||[];
  if(parts.length!==2||parts[0]!==protocol||!tokenPattern.test(parts[1]))return deny();
  prune();
  const grant=grants.get(parts[1]);
  if(!grant||grant.route!==route)return deny();
  grants.delete(parts[1]);
  if(connections.size>=12||[...connections.values()].filter(item=>item.route===route).length>=4)return deny();
  socket.setTimeout(7000,()=>socket.destroy());
  const terminated=()=>socket.destroyed||grant.signal.aborted||!allowed(route);
  const state={route,close:()=>socket.destroy()};
  connections.set(socket,state);
  const terminate=()=>state.close();
  grant.signal.addEventListener('abort',terminate,{once:true});
  socket.once('close',()=>{connections.delete(socket);grant.signal.removeEventListener('abort',terminate);});
  void (async()=>{
   try {
    const ip=await resolve(grant.target.hostname);
    if(terminated()||!isPublicIP(ip)){socket.destroy();return;}
    const headers={Origin:route.upstream};
    const credentials=cookie(route,grant.httpURL);
    if(credentials)headers.Cookie=credentials;
    const upstream=connect(grant.target,grant.protocols,{headers,followRedirects:false,maxPayload,
     perMessageDeflate:false,handshakeTimeout:6000,rejectUnauthorized:true,agent:false,
     lookup(_host,options,done){const family=isIP(ip);if(options.all)done(null,[{address:ip,family}]);else done(null,ip,family);}});
    let browser;
    state.close=()=>{socket.destroy();upstream.terminate();};
    socket.once('close',()=>upstream.terminate());
    upstream.on('error',()=>state.close());
    upstream.once('close',()=>state.close());
    upstream.once('open',()=>{
     if(terminated()){state.close();return;}
     socket.setTimeout(0);
     browserServer.handleUpgrade(req,socket,head,peer=>{
      browser=peer;
      browser.send(JSON.stringify({protocol:upstream.protocol}));
      browser.on('error',()=>state.close());
      browser.once('close',()=>state.close());
      browser.on('message',(data,binary)=>forward(upstream,data,binary,state.close));
     });
    });
    upstream.on('message',(data,binary)=>{if(browser)forward(browser,data,binary,state.close);});
   }catch{state.close();}
  })();
 }
 function close(){for(const connection of connections.values())connection.close();grants.clear();browserServer.close();}
 return {issue,upgrade,prune,close};
}
function forward(peer,data,binary,close){
 if(peer.readyState!==WebSocket.OPEN||peer.bufferedAmount+data.length>maxQueue){close();return;}
 peer.send(data,{binary},error=>{if(error)close();});
}
