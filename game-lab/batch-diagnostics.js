'use strict';
(()=>{const parentOrigin=document.currentScript?.dataset.parent;if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(parentOrigin||''))return;let count=0;
const send=(event,detail='')=>{if(count++<100)parent.postMessage({batchLab:true,event,detail:String(detail).slice(0,400)},parentOrigin);};
addEventListener('error',e=>send('runtime-error',e.message||'Resource error'),true);
addEventListener('unhandledrejection',e=>send('runtime-error',e.reason?.message||'Unhandled rejection'));
addEventListener('securitypolicyviolation',e=>send('sandbox-blocked',e.violatedDirective+' '+e.blockedURI));
addEventListener('DOMContentLoaded',()=>send('dom-ready','Not gameplay proof'));
})();
// Fit only detected legacy Unity instances; preserve each game's initial aspect.
// Does not patch engine code, fake initialization, or alter brightness.
(()=>{let observer=null,watch=null,canvas=null,aspect=null,raf=0,last='';
function fit(){raf=0;const instance=window.gameInstance,host=document.getElementById('gameContainer');if(!host||!instance?.Module||typeof instance.Module.setCanvasSize!=='function')return;canvas=host.querySelector('canvas');if(!canvas||!canvas.width||!canvas.height)return;if(!aspect)aspect=canvas.width/canvas.height;
const width=innerWidth,height=innerHeight;if(width<1||height<1)return;const cssWidth=Math.min(width,height*aspect),cssHeight=cssWidth/aspect,dpr=Math.min(2,Math.max(1,devicePixelRatio||1));const scale=Math.min(dpr,3840/cssWidth,2160/cssHeight),w=Math.max(1,Math.round(cssWidth*scale)),h=Math.max(1,Math.round(cssHeight*scale));
const wrapper=host.closest('.webgl-content');if(wrapper){Object.assign(wrapper.style,{position:'fixed',inset:'0',width:'100%',height:'100%',transform:'none',margin:'0'});}Object.assign(host.style,{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'});canvas.style.setProperty('width',cssWidth+'px','important');canvas.style.setProperty('height',cssHeight+'px','important');canvas.style.opacity='1';canvas.style.filter='none';const key=w+'x'+h;if(key!==last){last=key;instance.Module.setCanvasSize(w,h);}}
function schedule(){if(!raf)raf=requestAnimationFrame(fit);}
addEventListener('resize',schedule);addEventListener('DOMContentLoaded',()=>{const host=document.getElementById('gameContainer');if(!host)return;observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:true});let attempts=0;watch=setInterval(()=>{schedule();if(aspect||++attempts>=60){clearInterval(watch);watch=null;}},1000);schedule();});
addEventListener('pagehide',()=>{observer?.disconnect();clearInterval(watch);cancelAnimationFrame(raf);removeEventListener('resize',schedule);});})();
