// Operational transport presence only. No cookies, IPs, URLs, user agents or
// persistent IDs/history. A client is one open Poxey workspace page instance.
export const CLIENT_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const PRESENCE_PING_MS=15000, PRESENCE_STALE_MS=45000;
export function connectionClient(raw){if(typeof raw!=='string'||raw.length>150)throw Error('Invalid transport route');if(raw==='/wisp/')return null;const match=/^\/wisp\/([a-f0-9-]{36})\/$/.exec(raw);if(!match||!CLIENT_ID.test(match[1]))throw Error('Invalid client grouping route');return match[1];}
export class ConnectedClients{
 constructor({now=Date.now}={}){this.now=now;this.connections=new Map();this.groups=new Map();}
 add(ws,id){if(id!==null&&!CLIENT_ID.test(id))throw Error('Invalid client grouping ID');const at={id,lastPong:this.now()};this.connections.set(ws,at);if(id){let group=this.groups.get(id);if(!group)this.groups.set(id,group=new Set());group.add(ws);}ws.on('pong',()=>{if(this.connections.has(ws))at.lastPong=this.now();});ws.once('close',()=>this.remove(ws));}
 remove(ws){const at=this.connections.get(ws);if(!at)return;this.connections.delete(ws);if(at.id){const group=this.groups.get(at.id);group?.delete(ws);if(!group?.size)this.groups.delete(at.id);}}
 sweep(){for(const [ws,at]of this.connections){if(ws.readyState!==1||this.now()-at.lastPong>=PRESENCE_STALE_MS){this.remove(ws);ws.terminate();}else try{ws.ping();}catch{this.remove(ws);ws.terminate();}}}
 snapshot(){const unknown=[...this.connections.values()].filter(v=>!v.id).length,known=this.groups.size;return {available:true,connectedClients:unknown?null:known,minimumConnectedClients:Math.max(known,unknown?1:0),groupedClients:known,unattributedConnections:unknown,transportConnections:this.connections.size,pingIntervalSeconds:PRESENCE_PING_MS/1000,staleAfterSeconds:PRESENCE_STALE_MS/1000,meaning:'Temporary connected workspace page instances, not unique browsers or people',storage:'Memory only; deleted on disconnect/stale timeout; no history',legacy:unknown?'Older transports have no grouping ID; exact client count unavailable':null};}
 close(){for(const ws of this.connections.keys())ws.terminate();this.connections.clear();this.groups.clear();}
}
