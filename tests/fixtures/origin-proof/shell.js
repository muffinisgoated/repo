import routes from '/origin-proof/routes.js';

const sites = routes.map((route,index)=>({...route,index,id:String(index+1),frame:document.createElement('iframe')}));
const group=crypto.randomUUID(), events=document.querySelector('#evidence'), renders=new Set();
let pendingSession;
function record(line){const entry=document.createElement('p');entry.textContent=line;events.append(entry);}
function send(site,data){site.frame.contentWindow.postMessage({id:site.id,...data},site.origin);}
async function ticket(event,site) {
 const {operation,nonce}=event.data;
 if(!['ticket','session'].includes(operation)||!/^[a-f0-9-]{36}$/.test(nonce))return;
 const endpoint=operation==='session'?'/api/relay/session':'/api/relay/ticket/'+group;
 try {
  const request=async()=>{
   const response=await fetch(endpoint,{method:'POST',headers:{'X-Poxey-Relay':'1','X-Poxey-Relay-Origin':site.origin},cache:'no-store'});
   return {response,payload:await response.json()};
  };
  const {response,payload}=await (operation==='session'?(pendingSession??=request()):request());
  const error=response.status===428?'Authorize in Terminal: node relay-operator.mjs '+payload.code:response.ok?undefined:'Relay denied';
  if(error)record(error);
  event.source.postMessage({type:'relay-reply',nonce,ticket:payload.ticket,error},site.origin);
 }catch{record('Authorization service unavailable');}
}
window.addEventListener('message',event=>{
 const site=sites.find(candidate=>event.source===candidate.frame.contentWindow&&event.origin===candidate.origin);
 if(!site||!event.data||String(event.data.id)!==site.id)return;
 const message=event.data;
 switch(message.type) {
  case 'relay-request':void ticket(event,site);break;
  case 'ready':send(site,{action:'navigate',url:site.upstream+'/'});break;
  case 'navigation':
   if(new URL(message.url).origin!==site.upstream){record('FAIL unexpected cross-origin commit');break;}
   if(message.title.startsWith('Proof site ')){renders.add(site.id);record('Rendered '+message.title+' at '+site.origin+' '+new URL(message.url).pathname);}
   break;
  case 'origin-proof-navigate': {
   const target=sites.find(item=>item.upstream===new URL(message.url).origin);
   if(target&&target!==site){record('Routed link from '+site.origin+' to '+target.origin);send(target,{action:'navigate',url:message.url});}
   break;
  }
  case 'origin-proof-result':record('Probe '+site.id+' '+JSON.stringify(message.results));break;
  case 'origin-proof-message':record('Exact-target message at '+site.id+' from '+message.actualOrigin);break;
  case 'origin-proof-wrong-delivery':record('FAIL wrong-target message delivered');break;
  case 'error':record('Bridge '+site.id+': '+message.message);break;
 }
});
document.querySelector('button').onclick=()=>{
 if(renders.size!==sites.length){record('Wait for both fixtures to render');return;}
 for(const site of sites){
  const other=sites.find(candidate=>candidate!==site);
  send(site,{action:'origin-proof-check',otherIndex:other.index,otherOrigin:other.origin});
 }
};
for(const site of sites) {
 site.frame.title='Rewritten site '+site.id;
 site.frame.width='440';site.frame.height='165';
 site.frame.sandbox='allow-scripts allow-same-origin allow-forms';
 site.frame.referrerPolicy='no-referrer';
 const url=new URL('/',site.origin);
 url.searchParams.set('ui',location.origin);url.searchParams.set('id',site.id);
 url.searchParams.set('origin-proof','1');url.hash='client='+group;
 site.frame.src=url.href;
 document.querySelector('section').append(site.frame);
}
