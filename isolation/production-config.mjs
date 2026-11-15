import {randomUUID,timingSafeEqual,X509Certificate} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {isIP} from 'node:net';
import path from 'node:path';
import {createSecureContext} from 'node:tls';
import {parse} from 'tldts';
import {validHostname} from '../security.mjs';

async function readAbsolute(file,{privateFile=false,root}={}) {
 if(!file||!path.isAbsolute(file))throw Error('TLS and access files require absolute paths');
 if(privateFile){
  const stat=await lstat(file);
  const relative=path.relative(root,file);
  if(!relative||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))||
     !stat.isFile()||stat.uid!==process.getuid?.()||(stat.mode&0o077))throw Error('Use owner-only secret files outside the checkout');
 }
 return readFile(file);
}

export async function loadProductionConfig(env,root) {
 const {POXEY_CONTENT_SUFFIX:contentSuffix,POXEY_SHELL_HOSTNAME:shellHostname,
  POXEY_ARCADE_HOSTNAME:arcadeHostname,POXEY_TLS_CERT_FILE:certificateFile,
  POXEY_TLS_KEY_FILE:keyFile,POXEY_ACCESS_TOKEN_FILE:tokenFile}=env;
 const port=Number(env.POXEY_HTTPS_PORT??443);
 const bindAddress=env.POXEY_BIND_ADDRESS??'127.0.0.1';
 const classify=host=>parse(host,{allowPrivateDomains:true});
 const hostname=host=>typeof host==='string'&&host===host.toLowerCase()&&validHostname(host);
 if(![contentSuffix,shellHostname,arcadeHostname].every(hostname)||
    !Number.isInteger(port)||port<1||port>65535||!isIP(bindAddress))throw Error('Invalid production hostname, port or bind address');
 const suffix=classify(contentSuffix),shell=classify(shellHostname),arcade=classify(arcadeHostname);
 if(!suffix.isPrivate||suffix.publicSuffix!==contentSuffix||suffix.domain||
    classify('route-check.'+contentSuffix).domain!=='route-check.'+contentSuffix||
    !shell.domain||!arcade.domain||shell.domain===arcade.domain||
    ![shell,arcade].every(site=>site.isIcann||site.isPrivate)||
    [shellHostname,arcadeHostname].some(host=>/^(?:r-|game-)/.test(host))) {
  throw Error('Require an exclusive recognized private public suffix and separate registrable shell and Arcade sites');
 }
 const [cert,key,token]=await Promise.all([
  readAbsolute(certificateFile),readAbsolute(keyFile,{privateFile:true,root}),
  readAbsolute(tokenFile,{privateFile:true,root})
 ]);
 const leaf=new X509Certificate(cert);
 if(leaf.ca||leaf.checkIssued(leaf)||Date.parse(leaf.validFrom)>Date.now()||Date.parse(leaf.validTo)<=Date.now()||
    ![shellHostname,arcadeHostname,'r-'+randomUUID()+'.'+contentSuffix,'game-slope.'+contentSuffix]
      .every(name=>leaf.checkHost(name,{subject:'never'})))throw Error('TLS leaf must be current and cover all production authorities');
 const context=createSecureContext({key,cert,minVersion:'TLSv1.2'});
 const secret=token.toString('utf8').trim();
 if(!/^[A-Za-z0-9_-]{43,128}$/.test(secret))throw Error('Access token must be a high entropy base64url secret');
 const expected=Buffer.from('Basic '+Buffer.from('poxey:'+secret).toString('base64'));
 return {port,bindAddress,production:{
  contentSuffix,shellHostname,arcadeHostname,
  authorized(req){
   const header=req.headers.authorization||'';
   return Buffer.byteLength(header)===expected.length&&timingSafeEqual(Buffer.from(header),expected);
  }
 },issue:async()=>({key,cert,context})};
}
