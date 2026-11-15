// Opt-in layout assertions for a future authorized rendered-browser acceptance.
// Reads only Poxey's trusted UI geometry; exports no messages or document text.
export const acceptanceWidths=[320,375,390,768,1024,1280,1440];
const box=node=>{const {left,top,right,bottom,width,height}=node.getBoundingClientRect();return {left,top,right,bottom,width,height};};
export function inspectUILayout(doc){
 const viewport={width:doc.documentElement.clientWidth,height:doc.documentElement.clientHeight},issues=[];
 const drawer=doc.querySelector('#utility-drawer'),settings=doc.querySelector('.poxey-settings'),panel=doc.querySelector('#ai-panel');
 const result={viewport,settings:{status:'NOT_OPEN'},conversations:{status:'NOT_OPEN'},issues};
 if(settings&&drawer&&!drawer.hidden){
  const bounds=box(drawer),body=doc.querySelector('#drawer-content');result.settings={status:'MEASURED',bounds,labels:[],horizontalOverflow:body.scrollWidth>body.clientWidth+1};
  if(!bounds.width||!body.clientWidth||!viewport.width){result.settings.status='NOT_RENDERED';return result;}
  if(bounds.left< -1||bounds.right>viewport.width+1||bounds.top< -1||bounds.bottom>viewport.height+1)issues.push('Settings extends beyond viewport');
  if(result.settings.horizontalOverflow)issues.push('Settings horizontal overflow');
  const close=box(doc.querySelector('#drawer-close'));if(close.width<32||close.height<32||close.right>bounds.right+1)issues.push('Settings close target is clipped or too small');
  for(const label of settings.querySelectorAll('.settings-label')){const b=box(label);result.settings.labels.push({control:label.closest('label').htmlFor,width:b.width,height:b.height});if(label.textContent.length>12&&b.width<96)issues.push('Unreadable setting label: '+label.closest('label').htmlFor);}
  for(const input of settings.querySelectorAll('input[type=checkbox]')){const b=box(input);if(b.width<16||b.height<16)issues.push('Missing checkbox target: '+input.id);if(input.disabled&&!doc.getElementById(input.getAttribute('aria-describedby'))?.textContent.trim())issues.push('Disabled control lacks explanation: '+input.id);}
 }
 if(panel&&!panel.hidden){const bounds=box(panel),messages=doc.querySelector('#ai-messages'),composer=panel.querySelector('.ai-composer-section'),input=doc.querySelector('#ai-input');result.conversations={status:bounds.width?'MEASURED':'NOT_RENDERED',bounds};if(bounds.width){if(bounds.left< -1||bounds.right>viewport.width+1)issues.push('Conversations extends beyond viewport');if(messages.clientWidth&&messages.scrollWidth>messages.clientWidth+1)issues.push('Transcript horizontal overflow');if(composer&&box(composer).bottom>bounds.bottom+1)issues.push('Composer clipped below panel');if(box(input).width<80||box(input).height<32)issues.push('Composer input unusable');}}
 return result;
}
