// Read-only extraction. Never serializes HTML, inputs, forms, scripts, cookies or storage.
const excluded='form,input,textarea,select,button,script,style,noscript,iframe,canvas,svg,[contenteditable],[hidden],[inert],[aria-hidden="true"]';
export function publicPageURL(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!u.hostname.replace(/\.$/,'').includes('.')||/^[\d.]+$/.test(u.hostname)||u.hostname.replace(/\.$/,'')==='localhost'||/^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(u.hostname)||u.hostname.includes(':')||/(?:\.(?:local|internal|localhost))$/.test(u.hostname)||/\/(?:login|signin|auth|oauth|account|checkout|billing|password|private|dashboard|profile|wallet|payments|messages|mail)(?:\/|$)/i.test(decodeURIComponent(u.pathname)))throw Error();u.search='';u.hash='';return u.href;}catch{throw Error('This page cannot be shared safely. Open a normal public article.');}}

const blockSelector='h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,tr,dt,dd';
const questionNumber=value=>/^\s*(?:(?:question|problem)\s*|#\s*)(\d{1,3})\s*(?:[:.)–-]|\b)/i.exec(value)?.[1]||/^\s*(\d{1,3})[.)]\s+/.exec(value)?.[1];
export function questionReference(question){const q=String(question);const n=/\b(?:question|problem|number)\s*(\d{1,3})\b|#\s*(\d{1,3})\b/i.exec(q);return n?{number:String(Number(n[1]||n[2]))}:/\b(?:last|final) question\b/i.test(q)?{last:true}:null;}
export const asksVisibleQuestion=q=>/^(?:what(?:['’]s| is) (?:the answer|this question)|solve (?:this|the problem)|answer|(?:ask|look at|read) (?:the |this )?question|which (?:answer|option)|explain this (?:question|problem)|help me understand this)/i.test(q.trim());
function visibility(doc){const cache=new WeakMap();return function allowed(node){if(!node||node.closest?.(excluded+', [data-private], [data-sensitive]'))return false;if(cache.has(node))return cache.get(node);let ancestor=node,depth=0,yes=true;for(;ancestor&&depth++<128;ancestor=ancestor.parentElement){if(cache.has(ancestor)){yes=cache.get(ancestor);break;}const style=doc.defaultView?.getComputedStyle?.(ancestor);if(style&&(style.opacity==='0'||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.contentVisibility==='hidden')){yes=false;break;}}if(depth>=128)yes=false;cache.set(node,yes);return yes;};}
function redact(value){return value.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/gi,'Bearer [redacted]').replace(/\b(api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[^\s"';,]{6,}/gi,'$1=[redacted]');}
function readableText(node,doc,allowed,limit){const walk=doc.createTreeWalker(node,4);let value='',seen=0,n;while((n=walk.nextNode())&&seen++<4000&&value.length<limit){if(allowed(n.parentElement))value+=' '+n.nodeValue.slice(0,limit-value.length);}return redact(value.replace(/\s+/g,' ').trim()).slice(0,limit);}
function searchEvidence(doc,address,question,allowed){
 const duck=/(^|\.)duckduckgo\.com$/i.test(address.hostname)&&['/','/html/','/lite/'].includes(address.pathname)&&address.searchParams.has('q');
 const google=/(^|\.)google\.[a-z.]+$/i.test(address.hostname)&&address.pathname==='/search';
 if(!(duck||google)||questionReference(question)||asksVisibleQuestion(question))return null;
 const list=duck
  ? '[data-testid="mainline"] article[data-testid="result"],.result:has(a.result__a)'
  : '#search a[href]:has(h3),#rso a[href]:has(h3)';
 const items=[];
 for(const result of [...doc.querySelectorAll(list)].slice(0,40)){
  if(result.closest('[data-testid="ad"],[data-text-ad],.result--ad,[data-google-query-id]')||!allowed(result))continue;
  const heading=duck?result.querySelector('h2 a[href],a.result__a'):result.querySelector('h3');
  if(!heading||!allowed(heading))continue;
  const title=readableText(heading,doc,allowed,260);
  if(!title||items.some(item=>item.title===title))continue;
  const snippet=duck?result.querySelector('[data-result="snippet"],.result__snippet'):null;
  items.push({title,summary:snippet?readableText(snippet,doc,allowed,380):''});
  if(items.length===5)break;
 }
 const cards=duck?'[data-testid="sidebar"] [data-testid="about"],[data-testid="mainline"] [data-testid="about"]':'#rhs .kp-wholepage';
 const card=[...doc.querySelectorAll(cards)].find(allowed);
 const cardText=card?readableText(card,doc,allowed,650):'';
 if(!items.length&&!cardText)return null;
 const results=items.map(({title,summary},i)=>`${i+1}. ${title}${summary?' — '+summary:''}`);
 return [
  ...(cardText?['Separate information card: '+cardText]:[]),
  ...(results.length?['Ordinary website results in page order:',...results]:[])
 ].join('\n');
}
function evidenceVersion(values){
 let version=2166136261;
 for(const value of values)for(let i=0;i<value.length;i++)version=Math.imul(version^value.charCodeAt(i),16777619);
 return (version>>>0).toString(16);
}
export function extractPage(doc,{url,question='',selection}={}){
 const cleanURL=publicPageURL(url),allowed=visibility(doc);
 if(doc.querySelector('input[type="password"],input[autocomplete^="cc-"],input[autocomplete="one-time-code"]'))throw Error('Protected sign-in or payment content is not shared.');
 if(/\b(?:document|editor|writing|selected text)\b/i.test(question)&&[...doc.querySelectorAll('[contenteditable],textarea')].some(n=>allowed(n.parentElement)&&n.getAttribute('contenteditable')!=='false'))throw Error('Editable document text is not read automatically. Highlight the intended passage, use Share selected text with AI, and approve its preview. Passwords and private forms are never read.');
 const root=doc.querySelector('main article,[role="main"] article')||doc.querySelector('main,[role="main"]')||doc.querySelector('article')||doc.body;if(!root)throw Error('No readable page content is available.');
 // Scramjet can commit a readable error document at the requested URL.
 // Check the leading visible text before treating this as the site's content.
 if(/^Internal Service Worker Error:/i.test(readableText(root,doc,allowed,200)))
  throw Error('The selected webpage did not load. Reload it before asking about its content.');
 const address=new URL(url);
 const text=searchEvidence(doc,address,question,allowed);
 if(text)return {urlRedacted:true,version:evidenceVersion([doc.title||'',text]),kind:'page',url:cleanURL,title:String(doc.title||'Search results').slice(0,160),text,capturedAt:new Date().toISOString(),coverage:'Visible search-result titles and snippets, in page order; information cards listed separately'};

 // A larger bounded LOCAL index, not a larger cloud prompt. Nothing is retained.
 const blocks=[],walker=doc.createTreeWalker(root,1);let node=root,seen=0,heading='',chars=0,group=null;
 while(node&&seen++<12000&&blocks.length<1200&&chars<180000){
  if(allowed(node)){
   const semantic=node.matches?.(blockSelector),bare=/^(DIV|SECTION)$/.test(node.tagName)&&!node.querySelector(blockSelector+',div,section');
   if((semantic||bare)&&!node.parentElement?.closest('p,li,pre,blockquote,tr,dt,dd')){
    let value=node.tagName==='TR'?[...node.children].filter(n=>/^(TH|TD)$/.test(n.tagName)&&allowed(n)).map(n=>readableText(n,doc,allowed,1800)).join('\t'):readableText(node,doc,allowed,6000);
    if(value){if(node.tagName==='LI'&&node.parentElement?.tagName==='OL'){const n=[...node.parentElement.children].indexOf(node)+Number(node.parentElement.start||1);value=(node.parentElement.type==='A'?String.fromCharCode(64+n):n)+'. '+value;}
     const number=/^(?:question|problem|#)/i.test(value)||/\?/.test(value)||/^H[1-6]$/.test(node.tagName)?questionNumber(value):null;if(number)group={number:String(Number(number)),start:blocks.length};
     if(/^H[1-6]$/.test(node.tagName))heading=value;
     blocks.push({index:blocks.length+1,heading,text:value,paragraph:node.tagName==='P',question:group?.number||null,questionStart:group?.start??null,node});chars+=value.length;
    }
   }
  }node=walker.nextNode();
 }
 if(!blocks.length){const value=readableText(root,doc,allowed,6000);if(value)blocks.push({index:1,heading:'Page text',text:value,paragraph:false,node:root});}
 if(!blocks.length)throw Error('The page has no accessible readable text. Images and canvas content are not analyzed.');
 let selected='';const range=selection||doc.defaultView?.getSelection?.();let selectedRange;
 if(range&&!range.isCollapsed&&range.rangeCount&&allowed(range.anchorNode?.parentElement)&&allowed(range.focusNode?.parentElement)&&root.contains(range.anchorNode)&&root.contains(range.focusNode)){
  selectedRange=range.getRangeAt(0);const walk=doc.createTreeWalker(root,4);let n,count=0;
  while((n=walk.nextNode())&&count++<12000&&selected.length<1000){if(!allowed(n.parentElement)||!selectedRange.intersectsNode(n))continue;const from=n===selectedRange.startContainer?selectedRange.startOffset:0,to=n===selectedRange.endContainer?selectedRange.endOffset:n.nodeValue.length;selected+=' '+n.nodeValue.slice(from,Math.min(to,from+1000-selected.length));}selected=redact(selected.replace(/\s+/g,' ').trim()).slice(0,1000);
 }
 const ref=questionReference(question),starts=[...new Set(blocks.filter(b=>b.question!==null&&b.questionStart!==undefined).map(b=>b.questionStart))];let chosen,focusedQuestion=null;
 const selectedBlocks=selectedRange?blocks.filter(b=>{try{return selectedRange.intersectsNode(b.node);}catch{return false;}}):[];
 const focus=doc.defaultView?.getSelection?.()?.anchorNode?.parentElement;const focused=focus?blocks.find(b=>b.node===focus||b.node.contains(focus)):null;
 if(!ref&&asksVisibleQuestion(question)&&starts.length===1)focusedQuestion=starts[0];
 if(ref){const groups=ref.last?starts.slice(-1):starts.filter(i=>blocks[i].question===ref.number);if(groups.length!==1)throw Error('That question number could not be identified uniquely in the readable page. Name or highlight the intended question.');focusedQuestion=groups[0];}
 else if(asksVisibleQuestion(question)&&starts.length>1){const groups=[...new Set(selectedBlocks.map(b=>b.questionStart).filter(n=>n!==undefined&&n!==null))];if(groups.length===1)focusedQuestion=groups[0];else if(!selected&&focused?.questionStart!==undefined&&focused?.questionStart!==null)focusedQuestion=focused.questionStart;else throw Error('More than one question is visible. Name the question number or highlight the intended question.');}
 if(!ref&&asksVisibleQuestion(question)&&starts.length===0&&blocks.filter(b=>/\?/.test(b.text)).length>1&&!selected&&!focused)throw Error('More than one question is visible. Name the question number or highlight the intended question.');
 if(focusedQuestion!==null)chosen=blocks.filter(b=>b.questionStart===focusedQuestion);
 else{
  const ordinal=/\b(first|second|third|fourth|fifth)\s+(?:main\s+)?paragraph/i.exec(question);
  // Explicit section requests keep sibling list items together instead of ranking them away.
  const section=blocks.filter(b=>/^H[1-6]$/.test(b.node.tagName)&&new RegExp('\\bunder\\s+(?:the\\s+)?["“\'‘]?'+b.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'["”\'’]?(?:\\s+section)?(?:[?.!,;:]|$)','i').test(question));
  if(section.length===1){const start=blocks.indexOf(section[0]),level=Number(section[0].node.tagName[1]);let end=start+1;while(end<blocks.length&&(!/^H[1-6]$/.test(blocks[end].node.tagName)||Number(blocks[end].node.tagName[1])>level))end++;chosen=blocks.slice(start,end);}
  else if(ordinal){const target=blocks.filter(b=>b.paragraph)[['first','second','third','fourth','fifth'].indexOf(ordinal[1].toLowerCase())];if(!target)throw Error('That paragraph boundary could not be identified in the extracted page.');chosen=blocks.filter(b=>Math.abs(b.index-target.index)<=1);}
  else{const stop=new Set(['this','page','what','does','about','summarize','explain','reading','article','answer','question','screen','looking','number','with','that','which','there','could','would','should']);const terms=(question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(t=>!stop.has(t));const asked=question.toLowerCase();const score=b=>{const heading=b.heading.toLowerCase(),text=b.text.toLowerCase();const preciseHeading=heading.length>=8&&heading.split(/\s+/).length>=2&&asked.includes(heading);return (preciseHeading?20:0)+terms.reduce((n,t)=>n+(heading.includes(t)?2:0)+(text.includes(t)?1:0),0)+(selected&&b.text.includes(selected.slice(0,60))?1000:0);};const ranked=blocks.slice().sort((a,b)=>score(b)-score(a)||a.index-b.index);const relevant=ranked.filter(b=>score(b)>0).slice(0,5);chosen=relevant.length?relevant:blocks.slice(0,6);if(selectedBlocks.length)chosen=[...selectedBlocks,...chosen];chosen=[...new Map(chosen.map(b=>[b.index,b])).values()];}
 }
 // Prioritize the requested question, never let introductory paragraphs crowd it out.
 let content=selected?'Selected text: '+selected+'\n\n':'';let included=0;
 for(const b of chosen){let value=b.text;if(focusedQuestion===null&&value.length>1800){const terms=question.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[];const hits=terms.map(t=>value.toLowerCase().indexOf(t)).filter(n=>n>=0);const at=hits.length?Math.max(0,Math.min(...hits)-160):0;value=value.slice(at,at+1800)+' [passage excerpt]';}const next=`[P${b.index}] ${b.heading&&b.heading!==b.text?b.heading+' — ':''}${value}\n`;if(content.length+next.length>4300){if(focusedQuestion!==null)throw Error('That question and its choices exceed the safe page-context limit. Highlight a shorter complete question.');break;}content+=next;included++;}
 let safe='',bytes=0;for(const ch of content){const n=new TextEncoder().encode(ch).length;if(bytes+n>10000){if(focusedQuestion!==null)throw Error('That complete question and its choices exceed the safe sharing byte limit. Highlight a shorter complete question.');break;}safe+=ch;bytes+=n;}
 if(!included)throw Error('The relevant passage is too large. Highlight a shorter complete question.');
 const version=evidenceVersion([doc.title||'',...blocks.map(b=>b.heading+' '+b.text)]);
 return {urlRedacted:Boolean(new URL(url).search||new URL(url).hash),version,kind:'page',url:cleanURL,title:String(doc.title||'Active page').slice(0,160),text:safe.trim(),capturedAt:new Date().toISOString(),coverage:`${included} relevant readable blocks from a bounded local index${node?'; local scan limit reached':''}; text only, not images or the full screen`};
}
