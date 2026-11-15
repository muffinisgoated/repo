export const CHAT_KEY='poxey-web-chats-v1';
const bytes=value=>new TextEncoder().encode(value).length;
export function loadChats(storage){
 try{
  const raw=storage.getItem(CHAT_KEY)||'[]';if(raw.length>250000)return [];
  const chats=JSON.parse(raw),seen=new Set();
  return (Array.isArray(chats)?chats:[]).slice(-12).filter(c=>{if(!c||typeof c.id!=='string'||!Array.isArray(c.messages)||seen.has(c.id))return false;seen.add(c.id);return true;}).map(c=>({id:c.id.slice(0,80),title:String(c.title||'Conversation').slice(0,70),private:false,messages:c.messages.slice(-60).filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.text==='string').map(m=>({role:m.role,text:m.text.slice(0,m.role==='user'?5000:24000),complete:m.complete===true,...(Array.isArray(m.sources)?{sources:m.sources.slice(0,3).filter(s=>s&&['page','research','selection'].includes(s.kind)&&typeof s.url==='string'&&s.url.length<=2048&&typeof s.title==='string').map(s=>({id:s.id,kind:s.kind,linkable:s.linkable!==false,url:s.url,title:s.title.slice(0,180),coverage:String(s.coverage||'Retrieved evidence').slice(0,180)}))}:{}),...(m.truncated===true?{truncated:true}:{}),...(typeof m.error==='string'?{error:m.error.slice(0,300)}:{})}))}));
 }catch{return [];}
}
export function saveChats(storage,chats){
 const saved=chats.filter(c=>!c.private&&c.messages.length).slice(-12).map(c=>({...c,messages:c.messages.slice(-60)}));let trimmed=false;
 while(JSON.stringify(saved).length>240000){trimmed=true;if(saved.length>1)saved.shift();else if(saved[0]?.messages.length>2)saved[0].messages.splice(0,2);else throw Error('This chat is too large to save locally.');}
 storage.setItem(CHAT_KEY,JSON.stringify(saved));return trimmed;
}
// Keep complete neighboring exchanges, never an orphaned model reply or fake summary.
export function contextWindow(messages,{maxBytes=5000,maxMessages=15}={}){
 if(!Array.isArray(messages))throw Error('Invalid conversation.');
 const exchanges=[];let pending=null;
 for(const message of messages){
  if(!message||message.complete===false||!['user','assistant'].includes(message.role)||typeof message.text!=='string')continue;
  if(message.role==='user')pending={role:'user',content:message.text};
  else if(pending){exchanges.push([pending,{role:'assistant',content:message.text}]);pending=null;}
 }
 if(!pending)return {messages:[],omitted:exchanges.length};
 if(bytes(pending.content)>maxBytes)throw Error('This message is too long for the free pilot. Shorten it before sending.');
 let used=bytes(pending.content);const selected=[pending];let included=0;
 for(let i=exchanges.length-1;i>=0;i--){const pair=exchanges[i],size=pair.reduce((n,m)=>n+bytes(m.content),0);if(used+size>maxBytes||selected.length+2>maxMessages)break;selected.unshift(...pair);used+=size;included++;}
 return {messages:selected,omitted:exchanges.length-included};
}

export function continuationMessages(messages){
 const last=messages.at(-1);if(last?.role!=='assistant'||!last.truncated||!last.text)throw Error('There is no length-limited answer to continue.');
 const question=messages.at(-2);if(question?.role!=='user')throw Error('Original question is unavailable.');
 const tail=(value,limit)=>{let used=0,out='';for(const char of [...value].reverse()){const size=bytes(char);if(used+size>limit)break;out=char+out;used+=size;}return out;};
 const prompt='Continue the previous length-limited answer from its stopping point. Do not repeat earlier sections. If the visible tail lacks essential context, say so.';
 const q=bytes(question.text)>2000?'[Earlier question text omitted; ending:] '+tail(question.text,1900):question.text;
 const answer='[Partial answer truncated by the output limit; only its ending is shown:] '+tail(last.text,2000);
 return [...messages.slice(0,-2),{role:'user',text:q,complete:true},{role:'assistant',text:answer,complete:true},{role:'user',text:prompt,complete:true}];
}
