import {imageTypes,maxImageBytes,maxImageDataLength} from '../public/features/image-limits.mjs';
import {ProviderError} from './groq.mjs';

export function validateImageInput(input, supported){
 if(!Object.hasOwn(input,'image'))return null;
 if(input.imageConsent!==true||input.privateSession!==false)throw new ProviderError('image_consent');
 if(!supported)throw new ProviderError('image_unavailable');
 if(input.pageContext||input.selectionContext||input.documentContext||input.research||input.researchContext)throw new ProviderError('image_combined');
 const {mimeType,data}=input.image||{};
 if(!imageTypes.includes(mimeType)||typeof data!=='string')throw new ProviderError('image_invalid');
 if(data.length>maxImageDataLength)throw new ProviderError('image_size');
 const bytes=Buffer.from(data,'base64');
 if(bytes.length>maxImageBytes)throw new ProviderError('image_size');
 if(bytes.length<16||bytes.toString('base64')!==data)throw new ProviderError('image_invalid');
 const matches=mimeType==='image/png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):
  mimeType==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
  bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!matches)throw new ProviderError('image_invalid');
 return {mimeType,data};
}
