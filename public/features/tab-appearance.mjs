export const TAB_APPEARANCE_KEY = 'poxey-tab-appearance-v1';

const fields = {
 active: 'Active background',
 inactive: 'Inactive background',
 text: 'Tab text',
 accent: 'Active tab accent'
};
const presets = {
 Ocean: {active:'#174a75', inactive:'#102333', text:'#ffffff', accent:'#7dd3fc'},
 Forest: {active:'#215c41', inactive:'#142c23', text:'#ffffff', accent:'#a7f3d0'},
 Plum: {active:'#62396e', inactive:'#2d1b33', text:'#ffffff', accent:'#f0abfc'}
};
const defaults = {
 black: {active:'#171717', inactive:'#090909', text:'#ffffff', accent:'#168bff'},
 dark: {active:'#292e3b', inactive:'#181b25', text:'#f2f4fb', accent:'#a99bff'},
 light: {active:'#e9edf5', inactive:'#f1f3f8', text:'#23314b', accent:'#a99bff'}
};

export function sanitizeAppearance(value) {
 const colors = {};
 for (const key of Object.keys(fields)) {
  const color = value?.[key];
  if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) colors[key] = color.toLowerCase();
 }
 return colors;
}

function luminance(color) {
 const [r,g,b] = color.slice(1).match(/../g).map(channel => {
  const n = parseInt(channel,16)/255;
  return n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4;
 });
 return r*.2126+g*.7152+b*.0722;
}

export function contrast(a,b) {
 const x=luminance(a), y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}

export function readableText(background,preferred) {
 if (preferred && contrast(background,preferred)>=4.5) return preferred;
 return contrast(background,'#ffffff')>=contrast(background,'#000000') ? '#ffffff' : '#000000';
}

export function createTabAppearance({storage,body}) {
 let saved={};
 try { saved=sanitizeAppearance(JSON.parse(storage.getItem(TAB_APPEARANCE_KEY)||'{}')); } catch {}
 const currentDefaults=()=>defaults[body.dataset.theme]||defaults.black;
 function apply() {
  const enabled=Object.keys(saved).length>0;
  if (enabled) body.dataset.customTabs='true';
  else delete body.dataset.customTabs;
  const {active,inactive,text}= {...currentDefaults(),...saved};
  const colors={active,inactive,'active-text':readableText(active,text),
   'inactive-text':readableText(inactive,text),accent:saved.accent};
  for (const [key,value] of Object.entries(colors)) {
   if (enabled && value) body.style.setProperty('--tab-custom-'+key,value);
   else body.style.removeProperty('--tab-custom-'+key);
  }
 }
 apply();
 return {
  get value(){return {...saved};},
  get pickerColors(){return {...currentDefaults(),...saved};},
  apply,
  save(value){
   const next=sanitizeAppearance(value);
   try { storage.setItem(TAB_APPEARANCE_KEY,JSON.stringify(next)); } catch { return false; }
   saved=next;
   apply();
   return true;
  }
 };
}

export function tabAppearanceHTML() {
 return `<section class="feature-section tab-appearance" id="settings-tabs">
 <h3 tabindex="-1">Tab Appearance</h3>
 <div class="tab-preview" aria-label="Tab color preview">
  <span class="tab-preview-item active">Active tab</span><span class="tab-preview-item">Inactive tab</span>
 </div>
 <div class="tab-presets" role="group" aria-label="Tab color presets">
  ${Object.keys(presets).map(name=>`<button type="button" class="web-action" data-tab-preset="${name}"><span class="preset-dot" style="background:${presets[name].active}" aria-hidden="true"></span>${name}</button>`).join('')}
 </div>
 <details class="tab-custom"><summary>Custom colors</summary>
  <div class="tab-colors">${Object.entries(fields).map(([key,label])=>`<div class="browser-surface-field"><label class="tab-color-field">${label}<input type="color" data-tab-color="${key}"></label><button type="button" class="web-action" data-tab-reset-color="${key}" aria-label="Reset ${label.toLowerCase()}">Reset</button></div>`).join('')}</div>
  <button type="button" class="web-action" data-tab-clear-accent>Use default accent</button>
  <p class="settings-hint">Tab text adjusts for readability.</p>
 </details>
 <div class="tab-settings-footer">
  <button type="button" class="web-action" data-tab-reset>Reset tab colors</button>
  <span class="settings-hint" data-tab-status role="status"></span>
 </div>
 </section>`;
}

export function mountTabAppearance(root,model) {
 const status=root.querySelector('[data-tab-status]');
 function sync() {
  const value=model.value, colors=model.pickerColors;
  for(const input of root.querySelectorAll('[data-tab-color]')) input.value=colors[input.dataset.tabColor];
  for(const button of root.querySelectorAll('[data-tab-preset]')) {
   const preset=presets[button.dataset.tabPreset];
   button.setAttribute('aria-pressed',String(Object.keys(fields).every(key=>value[key]===preset[key])));
  }
  for(const button of root.querySelectorAll('[data-tab-reset-color]'))button.disabled=!value[button.dataset.tabResetColor];
  root.querySelector('[data-tab-clear-accent]').disabled=!value.accent;
  root.querySelector('[data-tab-reset]').disabled=Object.keys(value).length===0;
 }
 function save(next) {
  status.textContent=model.save(next)?'Saved':'Could not save tab colors';
  sync();
 }
 root.addEventListener('input',event=>{
  const key=event.target.dataset.tabColor;
  if(Object.hasOwn(fields,key)) save({...model.value,[key]:event.target.value});
 });
 // Some native pickers only emit change when they close.
 root.addEventListener('change',event=>{
  const key=event.target.dataset.tabColor;
  if(Object.hasOwn(fields,key)&&model.pickerColors[key]!==event.target.value) {
   save({...model.value,[key]:event.target.value});
  }
 });
 root.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(Object.hasOwn(presets,button.dataset.tabPreset)) save(presets[button.dataset.tabPreset]);
  else if(button.hasAttribute('data-tab-reset')) save({});
  else if(Object.hasOwn(fields,button.dataset.tabResetColor)){const next=model.value;delete next[button.dataset.tabResetColor];save(next);}
  else if(button.hasAttribute('data-tab-clear-accent')){
   const {accent,...rest}=model.value;
   save(rest);
  }
 });
 sync();
 return sync;
}
