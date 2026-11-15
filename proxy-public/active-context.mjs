// Question-triggered readable-text only. Parent permission checks run before
// dispatch and after reply; this module never polls or sends a cloud request.
import {extractPage,publicPageURL,questionReference,asksVisibleQuestion} from './page-evidence.mjs';
import {extractDocument,extractSelection,editableDocuments} from './selection-evidence.mjs';
const targetQuestion=asksVisibleQuestion;
const multipleQuestions=text=>{const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);return lines.filter(x=>/\b(?:question|problem)\s+\d+\s*[:.)-]/i.test(x)||/\?\s*$/.test(x)).length>1;};
const version=text=>{let n=2166136261;for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);return (n>>>0).toString(16);};
function chosenQuestion(doc,url,full){
 const selection=doc.defaultView?.getSelection?.(),active=doc.activeElement;
 // Only explicit nonempty selection or a caret inside an identifiable question
 // is used. Focusing an entire editor does not identify one of several questions.
 if(active?.tagName==='TEXTAREA'&&active.selectionEnd>active.selectionStart)return extractSelection(doc,{url});
 if(selection&&!selection.isCollapsed&&selection.rangeCount===1)return extractSelection(doc,{url,selection});
 const focus=selection?.anchorNode?.parentElement?.closest('p,li,section');
 if(focus&&full.contains(focus)&&/^(?:question|problem)\s+\d+\b/i.test(focus.textContent.trim())){const range=doc.createRange();range.selectNodeContents(focus);return extractSelection(doc,{url,selection:{isCollapsed:range.collapsed,rangeCount:1,getRangeAt:()=>range}});}
 return null;
}
export function extractActiveContext(doc,{url,question='',allowDocuments=false}={}){
 publicPageURL(url); // Reject protected URLs before reading text.
 // Search snippets are not an identified worksheet question. Never guess one.
 const address=new URL(url),searchPage=/(^|\.)google\.[a-z.]+$/i.test(address.hostname)&&address.pathname==='/search'||/(^|\.)duckduckgo\.com$/i.test(address.hostname)&&address.searchParams.has('q');
 const selected=doc.defaultView?.getSelection?.();
 if(searchPage&&asksVisibleQuestion(question)&&(!selected||selected.isCollapsed||!selected.toString().trim()))throw Error('Which search result or question do you mean? Open the result with the question or highlight it.');
 const editors=editableDocuments(doc);
 if(editors.length){
  // An article with a comment box is not an editable document. Prefer its
  // public text unless the user explicitly refers to their own draft/writing.
  const ownWriting=/\b(?:my|our)\s+(?:(?:open|current|active)\s+)?(?:document|doc|draft|writing)\b/i.test(question);
  if(!ownWriting){let publicText;try{publicText=extractPage(doc,{url,question:''});}catch{}if(publicText?.text.length>160)return extractPage(doc,{url,question});}
  if(!allowDocuments)throw Error('Automatic editable-document reading is off. Enable Automatically read editable documents in Settings, or use the manual preview and approval.');
  const complete=extractDocument(doc,{url,maxChars:120000,maxBytes:300000});let value=complete;if(complete.text.length<=4000&&new TextEncoder().encode(complete.text).length>10000)throw Error('The relevant document text exceeds the safe sharing budget. Select a shorter passage.');
  if(complete.text.length>4000){
   const indexed=doc.implementation?.createHTMLDocument('Readable current document');if(!indexed)throw Error('This long editor cannot be indexed safely. Share a shorter selected passage instead.');
   const main=indexed.createElement('main');for(const line of complete.text.split('\n')){const p=indexed.createElement('p');p.textContent=line;main.append(p);}indexed.body.append(main);const excerpt=extractPage(indexed,{url,question});if(excerpt.text.length>4000)throw Error('The relevant document question is too large. Share a shorter complete passage.');
   return {...complete,text:excerpt.text,kind:'document',version:version(complete.text),coverage:excerpt.coverage+'; authorized editor excerpt'};
  }
  const reference=questionReference(question);const number=reference?.number?[null,reference.number]:reference?.last?[null,[...complete.text.matchAll(/^(?:Question|Problem)\s+(\d+)\s*[:.)-]/gmi)].at(-1)?.[1]]:null;
  if(number&&multipleQuestions(complete.text)){const sections=complete.text.split(/(?=^(?:Question|Problem)\s+\d+\s*[:.)-])/mi).map(t=>t.trim());const matches=sections.filter(t=>new RegExp('^(?:Question|Problem)\\s+'+number[1]+'\\s*[:.)-]','i').test(t));if(matches.length!==1)throw Error('That question number could not be identified uniquely. Highlight the intended question.');value={...complete,text:matches[0]};}

  if(!number&&targetQuestion(question)&&multipleQuestions(complete.text)){
   value=chosenQuestion(doc,url,editors[0]);if(!value||multipleQuestions(value.text))throw Error('More than one question is visible. Highlight the intended question or name which one before asking.');
  }
  return {...value,kind:'document',version:version(complete.text),coverage:value===complete?'Current readable editor text':'Selected or focused question from the current editor'};
 }
 const page=extractPage(doc,{url,question});

 return page;
}

// Only accessible, visible frames on the SAME original public origin qualify.
// Scramjet's rewritten transport origin is never treated as an authorization.
export function extractPageWithFrames(doc,options){
 let evidence,error;try{evidence=extractActiveContext(doc,options);}catch(e){error=e;}
 const frames=[...doc.querySelectorAll('iframe')].slice(0,4);
 const reference=questionReference(options.question||'');
 if(!frames.length||evidence&&(!asksVisibleQuestion(options.question||'')&&!reference||/\?|\b(?:Question|Problem)\s+\d/i.test(evidence.text))){if(error)throw error;return {evidence,document:doc,documentURL:options.url};}
 if(error&&!/no accessible readable text|no readable page content|question number could not/i.test(error.message))throw error;
 publicPageURL(options.url);if(doc.querySelector('input[type=password],input[autocomplete^="cc-"],input[autocomplete="one-time-code"]'))throw Error('Protected sign-in or payment content is not shared.');
 const candidates=[];let blocked;
 for(const frame of frames){try{
  if(frame.closest('form,[hidden],[inert],[aria-hidden="true"]'))continue;
  let node=frame,hidden=false;while(node){const s=doc.defaultView?.getComputedStyle?.(node);if(s&&(s.display==='none'||s.visibility==='hidden'||s.opacity==='0')){hidden=true;break;}node=node.parentElement;}if(hidden)continue;
  const frameURL=options.resolveFrameURL?.(frame)||frame.src;publicPageURL(frameURL);if(new URL(frameURL).origin!==new URL(options.url).origin)continue;
  const child=frame.contentDocument;if(!child||child.readyState==='loading')continue;
  const value=extractActiveContext(child,{...options,url:frameURL});candidates.push({evidence:{...value,url:publicPageURL(options.url),title:('Embedded document · '+value.title).slice(0,160),coverage:'Accessible same-origin embedded document. '+value.coverage},document:child,documentURL:frameURL});
 }catch(e){blocked=e;}}
 if(candidates.length===1)return candidates[0];
 if(candidates.length>1)throw Error('More than one accessible document frame is present. Open the intended document in its own tab.');
 if(blocked&&/Automatic editable-document reading is off/.test(blocked.message))throw blocked;
 throw Error('The embedded document is inaccessible, protected, or on another origin. Open a supported public document in its own tab; no frame restriction was bypassed.');
}
