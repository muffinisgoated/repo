import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {TokenBucket} from '../capacity.mjs';
const require=createRequire(import.meta.url),DAY=86400000;
const privateFile=file=>{if(!fs.existsSync(file))return;const s=fs.lstatSync(file);if(s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('Private analytics storage required');};
export class VisitorAnalytics {
 constructor(directory,{now=Date.now,maximum=100000,maxNewPerDay=1000}={}){
  this.now=now;this.maximum=maximum;this.maxNewPerDay=maxNewPerDay;
  fs.mkdirSync(directory,{recursive:true,mode:0o700});privateFile(directory);this.file=path.join(directory,'visitors.sqlite');for(const suffix of ['','-wal','-shm'])privateFile(this.file+suffix);
  const existed=fs.existsSync(this.file),mask=process.umask(0o077);
  try{const {DatabaseSync}=require('node:sqlite');this.db=new DatabaseSync(this.file);this.db.exec('PRAGMA busy_timeout=250; PRAGMA synchronous=FULL; PRAGMA journal_mode=WAL; PRAGMA max_page_count=8192;');
   this.db.exec('CREATE TABLE IF NOT EXISTS meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,started INTEGER NOT NULL,total INTEGER NOT NULL,secret BLOB NOT NULL,mint_day INTEGER NOT NULL,mint_total INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS visitors(hash TEXT PRIMARY KEY,last_seen INTEGER NOT NULL,issued INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS visitors_last_seen ON visitors(last_seen);');
   let m=this.db.prepare('SELECT * FROM meta WHERE id=1').get();if(!m){if(existed)throw Error('Analytics metadata missing; restore backup');this.db.prepare('INSERT INTO meta VALUES(1,1,?,0,?,0,0)').run(now(),crypto.randomBytes(32));m=this.db.prepare('SELECT * FROM meta WHERE id=1').get();}
   if(m.version!==1||m.secret?.length!==32||!Number.isSafeInteger(m.total)||m.total<0)throw Error('Invalid analytics metadata');this.secret=Buffer.from(m.secret);this.started=m.started;
   for(const suffix of ['','-wal','-shm'])privateFile(this.file+suffix);
  }catch(e){this.db?.close();throw e;}finally{process.umask(mask);}
 }
 hash(client){return crypto.createHmac('sha256',this.secret).update('record:'+client).digest('hex');}
 receipt(client,issued){const body=`v1.${client}.${issued}`;return body+'.'+crypto.createHmac('sha256',this.secret).update(body).digest('base64url');}
 validate(value){if(!value||typeof value!=='object'||Array.isArray(value)||!/^[a-f0-9]{32}$/.test(value.client)||Object.keys(value).some(k=>!['client','receipt','consent'].includes(k)))throw Error('Invalid visitor request');if(value.receipt!==null&&typeof value.receipt!=='string')throw Error('Invalid receipt');if(value.receipt!==null){const p=value.receipt.split('.');if(p.length!==4||p[0]!=='v1'||p[1]!==value.client||!/^\d{1,16}$/.test(p[2])||!/^[A-Za-z0-9_-]{43}$/.test(p[3]))throw Error('Invalid receipt');const issued=Number(p[2]);if(!Number.isSafeInteger(issued)||issued<this.started||issued>this.now()+1000)throw Error('Invalid receipt');const expected=Buffer.from(this.receipt(value.client,issued)),actual=Buffer.from(value.receipt);if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))throw Error('Invalid receipt');return issued;}return null;}
 prune(){this.db.prepare('DELETE FROM visitors WHERE last_seen<=?').run(this.now()-30*DAY);}
 visit(value){if(value.consent!==true)throw Error('Consent required');const supplied=this.validate(value),hash=this.hash(value.client),now=this.now();this.db.exec('BEGIN IMMEDIATE');try{
   this.prune();let row=this.db.prepare('SELECT issued FROM visitors WHERE hash=?').get(hash),issued=supplied??row?.issued;
   if(issued===undefined){const m=this.db.prepare('SELECT total,mint_day,mint_total FROM meta WHERE id=1').get(),day=Math.floor(now/DAY),count=m.mint_day===day?m.mint_total:0;if(count>=this.maxNewPerDay||m.total>=Number.MAX_SAFE_INTEGER)throw Error('Visitor enrollment limit');issued=now;this.db.prepare('UPDATE meta SET total=total+1,mint_day=?,mint_total=? WHERE id=1').run(day,count+1);}
   if(!row&&this.db.prepare('SELECT count(*) AS n FROM visitors').get().n>=this.maximum)throw Error('Visitor storage limit');
   this.db.prepare('INSERT INTO visitors VALUES(?,?,?) ON CONFLICT(hash) DO UPDATE SET last_seen=excluded.last_seen').run(hash,now,issued);this.db.exec('COMMIT');return {receipt:this.receipt(value.client,issued)};
  }catch(e){this.db.exec('ROLLBACK');throw e;}}
 forget(value){if(this.validate(value)===null)throw Error('Receipt required');this.db.prepare('DELETE FROM visitors WHERE hash=?').run(this.hash(value.client));return {removed:true};}
 snapshot(){try{this.prune();const m=this.db.prepare('SELECT total,started FROM meta WHERE id=1').get();return {status:'available',startedAt:new Date(m.started).toISOString(),allTimeVisitors:m.total,last30Days:this.db.prepare('SELECT count(*) AS n FROM visitors WHERE last_seen>?').get(this.now()-30*DAY).n,windowDays:30,definition:'estimated opt-in unique browsers, not verified people'};}catch{return {status:'unavailable'};}}
 close(){if(!this.closed){this.closed=true;this.db.close();}}
}
export function createVisitorAnalytics(directory,options){if(!directory)return {snapshot:()=>({status:'disabled'}),close(){}};try{return new VisitorAnalytics(directory,options);}catch{return {snapshot:()=>({status:'unavailable'}),close(){}};}}
export function visitorRoutes({store,origin}){
 const admission=new TokenBucket(5,20),enrollment=new TokenBucket(1,10);
 return (req,res)=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  const respond=(status,value)=>{res.writeHead(status,headers);res.end(JSON.stringify(value));};
  if(req.url==='/api/analytics/summary'&&['GET','HEAD'].includes(req.method)){if(!admission.take()){respond(429,{status:'unavailable'});return;}respond(200,store.snapshot());return;}
  if(req.url!=='/api/analytics/visit'||req.method!=='POST'||req.headers.origin!==origin||req.headers['content-type']!=='application/json'||!['same-origin',undefined].includes(req.headers['sec-fetch-site'])){respond(403,{error:'Not permitted'});return;}
  // No Cookie/Authorization data is used. Clients deliberately omit credentials and referrer.
  if(store.snapshot().status!=='available'){respond(503,{error:'Analytics unavailable'});return;}
  if(!admission.take()){respond(429,{error:'Analytics cooldown'});return;}
  const size=Number(req.headers['content-length']);if(req.headers['transfer-encoding']||!Number.isSafeInteger(size)||size<2||size>512){respond(413,{error:'Request too large'});return;}
  let data='';const timer=setTimeout(()=>req.destroy(),2000);timer.unref();req.once('close',()=>clearTimeout(timer));req.on('error',()=>{});req.on('data',c=>{data+=c.toString();if(Buffer.byteLength(data)>512)req.destroy();});req.once('end',()=>{clearTimeout(timer);try{const value=JSON.parse(data);if(value.action==='forget'){const {action,...identity}=value;respond(200,store.forget(identity));}else{store.validate(value);if(value.receipt===null&&!enrollment.take()){respond(429,{error:'Visitor enrollment cooldown'});return;}respond(200,store.visit(value));}}catch(e){respond(/limit/.test(e.message)?429:400,{error:'Visitor request unavailable'});}});
 };
}
