// A cold worker must recover its controller without falling through to a static
// 404. The deadline includes revival itself, not just the subsequent polling.
self.PoxeyRouteRecovery=async function(ready,revive,limit=2000){
 if(ready())return true;
 const until=Date.now()+limit;let timer;
 try{
  await Promise.race([Promise.resolve().then(revive),new Promise(resolve=>{timer=setTimeout(resolve,limit);})]);
 }catch{return ready();}finally{clearTimeout(timer);}
 while(Date.now()<until){if(ready())return true;await new Promise(resolve=>setTimeout(resolve,Math.min(25,Math.max(0,until-Date.now()))));}
 return ready();
};
