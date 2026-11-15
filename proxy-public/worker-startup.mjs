// After unregister/reinstall the document may still expose its old controller.
// Bind the pinned controller to the registration's active worker instead.
export function activeWorker(registration){const worker=registration.active;if(!worker||worker.state==='redundant')throw Error('The page reader worker is not active. Reload this tab.');return worker;}
export async function controllerReady(controller,registration,limit=20000){
 let deadline,retry;
 try{
  retry=setTimeout(()=>{try{controller.serviceWorkerController=activeWorker(registration);controller.setupMessagePort();}catch{}},1000);
  await Promise.race([controller.wait(),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('The page reader took too long to start. Reload this tab.')),limit);})]);
 }finally{clearTimeout(deadline);clearTimeout(retry);}
}
export async function registeredWorker(registration,limit=15000){
 const until=Date.now()+limit;
 while(Date.now()<until){if(registration.active?.state==='activated')return registration;await new Promise(r=>setTimeout(r,25));}
 throw Error('The registered page worker did not activate. Reload this tab.');
}
