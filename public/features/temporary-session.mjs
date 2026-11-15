// Appearance may survive a refresh of this outer tab, but never uses localStorage.
export function createSessionPreferences(window){
 const prefix='poxey-temporary-v1:';
 const memory=new Map();
 let session;
 try{if(!window.opener)session=window.sessionStorage;}catch{}
 return {
  getItem(key){try{return session?.getItem(prefix+key)??memory.get(key)??null;}catch{return memory.get(key)??null;}},
  setItem(key,value){memory.set(key,String(value));try{session?.setItem(prefix+key,value);}catch{}return true;},
  removeItem(key){memory.delete(key);try{session?.removeItem(prefix+key);}catch{}}
 };
}

export function createTemporaryWallpaperStore(){
 const records=new Map();
 let selected=null;
 return {
  async list(){return [...records.values()];},
  async active(){return records.get(selected)||null;},
  async add(item){
   if(records.size>=4)throw Error('Remove a wallpaper before adding another.');
   const record={...item,id:crypto.randomUUID()};records.set(record.id,record);return record;
  },
  async select(id){if(id!==null&&!records.has(id))throw Error('Wallpaper no longer exists.');selected=id;},
  async remove(id){records.delete(id);if(selected!==id)return false;selected=null;return true;}
 };
}
