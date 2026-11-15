// Operational presence uses the workspace's in-memory proxy grouping ID.
// Historical reporting is opt-in, non-Private, and never backfilled after consent.
export function createArcadeTelemetry({clientID,historyAllowed=()=>false,Socket=globalThis.WebSocket,origin=globalThis.location?.origin,random=()=>crypto.randomUUID(),now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let socket=null,current=null,timer=null,seq=0,attempts=0,destroyed=false,paused=false;
 function state(){if(current&&!historyAllowed())current.store=false;return {seq:++seq,sessions:current?[{...current}]:[]};}
 function send(){if(socket?.readyState===1)try{socket.send(JSON.stringify(state()));}catch{socket.close();}}
 function schedule(){clearTimer(timer);if(destroyed||paused||!current)return;timer=setTimer(()=>{if(socket?.readyState===1){send();schedule();}else connect();},socket?.readyState===1?15000:Math.min(30000,1000*2**Math.min(attempts,5)));}
 function connect(){if(destroyed||paused||!current||!clientID||!Socket||socket||attempts>=10)return;attempts++;try{const url=new URL('/arcade-presence/'+clientID+'/',origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';const ws=new Socket(url.href);socket=ws;ws.onopen=()=>{if(ws!==socket)return;attempts=0;send();schedule();};ws.onerror=()=>{};ws.onclose=event=>{if(ws!==socket)return;socket=null;if([1008,1009].includes(event?.code)){clearTimer(timer);timer=null;attempts=10;return;}schedule();};}catch{socket=null;schedule();}}
 function close(){current=null;clearTimer(timer);timer=null;send();const old=socket;socket=null;old?.close();attempts=0;}
 return {open(game){close();if(destroyed)return;try{current={id:random(),game,started:now(),store:historyAllowed()===true};connect();}catch{current=null;}},close,suspend(){paused=true;clearTimer(timer);timer=null;const old=socket;socket=null;old?.close();},resume(){paused=false;attempts=0;connect();},update(){send();},destroy(){close();destroyed=true;}};
}
