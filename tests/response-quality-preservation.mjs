import fs from 'node:fs';
const edits=JSON.parse(fs.readFileSync(new URL('./fixtures/response-quality-deltas.json',import.meta.url)));
export function withoutResponseQuality(file,value){if(!edits[file])return value;let text=value.toString();for(const e of edits[file]){if(text.split(e.current).length!==2)throw Error('Unreviewed response-quality edit: '+file);text=text.replace(e.current,()=>e.previous);}return text;}
