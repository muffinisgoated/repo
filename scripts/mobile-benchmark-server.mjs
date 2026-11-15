// Local startup-only benchmark. 1.6 Mbit/s aggregate throughput, 150ms RTT.
// It does not simulate a physical phone, CPU throttling, or external websites.
import http from 'node:http';
import zlib from 'node:zlib';
const queue=[];let active=null;
const tick=setInterval(()=>{let budget=4000;while(budget>0){active ||= queue.shift();if(!active)return;if(active.res.destroyed){active=null;continue;}const end=Math.min(active.offset+budget,active.body.length);const data=active.body.subarray(active.offset,end);active.res.write(data);budget-=data.length;active.offset=end;if(end===active.body.length){active.res.end();active=null;}}},20);
const metrics=`addEventListener('load',()=>setTimeout(()=>{const n=performance.getEntriesByType('navigation')[0],r=performance.getEntriesByType('resource');const e=document.createElement('pre');e.id='benchmark-results';e.style='position:fixed;bottom:0;left:0;z-index:999999;background:white;color:black;font:10px monospace;max-width:100%;white-space:pre-wrap';e.textContent=JSON.stringify({initialHtmlTransferBytes:n.transferSize,initialHtmlEncodedBytes:n.encodedBodySize,domContentLoadedMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd,transferBytes:n.transferSize+r.reduce((a,v)=>a+v.transferSize,0),resources:r.length,failedResources:r.filter(v=>v.responseStatus>=400).map(v=>({url:v.name,status:v.responseStatus})),jsHeapBytes:performance.memory?.usedJSHeapSize});document.body.append(e);},0));`;
const server=http.createServer((req,res)=>{
 if(req.url==='/__metrics.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(metrics);return;}
 http.get({hostname:'127.0.0.1',port:8800,path:req.url,headers:{Host:'127.0.0.1:8800','Accept-Encoding':'gzip'}},up=>{
  const chunks=[];up.on('data',c=>chunks.push(c));up.on('end',()=>{
   let body=Buffer.concat(chunks);const headers={...up.headers,'cache-control':'no-store'};delete headers['transfer-encoding'];
   if(headers['content-type']?.includes('text/html')){if(headers['content-encoding']==='gzip')body=zlib.gunzipSync(body);body=Buffer.from(body.toString().replace('</head>','<script src="/__metrics.js"></script></head>'));body=zlib.gzipSync(body);headers['content-encoding']='gzip';}
   headers['content-length']=body.length;res.writeHead(up.statusCode,headers);setTimeout(()=>queue.push({res,body,offset:0}),150);
  });
 }).on('error',()=>{res.writeHead(502);res.end('Benchmark upstream unavailable');});
});
server.listen(8802,'127.0.0.1',()=>console.log('Startup benchmark only: http://127.0.0.1:8802'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(tick);server.closeAllConnections();server.close();});
