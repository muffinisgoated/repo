import {imageTypes,maxImageBytes} from './image-limits.mjs';

const maxLocalBytes=15*1024*1024;

async function prepareImage(file,doc){
 if(!imageTypes.includes(file.type))throw Error('Choose a JPG, PNG or WebP image.');
 if(file.size>maxLocalBytes)throw Error('Choose an image smaller than 15 MB.');
 const source=URL.createObjectURL(file),decoded=doc.createElement('img');
 try{
  decoded.src=source;
  try{await decoded.decode();}catch{throw Error('This image could not be opened. Choose another file.');}
  const {naturalWidth:width,naturalHeight:height}=decoded;
  if(!width||!height||width*height>40_000_000)throw Error('Choose an image with fewer than 40 million pixels.');
  const scale=Math.min(1,1536/Math.max(width,height));
  const canvas=doc.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');
  ctx.drawImage(decoded,0,0,canvas.width,canvas.height);
  let preview=canvas.toDataURL(file.type,0.9);
  if(preview.length>Math.floor(maxImageBytes/3)*4){
   ctx.globalCompositeOperation='destination-over';
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   preview=canvas.toDataURL('image/jpeg',0.78);
  }
  const match=/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(preview);
  if(!match||match[2].length>Math.floor(maxImageBytes/3)*4)throw Error('This image is still too large after preparation. Try a smaller image.');
  return {payload:{mimeType:match[1],data:match[2]},preview,name:file.name};
 }finally{URL.revokeObjectURL(source);}
}

export function mountImageAttachment({host,tools,dropTarget,getChat,allowed,onChange}){
 const doc=host.ownerDocument,images=new Map();
 let pending=null;
 const button=doc.createElement('button'),input=doc.createElement('input'),panel=doc.createElement('div');
 const status=doc.createElement('p'),preview=doc.createElement('img'),name=doc.createElement('span');
 const view=doc.createElement('button'),viewer=doc.createElement('dialog'),largePreview=doc.createElement('img'),closeViewer=doc.createElement('button');
 const controls=doc.createElement('div'),remove=doc.createElement('button'),label=doc.createElement('label'),consent=doc.createElement('input');
 status.setAttribute('aria-live','polite');
 button.type='button';button.className='feature-copy feature-image-pick';
 input.type='file';input.accept=imageTypes.join(',');input.hidden=true;
 panel.className='feature-image-attachment';preview.alt='Attached image preview';
 remove.type='button';remove.className='feature-copy';remove.textContent='Remove';remove.setAttribute('aria-label','Remove image');
 consent.type='checkbox';label.className='feature-image-consent';
 const consentCopy=doc.createElement('span'),consentTitle=doc.createElement('strong'),consentHelp=doc.createElement('small');
 consentHelp.textContent='Gemini receives the image with each question until you remove it or turn sharing off.';
 consentCopy.append(consentTitle,consentHelp);label.append(consent,consentCopy);
 view.type='button';view.className='feature-image-open';view.setAttribute('aria-label','View full image');view.append(preview);
 viewer.className='feature-image-viewer';viewer.setAttribute('aria-label','Image preview');largePreview.alt='Full attached image';
 closeViewer.type='button';closeViewer.className='feature-copy';closeViewer.textContent='Close preview';
 viewer.append(largePreview,closeViewer);
 viewer.addEventListener('close',()=>{largePreview.removeAttribute('src');view.focus({preventScroll:true});});
 closeViewer.onclick=()=>viewer.close();
 view.onclick=()=>{const image=images.get(getChat()?.id);if(image){largePreview.src=image.preview;viewer.showModal();}};
 controls.className='feature-image-actions';controls.append(remove);
 const card=doc.createElement('div');card.className='feature-image-card';card.append(view,name,controls);
 panel.append(card,label);
 const root=doc.createElement('div');root.className='feature-image-tools';root.append(input,panel,status,viewer);host.prepend(root);tools.append(button);
 button.innerHTML='<svg aria-hidden="true"><use href="#i-image"/></svg><span></span>';
 const buttonText=button.querySelector('span');
 function render(){
  const chat=getChat(),image=images.get(chat?.id);
  button.hidden=!allowed()&&!image;button.disabled=Boolean(pending);
  buttonText.textContent=image?'Replace image':'Add image';
  panel.dataset.shared=String(Boolean(image?.approved));
  consentTitle.textContent=image?.approved?'Sharing with Gemini':'Share with Gemini';
  panel.hidden=!image;
  if(viewer.open&&largePreview.getAttribute('src')!==image?.preview)viewer.close();
  if(image){preview.src=image.preview;name.textContent=image.name;consent.checked=image.approved;consent.disabled=!allowed();}
  else{preview.removeAttribute('src');name.textContent='';consent.checked=false;}
 }
 button.onclick=()=>{if(allowed())input.click();};
 async function attach(file){
  const chat=getChat();
  if(!file||!chat||!allowed())return;
  const operation={id:chat.id};pending=operation;status.textContent='Preparing image…';render();
  try{
   const image=await prepareImage(file,doc);
   if(pending!==operation||getChat()!==chat||!allowed())return;
   if(images.size>=4&&!images.has(chat.id))throw Error('Remove an image from another conversation first. Up to four chats can hold an image during this visit.');
   onChange(chat.id);
   images.set(chat.id,{...image,id:crypto.randomUUID(),approved:false});
   status.textContent='';
  }catch(error){if(pending===operation)status.textContent=error.message;}
  finally{if(pending===operation){pending=null;render();}}
 }
 input.onchange=()=>{const file=input.files?.[0];input.value='';void attach(file);};
 function transferFiles(transfer){
  if(transfer?.files?.length>1){status.textContent='Attach one image at a time.';return;}
  void attach(transfer?.files?.[0]);
 }
 dropTarget.addEventListener('paste',event=>{
  if(!allowed()||!event.clipboardData?.files?.length)return;
  event.preventDefault();transferFiles(event.clipboardData);
 });
 const fileDrag=event=>[...(event.dataTransfer?.types||[])].includes('Files');
 dropTarget.addEventListener('dragover',event=>{
  if(!fileDrag(event))return;
  event.preventDefault();event.dataTransfer.dropEffect=allowed()?'copy':'none';
  dropTarget.classList.toggle('feature-image-drop',allowed());
 });
 dropTarget.addEventListener('dragleave',event=>{
  if(!event.relatedTarget?.nodeType||!dropTarget.contains(event.relatedTarget))dropTarget.classList.remove('feature-image-drop');
 });
 dropTarget.addEventListener('drop',event=>{
  dropTarget.classList.remove('feature-image-drop');
  if(!fileDrag(event))return;
  event.preventDefault();
  if(allowed())transferFiles(event.dataTransfer);
 });
 consent.onchange=()=>{const chat=getChat(),image=images.get(chat?.id);if(!image)return;image.approved=consent.checked&&allowed();if(!image.approved)onChange(chat.id);status.textContent='';render();};
 remove.onclick=()=>{const id=getChat()?.id;forget(id);onChange(id);render();};
 function forget(id){images.delete(id);if(pending?.id===id)pending=null;status.textContent='';}
 render();
 return {render,isPreparing:id=>pending?.id===id,get:id=>images.get(id),forget,prune:ids=>{for(const id of images.keys())if(!ids.has(id))forget(id);},
  cancelPreparation(){if(pending){pending=null;status.textContent='';render();}},
  clear(){images.clear();pending=null;status.textContent='';render();}};
}
