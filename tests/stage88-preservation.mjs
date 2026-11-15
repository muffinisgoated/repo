// Exact reviewed Stage 8.8 edits only; unrelated changes still fail old byte guards.
import fs from 'node:fs';
const edits=JSON.parse(fs.readFileSync(new URL('./fixtures/stage88-authorized-deltas.json',import.meta.url)));
export function withoutStage88(file,value){if(!edits[file])return value;let source=value.toString();for(const edit of edits[file]){if(source.split(edit.current).length!==2)throw Error('Unreviewed Stage88 edit: '+file);source=source.replace(edit.current,edit.previous);}return source;}
