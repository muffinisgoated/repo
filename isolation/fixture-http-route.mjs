import {pipeline} from 'node:stream/promises';

// Stream a broker response to an authorized, same-origin transport.
export async function serveBrokerHTTP(req,res,{broker,route,
 authorize=()=> 'same-site',complete=()=>{},workspaceSignal,allowConvertedRedirect=false,headerDestination=false,publicCORS=false}) {
 const refuse=status=>{req.resume();res.writeHead(status,{'Cache-Control':'no-store'}).end();};
 if(req.method!=='POST'||req.headers.origin!==route.origin||
    !['same-origin',undefined].includes(req.headers['sec-fetch-site'])||
    req.headers['x-poxey-isolated-http']!=='1')return refuse(403);
 const stop=new AbortController();
 const signal=workspaceSignal?AbortSignal.any([stop.signal,workspaceSignal]):stop.signal;
 res.once('close',()=>stop.abort());
 let request,upstream;
 try {
  const body=[];
  let length=0;
  for await (const bytes of req) {
   length+=bytes.length;
   if(length>2*1024*1024)return refuse(413);
   body.push(bytes);
  }
  const url=headerDestination?req.headers['x-poxey-upstream-url']:new URL(req.url,route.origin).searchParams.get('url');
  const method=req.headers['x-poxey-upstream-method'];
  if(typeof method!=='string'||typeof url!=='string'||url.length>4096)return refuse(400);
  const requestHeaders=JSON.parse(req.headers['x-poxey-upstream-headers']||'[]');
  if(!Array.isArray(requestHeaders)||requestHeaders.length>32||
     requestHeaders.some(pair=>!Array.isArray(pair)||pair.length!==2||pair.some(value=>typeof value!=='string')))return refuse(400);
  const cookieContext=authorize({url,method});
  if(!cookieContext)return refuse(403);
  request={url,method};
  upstream=await broker.request({workspace:route.workspace,routeID:route.id,
   url,method,headers:requestHeaders,body:length?Buffer.concat(body,length):undefined,
   cookieContext,publicCORS,signal});
  complete({...request,upstream});
  request=null;
  // Non-document cross-site fetches and body-preserving cross-site redirects
  // stay blocked until they can be independently authorized by the shell.
  if(upstream.redirect && upstream.redirect.origin!==route.upstream) {
   upstream.body.destroy();
   if(upstream.redirect.method!=='GET'||(method!=='GET'&&!allowConvertedRedirect))return refuse(409);
   // Emit only metadata. The parent must independently mount the target route.
   const location=Buffer.from(upstream.redirect.url).toString('base64');
   if(location.length>5500)return refuse(409);
   res.writeHead(409,{'Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin',
    'X-Poxey-Fixture-Location':location}).end();
   return;
  }
  const envelope=Buffer.from(JSON.stringify({
   status:upstream.status,statusText:upstream.statusText,headers:upstream.headers.filter(([name])=>name.toLowerCase()!=='x-poxey-fixture-location')
  })).toString('base64');
  if(envelope.length>12000){upstream.body.destroy();return refuse(502);}
  res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store',
   'Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff',
   'X-Poxey-Upstream-Response':envelope});
  await pipeline(upstream.body,res);
 }catch {
  if(!res.headersSent&&!res.destroyed)refuse(502);
 }finally{if(request)complete({...request,upstream});}
}

export const serveFixtureHTTP=serveBrokerHTTP;
