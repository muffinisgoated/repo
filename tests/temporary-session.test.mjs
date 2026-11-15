import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {BrowserStore} from '../public/features/store.mjs';
import {settingsHTML} from '../public/features/settings-ui.mjs';
import {mountSettingsControls} from '../public/features/settings-controls.mjs';
import {createSessionPreferences,createTemporaryWallpaperStore} from '../public/features/temporary-session.mjs';

test('appearance survives refresh but does not inherit opener or legacy settings',()=>{
 const entries=new Map([['poxey-browser-v1','legacy']]);
 const sessionStorage={getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v)};
 const store=createSessionPreferences({sessionStorage});
 store.setItem('theme','light');
 assert.equal(createSessionPreferences({sessionStorage}).getItem('theme'),'light');
 assert.equal(createSessionPreferences({sessionStorage,opener:{}}).getItem('theme'),null);
 assert.equal(createSessionPreferences({sessionStorage}).getItem('poxey-browser-v1'),null);
 assert.equal(entries.get('poxey-browser-v1'),'legacy');
});

test('temporary Settings hide old controls, keep consent, and never serialize visits or bookmarks',()=>{
 const dom=new JSDOM('<main>'+settingsHTML({temporary:true})+'</main>');
 const root=dom.window.document.querySelector('main');
 const storage={getItem:()=>null,setItem:()=>assert.fail('Persistent write')};
 const store=new BrowserStore(storage,{temporary:true});
 const controls=mountSettingsControls({root,store,temporary:true});
 try{
  for(const id of ['feature-private','feature-history','remember-tabs','feature-visitors','feature-activity','feature-arcade-analytics'])assert.equal(root.querySelector('#'+id),null,id);
  root.querySelector('#feature-cloud-ai').click();root.querySelector('#feature-page-ai').click();
  assert.equal(store.settings.pageAI,true);
  assert.equal(store.recordVisit('https://example.com/','Fixture'),true);
  store.addBookmark('https://example.com/','Fixture');
  const fresh=new BrowserStore(storage,{temporary:true});
  assert.equal(fresh.history.length+fresh.bookmarks.length,0);
  assert.equal(fresh.settings.cloudAI,false);
 }finally{controls.destroy();dom.window.close();}
});

test('uploaded wallpaper records are scoped to the current document store',async()=>{
 const current=createTemporaryWallpaperStore();
 const record=await current.add({name:'Fixture',blob:new Blob()});
 await current.select(record.id);
 assert.equal((await current.active()).name,'Fixture');
 assert.deepEqual(await createTemporaryWallpaperStore().list(),[]);
});
