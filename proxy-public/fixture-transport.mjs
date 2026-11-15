// Only the controlled isolated fixture server advertises this transport.
export class FixtureTransport {
 ready=true;
 #workspace;
 #isolated;
 constructor(workspace,{isolated=false}={}) {
  if(!/^[a-f0-9]{64}$/.test(workspace||''))throw Error('The isolated fixture workspace is unavailable.');
  this.#workspace=workspace;
  this.#isolated=isolated;
 }
 async request(remote,method,body,headers,signal) {
  const endpoint=new URL(this.#isolated?'/isolated-http':'/origin-proof-http',location.origin);
  if(!this.#isolated)endpoint.searchParams.set('url',remote.href);
  const requestHeaders=headers.filter(([name])=>
   /^(accept|accept-language|content-type|range|if-match|if-none-match|if-modified-since|if-unmodified-since)$/i.test(name));
  if(body instanceof ReadableStream) {
   const reader=body.getReader(), chunks=[];
   let length=0;
   try {
    for (;;) {
     const {done,value}=await reader.read();
     if(done)break;
     length+=value.byteLength;
     if(length>2*1024*1024)throw Error('This request is too large for the isolated fixture.');
     chunks.push(value);
    }
   } catch(error) {
    await reader.cancel().catch(()=>{});
    throw error;
   } finally {reader.releaseLock();}
   body=new Blob(chunks);
  }
  const response=await fetch(endpoint,{method:'POST',credentials:'omit',cache:'no-store',
   signal,body,headers:{'X-Poxey-Isolated-HTTP':'1','X-Poxey-Upstream-Method':method,
    'X-Poxey-Upstream-Headers':JSON.stringify(requestHeaders),
    ...(this.#isolated?{'X-Poxey-Upstream-URL':remote.href}:{}),[this.#isolated?'X-Poxey-Route-Capability':'X-Poxey-Fixture-Workspace']:this.#workspace}});
  const redirect=response.headers.get('X-Poxey-Fixture-Location');
  if(response.status===409&&redirect){
   const bytes=Uint8Array.from(atob(redirect),c=>c.charCodeAt(0));
   return {status:409,statusText:'Conflict',body:'Opening the destination in its own isolated route.',
    headers:[['Content-Type','text/plain; charset=utf-8'],
     ['x-poxey-fixture-location',new TextDecoder().decode(bytes)]]};
  }
  if(!response.ok)throw Error('The destination was blocked by the isolated fixture route.');
  const bytes=Uint8Array.from(atob(response.headers.get('X-Poxey-Upstream-Response')||''),c=>c.charCodeAt(0));
  const metadata=JSON.parse(new TextDecoder().decode(bytes));
  if(method==='HEAD'||[204,205,304].includes(metadata.status)){
   await response.body?.cancel();
   return {...metadata,body:null};
  }
  return {...metadata,body:response.body};
 }
 connect(url,protocols,_requestHeaders,onopen,onmessage,onclose,onerror) {
  if(!this.#isolated)throw Error('This WebSocket cannot be opened through the isolated route.');
  const cancellation=new AbortController();
  let socket,ready=false;
  void (async()=>{
   try{
    const response=await fetch('/isolated-ws-ticket',{method:'POST',cache:'no-store',credentials:'omit',
     signal:AbortSignal.any([cancellation.signal,AbortSignal.timeout(10000)]),
     headers:{'X-Poxey-Route-Capability':this.#workspace,'X-Poxey-WebSocket-URL':url.href,
      'X-Poxey-WebSocket-Protocols':JSON.stringify(protocols||[])}});
    if(!response.ok)throw Error('WebSocket route rejected');
    const {token}=await response.json();
    if(!/^[a-f0-9]{64}$/.test(token)||cancellation.signal.aborted)throw Error('WebSocket authorization expired');
    const endpoint=new URL('/isolated-ws',location.origin);
    endpoint.protocol='wss:';
    socket=new WebSocket(endpoint,['poxey-route.v1',token]);
    socket.binaryType='arraybuffer';
    socket.onmessage=event=>{
     if(ready){onmessage(event.data);return;}
     try{const metadata=JSON.parse(event.data);ready=true;onopen(metadata.protocol,'');}
     catch{socket.close();onerror();}
    };
    socket.onerror=()=>onerror();
    socket.onclose=event=>onclose(event.code,event.reason);
   }catch{if(!cancellation.signal.aborted)onerror();}
  })();
  return [data=>{if(ready&&socket?.readyState===WebSocket.OPEN)socket.send(data);},
   (code,reason)=>{cancellation.abort();if(socket&&socket.readyState<WebSocket.CLOSING)socket.close(code,reason);}];
 }
}
