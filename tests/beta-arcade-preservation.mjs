import {withoutMilestone2} from './milestone2-preservation.mjs';
// Only reviewed owner-requested Beta integration changes are normalized for
// historical byte-preservation tests. Unrelated lines still fail comparisons.
import fs from 'node:fs';
import {withoutScreenReading} from './screen-reading-preservation.mjs';
import {withoutPageReliability} from './page-reliability-preservation.mjs';
import {withoutResponseQuality} from './response-quality-preservation.mjs';
import {withoutStage88} from './stage88-preservation.mjs';
const stage86=JSON.parse(fs.readFileSync(new URL('./fixtures/stage86-authorized-deltas.json',import.meta.url)));
const changes=JSON.parse(fs.readFileSync(new URL('./fixtures/stage85-beta-authorized-deltas.json',import.meta.url)));
const browsingRepair=JSON.parse(fs.readFileSync(new URL('./fixtures/browsing-repair-authorized-deltas.json',import.meta.url)));
const settingsAppearance=JSON.parse(fs.readFileSync(new URL('./fixtures/settings-appearance-deltas.json',import.meta.url)));
const premiumAppearance=JSON.parse(fs.readFileSync(new URL('./fixtures/premium-appearance-deltas.json',import.meta.url)));
const productionIngress=JSON.parse(fs.readFileSync(new URL('./fixtures/security-production-ingress-deltas.json',import.meta.url)));
const httpsArcade=JSON.parse(fs.readFileSync(new URL('./fixtures/security-https-arcade-deltas.json',import.meta.url)));
const httpsGateway=JSON.parse(fs.readFileSync(new URL('./fixtures/security-https-gateway-deltas.json',import.meta.url)));
const isolatedTabs=JSON.parse(fs.readFileSync(new URL('./fixtures/security-isolated-tabs-deltas.json',import.meta.url)));
const originRegistry=JSON.parse(fs.readFileSync(new URL('./fixtures/security-stage1e-deltas.json',import.meta.url)));
const originProof=JSON.parse(fs.readFileSync(new URL('./fixtures/security-stage1d-deltas.json',import.meta.url)));
const relayAdmission=JSON.parse(fs.readFileSync(new URL('./fixtures/security-stage1b-deltas.json',import.meta.url)));
const securityAudit=JSON.parse(fs.readFileSync(new URL('./fixtures/security-stage1-deltas.json',import.meta.url)));
const searchGrounding=JSON.parse(fs.readFileSync(new URL('./fixtures/conversations-search-deltas.json',import.meta.url)));
const temporarySession=JSON.parse(fs.readFileSync(new URL('./fixtures/temporary-session-deltas.json',import.meta.url)));
const reliability=JSON.parse(fs.readFileSync(new URL('./fixtures/reviewed-reliability-deltas.json',import.meta.url)));
const conversations=JSON.parse(fs.readFileSync(new URL('./fixtures/reviewed-conversations-deltas.json',import.meta.url)));
function withoutReviewedEdits(file,value,edits){
 if(!edits[file])return value;
 let source=value.toString();
 for(const edit of edits[file]){
  if(source.split(edit.current).length!==2)throw Error('Unreviewed source edit: '+file);
  source=source.replace(edit.current,()=>edit.previous);
 }
 return source;
}
export function withoutBetaArcade(file,value){for(const edits of [productionIngress,httpsArcade,httpsGateway,isolatedTabs,originRegistry,originProof,relayAdmission,securityAudit,searchGrounding,temporarySession,reliability,conversations])value=withoutReviewedEdits(file,value,edits);value=withoutMilestone2(file,withoutReviewedEdits(file,withoutReviewedEdits(file,withoutReviewedEdits(file,value,premiumAppearance),settingsAppearance),browsingRepair));value=withoutStage88(file,withoutResponseQuality(file,withoutPageReliability(file,withoutScreenReading(file,value))));if(!changes[file]&&!stage86[file])return value;let source=value.toString();for(const edit of stage86[file]||[]){if(!source.includes(edit.current))throw Error('Unreviewed Stage86 block: '+file);source=source.replace(edit.current,()=>edit.previous);}for(const edit of changes[file]||[]){if(edit.current){if(!source.includes(edit.current))throw Error('Unreviewed change to authorized Beta block: '+file);source=source.replace(edit.current,()=>edit.previous);}else throw Error('Unsupported deletion-only normalization');}return source;}
