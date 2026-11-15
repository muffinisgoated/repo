import path from 'node:path';
import {startServers,root} from '../server.mjs';
import {createLocalGateway} from '../isolation/local-gateway.mjs';
import {loadProductionConfig} from '../isolation/production-config.mjs';

const config=await loadProductionConfig(process.env,root);
const gateway=await createLocalGateway({...config,arcadeRoot:root});
const running=startServers(config.port,8801,{},{
 localIsolation:gateway,bindAddress:config.bindAddress,gameOrigins:false,
 localUnityDirectory:path.join(root,'local-games/tunnel-rush'),
 arcadeDirectory:path.join(root,'arcade-telemetry/.state'),
 aiDirectory:path.join(root,'features-backend/.state')
});
running.servers[0].once('listening',()=>console.log('PoxeyX1 isolated ingress: '+running.uiOrigin));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,running.stop);
