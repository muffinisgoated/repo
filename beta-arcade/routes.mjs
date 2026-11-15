// Private local Beta packages in the normal Arcade. Never gameplay-certified.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {isolatedOrigin,createGameOriginHandler} from './game-origin.mjs';
import {createInstalledGames} from '../game-packages/routes.mjs';
export function createBetaArcade({root,uiOrigin,proxyOrigin,gameOrigin=isolatedOrigin}){
 const upgraded=fs.existsSync(path.join(root,'local-games/gn-stage86/installed.json')),directory=path.join(root,'local-games',upgraded?'gn-stage86':'gn-beta');const origins=[];let games=[],catalog=[];
 try {
  const specs=JSON.parse(fs.readFileSync(path.join(root,'public/arcade/beta-catalog.json')));let installed={schema:1,games:[]};try{installed=JSON.parse(fs.readFileSync(path.join(directory,'installed.json')));}catch{}
  if(!Array.isArray(specs)||specs.length>400)throw Error('Invalid Beta registry');if(installed.schema!==1||!Array.isArray(installed.games)||installed.games.length>400)installed={schema:1,games:[]};
  const ids=new Set();for(const g of specs){try{
   if(!(/^(?:gn-[0-9]+|local-slope)$/.test(g.id))||ids.has(g.id)||g.type!=='beta-local'||g.releaseStatus!=='beta-local'||g.verified!==false||g.beta?.localOnly!==true||g.url!==`/arcade-beta/runtime/${g.id}/index.beta.html`||!new RegExp('^/arcade/art/'+g.id+'-beta\\.(?:png|jpg|svg|webp)$').test(g.cover))continue;ids.add(g.id);
   const p=installed.games.find(p=>p.id===g.id&&p.packageHash===g.packageHash),pack=path.join(directory,'packages',g.id);
   let ready=Boolean(p?.launchable&&p.entry==='index.beta.html'&&p.files.length<=5000&&p.files.some(f=>f.path===p.entry));
   if(ready)ready=p.files.every(f=>{try{if(typeof f.path!=='string'||path.isAbsolute(f.path)||f.path.includes('\\')||f.path.split('/').some(p=>!p||p==='..'||p.startsWith('.'))||f.bytes<0||f.bytes>100000000)return false;const file=path.join(pack,f.path),real=fs.realpathSync(file),st=fs.statSync(file);return real.startsWith(fs.realpathSync(pack)+path.sep)&&st.isFile()&&!fs.lstatSync(file).isSymbolicLink()&&st.size===f.bytes&&Math.abs(st.mtimeMs-f.mtimeMs)<=1;}catch{return false;}});
   if(ready)try{ready=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'public',g.cover))).digest('hex')===g.beta.artworkSHA256;}catch{ready=false;}
   // Keep unavailable IDs for saved favorites, but never expose a launch card.
   if(g.runtimeOrigin){
    if(g.runtimeOrigin!==isolatedOrigin(g.id))ready=false;
    g.runtimeOrigin=gameOrigin(g.id);
    if(!g.runtimeOrigin)ready=false;
   }
   catalog.push(ready?g:{...g,disabled:true});
   if(ready&&g.disabled!==true){
    games.push(g);
    if(g.runtimeOrigin)origins.push({game:g,handler:createGameOriginHandler({game:g,pack:p,directory,uiOrigin,proxyOrigin,origin:g.runtimeOrigin,diagnosticsFile:path.join(root,'proxy-public/arcade/beta-diagnostics.js')})});
   }
  }catch{continue;}}
 }catch{games=[];catalog=[];}
 const route=createInstalledGames({enabled:games.length>0,root,uiOrigin,proxyOrigin,directory,prefix:'/arcade-beta/',ownerRoutes:false,diagnosticsFile:path.join(root,'proxy-public/arcade/beta-diagnostics.js'),frameAncestors:uiOrigin+' '+proxyOrigin,allowBlobConnect:true,allowDataScripts:true});
 return {games,catalog,origins,handle(req,res,isProxy){if(!req.url?.startsWith('/arcade-beta/'))return false;const match=req.url.match(/^\/arcade-beta\/runtime\/(gn-[0-9]+|local-slope)\//);if(!isProxy||match&&!games.some(g=>g.id===match[1])){res.writeHead(404,{'Cache-Control':'no-store'}).end('Local Beta game unavailable.');return true;}if(match){const game=games.find(g=>g.id===match[1]);if(game?.disabled){res.writeHead(404).end();return true;}if(game?.runtimeOrigin){const rel=req.url.slice(('/arcade-beta/runtime/'+game.id+'/').length);if(!game.beta?.originUnavailable){res.writeHead(302,{Location:game.runtimeOrigin+'/'+rel,'Cache-Control':'no-store'}).end();return true;}res.writeHead(503).end('Game origin unavailable');return true;}}return route(req,res,isProxy);}};
}
