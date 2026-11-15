// Cross-instance revocations take effect without waiting for storage events.
// Never writes storage, imports other profile data or propagates remote grants.
import {DATA_KEY} from './store.mjs';
const permissions=['cloudAI','pageAI','documentAI','researchAI'];
function savedSettings(storage){try{const value=JSON.parse(storage.getItem(DATA_KEY)||'null');return value?.settings&&typeof value.settings==='object'?value.settings:null;}catch{return null;}}
export function effectiveAISettings(settings,storage){const saved=savedSettings(storage),result={...settings};for(const key of permissions)result[key]=settings[key]===true&&saved?.[key]===true;result.privateSession=settings.privateSession===true||!saved||saved.privateSession!==false;return result;}
export function applyStoredRestrictions(store,storage){const next=effectiveAISettings(store.settings,storage),revoked=[];for(const key of permissions)if(store.settings[key]===true&&!next[key]){store.settings[key]=false;revoked.push(key);}const privateChanged=!store.settings.privateSession&&next.privateSession;if(privateChanged)store.settings.privateSession=true;return {revoked,privateChanged};}
export function createConsentGuard({store,storage,onRestriction=()=>{}}){let notifying=false;return ()=>{if(!notifying){const change=applyStoredRestrictions(store,storage);if(change.revoked.length||change.privateChanged){notifying=true;try{onRestriction(change);}finally{notifying=false;}}}return effectiveAISettings(store.settings,storage);};}
