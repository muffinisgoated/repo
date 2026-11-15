import {server as wisp,packet} from '@mercuryworkshop/wisp-js/server';
import {validHostname,SafeTCPSocket} from './security.mjs';
import {boundedWispSend} from './wisp-reliability.mjs';
import {PacketQueue,TokenBucket} from './capacity.mjs';
export function managedConnection(ws,{limits,metrics,budget,wispVersion=1,Socket=SafeTCPSocket,destination=null}){
 const upstream=destination?new URL(destination):null;
 const upstreamPort=upstream?.protocol==='https:'?443:80;
 const overflow=()=>{metrics.add('queueOverflows');ws.close(1008,'Input budget exceeded');};
 let connectionQueued=0,idleSince=null;
 const queue=(bytes)=>new PacketQueue({bytes,items:limits.queueItems,onOverflow:overflow,canAccept:n=>connectionQueued+n<=limits.queuedBytesPerConnection&&budget.queued+n<=limits.queuedBytesGlobal,onBytes:n=>{connectionQueued+=n;budget.queued+=n;metrics.gauge('queuedBytes',n);}});
 const packets=new TokenBucket(limits.packetsPerSecond,limits.packetBurst),starts=new TokenBucket(limits.streamStartsPerSecond,limits.streamStartBurst);
 class TrackedSocket extends Socket{
  async connect(){try{await super.connect();if(!this.closed){this.counted=true;metrics.gauge('tcp',1);this.socket?.setTimeout(limits.tcpIdleMs,()=>{metrics.add('tcpTimeouts');this.socket?.destroy();});}}catch(error){metrics.add('streamFailures');if(error.message?.includes('timed out'))metrics.add('tcpTimeouts');throw error;}}
  close(){if(this.counted){this.counted=false;metrics.gauge('tcp',-1);}super.close();}
 }
 class Connection extends wisp.ServerConnection{
  route_packet(buffer){try{packet.WispPacket.parse_all(buffer);}catch{metrics.add('streamRejected');ws.close(1008,'Invalid protocol packet');return;}super.route_packet(buffer);}
  create_stream(id,type,host,port){
   if(!Number.isSafeInteger(id)||id<1||this.streams[id]){metrics.add('streamRejected');ws.close(1008,'Invalid stream identifier');return;}
   if(upstream&&(host!==upstream.hostname||port!==upstreamPort)||type!==1||![80,443].includes(port)||!validHostname(host)||Object.keys(this.streams).length>=limits.streamsPerConnection||Object.values(this.streams).filter(s=>s.socket.hostname===host).length>=limits.streamsPerHost||budget.streams>=limits.streamsGlobal||!starts.take()){
    metrics.add('streamRejected');this.ws.send(new packet.WispPacket({type:4,stream_id:id,payload:new packet.ClosePayload({reason:packet.close_reasons.ConnThrottled})})).catch(()=>{});return;
   }
   idleSince=null;budget.streams++;metrics.gauge('streams',1);metrics.add('streamOpened');
   super.create_stream(id,type,host,port);
   const stream=this.streams[id],close=stream.close.bind(stream);let released=false;
   stream.send_buffer.close();stream.send_buffer=queue(limits.streamQueueBytes);
   stream.close=async(...args)=>{if(this.streams[id]===stream){delete this.streams[id];if(!Object.keys(this.streams).length)idleSince=Date.now();}if(!released){released=true;if([packet.close_reasons.HostBlocked,packet.close_reasons.ConnThrottled].includes(args[0]))metrics.add('streamRejected');budget.streams--;metrics.gauge('streams',-1);metrics.add('streamClosed');}return close(...args);};
  }
 }
 const conn=new Connection(ws,'/wisp/',{TCPSocket:TrackedSocket,wisp_version:wispVersion});conn.ws.data_queue=queue(limits.queueBytes);let input=0;
 ws.on('message',data=>{input+=data.byteLength??data.length??0;metrics.add('wsInputBytes',data.byteLength??data.length??0);if(input>limits.connectionBytes||!packets.take()){metrics.add('rateLimits');ws.close(1008,'Connection budget exceeded');}});
 ws.on('error',()=>metrics.add('wsFailures'));
 let handshake=setTimeout(()=>{metrics.add('wsTimeouts');ws.terminate();},limits.handshakeMs);handshake.unref();
 // The pinned setup adapter installs bounded send; keep its protocol behavior.
 const running=(async()=>{try{await conn.setup();idleSince=Date.now();clearTimeout(handshake);handshake=null;let output=0;conn.ws.send=data=>{const bytes=data instanceof packet.WispPacket?data.serialize().bytes.byteLength:data.byteLength??data.length??0;output+=bytes;if(input+output>limits.connectionBytes){ws.close(1008,'Connection budget exceeded');return Promise.resolve();}metrics.add('wsOutputBytes',bytes);const result=boundedWispSend(conn.ws,data,{timeoutMs:limits.sendTimeoutMs});result.catch(error=>{if(error.message.includes('timed out'))metrics.add('wsTimeouts');});return result;};await conn.run();}catch{metrics.add('wsFailures');ws.terminate();}finally{clearTimeout(handshake);await conn.cleanup().catch(()=>{});conn.ws.data_queue.close();}})();
 return {conn,running,idleFor:now=>ws.readyState===1&&idleSince!==null?now-idleSince:0};
}
