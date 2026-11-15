importScripts('/controller/controller.sw.js');
importScripts('/route-recovery.js');
// Concurrent requests for the same controller share its recovery attempt.
const recoveringControllers=new Map();
addEventListener('fetch',event=>{
  const prefix=new URL(event.request.url).pathname.match(/^\/~\/sj\/([^/]+)\//u)?.[0];
  if(!prefix)return;
  event.respondWith((async()=>{
    const ready=()=> $scramjetController.shouldRoute(event);
    if(!ready()){
      let recovery=recoveringControllers.get(prefix);
      if(!recovery){
        recovery=PoxeyRouteRecovery(ready,async()=>{
          // The bridge owns the controller port but is outside this worker's scope.
          for(const client of await clients.matchAll({type:'window',includeUncontrolled:true})){
            const url=new URL(client.url);
            if(url.origin===location.origin&&url.pathname==='/'&&url.searchParams.has('id')){
              client.postMessage({$controller$swrevive:{},poxeyPrefix:prefix});
            }
          }
        }).finally(()=>recoveringControllers.delete(prefix));
        recoveringControllers.set(prefix,recovery);
      }
      await recovery;
    }
    if(!ready())return new Response('The page reader session was interrupted. Reload this PoxeyX1 tab.',{status:503,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
    const result=await $scramjetController.route(event);
    if(!globalThis.POXEY_ISOLATED_SHELL)return result;
    const headers=new Headers(result.headers);
    headers.set('Cache-Control','no-store');
    headers.set('Cross-Origin-Resource-Policy','same-origin');
    headers.set('Origin-Agent-Cluster','?1');
    headers.set('Content-Security-Policy',`default-src 'self' data: blob:; script-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' data: blob:; connect-src 'self' blob:; frame-src 'self' blob:; form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self' ${globalThis.POXEY_ISOLATED_SHELL}`);
    return new Response(result.body,{status:result.status,statusText:result.statusText,headers});
  })());
});
