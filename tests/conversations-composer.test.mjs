import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountImageAttachment} from '../public/features/image-attachment.mjs';

test('file paste and drop share preview validation while ordinary text paste is untouched',async()=>{
 const dom=new JSDOM('<section><textarea></textarea><div id="preview"></div><div id="tools"></div></section>');
 try{
  const doc=dom.window.document,panel=doc.querySelector('section'),input=doc.querySelector('textarea');
  let allowed=true;
  mountImageAttachment({host:doc.querySelector('#preview'),tools:doc.querySelector('#tools'),dropTarget:panel,getChat:()=>({id:'chat'}),allowed:()=>allowed,onChange:()=>assert.fail('An unsupported file attached')});
  function transfer(type,key,value){
   const event=new dom.window.Event(type,{bubbles:true,cancelable:true});
   Object.defineProperty(event,key,{value});
   input.dispatchEvent(event);
   return event;
  }
  input.value='Keep my draft';
  assert.equal(transfer('paste','clipboardData',{files:[]}).defaultPrevented,false);
  assert.equal(transfer('paste','clipboardData',{files:[{type:'application/pdf'}]}).defaultPrevented,true);
  await Promise.resolve();
  assert.match(panel.querySelector('.feature-image-tools p').textContent,/Choose a JPG/);
  assert.equal(input.value,'Keep my draft');
  assert.equal(transfer('drop','dataTransfer',{types:['Files'],files:[{},{}]}).defaultPrevented,true);
  assert.match(panel.querySelector('.feature-image-tools p').textContent,/one image at a time/);
  allowed=false;
  assert.equal(transfer('paste','clipboardData',{files:[{type:'image/png'}]}).defaultPrevented,false);
  assert.equal(transfer('drop','dataTransfer',{types:['Files'],files:[{type:'image/png'}]}).defaultPrevented,true);
 }finally{dom.window.close();}
});
