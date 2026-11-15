// Opt-in aggregate presence only: no URLs, titles, browsing events or identity in payload.
export function createActivityReporter({enabled,visible=()=>document.visibilityState==='visible',fetcher=fetch,schedule=setTimeout,cancel=clearTimeout,serialize=job=>job(),onStatus=()=>{}}={}){
 let timer=null,inFlight=null,stopped=false,removing=false,removePending=false,wasEnabled=Boolean(enabled());
 const allowed=()=>!stopped&&enabled()&&visible();
 const report=value=>{try{onStatus(value);}catch{/* Status UI cannot affect reporting. */}};
 function arm(){if(timer!==null)cancel(timer);timer=null;if(allowed())timer=schedule(()=>{timer=null;void send();},60000);}
 async function send(remove=false){
  if(inFlight){if(remove)removePending=true;return;}
  if(!remove&&!allowed())return;
  const control=new AbortController();inFlight=control;const deadline=schedule(()=>control.abort(),2500);removing=remove;
  try{await serialize(async()=>{if(control.signal.aborted||(!remove&&!allowed()))return;const response=await fetcher('/api/session/activity',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:remove?'{"remove":true}':'{}',signal:control.signal,cache:'no-store',referrerPolicy:'no-referrer'});if(!response||response.status!==204)throw Error('Reporting unavailable');report(remove?'Off':'Reporting active');});}catch{report('Reporting unavailable · browsing is unaffected');}
  finally{cancel(deadline);inFlight=null;removing=false;if(removePending){removePending=false;void send(true);}else arm();}
 }
 function update(){if(timer!==null)cancel(timer);timer=null;const on=Boolean(enabled()),withdraw=wasEnabled&&!on;wasEnabled=on;report(stopped?'Paused':!on?'Off · Private mode or reporting disabled':!visible()?'Paused while this page is hidden':'Connecting…');if(allowed())void send();else if(withdraw&&!stopped&&!removing)void send(true);}
 function stop(){stopped=true;if(timer!==null)cancel(timer);timer=null;inFlight?.abort();}
 function start(){stopped=false;wasEnabled=Boolean(enabled());update();}
 return {update,stop,start};
}
