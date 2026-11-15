import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {createAssistant} from '../public/features/assistant-ui.mjs';
import {readerFixture,uiFixture} from './screen-reading-harness.mjs';
import {createPageLifecycle} from '../proxy-public/page-lifecycle.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('a live read flushes a pending mutation notice before returning its new revision',async()=>{
 const dom=new JSDOM('<main><p>First panel.</p></main>'),notices=[];
 const lifecycle=createPageLifecycle({notify:s=>notices.push(s),Observer:dom.window.MutationObserver,delay:1000});
 try{const first=lifecycle.capture(dom.window.document,'https://jqueryui.com/demo');dom.window.document.querySelector('p').textContent='Second panel.';await Promise.resolve();assert.equal(notices.length,1);const current=lifecycle.capture(dom.window.document,'https://jqueryui.com/demo');assert.ok(current.documentRevision>first.documentRevision);assert.equal(notices.length,2);assert.equal(notices.at(-1).documentRevision,current.documentRevision);assert.doesNotMatch(JSON.stringify(notices),/First panel|Second panel/);}finally{lifecycle.destroy();dom.window.close();}
});
function controlled({read,stream,enroll}={}){
 const f=readerFixture(),shell=new JSDOM(fs.readFileSync('public/index.html','utf8')),old=globalThis.document;
 globalThis.document=shell.window.document;
 const d=shell.window.document,calls=[];
 const ai=createAssistant({getSettings:()=>f.settings,getActiveSource:()=>({tabID:String(f.tab.id),url:f.tab.input,title:f.tab.title}),getPageContext:async(q,o)=>{await read?.(q,o);return f.reader.read(q,o);},validatePageContext:e=>f.reader.isCurrent(e),revalidatePageContext:(e,q,o)=>f.reader.verify(e,q,o),getSelectedText:async()=>{throw Error('Automatic pages must not request manual selection');},api:{capabilities:async()=>({available:true,page:true,session:true,modes:['auto','fast']}),usage:async()=>null,ensureSession:async()=>enroll?.(),streamAnswer:async r=>{calls.push(r);r.onEvidence({sources:[{id:1,kind:'page',title:'Current source',url:r.pageContext.url}]});if(stream)await stream(r);else r.onText('Current answer.');}}});
 return {...f,ai,d,calls,shell,async send(text){d.querySelector('#ai-input').value=text;await ai.send();},change(text='UPDATED_PUBLIC_TEXT'){f.dom.window.document.querySelector('p').textContent=text;f.entry.documentRevision++;ai.sourceChanged();},status:()=>d.querySelector('.feature-ai-status').textContent,close(){ai.dispose();f.close();globalThis.document=old;shell.window.close();}};
}

test('same-page dynamic follow-up rereads automatically and excludes obsolete answers',async()=>{
 const f=uiFixture({html:'<main><p>OLD_MATH</p></main>'});
 try{await f.ai.open();await f.send('Summarize this page.');f.change({url:f.tab.input,newDocument:false,html:'<main><p>Updated museum opening hours: 10 am.</p></main>'});await f.send('What about the opening hours?');assert.equal(f.calls.length,2);const r=f.calls[1];assert.match(r.pageContext.text,/10 am/);assert.doesNotMatch(JSON.stringify(r.messages),/OLD_MATH|OLD_ANSWER/);assert.deepEqual(r.messages.map(m=>m.text),['Summarize this page.','What about the opening hours?']);assert.equal(f.shell.window.document.querySelector('.selection-preview'),null);}finally{f.close();}
});

for(const change of ['path','query','fragment','tab'])test('automatic dynamic refresh never crosses a '+change+' boundary',async()=>{
 const f=uiFixture();
 try{await f.ai.open();await f.send('Summarize this page.');if(change==='tab')f.tab.id++;else f.tab.input+=change==='path'?'/other':change==='query'?'?q=other':'#other';f.ai.sourceChanged();await f.send('What about its purpose?');assert.equal(f.calls.length,1);assert.match(f.shell.window.document.querySelector('.feature-chat-error').textContent,/changed/);}finally{f.close();}
});

