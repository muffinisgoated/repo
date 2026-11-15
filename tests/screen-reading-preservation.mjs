// Exact authorized command/lifecycle fixes; other historical preservation checks remain strict.
import fs from 'node:fs';
const edits=JSON.parse(fs.readFileSync(new URL('./fixtures/screen-reading-deltas.json',import.meta.url)));
export function withoutScreenReading(file,value){if(!edits[file])return value;let text=value.toString();for(const e of edits[file]){if(text.split(e.current).length!==2)throw Error('Unreviewed screen-reading edit: '+file);text=text.replace(e.current,()=>e.previous);}return text;}
