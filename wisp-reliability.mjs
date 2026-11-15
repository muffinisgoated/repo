import {packet} from '@mercuryworkshop/wisp-js/server';
// Adapter for pinned wisp-js 0.5.1. Keep its packet encoding and buffer ceiling,
// but never keep a send task alive forever after the peer disconnects/stalls.
export async function boundedWispSend(channel,data,{timeoutMs=15000,pollMs=10}={}){
 const ws=channel.ws;
 if(ws.readyState!==ws.OPEN)throw Error('Wisp connection closed');
 if(data instanceof packet.WispPacket)data=data.serialize().bytes;
 ws.send(data);
 if(ws.bufferedAmount<=channel.send_buffer_size)return;
 const until=Date.now()+timeoutMs;
 while(ws.bufferedAmount>channel.send_buffer_size/2){
  if(ws.readyState!==ws.OPEN)throw Error('Wisp connection closed');
  if(Date.now()>=until){ws.close(1013,'Connection stalled');throw Error('Wisp send timed out');}
  await new Promise(resolve=>setTimeout(resolve,Math.min(pollMs,Math.max(1,until-Date.now()))));
 }
 if(ws.readyState!==ws.OPEN)throw Error('Wisp connection closed');
}
const installed=Symbol.for('poxey.wisp.bounded-send');
export function installWispReliability(server){
 const proto=server.ServerConnection.prototype;if(proto[installed])return;
 const setup=proto.setup;
 proto.setup=async function(...args){
  this.ws.send=data=>{const result=boundedWispSend(this.ws,data);result.catch(()=>{});return result;};
  return setup.apply(this,args);
 };
 Object.defineProperty(proto,installed,{value:true});
}
