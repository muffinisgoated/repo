// Scroll just the drawer even when it overlays a scrollable page or iframe.
export function revealSetting(root,target,{center=false}={}){
 if(!target||!root.contains(target))return;
 const viewport=root.getBoundingClientRect(),row=target.getBoundingClientRect();
 const top=root.scrollTop+row.top-viewport.top;
 const offset=center?(root.clientHeight-row.height)/2:(root.querySelector('.settings-jump')?.offsetHeight||0)+12;
 root.scrollTop=top-Math.max(0,offset);
}
