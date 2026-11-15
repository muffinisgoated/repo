import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createBrowserPalette,mountBrowserPalette,browserPaletteHTML} from '../public/features/browser-appearance.mjs';
import {revealSetting} from '../public/features/settings-scroll.mjs';

test('browser palette applies readable colors, persists, and resets individual fields',()=>{
 const win=new JSDOM('<body data-theme="black">'+browserPaletteHTML(),{url:'http://localhost'}).window;
 try{
  const {body}=win.document,model=createBrowserPalette(win.localStorage,body);
  mountBrowserPalette(body,model,()=>true);
  const input=body.querySelector('[data-surface="address"]');
  input.value='#ffeedd';input.dispatchEvent(new win.Event('input',{bubbles:true}));
  assert.equal(body.style.getPropertyValue('--browser-address-ink'),'#000000');
  assert.deepEqual(createBrowserPalette(win.localStorage,body).value,{address:'#ffeedd'});
  body.querySelector('[data-reset-surface="address"]').click();
  assert.equal(body.style.getPropertyValue('--browser-address'),'');
  assert.equal(input.value,'#111111');
 }finally{win.close();}
});
test('settings jump scrolls only the drawer and accounts for sticky navigation',()=>{
 const target={getBoundingClientRect:()=>({top:340,height:30}),scrollIntoView:()=>assert.fail('Outer scrolling requested')};
 const drawer={contains:t=>t===target,scrollTop:100,clientHeight:300,getBoundingClientRect:()=>({top:40}),querySelector:()=>({offsetHeight:64})};
 revealSetting(drawer,target);
 assert.equal(drawer.scrollTop,324);
});
