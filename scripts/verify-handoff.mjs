import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,readFile,realpath,utimes} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const readJSON=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
const hashes=await readJSON('SHA256SUMS.json');

for(const [name,expected] of Object.entries(hashes)){
 const file=path.resolve(root,name);
 if(!file.startsWith(root+path.sep)||await realpath(file)!==file||!(await lstat(file)).isFile()){
  throw Error('Unexpected path: '+name);
 }
 const hash=createHash('sha256');
 for await(const chunk of createReadStream(file))hash.update(chunk);
 if(hash.digest('hex')!==expected)throw Error('SHA-256 mismatch: '+name);
}
console.log('Verified '+Object.keys(hashes).length+' supplied files.');

if(process.argv.includes('--restore-arcade-times')){
 const times=await readJSON('ARCADE_FILE_TIMES.json');
 for(const [name,{sha256,mtimeMs}] of Object.entries(times)){
  if(!name.startsWith('local-games/gn-stage86/packages/')||!hashes[name]||sha256!==hashes[name]||!Number.isFinite(mtimeMs)){
   throw Error('Invalid Arcade timestamp record: '+name);
  }
 }
 for(const [name,{mtimeMs}] of Object.entries(times)){
  const file=path.join(root,name);
  await utimes(file,(await lstat(file)).atime,mtimeMs/1000);
  if(Math.abs((await lstat(file)).mtimeMs-mtimeMs)>1)throw Error('Filesystem cannot preserve the required timestamp: '+name);
 }
 console.log('Restored '+Object.keys(times).length+' verified Arcade timestamps.');
}
