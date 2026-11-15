// Offline application DOM; no rendered-site or live-provider claim.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';import {createAssistant} from '../public/features/assistant-ui.mjs';import {settingsHTML} from '../public/features/settings-ui.mjs';
test('a document-setting warning appears once, with its Settings action and draft preserved',async()=>{const dom=new JSDOM(fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8')),old=globalThis.document;globalThis.document=dom.window.document;const message='Automatic editable-document reading is off. Enable it in Settings.';let calls=0;const ai=createAssistant({getSettings:()=>({cloudAI:true,pageAI:true,documentAI:true,privateSession:false}),getPageContext:async()=>{throw Error(message);},getSelectedText:async()=>{},api:{capabilities:async()=>({available:true,page:true,modes:['auto','fast']}),usage:async()=>null,streamAnswer:async()=>calls++}});try{await ai.open();const input=dom.window.document.querySelector('#ai-input');input.value='Which prototype should the company buy?';await ai.send();assert.equal(dom.window.document.querySelector('#ai-panel').textContent.split(message).length-1,1);assert.equal(dom.window.document.querySelector('.feature-chat-error').textContent,message);assert.equal([...dom.window.document.querySelectorAll('button')].find(b=>b.textContent==='Open Settings').hidden,false);assert.equal(input.value,'Which prototype should the company buy?');assert.equal(calls,0);}finally{ai.dispose();globalThis.document=old;dom.window.close();}});
test('Settings omits counting UI and retains opt-in privacy controls in a collapsed disclosure',()=>{
 const dom=new JSDOM(settingsHTML());
 try {
  const doc=dom.window.document;
  assert.equal(doc.querySelector('.connected-clients-note'),null);
  assert.doesNotMatch(doc.body.textContent,/Connected Clients|active users|activity analytics|visit estimates|launch totals/i);
  for(const id of ['feature-visitors','feature-activity','feature-arcade-analytics']){
   const input=doc.getElementById(id);
   assert.equal(input.checked,false);
   assert.equal(input.closest('.settings-advanced-privacy').open,false);
  }
 } finally {dom.window.close();}
});
test('Settings prose has no painted black rectangular background in the current CSS cascade (not a layout or selection test)',()=>{const css=['styles.css','web-edition.css','features/features.css','features/settings.css'].map(f=>fs.readFileSync(new URL('../public/'+f,import.meta.url),'utf8')).join('\n');const dom=new JSDOM('<style>'+css+'</style><body class="web-edition">'+settingsHTML()+'</body>');try{for(const node of dom.window.document.querySelectorAll('.settings-label,.settings-hint,.settings-details p')){const style=dom.window.getComputedStyle(node);assert.equal(style.backgroundColor,'rgba(0, 0, 0, 0)');assert.ok(['none',''].includes(style.backgroundImage));}}finally{dom.window.close();}});
