export function cleanSave(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const entries=Object.entries(value);if(entries.length>64)return null;const result=Object.create(null);
 for(const [key,item] of entries){if(['__proto__','prototype','constructor'].includes(key)||key.length>100||typeof item!=='string'||item.length>32768)return null;result[key]=item;}
 return JSON.stringify(result).length<=65536?result:null;
}
export function storageScript(saved,token){
 const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
 return `<script>(()=>{const data=Object.assign(Object.create(null),${json(saved)}),token=${json(token)};const sync=()=>parent.postMessage({type:'arcade-save',token,value:data},'*');const storage={getItem:k=>Object.hasOwn(data,String(k))?data[String(k)]:null,setItem(k,v){k=String(k);v=String(v);if(['__proto__','prototype','constructor'].includes(k)||k.length>100||v.length>32768)return;const next={...data,[k]:v};if(Object.keys(next).length>64||JSON.stringify(next).length>65536)return;data[k]=v;sync();},removeItem(k){delete data[String(k)];sync();},clear(){for(const k of Object.keys(data))delete data[k];sync();},key:i=>Object.keys(data)[i]??null,get length(){return Object.keys(data).length}};Object.defineProperty(window,'localStorage',{value:storage});})();<\/script>`;
}
