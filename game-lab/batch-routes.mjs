// Private, opt-in package acceptance. No production registry or telemetry writes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const prefix='/game-lab/batch/';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ogg':'audio/ogg','.mp3':'audio/mpeg','.wav':'audio/wav','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon','.swf':'application/x-shockwave-flash'};
export function createBatchLab({directory,root,uiOrigin,proxyOrigin}){
 const packages=new Map();let rows=[];
 if(directory)try{
  const base=fs.realpathSync(directory),manifest=JSON.parse(fs.readFileSync(path.join(base,'acceptance-manifest.json'),'utf8'));
  if(manifest.games.length>30)throw Error('Candidate limit');
  for(const game of manifest.games){
   if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.id)||packages.has(game.id)||game.files.length>600)throw Error('Invalid package');
   const gameRoot=fs.realpathSync(path.join(base,'packages',game.id));if(!gameRoot.startsWith(base+path.sep))throw Error('Invalid root');
   const files=new Map();let bytes=0;
   for(const f of game.files){
    if(typeof f.path!=='string'||f.path.includes('\\')||f.path.split('/').some(p=>!p||p==='..'||p.startsWith('.'))||path.isAbsolute(f.path))throw Error('Invalid path');
    const raw=path.join(gameRoot,f.path),file=fs.realpathSync(raw),stat=fs.statSync(file);
    if(!file.startsWith(gameRoot+path.sep)||fs.lstatSync(raw).isSymbolicLink()||!stat.isFile()||stat.size>70_000_000||(bytes+=stat.size)>100_000_000)throw Error('Invalid file');
    if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==f.sha256)throw Error('Integrity mismatch');
    files.set(f.path,file);
   }
   if(!files.has('index.html')||!files.has(game.entry||'index.html'))continue;
   packages.set(game.id,{game,files});
  }
  rows=manifest.games.filter(g=>packages.has(g.id)).map(({files,...g})=>g);
 }catch{packages.clear();rows=[];}
 return function handle(req,res,isProxy){
  if(!req.url?.startsWith(prefix))return false;
  const no=()=>{res.writeHead(404,{'Cache-Control':'no-store'}).end('Private batch lab unavailable.');return true;};
  if(!packages.size||!['GET','HEAD'].includes(req.method))return no();
  const url=new URL(req.url,isProxy?proxyOrigin:uiOrigin);if(url.search.length>256||(!isProxy&&url.search))return no();
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=(), display-capture=(), usb=()'};
  let body,file,type;
  if(!isProxy){
   const names=new Map([[prefix,'batch.html'],[prefix+'owner.js','batch-owner.js'],[prefix+'style.css','batch.css']]);
   if(url.pathname===prefix+'manifest.json'){body=JSON.stringify({games:rows,proxyOrigin});type='application/json';}
   else if(names.has(url.pathname)){file=path.join(root,'game-lab',names.get(url.pathname));type=mime[path.extname(file)];}else return no();
   headers['Content-Security-Policy']=`default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src ${proxyOrigin}${prefix}assets/; img-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'`;
  }else if(url.pathname===prefix+'diagnostics.js'){
   file=path.join(root,'game-lab/batch-diagnostics.js');type='text/javascript';headers['Access-Control-Allow-Origin']='null';
  }else{
   const match=url.pathname.match(/^\/game-lab\/batch\/assets\/([a-z0-9-]+)\/(.+)$/);if(!match)return no();
   let rel;try{rel=decodeURIComponent(match[2]);}catch{return no();}
   const pack=packages.get(match[1]);if(!pack||!pack.files.has(rel))return no();
   if(req.headers.origin&&req.headers.origin!=='null')return no();
   file=pack.files.get(rel==='index.html'?(pack.game.entry||rel):rel);type=mime[path.extname(file)]||'application/octet-stream';
   const assets=proxyOrigin+prefix+'assets/'+match[1]+'/';
   headers['Access-Control-Allow-Origin']='null';headers.Vary='Origin';
   // Only this candidate's allowlisted local assets. No external SDK substitutes,
   // outgoing network, cookies, same-origin privilege, forms or service workers.
   headers['Content-Security-Policy']=`default-src 'none'; script-src ${assets} ${proxyOrigin}${prefix}diagnostics.js 'unsafe-inline' 'unsafe-eval' blob:; style-src ${assets} 'unsafe-inline'; img-src ${assets} data: blob:; font-src ${assets} data:; media-src ${assets} blob:; connect-src ${assets}; worker-src blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${uiOrigin}`;
   if(rel==='index.html'){
    const diagnostics=`<script src="${proxyOrigin}${prefix}diagnostics.js" data-parent="${uiOrigin}"></script>`;
    const original=fs.readFileSync(file,'utf8');body=/<head[^>]*>/i.test(original)?original.replace(/<head[^>]*>/i,head=>head+diagnostics):original.replace(/<!doctype[^>]*>/i,doctype=>doctype+diagnostics);if(body===original)body=diagnostics+original;file=null;
   }
  }
  if(body!==undefined){res.writeHead(200,{...headers,'Content-Type':type,'Content-Length':Buffer.byteLength(body)});res.end(req.method==='HEAD'?undefined:body);return true;}
  res.writeHead(200,{...headers,'Content-Type':type,'Content-Length':fs.statSync(file).size});if(req.method==='HEAD'){res.end();return true;}
  const stream=fs.createReadStream(file);res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy());stream.pipe(res);return true;
 };
}
