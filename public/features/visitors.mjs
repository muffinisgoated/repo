// First-party optional counting. No Cookie/Authorization/referrer or page data transmitted.
const KEY='poxey-visitor-receipt-v1';
export function createVisitorReporter({consent,allowed,storage,lock,fetcher=fetch,random=()=>crypto.randomUUID().replaceAll('-',''),now=Date.now,schedule=setTimeout,cancel=clearTimeout,onChange=()=>{}}){
 let timer=null,inFlight=false,controller=null,stopped=false;
 const permitted=()=>!stopped&&consent()&&allowed();
 function arm(){if(timer!==null)cancel(timer);timer=null;if(permitted())timer=schedule(()=>{timer=null;void report();},900000);}
 async function report(){if(inFlight||!permitted())return;inFlight=true;controller=new AbortController();const signal=controller.signal,deadline=schedule(()=>controller?.abort(),2500);
  try{await lock(async()=>{if(signal.aborted||!permitted())return;let state;try{state=JSON.parse(storage.getItem(KEY)||'null');}catch{}
   if(!state||!/^[a-f0-9]{32}$/.test(state.client))state={client:random(),receipt:null,last:0};
   // Save the nonce BEFORE the request. A lost response/reload retries idempotently.
   storage.setItem(KEY,JSON.stringify(state));if(state.receipt&&now()-state.last<5000)return;
   const r=await fetcher('/api/analytics/visit',{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({client:state.client,receipt:state.receipt,consent:true}),signal});
   if(!r.ok)return;const data=await r.json();if(typeof data.receipt!=='string'||data.receipt.length>256)return;storage.setItem(KEY,JSON.stringify({...state,receipt:data.receipt,last:now()}));onChange();
  });}catch{/* Missing storage, cooldown and analytics outages never affect browsing. */}finally{cancel(deadline);controller=null;inFlight=false;arm();}
 }
 function update(){if(timer!==null)cancel(timer);timer=null;if(permitted())void report();else controller?.abort();}
 function stop(){stopped=true;if(timer!==null)cancel(timer);timer=null;controller?.abort();}
 function start(){stopped=false;update();}
 return {update,stop,start};
}
export function createVisitorDisplay({fetcher=fetch,visible=()=>document.visibilityState==='visible',schedule=setTimeout,cancel=clearTimeout}={}){
 let target=null,timer=null,pending=false,controller=null;
 async function refresh(){if(pending||!target?.isConnected||!visible()||target.offsetParent===null)return;if(timer!==null)cancel(timer);timer=null;pending=true;controller=new AbortController();const deadline=schedule(()=>controller?.abort(),2500);
  try{const r=await fetcher('/api/analytics/summary',{credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();const s=await r.json();if(s.status==='disabled')target.textContent='Visitor analytics disabled';else if(s.status==='available'&&Number.isSafeInteger(s.allTimeVisitors)&&s.allTimeVisitors>=0&&Number.isSafeInteger(s.last30Days)&&s.last30Days>=0&&s.last30Days<=s.allTimeVisitors&&Number.isFinite(Date.parse(s.startedAt))){target.textContent=`All-time ${s.allTimeVisitors.toLocaleString()} · Last 30 days ${s.last30Days.toLocaleString()}`;target.title=`Estimated opt-in unique browsers, not people. Collecting since ${new Date(s.startedAt).toLocaleString()}.`;}
   else throw Error();}catch{if(target)target.textContent='Visitor statistics unavailable';}finally{cancel(deadline);pending=false;controller=null;if(target?.isConnected&&visible()&&target.offsetParent!==null)timer=schedule(()=>{timer=null;void refresh();},60000);}
 }
 function mount(element){if(timer!==null)cancel(timer);timer=null;target=element;target.textContent='Visitor statistics loading…';void refresh();}
 function stop(){if(timer!==null)cancel(timer);timer=null;controller?.abort();}
 return {mount,refresh,stop};
}
