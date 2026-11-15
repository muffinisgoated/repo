// Disposable manual test process. It binds the normal local app ports so the
// real Safari/Chromium worker runs unchanged, with only its outbound sockets
// replaced by two exact-name synthetic destinations. Do not run alongside the app.
import http from 'node:http';
import net from 'node:net';
import {once} from 'node:events';
import {startServers} from '../server.mjs';
import {SafeTCPSocket} from '../security.mjs';

const a='site-a.example', b='site-b.example';
const fixture=http.createServer((req,res)=>{
 const host=req.headers.host?.split(':')[0];
 if(host!==a&&host!==b)return res.writeHead(403).end();
 const headers={'Content-Type':'text/html','Cache-Control':'no-store','Connection':'close'};
 if(host===a) {
  headers['Set-Cookie']=['site_a=synthetic_a; Path=/', 'foreign_write=synthetic_forgery; Domain='+b+'; Path=/'];
  return res.writeHead(200,headers).end(`<!doctype html><title>Proxied fixture A</title><h1>Proxied fixture A</h1>
   <p id="result"></p><a href="http://${b}/inspect">Open fixture B</a>
   <script>document.querySelector('#result').textContent=document.cookie.includes('site_a=synthetic_a')?'A own cookie visible':'A own cookie missing'</script>`);
 }
 const cookies=req.headers.cookie||'';
 headers['Set-Cookie']='site_b=synthetic_b; Path=/';
 return res.writeHead(200,headers).end(`<!doctype html><title>Proxied fixture B</title><h1>Proxied fixture B</h1>
  <p>B received forged cookie: ${cookies.includes('foreign_write=')?'YES':'NO'}</p><p id="checks"></p>
  <script>document.querySelector('#checks').textContent='B own cookie visible: '+(document.cookie.includes('site_b=synthetic_b')?'YES':'NO')+'; B foreign cookie visible: '+(document.cookie.includes('site_a=')||document.cookie.includes('foreign_write=')?'YES':'NO')</script>`);
});
fixture.listen(0,'127.0.0.1');
await once(fixture,'listening');
SafeTCPSocket.prototype.connect=async function() {
 if(![a,b].includes(this.hostname)||this.port!==80||this.closed)throw Error('Fixture destination denied');
 this.socket=net.connect({host:'127.0.0.1',port:fixture.address().port});
 await once(this.socket,'connect');
 this.iterator=this.socket[Symbol.asyncIterator]();
};
const app=startServers(8800,8801,{}, {relayOperator:true,gameOrigins:false});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.stop();fixture.closeAllConnections();fixture.close();});
console.log('Disposable proxied fixtures ready on the local PoxeyX1 shell.');
