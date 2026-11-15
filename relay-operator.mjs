import {createServer, createConnection} from 'node:net';
import {createHash} from 'node:crypto';
import {chmodSync, lstatSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project = fileURLToPath(new URL('.',import.meta.url));
const suffix = createHash('sha256').update(project).digest('hex').slice(0,12);
function socketLocation() {
 if(typeof process.getuid!=='function')throw Error('The relay operator requires a POSIX user and Unix socket. On Windows use WSL2.');
 const parent=process.platform==='darwin'?'/private/tmp':tmpdir();
 const directory=path.join(parent,`poxey-relay-${process.getuid()}-${suffix}`);
 return {directory,address:path.join(directory,'approve.sock')};
}
const codeFormat = /^[0-9a-f]{24}$/;

export function startRelayOperator(approve) {
 const {directory,address}=socketLocation();
 mkdirSync(directory,{mode:0o700,recursive:true});
 const entry = lstatSync(directory);
 if(!entry.isDirectory() || entry.uid!==process.getuid() || (entry.mode&0o077))throw Error('Private relay operator directory required');
 const server = createServer(peer=>{
  peer.setTimeout(2000,()=>peer.destroy());
  peer.on('error',()=>{});
  let input='';
  peer.on('data',data=>{
   input+=data.toString('ascii');
   if(input.length>25)peer.destroy();
   else if(input.endsWith('\n')){
    const code=input.slice(0,-1);
    peer.end(codeFormat.test(code)&&approve(code)?'Approved. Reload the PoxeyX1 tab.\n':'Pairing code expired or unavailable.\n');
   }
  });
 });
 server.maxConnections=4;
 server.listen(address,()=>chmodSync(address,0o600));
 return server;
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const code=process.argv[2];
 if(!codeFormat.test(code||'')){console.error('Usage: node relay-operator.mjs <pairing-code>');process.exitCode=1;}
 else {
  const {address}=socketLocation();
  const peer=createConnection(address,()=>peer.end(code+'\n'));
  peer.on('data',data=>process.stdout.write(data));
  peer.on('error',()=>{console.error('The local relay approval service could not be reached.');process.exitCode=1;});
 }
}
