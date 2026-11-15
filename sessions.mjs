import crypto from 'node:crypto';
export const SESSION_ACTIVITY_MS=5*60_000, SESSION_EXPIRY_MS=30*60_000;
const COOKIE='poxey_activity';
export class ActiveSessions {
 constructor({now=Date.now,maximum=10000}={}){this.now=now;this.maximum=maximum;this.sessions=new Map();}
 prune(){const now=this.now();for(const [id,last] of this.sessions)if(now-last>=SESSION_EXPIRY_MS)this.sessions.delete(id);}
 cookieID(cookie=''){const matches=String(cookie).split(';').map(s=>s.trim()).filter(s=>s.startsWith(COOKIE+'='));if(matches.length!==1)return null;const id=matches[0].slice(COOKIE.length+1);return /^[a-f0-9]{32}$/.test(id)?id:null;}
 touch(cookie){this.prune();const now=this.now();let id=this.cookieID(cookie);if(!id||!this.sessions.has(id)){if(this.sessions.size>=this.maximum)throw Error('Session capacity reached');id=crypto.randomBytes(16).toString('hex');}this.sessions.set(id,now);return `${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/api/session/; Max-Age=1800`;}
 remove(cookie){const id=this.cookieID(cookie);if(id)this.sessions.delete(id);return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/session/; Max-Age=0`;}
 snapshot(){this.prune();const now=this.now();return {activeSessions:[...this.sessions.values()].filter(at=>now-at<SESSION_ACTIVITY_MS).length,activityWindowSeconds:300,expirySeconds:1800,reporting:'optional; off by default; private mode excluded',meaning:'anonymous reporting browser sessions, not unique people',storage:'bounded process memory; resets on server restart'};}
 clear(){this.sessions.clear();}
}
// Public reporting endpoint only. Never returns aggregate metrics or identities.
export function sessionActivity(req,res,{sessions,origin}){
 if(req.method!=='POST'||req.headers.origin!==origin||req.headers['content-type']!=='application/json'||!['same-origin',undefined].includes(req.headers['sec-fetch-site'])){res.writeHead(403);res.end();return;}
 if(req.headers['transfer-encoding']||!['2','15'].includes(req.headers['content-length'])){res.writeHead(413);res.end();return;}
 let text='';const timer=setTimeout(()=>req.destroy(),2000);timer.unref();req.once('close',()=>clearTimeout(timer));req.on('error',()=>{});
 req.on('data',chunk=>{text+=chunk.toString();if(Buffer.byteLength(text)>16)req.destroy();});
 req.once('end',()=>{clearTimeout(timer);try{if(text!=='{}'&&text!=='{"remove":true}')throw Error();const cookie=text==='{}'?sessions.touch(req.headers.cookie):sessions.remove(req.headers.cookie);res.writeHead(204,{'Set-Cookie':cookie,'Cache-Control':'no-store'});res.end();}catch{res.writeHead(text==='{}'?503:400);res.end();}});
}
