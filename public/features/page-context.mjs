// Deictic page/document references, not every occurrence of “document” or “page”.
export function pageIntent(text){const t=String(text).replace(/[’]/g,"'").trim().replace(/^(?:(?:please|can you|could you|would you)\s+)+/i,'');
 // A webpage explicitly located on the screen is also a current-page request.
 if(/\b(?:web\s*page|website|article|document)\s+on\s+(?:my|the|this)\s+screen\b/i.test(t))return true;
 // Screen commands mean the current Poxey webpage text, never desktop capture.
 if(/^(?:(?:read|look at|summarize|describe|explain) (?:my|the|this|current) screen|what(?:'s| is) on (?:my|the|this) screen|what does this say|explain what I(?:'m| am) looking at)(?:[.!?]|$)/i.test(t))return true;
 // A result or visible passage can refer to this tab without saying “webpage”.
 if(/\b(?:which|what)(?:'s| is| are)?\s+(?:the\s+)?(?:information|knowledge|featured)\s+(?:card|panel)\b|\b(?:which|what)(?:'s| is| are)?\s+(?:the\s+)?(?:first|top)\s+(?:ordinary|organic)\s+(?:website\s+)?result\b/i.test(t))return true;
 if(/\b(?:result|listing|question|problem|answer|text|error|code|paragraph|option)\b.{0,55}\b(?:on (?:my|the|this|current|active) (?:screen|(?:web\s*)?page|tab)|I(?:'m| am) looking at|in (?:my|this|the|current|active) (?:page|tab))\b/i.test(t))return true;
 if(/^(?:(?:what(?:'s| is)|which is|tell me|read|describe|explain|summarize)(?: me)? (?:the )?(?:first|second|third|fourth|fifth|top|last) (?:ordinary |organic |website |search )?(?:result|listing)|what(?:'s| is) (?:on |in )my (?:page|tab))(?:[.!?]|$)/i.test(t))return true;
 if(/\b(?:question|problem|number|#)\s*\d{1,3}\b|\b(?:last|final) question\b/i.test(t))return true;
 if(/^(?:what(?:'s| is) (?:the answer|number \d+|this question(?: asking)?|the main idea)|solve (?:this|the problem I'm looking at)|explain this (?:question|problem|code|error)|what does this (?:mean|error mean)|summarize what I(?:'m| am) reading|which (?:answer|option) is (?:correct|right|best)|help me understand this|what should I (?:write|do next)|why (?:isn't|is not) this working|which prototype should (?:I|we|the company) (?:choose|buy|select))(?:[.!?]|$)/i.test(t))return true;
 return /\b(?:this|current|active)\s+(?:web\s*)?(?:page|site|tab|article|document)\b|\b(?:the )?(?:page|article|document|website)\s+(?:that )?I(?:'m| am)\s+(?:currently\s+)?(?:viewing|reading|looking at)|\bwhat (?:am I looking at|I(?:'m| am) reading)|\b(?:first|second|third|fourth|fifth)\s+(?:main\s+)?paragraph|\b(?:selected|highlighted) text|\b(?:this|the) paragraph|\b(?:the|this) author|\bthese sections/i.test(t)||/^(?:read this|summarize this|explain this|what(?:'s| is) this)[.!?]*$/i.test(t);
}
export function pagePermission(settings){if(settings.privateSession)return 'Page sharing is unavailable in Private mode. Use a normal session to share readable webpage text.';if(!settings.cloudAI)return 'Cloud AI is turned off. Enable Allow cloud AI in PoxeyX1 Settings before sharing page text.';if(!settings.pageAI)return "Page sharing is turned off. Enable automatic webpage sharing in PoxeyX1 Settings.";return null;}
export const relatedFollowUp=text=>/^(?:why(?:\s|\?)|how so|how much (?:cheaper|more|less|budget|money|does (?:it|that)|is (?:it|that))|what about|which one|explain (?:that|it|this in (?:more )?detail)|make (?:that|it)|summarize (?:that|it)|tell me more|what does (?:that|it say)|who wrote (?:it|that)|(?:what|when|where|who|how) (?:does|did|is|was|are|were|can) (?:it|that|they|those)\b|when was (?:it|that) (?:written|published))/i.test(text.trim());
// A reference to the user's open writing is not an ordinary general-knowledge
// question. It requires excerpt approval or the separate automatic-document opt-in.
export const documentIntent=text=>/\b(?:my|our)\s+(?:(?:open|current|active|shared|attached|approved)\s+)?(?:document|doc|draft|writing)\b|\b(?:open|shared|attached|approved)\s+(?:document|text|file)\b|\b(?:document|text|file)\b.{0,45}\b(?:shared|attached|approved)\b/i.test(text);
export function createPageReader({getTab,getEntry,getSettings,origin,events=globalThis,timeoutMs=4000}){
 const captured=new WeakMap(),pending=new Map(),observed=new Map();let epoch=0;
 const isCurrent=value=>{const at=captured.get(value),tab=getTab(),entry=tab&&getEntry(tab.id);return !!at&&at.epoch===epoch&&tab?.view==='web'&&tab.id===at.id&&tab.input===at.url&&entry?.iframe.contentWindow===at.window&&(!at.documentID||entry.documentAvailable!==false&&entry.documentID===at.documentID&&(at.selectionOnly||entry.documentRevision===at.documentRevision));};
 const receive=event=>{
  const data=event.data,p=pending.get(data?.requestId);
  if(!p||event.origin!==p.origin||event.source!==p.window||data.id!==String(p.id)||data.type!==(p.selectionOnly?'selection-evidence':'page-evidence'))return;
  pending.delete(data.requestId);clearTimeout(p.timer);p.cleanup();
  const current=getTab(),entry=current&&getEntry(current.id);
  if(!current||current.id!==p.id||current.view!=='web'||current.input!==p.url||entry?.iframe.contentWindow!==p.window)return p.reject(Error('The active tab changed while reading. Ask again on the intended page.'));
  if(data.error)return p.reject(Error(String(data.error).slice(0,220)));
  const value=data.evidence;
  if(!value||!(p.selectionOnly?value.kind==='selection':value.kind==='page'||p.documentAllowed&&value.kind==='document')||typeof value.text!=='string'||!value.text.trim()||value.text.length>4500||new TextEncoder().encode(value.text).length>10000||typeof value.title!=='string'||value.title.length>160||typeof value.url!=='string')return p.reject(Error('The page reader returned invalid evidence.'));
  if(!p.selectionOnly&&(typeof value.version!=='string'||!/^[-_a-zA-Z0-9]{1,64}$/.test(value.version)))return p.reject(Error('The page reader returned invalid evidence version.'));
  if(entry.documentID&&(!/^[a-f0-9-]{36}$/.test(value.documentID||'')||value.documentID!==entry.documentID||value.documentRevision!==entry.documentRevision||entry.documentAvailable===false))return p.reject(Error('The selected document changed while reading. Ask again on the intended page.'));
  try{const expected=new URL(p.url),actual=new URL(value.url);expected.search='';expected.hash='';if(actual.href!==expected.href)throw Error();}catch{return p.reject(Error('The selected page navigated while reading. Ask again on the intended page.'));}
  const settings=getSettings();if(!settings.cloudAI||(!p.selectionOnly&&!settings.pageAI)||value.kind==='document'&&!settings.documentAI||settings.privateSession)return p.reject(Error('Page sharing was disabled while reading. Nothing was sent to AI.'));
  const result={...value,tabID:String(p.id)};captured.set(result,{id:p.id,url:p.url,window:p.window,documentID:value.documentID,documentRevision:value.documentRevision,selectionOnly:p.selectionOnly,epoch});p.resolve(result);
 };
 events.addEventListener('message',receive);
 const read=(question,{signal,previous,explicit=true,selectionOnly=false,documentOnly=false}={})=>{
  const settings=getSettings(),tab=getTab();if(!settings.cloudAI||(!selectionOnly&&!settings.pageAI)||settings.privateSession)throw Error('Page sharing is off or this is a Private session. Enable active-page sharing in a normal session.');if(!tab||tab.view!=='web')throw Error('Select a normal webpage first. No page was read.');
  if(!explicit&&previous?.tabID!==String(tab.id))throw Error('The active tab changed. Ask about this page explicitly or return to the earlier tab.');
  const entry=getEntry(tab.id);if(!entry?.ready)throw Error('The selected webpage reader is not ready.');if(signal?.aborted)throw new DOMException('Stopped','AbortError');
  return new Promise((resolve,reject)=>{const requestId=crypto.randomUUID(),window=entry.iframe.contentWindow,frameOrigin=entry.origin||origin();const abort=()=>{const p=pending.get(requestId);if(!p)return;pending.delete(requestId);clearTimeout(p.timer);p.cleanup();reject(new DOMException('Stopped','AbortError'));};const cleanup=()=>signal?.removeEventListener('abort',abort);const timer=setTimeout(()=>{pending.delete(requestId);cleanup();reject(Error('The browser page reader timed out. Reload the selected tab; no web search was substituted.'));},timeoutMs);pending.set(requestId,{selectionOnly,documentAllowed:!selectionOnly&&settings.documentAI===true,id:tab.id,url:tab.input,window,origin:frameOrigin,timer,resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true});observed.set(window,{id:String(tab.id),origin:frameOrigin});if(observed.size>32)observed.delete(observed.keys().next().value);try{window.postMessage({id:String(tab.id),action:selectionOnly?(documentOnly?'read-document':'read-selection'):'read-context',allowDocuments:!selectionOnly&&settings.documentAI===true,requestId,question:String(question).slice(0,600)},frameOrigin);}catch{pending.delete(requestId);clearTimeout(timer);cleanup();reject(Error('The selected webpage reader could not be reached. Reload this tab; nothing was sent to AI.'));}});
 };
 const stop=()=>{epoch++;for(const [window,target]of observed)try{window.postMessage({id:target.id,action:'stop-context'},target.origin);}catch{}observed.clear();for(const p of pending.values()){clearTimeout(p.timer);p.cleanup();p.reject(Error('Page reading stopped. Nothing was sent to AI.'));}pending.clear();};
 return {isCurrent,read,stop,readSelection:options=>read('',{...options,selectionOnly:true}),
  async verify(value,question,options){if(!isCurrent(value))throw Error('The selected document changed before sending. Nothing was sent to AI.');const fresh=await read(question,options);if(!isCurrent(value)||fresh.version!==value.version||fresh.text!==value.text||fresh.documentID!==value.documentID||fresh.documentRevision!==value.documentRevision)throw Error('The selected page content changed before sending. Ask again on the intended page.');return true;},
  destroy(){events.removeEventListener('message',receive);stop();}
 };
}
export function researchIntent(text){
 const question=String(text).trim().replace(/^(?:(?:please|can you|could you|would you)\s+)+/i,'');
 if(/^(?:write|rewrite|draft|translate|roleplay|imagine|invent)\b/i.test(question))return false;
 return /^research\b/i.test(question)||/\b(?:search the web|look up|find (?:official|recent|current)|latest|current version|recent news|today'?s news|up[- ]to[- ]date)\b/i.test(question)||/^(?:who (?:is|leads|runs)|what (?:is|are)|how much (?:is|are|does)).{0,160}\b(?:today|right now|currently|as of (?:today|now))\b/i.test(question)||/^who\s+(?:is|was)\s+(?:the\s+)?current\s+(?:president|prime minister|ceo|leader|champion)\b/i.test(question);
}
