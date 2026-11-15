// Pinned Scramjet 2.0.67-alpha.2 History URL compatibility repair.
// Preserve native omitted/undefined/null URL behavior instead of String(undefined).
// Refuse unknown bundles: review this patch explicitly before any runtime upgrade.
export function patchHistory(source){
 const before='let r=e.box.histories.get(t.this),s=(0,n.Qf)(t.args[2]);if(n.xP.canParse(s)';
 const after='let r=e.box.histories.get(t.this),s=t.args[2]==null?null:(0,n.Qf)(t.args[2]);if(s!==null&&n.xP.canParse(s)';
 if(source.includes(after))return source;
 if(source.split(before).length!==2)throw Error('Scramjet History patch target changed; runtime sync aborted');
 return source.replace(before,after);
}

// Keep just the CSS url keyword case-insensitive on Safari versions that
// cannot parse scoped regular expression modifiers.
export function patchCssUrlPatterns(source) {
 const before = '(?i:url)';
 const after = '[uU][rR][lL]';
 const originalCount = source.split(before).length - 1;
 const patchedCount = source.split(after).length - 1;
 if (originalCount === 0 && patchedCount === 2) return source;
 if (originalCount !== 2 || patchedCount !== 0) {
  throw Error('Scramjet CSS URL patch targets changed; runtime sync aborted');
 }
 return source.replaceAll(before, after);
}


// Keep web storage inside the outer tab's temporary storage. Block durable
// site APIs on rewritten pages instead of relying on a close event to purge them.
export function patchTemporaryWebsiteStorage(source){
 const steps=[
  ['new Proxy(t.localStorage,r)','new Proxy(t.sessionStorage,r)'],
  ['e.url.host+"@"','e.context.prefix.pathname.split("/").slice(0,4).join("/")+"@"+e.url.origin+"@"'],
  ['t.startsWith(e.url.host)','t.startsWith(e.context.prefix.pathname.split("/").slice(0,4).join("/")+"@"+e.url.origin+"@")'],
  ['r.startsWith(e.url.host)&&t.removeItem(r)','r.startsWith(e.context.prefix.pathname.split("/").slice(0,4).join("/")+"@"+e.url.origin+"@")&&t.removeItem(r)'],
  ['t.substring(e.url.host.length+1)','t.substring((e.context.prefix.pathname.split("/").slice(0,4).join("/")+"@"+e.url.origin+"@").length)'],
  ['return t.getItem(n[r])','return n[r]?.slice((e.context.prefix.pathname.split("/").slice(0,4).join("/")+"@"+e.url.origin+"@").length)??null'],
  ['e.Proxy("IDBFactory.prototype.open",{apply(t){t.args[0]=`${e.url.origin}@${t.args[0]}`}})', 'for(const method of ["open","deleteDatabase","databases"])if(typeof globalThis.IDBFactory?.prototype[method]==="function")e.Proxy("IDBFactory.prototype."+method,{apply(){throw new DOMException("Website database is unavailable in this session","SecurityError")}})'],
  ['e.Proxy("CacheStorage.prototype.open",{apply(t){t.args[0]=`${e.url.origin}@${t.args[0]}`}}),e.Proxy("CacheStorage.prototype.has",{apply(t){t.args[0]=`${e.url.origin}@${t.args[0]}`}}),e.Proxy("CacheStorage.prototype.match",{apply(t){let r=(0,i.Qf)(t.args[0]);t.args[0]=e.rewriteUrl(r)}}),e.Proxy("CacheStorage.prototype.delete",{apply(t){t.args[0]=`${e.url.origin}@${t.args[0]}`}})', 'for(const method of ["open","has","match","delete","keys"])e.Proxy("CacheStorage.prototype."+method,{apply(t){t.return(Promise.reject(new DOMException("Website cache is unavailable in this session","SecurityError")))}})'],
  ['e.Proxy("StorageManager.prototype.getDirectory",{apply(t){', 'e.Proxy("StorageManager.prototype.getDirectory",{apply(t){t.return(Promise.reject(new DOMException("Website files are unavailable in this session","SecurityError")));return;']
 ];
 for(const [before,after] of steps){
  if(!source.includes(before))throw Error('Pinned website storage patch target changed: '+before.slice(0,45));
  source=source.replaceAll(before,after);
 }
 // Do not let localStorage.clear run against ordinary sessionStorage keys.
 return source.replace('for(let r in(0,i.BR)(t))','for(let r of(0,i.BR)(t))');
}
