import {createSocket} from 'node:dgram';
import {once} from 'node:events';

// Authoritative loopback answers for active PoxeyX1 test names only.
export function answerLocalDNS(packet, isActive) {
 if(packet.length<17||packet.length>512||packet.readUInt16BE(4)!==1||(packet.readUInt16BE(2)&0xf800)!==0)return;
 let cursor=12;
 const labels=[];
 while(cursor<packet.length&&packet[cursor]) {
  const size=packet[cursor++];
  if(size>63||cursor+size>=packet.length)return;
  const label=packet.toString('ascii',cursor,cursor+size);
  if(!/^[a-z0-9-]+$/i.test(label))return;
  labels.push(label.toLowerCase());
  cursor+=size;
 }
 cursor++;
 if(cursor+4>packet.length||packet.readUInt16BE(cursor+2)!==1)return;
 const host=labels.join('.');
 if(!host.endsWith('.test'))return;
 const type=packet.readUInt16BE(cursor),questionEnd=cursor+4;
 const active=isActive(host),hasAddress=active&&(type===1||type===255);
 const reply=Buffer.alloc(questionEnd+(hasAddress?16:0));
 packet.copy(reply,0,0,questionEnd);
 reply.writeUInt16BE(0x8400|(packet.readUInt16BE(2)&0x100)|(active?0:3),2);
 reply.writeUInt16BE(hasAddress?1:0,6);
 reply.writeUInt32BE(0,8);
 if(hasAddress)Buffer.from('c00c000100010000000100047f000001','hex').copy(reply,questionEnd);
 return reply;
}
export async function startLocalDNS(port,isActive) {
 const socket=createSocket('udp4');
 socket.on('message',(message,peer)=>{
  if(peer.address!=='127.0.0.1')return;
  const result=answerLocalDNS(message,isActive);
  if(result)socket.send(result,peer.port,peer.address,()=>{});
 });
 const ready=once(socket,'listening');
 socket.bind(port,'127.0.0.1');
 await ready;
 return socket;
}
