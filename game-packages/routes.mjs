// Opt-in private candidate execution. Accepted Arcade registry stays separate.
import fs from 'node:fs';import path from 'node:path';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon','.gif':'image/gif','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.webm':'audio/webm','.glb':'model/gltf-binary'};
export function createInstalledGames({enabled,root,uiOrigin,proxyOrigin,directory=path.join(root,'work/stage85'),prefix='/game-lab/installed/',ownerRoutes=true,diagnosticsFile=path.join(root,'game-lab/batch-diagnostics.js'),frameAncestors=uiOrigin,allowBlobConnect=false,allowDataScripts=false}){
 const games=new Map();let base;
 if(enabled)try{base=fs.realpathSync(directory);const manifest=JSON.parse(fs.readFileSync(path.join(base,'installed.json'),'utf8'));if(manifest.schema!==1||manifest.games.length>900)throw Error();
 for(const game of manifest.games){try{if(!/^gn-[0-9]+$/.test(game.id)||games.has(game.id)||game.files.length>5000)throw Error();const dir=fs.realpathSync(path.join(base,'packages',game.id));if(!dir.startsWith(base+path.sep))throw Error();const files=new Map();for(const f of game.files){if(typeof f.path!=='string'||path.isAbsolute(f.path)||f.path.includes('\\')||f.path.split('/').some(p=>!p||p==='..'||p.startsWith('.'))||!Number.isFinite(f.bytes)||f.bytes>100_000_000)throw Error();files.set(f.path,f);}if(!files.has(game.entry))throw Error();games.set(game.id,{game,files,dir});}catch{continue;}}
 }catch{games.clear();}
 return (req,res,isProxy)=>{
  if(!req.url?.startsWith(prefix))return false;
  const no=()=>{res.writeHead(404,{'Cache-Control':'no-store'}).end('Local candidate unavailable.');return true;};
  if(!enabled||!games.size||!['GET','HEAD'].includes(req.method))return no();let url;try{url=new URL(req.url,isProxy?proxyOrigin:uiOrigin);}catch{return no();}if(url.search.length>512)return no();
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=(), display-capture=(), usb=()'};let file,body,type;
  if(!isProxy){
   if(!ownerRoutes)return no();
   const names=new Map([[prefix,'index.html'],[prefix+'app.js','app.js'],[prefix+'style.css','style.css']]);if(url.search)return no();
   if(url.pathname===prefix+'catalog.json'){body=JSON.stringify({proxyOrigin,games:[...games.values()].map(({game:{files,...g}})=>g)});type='application/json';}
   else if(names.has(url.pathname)){file=path.join(root,'game-packages',names.get(url.pathname));type=mime[path.extname(file)];}
   else if(url.pathname.startsWith(prefix+'cover/')){const id=url.pathname.slice((prefix+'cover/').length),pack=games.get(id);if(!pack?.game.cover)return no();file=checked(pack,pack.game.cover);if(!file)return no();type=mime[path.extname(file)]||'application/octet-stream';}
   else return no();
   headers['Content-Security-Policy']=`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-src ${proxyOrigin}${prefix}runtime/; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  }else if(url.pathname===prefix+'diagnostics.js'){file=diagnosticsFile;type='text/javascript';headers['Access-Control-Allow-Origin']='null';}
  else{
   const m=url.pathname.startsWith(prefix+'runtime/')?url.pathname.slice((prefix+'runtime/').length).match(/^(gn-[0-9]+)\/(.+)$/):null;if(!m)return no();const pack=games.get(m[1]);if(!pack?.game.launchable)return no();let rel;try{rel=decodeURIComponent(m[2]);}catch{return no();}file=checked(pack,rel);if(!file)return no();if(req.headers.origin&&req.headers.origin!=='null')return no();
   const metadata=pack.files.get(rel);type=(['text/javascript','application/wasm','application/octet-stream'].includes(metadata.contentType)?metadata.contentType:null)||mime[path.extname(file)]||'application/octet-stream';if(['gzip','br'].includes(metadata.contentEncoding))headers['Content-Encoding']=metadata.contentEncoding;headers['Access-Control-Allow-Origin']='null';headers.Vary='Origin';const assets=proxyOrigin+prefix+'runtime/'+m[1]+'/';
   headers['Content-Security-Policy']=`default-src 'none'; script-src ${assets} ${proxyOrigin}${prefix}diagnostics.js 'unsafe-inline' 'unsafe-eval' blob:${allowDataScripts?' data:':''}; style-src ${assets} 'unsafe-inline'; img-src ${assets} data: blob:; media-src ${assets} blob:${allowDataScripts?' data:':''}; font-src ${assets} data:; connect-src ${assets}${allowBlobConnect?' blob: data:':''}; worker-src ${assets} blob:${allowDataScripts?' data:':''}; object-src 'none'; frame-src 'none'; base-uri ${assets}; form-action 'none'; frame-ancestors ${frameAncestors}`;
  }
  if(body!==undefined){res.writeHead(200,{...headers,'Content-Type':type,'Content-Length':Buffer.byteLength(body)});res.end(req.method==='HEAD'?undefined:body);return true;}
  res.writeHead(200,{...headers,'Content-Type':type,'Content-Length':fs.statSync(file).size});if(req.method==='HEAD'){res.end();return true;}const stream=fs.createReadStream(file);res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);return true;
 };
}
function checked(pack,rel){const expected=pack.files.get(rel);if(!expected)return null;try{const raw=path.join(pack.dir,rel),real=fs.realpathSync(raw),st=fs.statSync(real);if(!real.startsWith(pack.dir+path.sep)||fs.lstatSync(raw).isSymbolicLink()||!st.isFile()||st.size!==expected.bytes||Math.abs(st.mtimeMs-expected.mtimeMs)>1)return null;return real;}catch{return null;}}
