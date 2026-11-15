import dns from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';
const globalIPv6=ipaddr.parseCIDR("2000::/3");
export function isPublicIP(value) {
  try {
    if(!net.isIP(value)||value.includes('%'))return false;
    let ip=ipaddr.parse(value);
    if(ip.kind()==='ipv6'&&ip.isIPv4MappedAddress())ip=ip.toIPv4Address();
    return ip.range()==='unicast'&&(ip.kind()==='ipv4'||ip.match(globalIPv6));
  }catch{return false;}
}
export function validHostname(host) {
  return typeof host==='string' && host.length<=253 && !net.isIP(host) && host.includes('.') && !/(?:^|\.)(?:localhost|local|internal|invalid|test)$/i.test(host) && host.split('.').every(label=>/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label));
}
export async function resolvePublicHost(host, lookup=dns.lookup) {
  if(!validHostname(host))throw Error('Destination denied');
  const addresses=await lookup(host,{all:true,order:'ipv4first'});
  if(!addresses.length||addresses.some(item=>!isPublicIP(item.address)))throw Error('Private destination denied');
  return addresses[0].address;
}
// Resolve once, validate all answers, and connect to the verified IP rather than
// resolving the hostname again. This closes a DNS-rebinding/IPv6-private gap.
export class SafeTCPSocket {
  constructor(hostname,port,{resolve=resolvePublicHost}={}){this.hostname=hostname;this.port=port;this.socket=null;this.iterator=null;this.closed=false;this.resolve=resolve;}
  async connect(){
    if(![80,443].includes(this.port))throw Error('Port denied');
    if(this.closed)throw Error('Connection closed');
    const ip=await this.resolve(this.hostname);
    if(this.closed)throw Error('Connection closed');
    if(!isPublicIP(ip))throw Error('Private destination denied');
    const socket=new net.Socket({highWaterMark:65536});this.socket=socket;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{socket.destroy();reject(Error('Connection timed out'));},15000);timer.unref();
      socket.once('connect',()=>{clearTimeout(timer);resolve();});
      socket.once('close',()=>{clearTimeout(timer);reject(Error('Connection closed'));});
      socket.once('error',error=>{clearTimeout(timer);reject(error);});
      socket.setNoDelay(true);socket.connect({host:ip,port:this.port});
    });
    this.iterator=socket[Symbol.asyncIterator]();
  }
  async recv(){const next=await this.iterator.next();return next.done?null:next.value;}
  async send(data){if(!this.socket||this.socket.destroyed)throw Error('Connection closed');await new Promise((resolve,reject)=>this.socket.write(data,error=>error?reject(error):resolve()));}
  close(){this.closed=true;this.socket?.destroy();this.socket=null;}
  pause(){} // Node's async iterator and highWaterMark apply stream backpressure.
  resume(){}
}
