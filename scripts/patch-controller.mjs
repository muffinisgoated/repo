import {isHttpOnly} from './patch-cookie-isolation.mjs';
import {createBodyTransfer} from './body-transfer.mjs';

const replacements = {
 api: [
  // The controller cookie jar lives in this bridge only. Legacy IndexedDB is
  // left untouched for rollback and is never read or written on this path.
  [/async loadSavedCookies\(e=!1\)\{.*?\}async persistCookies\(\)\{.*?\}setTransport\(e\)/, 'async loadSavedCookies(){}async persistCookies(){}setTransport(e)'],
  ['e.data?.$controller$setCookie&&', 'e.source===this.serviceWorkerController&&e.data?.$controller$setCookie&&'],

  ['initHeaders: ${JSON.stringify(l.headers??[])}',
   'initHeaders: ${JSON.stringify((l.headers??[]).filter(([name])=>!/^set-cookie2?$/i.test(name)))}'],
  ['this.cookieJar.setCookies(t.cookie,new URL(t.url))','this.cookieJar.setCookies(t.cookie,new URL(t.url),true)'],
  ['cookies: ${JSON.stringify(s.dump())}', 'cookies: ${JSON.stringify(s.dumpForDocument(a.origin))}'],

  ['this.id=b(),this.config=', 'this.id=crypto.randomUUID(),this.config='],

  // The bridge owns recovery. A second listener would close the port it just opened.
  ['if(e.data.$controller$swrevive){if(this.guardServiceWorkerRevive)return;this.setupMessagePort()}',''],
  ['body:e.body,cache:e.cache', 'body:poxeyBodyTransfer.decode(e.body),cache:e.cache'],
  ['return[{body:s.body,status:s.status,statusText:s.statusText,headers:s.headers.toRawHeaders()},s.body instanceof ReadableStream||s.body instanceof ArrayBuffer?[s.body]:[]]',
   'const encoded=poxeyBodyTransfer.encode(s.body);return[{body:encoded.body,status:s.status,statusText:s.statusText,headers:s.headers.toRawHeaders()},encoded.transfer]'],
  ['this.transport.request(new URL(e),t,r,o,void 0);return[s,[s.body]]',
   'this.transport.request(new URL(e),t,poxeyBodyTransfer.decode(r),o,void 0);const safeHeaders=s.headers.filter(([name,value])=>{if(/^set-cookie2?$/i.test(name)&&poxeyIsHttpOnly(value)){if(name.toLowerCase()==="set-cookie")this.cookieJar.setCookies(value,new URL(e));return false}return true});const encoded=poxeyBodyTransfer.encode(s.body);return[{...s,headers:safeHeaders,body:encoded.body},encoded.transfer]']
 ],
 sw: [
  // Only a real bridge can register a controller. A content frame can request
  // a transport only for the controller that owns its actual worker client URL.
  ['let t=e.data.$controller$init,r=i.findIndex(e=>e.id===t.id);-1!==r&&i.splice(r,1),i.push(new s(t.prefix,t.id,e.ports[0]))',
   'const t=e.data.$controller$init,owner=e.source;if(!owner?.url||owner.type!=="window"||e.ports.length!==1)return;const url=new URL(owner.url);if(url.origin!==self.location.origin||url.pathname!=="/"||url.searchParams.get("ui")!==(self.POXEY_ISOLATED_SHELL||"http://127.0.0.1:8800")||!/^\\d{1,5}$/.test(url.searchParams.get("id")||"")||typeof t.id!=="string"||!/^[a-f0-9-]{36}$/.test(t.id)||t.prefix!=="/~/sj/"+t.id+"/")return;const r=i.findIndex(e=>e.id===t.id);if(r!==-1){if(i[r].owner!==owner.id)return;i[r].port.close();i.splice(r,1)}const controller=new s(t.prefix,t.id,e.ports[0]);controller.owner=owner.id;controller.port=e.ports[0];i.push(controller)'],
  ['let{port:t,prefix:r}=e.data.$sw$initRemoteTransport,o=i.find(e=>new URL(r).pathname.startsWith(e.prefix));if(!o)return void console.error("No relevant controller found for transport init");o.rpc.call("initRemoteTransport",t,[t])',
   'const {port:t,prefix:r}=e.data.$sw$initRemoteTransport;if(!e.source?.url||e.source.type!=="window"||e.ports.length!==1||t!==e.ports[0]||typeof r!=="string")return;const source=new URL(e.source.url);if(source.origin!==self.location.origin)return;const o=i.find(tab=>source.pathname.startsWith(tab.prefix)&&r===self.location.origin+tab.prefix);if(o)o.rpc.call("initRemoteTransport",t,[t]).catch(()=>{})'],
  ['let t={};addEventListener("message"', 'let t=Object.create(null);addEventListener("message"'],
  ['o&&(o(),delete t[r.id])', 'o&&e.source?.id===o.clientID&&(o.resolve(),delete t[r.id])'],
  // Serialize cookie updates only for a window on that upstream origin.
  ['for(let a of o){let o=Math.random()', 'for(let a of o){let upstream;try{const path=new URL(a.url).pathname.slice(this.prefix.length).split("/");upstream=new URL(decodeURIComponent(path[1])).origin}catch{continue}const scoped=e.filter(item=>{try{return new URL(item.url).origin===upstream}catch{return false}});if(!scoped.length)continue;let o=Math.random()'],
  ['$controller$setCookie:{cookies:e,options:r,id:o}', '$controller$setCookie:{cookies:scoped,options:r,id:o}'],
  ['t[o]=()=>e(o)', 't[o]={clientID:a.id,resolve:()=>e(o)}'],
  ['return console.error("Service Worker error:",e),new Response("Internal Service Worker Error: "+e.message,{status:500})',
   'return new Response("Internal Service Worker Error: The website request failed",{status:500,headers:{"Cache-Control":"no-store"}})'],

  ['let o=await self.clients.matchAll(),s=[],i=[],n=', 'let o=(await self.clients.matchAll()).filter(client=>new URL(client.url).pathname.startsWith(this.prefix)),s=[],i=[],n='],
  [/`timed out waiting for set cookie response .*?clientUrls=\$\{o\.map\(e=>e\.url\)\.join\(","\)\}`/, '"Timed out waiting for a website cookie update"'],

  // A native client already inside one controller cannot borrow another
  // controller's cookie jar by fetching its rewritten path.
  ['o=await clients.get(e.clientId),s=[...e.request.headers],',
   'o=e.clientId?await clients.get(e.clientId):null;if(o?.url){const client=new URL(o.url);if(client.origin===t.origin&&client.pathname.startsWith("/~/sj/")&&!client.pathname.startsWith(r.prefix))return new Response("Controller access denied",{status:403,headers:{"Cache-Control":"no-store"}})}let s=[...e.request.headers],'],
  ['n=await r.rpc.call("request",', 'encoded=poxeyBodyTransfer.encode(e.request.body),n=await r.rpc.call("request",'],
  ['body:e.request.body,cache:e.request.cache', 'body:encoded.body,cache:e.request.cache'],
  ['e.request.body instanceof ReadableStream||e.request.body instanceof ArrayBuffer?[e.request.body]:void 0);return new Response(n.body,',
   'encoded.transfer);return new Response(poxeyBodyTransfer.decode(n.body),']
 ],
 inject: [
  ['if(!e.data?.$controller$setCookie||', 'if(e.source!==(navigator.serviceWorker?.controller||c)||!e.data?.$controller$setCookie||'],
  ['console.error("Failed to set cookie",e)', 'console.error("Failed to set a website cookie")'],

  ['return await this.rpc.call("request",{remote:e.href,method:t,body:o,headers:r})',
   'const encoded=poxeyBodyTransfer.encode(o);const response=await this.rpc.call("request",{remote:e.href,method:t,body:encoded.body,headers:r},encoded.transfer);return {...response,body:poxeyBodyTransfer.decode(response.body)}']
 ]
};

export function patchController(source, bundle) {
 const entry = 'var $scramjetController;(()=>{';
 const steps = replacements[bundle];
 if (!steps) throw Error('Unknown Scramjet controller bundle: ' + bundle);
 for (const [before, after] of steps) {
  if ((typeof before==='string'?source.split(before).length-1:[...source.matchAll(new RegExp(before.source,'g'))].length) !== 1) {
   throw Error('Scramjet controller ' + bundle + ' patch target changed: ' + String(before).slice(0,100));
  }
  source = source.replace(before, after);
 }
 if (!source.startsWith(entry)) throw Error('Scramjet controller entry changed');
 return entry + 'const poxeyIsHttpOnly=' + isHttpOnly.toString() + ';const poxeyBodyTransfer=(' + createBodyTransfer.toString() + ')();\n' + source.slice(entry.length);
}
