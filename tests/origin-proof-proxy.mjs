// Explicit local-only POC. Runs the actual bridge, worker, rewriter and ticketed
// relay. Only the two controlled destinations have a permitted fixture dialer.
import http from 'node:http';
import net from 'node:net';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {startServers} from '../server.mjs';
import {SafeTCPSocket} from '../security.mjs';

const brokerMode=process.argv.includes('--normal-tabs');
const hosts=['site-a.example','site-b.example'];
const safePath=new Set(['/','/next']);
const fixture=http.createServer((req,res)=>{
 const index=hosts.indexOf(req.headers.host);
 if(index<0)return res.writeHead(404).end();
 const redirect=brokerMode&&/^\/(cross-)?redirect-(301|302|303|307|308)$/.exec(req.url);
 if(redirect){
  const location=redirect[1]?'http://'+hosts[1-index]+'/next':'/next';
  return res.writeHead(Number(redirect[2]),{Location:location,'Cache-Control':'no-store'}).end();
 }
 if(!safePath.has(req.url))return res.writeHead(404).end();
 const letter=index?'B':'A', other=index?'A':'B';
 const own='fixture_'+letter+'=canary_'+letter;
 const cookie=String(req.headers.cookie||'');
 const state=(cookie.includes('fixture_'+other+'=')?'foreign cookie leaked':'no foreign credential sent')+'; own credential '+(cookie.includes(own)?'sent':'absent');
 res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store','Set-Cookie':own+'; Path=/; HttpOnly','Connection':'close'});
 res.end(`<!doctype html><title>Proof site ${letter}</title><h1>Proof site ${letter}</h1>
 <p id="cookie-result">${state}</p>
 <a href="http://${hosts[1-index]}/next">Switch from ${letter} to ${other}</a>`);
});
fixture.listen(0,'127.0.0.1');
await once(fixture,'listening');

function socketFor(allowed) {
 return class FixtureSocket extends SafeTCPSocket {
  async connect() {
   if(this.hostname!==allowed||this.port!==80||this.closed)throw Error('Fixture destination denied');
   this.socket=net.connect({host:'127.0.0.1',port:fixture.address().port});
   await once(this.socket,'connect');
   this.iterator=this.socket[Symbol.asyncIterator]();
  }
 };
}
const script=readFileSync(new URL('./fixtures/origin-proof/shell.js',import.meta.url));
const app=startServers(8800,8801,{}, {relayOperator:true,gameOrigins:false,originProof:{
 secondaryPort:18937,
 fixtureHTTP:brokerMode?{resolve:async()=> '93.184.215.14',
  dial(secure,options,onResponse){
   if(secure||options.port!==80||!hosts.includes(options.headers.host))throw Error('Fixture dial denied');
   return http.request({...options,hostname:'127.0.0.1',port:fixture.address().port},onResponse);
  }}:null,
 sites:hosts.map(host=>({upstream:'http://'+host,Socket:socketFor(host)})),
 serve(req,res,routes){
  const content={
   '/origin-proof/':['text/html','<!doctype html><title>PoxeyX1 Origin Proof</title><h1>PoxeyX1 Origin Proof</h1><button>Run origin probes</button><section></section><div id="evidence"></div><script type="module" src="/origin-proof/shell.js"></script>'],
   '/origin-proof/shell.js':['text/javascript',script],
   '/origin-proof/routes.js':['text/javascript','export default '+JSON.stringify(routes.map(({origin,site})=>({origin,upstream:site.upstream})))]
  }[req.url];
  if(!content)return false;
  res.writeHead(200,{'Content-Type':content[0],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
   'Content-Security-Policy':`default-src 'none'; script-src 'self'; connect-src 'self'; frame-src ${routes.map(r=>r.origin).join(' ')}; frame-ancestors 'none'`});
  res.end(content[1]);return true;
 }
}});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.stop();fixture.closeAllConnections();fixture.close();});
console.log('Local PoxeyX1 origin proof: '+app.uiOrigin+(brokerMode?'/?isolated-fixtures=1':'/origin-proof/'));