test('dynamic pre-dispatch mutation refreshes once without sending the obsolete evidence',async()=>{
 let f,enrollments=0;f=controlled({enroll:()=>{if(++enrollments===1)f.change();}});
 try{await f.ai.open();await f.send('Summarize this page.');assert.equal(enrollments,2);assert.equal(f.calls.length,1);assert.match(f.calls[0].pageContext.text,/UPDATED_PUBLIC_TEXT/);assert.doesNotMatch(f.calls[0].pageContext.text,/CURRENT_PUBLIC_TEXT/);assert.equal(f.status(),'');}finally{f.close();}
});

test('dynamic streaming mutation aborts stale output and regenerates at most once',async()=>{
 let f;f=controlled({stream:async r=>{if(f.calls.length===1){r.onText('STALE_PARTIAL');f.change();assert.equal(r.signal.aborted,true);r.onStatus('thinking');r.onText('LATE_STALE_TOKEN');}else r.onText('REFRESHED_ANSWER');}});
 try{await f.ai.open();await f.send('Summarize this page.');assert.equal(f.calls.length,2);assert.match(f.calls[1].pageContext.text,/UPDATED_PUBLIC_TEXT/);assert.match(f.d.querySelector('#ai-messages').textContent,/REFRESHED_ANSWER/);assert.doesNotMatch(f.d.querySelector('#ai-messages').textContent,/STALE_PARTIAL|LATE_STALE_TOKEN/);assert.equal(f.status(),'');}finally{f.close();}
});

test('a continuously mutating page stops after one automatic refresh',async()=>{
 let f;f=controlled({stream:async r=>{r.onText('STALE_TOKEN');f.change('Change '+f.calls.length);r.onText('LATE_TOKEN');}});
 try{await f.ai.open();await f.send('Summarize this page.');assert.equal(f.calls.length,2);assert.match(f.d.querySelector('.feature-chat-error').textContent,/active page changed/);assert.doesNotMatch(f.d.querySelector('#ai-messages').textContent,/STALE_TOKEN|LATE_TOKEN/);assert.equal(f.status(),'');}finally{f.close();}
});

for(const restriction of ['pageAI','cloudAI','privateSession'])test('consent withdrawal during refresh prevents any replacement request: '+restriction,async()=>{
 let f;f=controlled({stream:async()=>{f.change();f.settings[restriction]=restriction==='privateSession';f.ai.permissionsChanged();}});
 try{await f.ai.open();await f.send('Summarize this page.');assert.equal(f.calls.length,1);assert.equal(f.status(),'');}finally{f.close();}
});

test('Reading page and Thinking appear only during their operations and clear on text/completion',async()=>{
 const readGate=deferred(),thinkingGate=deferred(),finish=deferred();let request;
 const f=controlled({read:()=>readGate.promise,stream:async r=>{request=r;r.onStatus('thinking');await thinkingGate.promise;r.onText('Live text.');await finish.promise;}});
 try{await f.ai.open();const pending=f.send('Summarize this page.');assert.equal(f.status(),'Reading page…');readGate.resolve();for(let n=0;n<20&&!request;n++)await tick();assert.ok(request);assert.equal(f.status(),'Thinking…');thinkingGate.resolve();await tick();assert.equal(f.status(),'');finish.resolve();await pending;assert.equal(f.status(),'');assert.equal(f.d.querySelector('.feature-ai-context').textContent,'');assert.match(f.d.querySelector('#ai-messages').textContent,/Page used for this answer: Current source/);assert.doesNotMatch(f.d.querySelector('#ai-panel').textContent,/Share selected text with AI|Using current page/);assert.equal(f.d.querySelector('.feature-document-tools').open,false);assert.equal(f.d.querySelector('#ai-attach-file').textContent,'Use selected passage');}finally{readGate.resolve();thinkingGate.resolve();finish.resolve();f.close();}
});

test('stopping a pending read clears activity and cannot restart automatically',async()=>{
 const gate=deferred(),f=controlled({read:()=>gate.promise});
 try{await f.ai.open();const pending=f.send('Summarize this page.');assert.equal(f.status(),'Reading page…');f.ai.stop();assert.equal(f.status(),'Stopped.');gate.resolve();await pending;assert.equal(f.calls.length,0);assert.equal(f.status(),'Stopped.');}finally{gate.resolve();f.close();}
});
