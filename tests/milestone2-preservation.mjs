// Exact reviewed Arcade changes only; all unrelated historical checks stay strict.
import fs from 'node:fs';
const additions=JSON.parse(fs.readFileSync(new URL('./fixtures/owner-testing-deltas.json',import.meta.url)));
const changes=JSON.parse(fs.readFileSync(new URL('./fixtures/milestone2-deltas.json',import.meta.url)));
export function withoutMilestone2(file,value){
 if(!changes[file]&&!additions[file])return value;
 let text=value.toString();
 for(const edit of additions[file]||[]){if(text.split(edit.current).length!==2)throw Error('Unreviewed owner-testing addition: '+file);text=text.replace(edit.current,()=>edit.previous);}
 if(!changes[file])return text;
 for(const edit of changes[file]){
  if(text.split(edit.current).length!==2)throw Error('Unreviewed Milestone 2 change: '+file);
  text=text.replace(edit.current,()=>edit.previous);
 }
 return text;
}
