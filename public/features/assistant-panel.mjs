// Resizing is local preference only; no networking or conversation data.
export function mountAssistantSizing({panel,handle,storage,viewport=()=>globalThis.innerWidth,events=globalThis}={}){
 if(!panel||!handle)return()=>{};const key='poxey-ai-width-v1';let width=480,preferred=480,dragging=false;
 const clamp=n=>Math.max(320,Math.min(900,Math.floor(viewport()*.85),n));
 const apply=(n,remember=true)=>{if(remember)preferred=n;width=clamp(n);panel.style.setProperty('--ai-width',width+'px');handle.setAttribute('aria-valuenow',String(width));handle.setAttribute('aria-valuemax',String(clamp(900)));};
 try{const saved=Number(storage.getItem(key));if(saved>=320&&saved<=900)width=saved;}catch{}apply(width);
 handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','Resize Conversations');handle.setAttribute('aria-valuemin','320');handle.setAttribute('aria-valuemax',String(clamp(900)));
 const save=()=>{try{storage.setItem(key,String(width));}catch{}};
 let startX,startWidth,pointer;
 const move=e=>{if(dragging&&e.pointerId===pointer)apply(startWidth+startX-e.clientX);};const end=e=>{if(!dragging||e?.pointerId!==undefined&&e.pointerId!==pointer)return;dragging=false;try{handle.releasePointerCapture?.(pointer);}catch{}save();};
 const down=e=>{if(e.button!==0||dragging)return;e.preventDefault();dragging=true;startX=e.clientX;startWidth=width;pointer=e.pointerId;try{handle.setPointerCapture?.(pointer);}catch{}};
 const keys=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();apply(e.key==='Home'?320:e.key==='End'?900:width+(e.key==='ArrowLeft'?40:-40));save();};
 const resize=()=>apply(preferred,false);
 handle.addEventListener('pointerdown',down);handle.addEventListener('keydown',keys);events.addEventListener('pointermove',move);events.addEventListener('pointerup',end);events.addEventListener('pointercancel',end);events.addEventListener('blur',end);events.addEventListener('resize',resize);
 return()=>{end();handle.removeEventListener('pointerdown',down);handle.removeEventListener('keydown',keys);events.removeEventListener('pointermove',move);events.removeEventListener('pointerup',end);events.removeEventListener('pointercancel',end);events.removeEventListener('blur',end);events.removeEventListener('resize',resize);};
}
