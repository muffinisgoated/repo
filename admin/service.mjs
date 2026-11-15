import crypto from 'node:crypto';import net from 'node:net';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import readline from 'node:readline';import {fileURLToPath} from 'node:url';import {AdminAccess} from './access.mjs';import {TokenBucket} from '../capacity.mjs';
export function readLiveMetrics(file,now=Date.now()){
 const st=fs.lstatSync(file);if(st.isSymbolicLink()||st.size>262144)throw Error('Metrics unavailable');
 const m=JSON.parse(fs.readFileSync(file,'utf8')),at=Date.parse(m.timestamp);
 if(m.schemaVersion!==1||m.available!==true||!Number.isFinite(at)||now-at>15000||at>now+1000)throw Error('Metrics stale or unavailable');return m;
}
export function startAdmin({directory,socket,metrics}){
 const access=new AdminAccess(directory),rate=new TokenBucket(10,30);let clients=0;
 if(fs.existsSync(socket))throw Error('Admin socket already exists; inspect the running service first');
 const server=net.createServer(client=>{clients++;let buffer='',done=false;client.setTimeout(3000,()=>client.destroy());client.on('error',()=>{});client.once('close',()=>clients--);if(clients>8){client.destroy();return;}
 client.on('data',chunk=>{if(done)return;buffer+=chunk.toString('utf8');if(Buffer.byteLength(buffer)>16384){client.destroy();return;}if(!buffer.includes('\n'))return;done=true;
  try{if(!rate.take())throw Error('Admin service busy');const m=JSON.parse(buffer.slice(0,buffer.indexOf('\n')));let result;
   if(m.kind==='enroll')result=access.request(m);
   else if(m.kind==='status')result={device:access.state.devices.find(d=>d.requestId===m.requestId&&!d.revoked)?.id||null};
   else if(m.kind==='challenge')result=access.challenge(m.device,m.digest);
   else if(m.kind==='operation')result=access.execute(m.auth,m.operation,()=>({...metrics(),admin:{retainedAuditEntries:access.state.audit.length,authenticationRejectionsRetained:access.state.audit.filter(x=>x.action==='authentication-rejected').length,configurationChangesRetained:access.state.audit.filter(x=>x.action.startsWith('configuration-')).length}}));
   else throw Error('Unsupported request');client.end(JSON.stringify({ok:true,result})+'\n');
  }catch(error){const message=error.message==='Metrics stale or unavailable'?'Metrics stale or unavailable. Waiting for the collector.':'Access denied or request unavailable';client.end(JSON.stringify({ok:false,error:message})+'\n');}
 });});
 server.listen(socket,()=>fs.chmodSync(socket,0o600));return {access,server,stop(){server.close();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const base=path.join('/private/tmp','poxey-web-admin-'+process.getuid());fs.mkdirSync(base,{mode:0o700,recursive:true});const st=fs.lstatSync(base);if(st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('Private socket directory required');
 const running=startAdmin({directory:fileURLToPath(new URL('./.state',import.meta.url)),socket:path.join(base,'service.sock'),metrics:()=>readLiveMetrics(new URL('../reports/stage4/live-monitoring.json',import.meta.url))});
 console.log(running.access.state.devices.length?'Local Admin ready. Enrolled-device authentication enabled; owner bootstrap disabled.':'Local Admin ready. Type inspect REQUEST_ID, compare the app fingerprint, then approve REQUEST_ID FINGERPRINT.');
 const lines=readline.createInterface({input:process.stdin});lines.on('line',line=>{const [action,id,fingerprint]=line.trim().split(/\s+/);try{const p=running.access.pending.get(id);if(!p)throw Error();const expected=awaitFingerprint(p.key);if(action==='inspect'){console.log('Requested device:',p.name,'key fingerprint:',expected);}else if(action==='approve'&&fingerprint===expected){running.access.approveFirstOwner(id);console.log('Owner enrollment approved.');}else console.log('Approval rejected: compare and supply the complete fingerprint.');}catch{console.log('Request unavailable or approval rejected.');}});
 function awaitFingerprint(key){return crypto.createHash('sha256').update(Buffer.from(key,'base64')).digest('hex');}
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{lines.close();running.stop();});
}
