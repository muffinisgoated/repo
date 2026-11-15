import {execFile} from 'node:child_process';
import {randomBytes, X509Certificate} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createSecureContext} from 'node:tls';
import {promisify} from 'node:util';
import {arcadeName,arcadeGameName} from './local-arcade.mjs';

export const shellName='shell.test';
export const routeName=/^r-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.test$/;
const openssl=promisify(execFile);
const run=(args)=>openssl('openssl',args,{timeout:10000,maxBuffer:16384});

export async function initializeLocalCA(directory) {
 await mkdir(directory,{mode:0o700});
 try {
  await run(['req','-new','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256',
   '-noenc','-days','30','-sha256','-subj','/CN=PoxeyX1 Local Test CA',
   '-addext','basicConstraints=critical,CA:TRUE,pathlen:0',
   '-addext','keyUsage=critical,keyCertSign,cRLSign',
   '-addext','nameConstraints=critical,permitted;DNS:.test',
   '-keyout',path.join(directory,'root.key'),'-out',path.join(directory,'root.pem')]);
 } catch(error) {
  await rm(directory,{recursive:true,force:true});
  throw error;
 }
}

export async function localCertificateIssuer(directory) {
 const issuer=new X509Certificate(await readFile(path.join(directory,'root.pem')));
 if(!issuer.ca || Date.parse(issuer.validTo)<=Date.now()+86400000)throw Error('Local CA expired or invalid');
 return async hostname=>{
  if(hostname!==shellName&&hostname!==arcadeName&&!arcadeGameName.test(hostname)&&!routeName.test(hostname))throw Error('Certificate hostname denied');
  const tmp=await mkdtemp(path.join(tmpdir(),'poxeyx1-leaf-'));
  try {
   const keyFile=path.join(tmp,'leaf.key'),csr=path.join(tmp,'leaf.csr'),certFile=path.join(tmp,'leaf.pem'),ext=path.join(tmp,'ext');
   await writeFile(ext,'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:'+hostname+'\n');
   await run(['req','-new','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-noenc','-subj','/CN='+hostname,'-keyout',keyFile,'-out',csr]);
   await run(['x509','-req','-in',csr,'-CA',path.join(directory,'root.pem'),'-CAkey',path.join(directory,'root.key'),
    '-set_serial','0x'+randomBytes(16).toString('hex'),'-days','1','-sha256','-extfile',ext,'-out',certFile]);
   const [key,cert]=await Promise.all([readFile(keyFile),readFile(certFile)]);
   const leaf=new X509Certificate(cert);
   if(!leaf.checkHost(hostname,{subject:'never',wildcards:false})||!leaf.verify(issuer.publicKey))throw Error('Local TLS signature invalid');
   return {key,cert,context:createSecureContext({key,cert,minVersion:'TLSv1.2'})};
  } finally {
   await rm(tmp,{recursive:true,force:true});
  }
 };
}
