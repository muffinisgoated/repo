import {createBetaArcade} from '../beta-arcade/routes.mjs';

export const arcadeName='arcade.test';
export const arcadeGameName=/^game-(?:slope|[0-9]{1,4})\.test$/;

export async function prepareLocalArcade({root,uiOrigin,origin,gameOrigin,issue}) {
 const beta=createBetaArcade({root,uiOrigin,proxyOrigin:origin,gameOrigin});
 const hosts=new Map([[new URL(origin).hostname,{authority:'arcade'}]]);
 for(const {handler} of beta.origins)hosts.set(new URL(handler.origin).hostname,{authority:handler});
 const entries=[...hosts];
 for(let index=0;index<entries.length;index+=4){
  await Promise.all(entries.slice(index,index+4).map(async([name,entry])=>{
   entry.certificate=await issue(name);
  }));
 }
 return {origin,beta,hosts};
}
