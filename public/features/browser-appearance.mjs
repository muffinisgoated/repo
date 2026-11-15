import {readableText} from './tab-appearance.mjs';
export const accents = Object.freeze({
 'Electric Blue':'#168bff', 'Neon Purple':'#a855f7', Emerald:'#00d68f',
 'Bright Red':'#ff365e', 'Ice Cyan':'#00d9ff', 'Sunset Orange':'#ff8a00', 'Pure White':'#ffffff'
});

const accentKey='poxey-browser-accent-v1';

export function createBrowserAccent(storage,body) {
 const valid=value=>Object.hasOwn(accents,value);
 let saved=storage.getItem(accentKey);
 function apply(){
  if(valid(saved)){
   body.style.setProperty('--browser-accent-preset',accents[saved]);
   body.dataset.browserAccent=saved;
  }else{
   body.style.removeProperty('--browser-accent-preset');
   delete body.dataset.browserAccent;
  }
 }
 apply();
 return {
  get value(){return saved;},
  save(value){
   if(!valid(value)&&value!=='')return false;
   try{storage.setItem(accentKey,value);}catch{return false;}
   saved=value;
   apply();
   return true;
  }
 };
}

export function accentSettingsHTML(){
 return `<div class="accent-settings">
  <h4>Browser accent</h4>
  <div class="accent-options" role="group" aria-label="Browser accent">
   ${Object.entries(accents).map(([name,color])=>`<button type="button" class="web-action" data-browser-accent="${name}"><span style="--swatch:${color}" aria-hidden="true"></span>${name}</button>`).join('')}
   <button type="button" class="web-action" data-browser-accent="">Theme default</button>
  </div>
  <p class="settings-hint" data-accent-status role="status"></p>
 </div>`;
}

export function mountBrowserAccent(root,model){
 const buttons=root.querySelectorAll('[data-browser-accent]');
 const status=root.querySelector('[data-accent-status]');
 const sync=()=>buttons.forEach(button=>{
  button.setAttribute('aria-pressed',String((model.value||'')===button.dataset.browserAccent));
 });
 buttons.forEach(button=>button.addEventListener('click',()=>{
  status.textContent=model.save(button.dataset.browserAccent)?'Accent saved.':'Could not save the accent.';
  sync();
 }));
 sync();return sync;
}

const paletteKey='poxey-browser-surfaces-v1';
const surfaces={
 background:['Main background','#000000','#10121a','#f3f5fa'],
 toolbar:['Toolbar','#090909','#181b25','#f1f3f8'],
 address:['Address and search','#111111','#181b25','#ffffff'],
 shortcuts:['Shortcut tiles','#111111','#181b25','#ffffff'],
 settings:['Settings panel','#111111','#181b25','#ffffff'],
 accent:['Custom accent','#168bff','#a99bff','#675ad1']
};

function cleanPalette(value){
 return Object.fromEntries(Object.entries(value||{}).filter(([key,color])=>Object.hasOwn(surfaces,key)&&typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color)));
}

export function createBrowserPalette(storage,body){
 let saved={};
 try{
  const stored=JSON.parse(storage.getItem(paletteKey)||'{}');
  saved=cleanPalette(stored);
 }catch{}
 const apply=()=>{
  for(const key of Object.keys(surfaces)){
   const color=saved[key];
   if(color){
    body.style.setProperty('--browser-'+key,color);
    if(key!=='accent')body.style.setProperty('--browser-'+key+'-ink',readableText(color));
   }else{
    body.style.removeProperty('--browser-'+key);
    body.style.removeProperty('--browser-'+key+'-ink');
   }
  }
 };
 apply();
 return {
  get value(){return {...saved};},
  get defaults(){const theme=body.dataset.theme;return Object.fromEntries(Object.entries(surfaces).map(([key,values])=>[key,values[theme==='light'?3:theme==='dark'?2:1]]));},
  save(value){const next=cleanPalette(value);try{storage.setItem(paletteKey,JSON.stringify(next));}catch{return false;}saved=next;apply();return true;}
 };
}

export function browserPaletteHTML(){
 return `<details class="browser-palette"><summary>Customize browser colors</summary>
 <div class="browser-surface-fields">${Object.entries(surfaces).map(([key,[label]])=>`<div class="browser-surface-field"><label>${label}<input type="color" data-surface="${key}"></label><button type="button" class="web-action" data-reset-surface="${key}" aria-label="Reset ${label.toLowerCase()}">Reset</button></div>`).join('')}</div>
 <p class="settings-hint">Changes appear live. Tab colors have their own controls below.</p>
 </details><button type="button" class="web-action" data-reset-appearance>Reset all colors and theme</button><p class="settings-hint" data-surface-status role="status"></p>`;
}

export function mountBrowserPalette(root,model,resetAppearance){
 const status=root.querySelector('[data-surface-status]');
 function sync(){
  const saved=model.value, defaults=model.defaults;
  for(const input of root.querySelectorAll('[data-surface]'))input.value=saved[input.dataset.surface]||defaults[input.dataset.surface];
  for(const button of root.querySelectorAll('[data-reset-surface]'))button.disabled=!saved[button.dataset.resetSurface];
 }
 function save(next){
  const ok=model.save(next);status.textContent=ok?'Saved.':'Could not save colors.';sync();return ok;
 }
 for(const type of ['input','change'])root.addEventListener(type,event=>{
  const key=event.target.dataset.surface,value=event.target.value;
  if(Object.hasOwn(surfaces,key)&&/^#[0-9a-f]{6}$/i.test(value)&&model.value[key]!==value)save({...model.value,[key]:value});
 });
 root.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-reset-appearance')){
   const paletteSaved=save({}), themeSaved=resetAppearance();
   status.textContent=paletteSaved&&themeSaved?'Default appearance restored.':'Some appearance settings could not be saved.';
   sync();return;
  }
  const key=button.dataset.resetSurface;
  if(Object.hasOwn(surfaces,key)){const next=model.value;delete next[key];save(next);}
 });
 sync();return sync;
}
