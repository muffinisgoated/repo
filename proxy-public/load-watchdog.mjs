export function watchPage({onTimeout,onReady,limit=45000,setTimer=setTimeout,clearTimer=clearTimeout}){
 let timer=null,active=false,reported=false;
 return {
  start(){this.cancel();active=true;reported=false;timer=setTimer(()=>{timer=null;if(active){reported=true;onTimeout();}},limit);},
  ready(){if(!active)return;active=false;if(timer!==null)clearTimer(timer);timer=null;onReady(reported);},
  cancel(){active=false;if(timer!==null)clearTimer(timer);timer=null;}
 };
}
export function needsComposer(url){try{return new URL(url).hostname==='chatgpt.com';}catch{return false;}}
