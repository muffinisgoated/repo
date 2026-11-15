// Local, ephemeral document identity. Never stores or transmits page text.
// Start observing only after a question requests readable page evidence.
export function createPageLifecycle({notify,Observer=globalThis.MutationObserver,random=()=>crypto.randomUUID(),delay=500}={}){
 let doc=null,url=null,id=null,revision=0,observer=null,timer=null,observedWindow=null,observedRoot=null;
 const state=()=>({documentID:id,documentRevision:revision,documentAvailable:Boolean(doc)});
 const announce=()=>{timer=null;if(id)notify(state());};
 const changed=()=>{revision++;if(!timer)timer=setTimeout(announce,delay);};
 const editorChanged=event=>{if(event.target?.closest?.('textarea,[contenteditable]'))changed();};
 const stop=()=>{observedRoot?.removeEventListener('input',editorChanged,true);observedRoot?.removeEventListener('change',editorChanged,true);observedRoot=null;observedWindow?.removeEventListener('pagehide',depart);observedWindow=null;observer?.disconnect();observer=null;clearTimeout(timer);timer=null;};
 const depart=()=>{stop();doc=null;url=null;id=random();revision=0;announce();};
 return {
  capture(next,nextURL){
   if(next!==doc||nextURL!==url){stop();doc=next;url=nextURL;id=random();revision=0;announce();observedWindow=doc?.defaultView;observedWindow?.addEventListener('pagehide',depart,{once:true});if(Observer&&doc?.body){observer=new Observer(changed);observedRoot=doc.body; // Observe replacement of the main region too; notices contain metadata only.
 observer.observe(observedRoot,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','inert','aria-hidden','style','class','contenteditable','data-private','data-sensitive']});observedRoot.addEventListener('input',editorChanged,true);observedRoot.addEventListener('change',editorChanged,true);}}
   else{const mutations=observer?.takeRecords().length;if(mutations||timer){clearTimeout(timer);timer=null;if(mutations)revision++;announce();}}
   return state();
  },
  invalidate(){stop();doc=null;url=null;id=random();revision=0;announce();},
  destroy(){stop();doc=null;url=null;id=null;}
 };
}
