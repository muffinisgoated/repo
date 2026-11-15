export const DEFAULT_LIMITS=Object.freeze({webSockets:6,upgradesPerMinute:20,streamsPerConnection:32,streamsPerHost:8,streamsGlobal:128,httpConcurrent:64,httpPerSecond:120,httpBurst:240,messageBytes:1048576,queueBytes:2097152,queueItems:128,streamQueueBytes:8388608,queuedBytesPerConnection:16777216,queuedBytesGlobal:67108864,packetsPerSecond:2000,packetBurst:4000,streamStartsPerSecond:16,streamStartBurst:32,connectionBytes:268435456,sendTimeoutMs:15000,handshakeMs:15000,tcpIdleMs:120000});
export function capacityLimits(overrides={}){
 const limits={...DEFAULT_LIMITS};
 for(const [key,value]of Object.entries(overrides)){if(!Object.hasOwn(limits,key)||!Number.isSafeInteger(value)||value<1||value>DEFAULT_LIMITS[key]*16)throw Error('Invalid capacity setting: '+key);limits[key]=value;}
 if(limits.messageBytes>limits.queueBytes)throw Error('Message exceeds queue budget');
 return Object.freeze(limits);
}
export class TokenBucket{
 constructor(rate,burst,now=()=>performance.now()){this.rate=rate;this.burst=burst;this.tokens=burst;this.now=now;this.at=now();}
 take(){const now=this.now();this.tokens=Math.min(this.burst,this.tokens+Math.max(0,now-this.at)*this.rate/1000);this.at=now;if(this.tokens<1)return false;this.tokens--;return true;}
}
// Upstream calls put() without awaiting it on some receive paths. Never retain
// unlimited waiting producers; reject/close at a byte/item ceiling instead.
export class PacketQueue{
 constructor({bytes,items,onOverflow,onBytes=()=>{},canAccept=()=>true}){Object.assign(this,{maxBytes:bytes,maxItems:items,onOverflow,onBytes,canAccept});this.queue=[];this.bytes=0;this.waiter=null;this.closed=false;}
 get size(){return this.queue.length;}
 put(value){if(this.closed)return Promise.resolve();const bytes=value?.byteLength??value?.length??0;
  if(bytes>this.maxBytes||!this.canAccept(bytes)){this.close();this.onOverflow();return Promise.resolve();}
  if(this.waiter){const resolve=this.waiter;this.waiter=null;resolve(value);return Promise.resolve();}
  if(this.queue.length>=this.maxItems||bytes>this.maxBytes-this.bytes){this.close();this.onOverflow();return Promise.resolve();}
  this.queue.push({value,bytes});this.bytes+=bytes;this.onBytes(bytes);return Promise.resolve();
 }
 get(){if(this.closed)return Promise.resolve(null);if(this.queue.length){const item=this.queue.shift();this.bytes-=item.bytes;this.onBytes(-item.bytes);return Promise.resolve(item.value);}return new Promise(resolve=>this.waiter=resolve);}
 close(){if(this.closed)return;this.closed=true;this.onBytes(-this.bytes);this.bytes=0;this.queue=[];this.waiter?.(null);this.waiter=null;}
}
