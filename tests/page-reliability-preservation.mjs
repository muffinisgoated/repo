// Exact reviewed page-awareness changes; unrelated historical preservation checks remain intact.
import fs from 'node:fs';
const edits=JSON.parse(fs.readFileSync(new URL('./fixtures/page-reliability-deltas.json',import.meta.url)));
export function withoutPageReliability(file,value){if(!edits[file])return value;let text=value.toString();for(const e of edits[file]){if(text.split(e.current).length!==2)throw Error('Unreviewed page reliability edit: '+file);text=text.replace(e.current,()=>e.previous);}return text;}
