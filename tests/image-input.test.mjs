import test from 'node:test';
import assert from 'node:assert/strict';
import {validateImageInput} from '../features-backend/image-input.mjs';
import {createGemini} from '../features-backend/gemini.mjs';

const images=[
 {mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII='},
 {mimeType:'image/jpeg',data:'/9j/4AAQSkZJRgABAQAAAQABAAD/2Q=='},
 {mimeType:'image/webp',data:'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'}
];
const approved=image=>({image,imageConsent:true,privateSession:false});

test('image input requires explicit consent, a normal session and a compatible provider',()=>{
 assert.equal(validateImageInput({},false),null);
 for(const image of images){
  assert.deepEqual(validateImageInput(approved(image),true),image);
  assert.throws(()=>validateImageInput({...approved(image),imageConsent:false},true),{code:'image_consent'});
  assert.throws(()=>validateImageInput({...approved(image),privateSession:true},true),{code:'image_consent'});
  assert.throws(()=>validateImageInput(approved(image),false),{code:'image_unavailable'});
  for(const key of ['research','researchContext','selectionContext','documentContext','pageContext'])
   assert.throws(()=>validateImageInput({...approved(image),[key]:{}},true),{code:'image_combined'});
 }
});

test('image input rejects mismatched signatures, noncanonical data and oversized payloads',()=>{
 assert.throws(()=>validateImageInput(approved({...images[0],mimeType:'image/jpeg'}),true),{code:'image_invalid'});
 assert.throws(()=>validateImageInput(approved({...images[0],data:images[0].data+'\n'}),true),{code:'image_invalid'});
 assert.throws(()=>validateImageInput(approved({...images[0],data:'A'.repeat(1_400_000)}),true),{code:'image_size'});
});

test('Gemini receives image bytes only in the latest user turn and rejects a bad image without a model cooldown',async()=>{
 let payload;
 const fetcher=async(_url,options)=>{
  payload=JSON.parse(options.body);
  return new Response('{}',{status:400});
 };
 const provider=createGemini({key:'synthetic-fixture-key-for-tests',fetcher});
 const messages=[{role:'user',content:'Read the screenshot'},{role:'assistant',content:'Route 17'},{role:'user',content:'What platform?'}];
 await assert.rejects(async()=>{
  for await(const _ of provider.stream({messages,image:images[0],selectedMode:'fast'})){}
 },{code:'image_rejected'});
 assert.deepEqual(payload.contents.map(m=>m.parts.map(p=>p.inlineData||p.text)),[
  ['Read the screenshot'],['Route 17'],[images[0],'What platform?']
 ]);
});
