import http from 'node:http';
import https from 'node:https';
import {Cookie, CookieJar} from 'tough-cookie';
import {resolvePublicHost, isPublicIP} from '../security.mjs';
import {upstreamOrigin} from './origin-registry.mjs';

const redirects = new Set([301, 302, 303, 307, 308]);
const allowedMethods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const requestHeaders = new Set(['accept', 'accept-language', 'content-type', 'range',
 'if-match', 'if-none-match', 'if-modified-since', 'if-unmodified-since']);
const privateHeaders = new Set(['set-cookie', 'set-cookie2', 'authentication-info',
 'www-authenticate', 'proxy-authenticate', 'proxy-authentication-info', 'service-worker-allowed']);
const corsRequestHeaders=new Set(['accept','accept-language']);
const corsResponseHeaders=new Set(['cache-control','content-language','content-length','content-type',
 'expires','last-modified','pragma']);
const maxRequestBytes = 2 * 1024 * 1024;
const maxCookiesPerRoute = 128;

function cleanHeaders(headers,allow=requestHeaders) {
 const result = {};
 for (const [name, value] of headers) {
  const key = name.toLowerCase();
  if (allow.has(key)) result[key] = value;
 }
 return result;
}

export function redirectTarget(status, location, source, method) {
 if (!redirects.has(status) || !location) return null;
 const target = new URL(location, source);
 const origin = upstreamOrigin(target.href);
 const convertsToGet = (status === 303 && method !== 'HEAD') ||
  ((status === 301 || status === 302) && method === 'POST');
 return {url: target.href, origin, method: convertsToGet ? 'GET' : method};
}

// Server-only transport. The caller chooses the request context from its
// trusted navigation state. Browser headers never supply cookie or TLS authority.
export function createUpstreamHTTP({registry, resolve=resolvePublicHost,
 dial=(secure, options, callback)=>(secure ? https : http).request(options, callback),
 timeoutMs=15000}={}) {
 const jars = new Map();
 function releaseWorkspace(workspace) {
  for(const [id,entry] of jars)if(entry.route.workspace===workspace)jars.delete(id);
 }
 function jarFor(route) {
  for (const [id, entry] of jars) {
   if (registry.authorize(entry.route.workspace, id) !== entry.route) jars.delete(id);
  }
  let entry = jars.get(route.id);
  if (!entry) {
   entry = {route, jar:new CookieJar(undefined,{prefixSecurity:'strict',allowSecureOnLocal:false})};
   jars.set(route.id, entry);
  }
  return entry;
 }

 function socketCookie(route,url) {
  if(registry.authorize(route.workspace,route.id)!==route||upstreamOrigin(url.href)!==route.upstream)return '';
  return jars.get(route.id)?.jar.getCookieStringSync(url.href,{sameSiteContext:'strict'})||'';
 }
 async function request({workspace, routeID, url, method='GET', headers=[], body,
  cookieContext='omit', publicCORS=false, signal}) {
  const route = registry.authorize(workspace, routeID);
  const target = new URL(url);
  const destination=upstreamOrigin(target.href);
  const foreign=route&&destination!==route.upstream;
  if (!route || foreign&&(!publicCORS||!['GET','HEAD'].includes(method)) ||
   !allowedMethods.has(method) || !['omit','same-site','cross-site-navigation'].includes(cookieContext)) {
   throw Error('Upstream request denied');
  }
  if (body != null && (!Buffer.isBuffer(body) || body.length > maxRequestBytes ||
   method === 'GET' || method === 'HEAD')) throw Error('Upstream request body denied');
  if (cookieContext === 'cross-site-navigation' && method !== 'GET' && method !== 'HEAD') {
   throw Error('Cross-site request body denied');
  }

  const cancellation = AbortSignal.timeout(timeoutMs);
  const deadline = signal ? AbortSignal.any([signal,cancellation]) : cancellation;
  const address = await resolve(target.hostname);
  deadline.throwIfAborted();
  if (!isPublicIP(address) || registry.authorize(workspace, routeID) !== route) {
   throw Error('Upstream connection denied');
  }
  const secure = target.protocol === 'https:';
  const safeHeaders = cleanHeaders(headers,foreign?corsRequestHeaders:requestHeaders);
  safeHeaders.host = target.host;
  safeHeaders['accept-encoding'] = 'identity';
  safeHeaders['user-agent'] = 'PoxeyX1/1.0 (local interactive web browser)';
  if(foreign)safeHeaders.origin=route.upstream;
  if(!foreign&&cookieContext==='same-site'&&!['GET','HEAD'].includes(method))safeHeaders.origin=route.upstream;
  if (body != null) safeHeaders['content-length'] = body.length;
  const credentials = foreign||cookieContext==='omit' ? null : jarFor(route);
  if (credentials) {
   const sameSiteContext = cookieContext==='same-site' ? 'strict' : 'lax';
   const cookie = credentials.jar.getCookieStringSync(target.href,{sameSiteContext});
   if (cookie) safeHeaders.cookie = cookie;
  }

  return new Promise((resolveResponse,reject)=>{
   const outbound = dial(secure,{
    hostname: address, port: secure ? 443 : 80, path: target.pathname+target.search,
    servername: secure ? target.hostname : undefined, rejectUnauthorized:true,
    method, headers:safeHeaders, agent:false, signal:deadline, maxHeaderSize:16384
   }, response=>{
    try {
     if (registry.authorize(workspace, routeID) !== route) throw Error('Expired route');
     const redirect = redirectTarget(response.statusCode,response.headers.location,target,method);
     const exposed=new Set(corsResponseHeaders);
     let exposeAll=false;
     if(foreign){
      const permitted=response.headers['access-control-allow-origin'];
      if(redirect||!['*',route.upstream].includes(permitted))throw Error('Cross-origin response denied');
      const names=(response.headers['access-control-expose-headers']||'').split(',').map(name=>name.trim().toLowerCase());
      exposeAll=names.includes('*');
      for(const name of names)exposed.add(name);
     }
     if (credentials) {
      for (const value of response.headers['set-cookie'] ?? []) {
       if (Buffer.byteLength(value)>4096) continue;
       const cookie = Cookie.parse(value);
       if (!cookie || (cookie.secure && !secure) ||
        (cookie.sameSite==='none' && !cookie.secure)) continue;
       cookie.sameSite||='lax';
       // Keep the jar bounded even when a server cycles through distinct names.
       const stored = credentials.jar.serializeSync().cookies;
       if (stored.length >= maxCookiesPerRoute) {
        const oldest = stored[0];
        credentials.jar.store.removeCookie(oldest.domain,oldest.path,oldest.key,()=>{});
       }
       credentials.jar.setCookieSync(cookie,target.href,{http:true,ignoreError:true,
        sameSiteContext:cookieContext==='same-site'?'strict':'lax'});
      }
     }
     const headers = [];
     for (let index=0; index<response.rawHeaders.length; index+=2) {
      const name=response.rawHeaders[index];
      if (!privateHeaders.has(name.toLowerCase())&&(!foreign||exposeAll||exposed.has(name.toLowerCase()))) headers.push([name,response.rawHeaders[index+1]]);
     }
     resolveResponse({status:response.statusCode,statusText:response.statusMessage,
      headers,redirect,body:response});
    } catch(error) {
     response.destroy();
     reject(error);
    }
   });
   outbound.on('error',reject);
   outbound.end(body);
  });
 }
 return {request,releaseWorkspace,socketCookie};
}
