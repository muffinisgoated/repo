import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DEFAULT_LIMITS,capacityLimits} from '../capacity.mjs';
// Deliberately no increases above the proven Stage4 defaults on this 8GB Mac.
export const CONTROL_RANGES=Object.freeze({webSockets:[1,6],streamsGlobal:[8,128],httpPerSecond:[10,120],tcpIdleMs:[15000,120000]});
export class AdminControls {
 constructor(directory){this.file=path.join(directory,'limits.json');this.state={next:{},previous:null};if(fs.existsSync(this.file)){const st=fs.lstatSync(this.file);if(st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('Private settings required');this.state=JSON.parse(fs.readFileSync(this.file,'utf8'));this.validate(this.state.next);if(this.state.previous)this.validate(this.state.previous);}}
 validate(values){if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Invalid settings');for(const [key,value]of Object.entries(values)){const range=CONTROL_RANGES[key];if(!range||!Number.isSafeInteger(value)||value<range[0]||value>range[1])throw Error('Unsafe setting');}return capacityLimits(values);}
 save(){const temporary=this.file+'.'+crypto.randomUUID();fs.writeFileSync(temporary,JSON.stringify(this.state),{mode:0o600,flag:'wx'});fs.renameSync(temporary,this.file);}
 read(){return {ranges:CONTROL_RANGES,next:{...DEFAULT_LIMITS,...this.state.next},canRollback:this.state.previous!==null,restartRequired:true};}
 stage(key,value){this.validate({...this.state.next,[key]:value});this.state={next:{...this.state.next,[key]:value},previous:this.state.next};this.save();return this.read();}
 rollback(){if(this.state.previous===null)throw Error('No rollback available');this.state={next:this.state.previous,previous:this.state.next};this.save();return this.read();}
}
