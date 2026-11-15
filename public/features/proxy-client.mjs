// One temporary workspace grouping ID, shared by all its proxy frames/connections.
// No localStorage/sessionStorage/cookies, analytics or Private-mode information.
export function createProxyClient(random=()=>crypto.randomUUID()){
 let id=null;try{const candidate=random();if(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(candidate))id=candidate;}catch{}
 // Older clients without secure UUID support retain browsing, with unknown grouping.
 return {clientID:id,frameURL(origin,ui,idOfTab){const url=new URL('/',origin);url.searchParams.set('ui',ui);url.searchParams.set('id',String(idOfTab));if(id)url.hash='client='+id;return url.href;}};
}
