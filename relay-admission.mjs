import {randomBytes} from 'node:crypto';
import {TokenBucket} from './capacity.mjs';

const secret = () => randomBytes(32).toString('hex');
const validSecret = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const pairLifetime = 5 * 60_000;
const sessionLifetime = 2 * 60 * 60_000;
const ticketLifetime = 20_000;

export function createRelayAdmission({now=Date.now}={}) {
 const sessions = new Map(), pairs = new Map(), tickets = new Map();
 function prune() {
  const at = now();
  for(const [key, session] of sessions) {
   if(session.expires > at)continue;
   sessions.delete(key);
   pairs.delete(session.code);
  }
  for(const [key, ticket] of tickets)if(ticket.expires <= at || !sessions.has(ticket.key))tickets.delete(key);
 }
 function authorize(key) {
  prune();
  const existing = validSecret(key) && sessions.get(key);
  if(existing)return {key, approved:existing.approved, code:existing.code};
  if(pairs.size >= 32 || sessions.size >= 64)return null;
  key = secret();
  const code = randomBytes(12).toString('hex');
  const session = {code, approved:false, expires:now()+pairLifetime};
  sessions.set(key, session);
  pairs.set(code, key);
  return {key, approved:false, code};
 }
 function approve(code) {
  prune();
  const key = pairs.get(code), session = sessions.get(key);
  if(!session)return false;
  pairs.delete(code);
  session.approved = true;
  session.code = null;
  session.expires = now()+sessionLifetime;
  session.rate = new TokenBucket(1, 12);
  return true;
 }
 function issue(key, client, scope=null) {
  prune();
  const session = sessions.get(key);
  if(!session?.approved || tickets.size >= 128 || !session.rate.take())return null;
  const token = secret();
  tickets.set(token,{key, client, scope, expires:now()+ticketLifetime});
  return token;
 }
 function consume(token, client, scope=null) {
  prune();
  const ticket = validSecret(token) && tickets.get(token);
  if(!ticket || ticket.client !== client || ticket.scope !== scope)return null;
  tickets.delete(token);
  return {expires:sessions.get(ticket.key).expires};
 }
 return {authorize, approve, issue, consume};
}

export function relayRequest(req, res, {admission, origin, client, scope=null}) {
 const send = (status, value, headers={}) => {
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
  res.end(JSON.stringify(value));
 };
 if(req.method!=='POST'||req.headers.origin!==origin||!['same-origin',undefined].includes(req.headers['sec-fetch-site'])||
    req.headers['x-poxey-relay']!=='1'||req.headers['transfer-encoding']||Number(req.headers['content-length']||0)!==0) {
  req.resume();
  return send(403,{error:'Relay request denied'});
 }
 const cookies = (req.headers.cookie||'').split(';').map(item=>item.trim()).filter(item=>item.startsWith('poxey_relay='));
 const key = cookies.length===1?cookies[0].slice('poxey_relay='.length):null;
 if(req.url==='/api/relay/session') {
  const result = admission.authorize(key);
  if(!result)return send(429,{error:'Relay approval is at capacity. Try again later.'});
  const headers = result.key===key?{}:{'Set-Cookie':`poxey_relay=${result.key}; HttpOnly; SameSite=Strict; Path=/api/relay/${origin.startsWith('https:')?'; Secure':''}`};
  return send(result.approved?200:428,result.approved?{ok:true}:{code:result.code},headers);
 }
 if(!key)return send(403,{error:'Relay approval required'});
 const ticket = admission.issue(key,client,scope);
 return ticket?send(200,{ticket}):send(403,{error:'Relay approval expired or ticket limit reached'});
}
