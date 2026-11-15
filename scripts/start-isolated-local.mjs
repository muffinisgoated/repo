import path from 'node:path';
import {startServers,root} from '../server.mjs';
import {initializeLocalCA,localCertificateIssuer} from '../isolation/local-certificates.mjs';
import {createLocalGateway} from '../isolation/local-gateway.mjs';
import {startLocalDNS} from '../isolation/local-dns.mjs';

const directory=process.env.POXEY_LOCAL_TLS_DIRECTORY;
if(!directory||!path.isAbsolute(directory)||directory===root||directory.startsWith(root+path.sep)) {
 throw Error('Set POXEY_LOCAL_TLS_DIRECTORY to an absolute private path outside the repository.');
}
if(process.argv.includes('--init-ca')){
 await initializeLocalCA(directory);
 console.log('Local CA generated. Its certificate must be trusted by the test browser.');
}else{
 const port=8843,dnsPort=8853;
 const gateway=await createLocalGateway({port,arcadeRoot:root,issue:await localCertificateIssuer(directory)});
 const dns=await startLocalDNS(dnsPort,gateway.hasName);
 const running=startServers(port,8801,{},{
  localIsolation:gateway,gameOrigins:false,localUnityDirectory:path.join(root,'local-games/tunnel-rush'),
  arcadeDirectory:path.join(root,'arcade-telemetry/.state'),aiDirectory:path.join(root,'features-backend/.state')
 });
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{dns.close();running.stop();});
 console.log('Isolated PoxeyX1: '+running.uiOrigin+' | Local .test resolver at 127.0.0.1:'+dnsPort);
}
