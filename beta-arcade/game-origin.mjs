// Dedicated, read-only game origin. No UI, Wisp, AI, Admin or profile endpoints.
import fs from 'node:fs';import path from 'node:path';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.wasm':'application/wasm','.webm':'audio/webm','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.woff':'font/woff','.woff2':'font/woff2','.glb':'model/gltf-binary','.ico':'image/x-icon','.webp':'image/webp','.avif':'image/avif','.gif':'image/gif','.ttf':'font/ttf'};
export function isolatedOrigin(id){if(id==='local-slope')return 'http://poxey-game-slope.localhost:12001';if(!/^gn-\d+$/.test(id))return null;const n=Number(id.slice(3));return n>=0&&n<=2000?'http://poxey-game-'+n+'.localhost:'+(10000+n):null;}
export function createGameOriginHandler({game,pack,directory,uiOrigin,proxyOrigin,diagnosticsFile,origin=isolatedOrigin(game.id)}){
 const folder=fs.realpathSync(path.join(directory,'packages',game.id)),base=fs.realpathSync(directory),files=new Map(pack.files.map(f=>[f.path,f]));if(!folder.startsWith(base+path.sep)||fs.lstatSync(path.join(directory,'packages',game.id)).isSymbolicLink()||files.size>5000)throw Error('Invalid game directory');
 return {origin,handle(req,res){
  const fail=status=>{res.writeHead(status,{'Cache-Control':'no-store'}).end('Game resource unavailable.');return true;};
  if(req.headers.host!==new URL(origin).host||!['GET','HEAD'].includes(req.method))return fail(403);
  if(req.headers.origin&&![origin,proxyOrigin].includes(req.headers.origin))return fail(403);
  let url,rel;try{url=new URL(req.url,origin);if(url.search.length>512)return fail(400);rel=decodeURIComponent(url.pathname).slice(1);if(!rel||rel.includes('\\')||rel.includes('\0')||rel.split('/').some(p=>!p||p==='..'||p.startsWith('.')))return fail(404);}catch{return fail(400);}
  let file,meta;if(rel==='diagnostics.js'){file=diagnosticsFile;meta={};}else {meta=files.get(rel);if(!meta)return fail(404);try{file=fs.realpathSync(path.join(folder,rel));const st=fs.statSync(file);if(!file.startsWith(folder+path.sep)||fs.lstatSync(path.join(folder,rel)).isSymbolicLink()||!st.isFile()||st.size!==meta.bytes||Math.abs(st.mtimeMs-meta.mtimeMs)>1)return fail(404);}catch{return fail(404);}}
  const headers={'Content-Type':meta.contentType||mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=(), display-capture=(), usb=(), payment=(), document-domain=()','Origin-Agent-Cluster':'?1','Service-Worker-Allowed':'/','Content-Security-Policy':`default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self' data: blob:${game.id==='gn-116'?' https://cdn.jsdelivr.net/gh/gn-math/assets@main/valid.json':''}; worker-src 'self' blob: data:; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors ${uiOrigin} ${proxyOrigin}`};
  if(req.headers.origin===proxyOrigin){headers['Access-Control-Allow-Origin']=proxyOrigin;headers.Vary='Origin';}if(['gzip','br'].includes(meta.contentEncoding))headers['Content-Encoding']=meta.contentEncoding;
  if(rel==='diagnostics.js'&&origin.startsWith('https://')){
   const script=fs.readFileSync(file,'utf8').replace("'http://localhost:8801'",JSON.stringify(proxyOrigin));
   headers['Content-Length']=Buffer.byteLength(script);
   res.writeHead(200,headers).end(req.method==='HEAD'?undefined:script);
   return true;
  }
  headers['Content-Length']=fs.statSync(file).size;res.writeHead(200,headers);if(req.method==='HEAD'){res.end();return true;}const stream=fs.createReadStream(file);res.once('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);return true;
 }};
}
