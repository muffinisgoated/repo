import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),url='http://127.0.0.1:8800/';
async function running(){try{const r=await fetch(url+'runtime-config.js',{signal:AbortSignal.timeout(1000)});return r.ok&&(await r.text()).includes('POXEY_RUNTIME');}catch{return false;}}
function open(){const [command,args]=process.platform==='darwin'?['open',[url]]:process.platform==='win32'?['cmd',['/c','start','',url]]:['xdg-open',[url]];spawn(command,args,{stdio:'ignore'}).on('error',()=>console.log('Open '+url));}
if(await running()){console.log('PoxeyX1 Web Edition is already running: '+url);open();}
else{
 const sync=spawnSync(process.execPath,[path.join(root,'scripts/build.mjs')],{cwd:root,stdio:'inherit'});
 if(sync.status!==0){console.error('Build failed. Use the Node version in .nvmrc and run npm ci --ignore-scripts in this project.');process.exitCode=1;}
 else{
  const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,stdio:'inherit'});
  let ready=false;for(let i=0;i<40;i++){if(await running()){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,150));}
  if(!ready){console.error('Startup failed. Check whether ports 8800 and 8801 are already used.');child.kill();process.exitCode=1;}
  else{open();console.log('Keep this terminal open while using Web Edition. Ctrl+C stops this server.');process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));}
 }
}
