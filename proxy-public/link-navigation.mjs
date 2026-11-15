// Read the original href attribute. The proxy's reflected href property can
// already be decoded, so decoding it a second time corrupts real destinations.
export function resolveLink(raw,current,proxyOrigin,unrewrite){
 try{
  if(typeof raw!=='string'||!raw.trim())return null;
  let url=new URL(raw,current);
  if(url.origin===proxyOrigin)url=new URL(unrewrite(url.href));
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>4096)return null;
  const previous=new URL(current);
  if(url.hash&&url.origin+url.pathname+url.search===previous.origin+previous.pathname+previous.search)return null;
  return url.href;
 }catch{return null;}
}
