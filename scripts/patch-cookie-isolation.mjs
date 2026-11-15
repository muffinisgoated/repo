// Keep the PSL parser inside the generated script's closure. The installed
// package's bundled UMD build covers private suffixes such as github.io.
export function cookieScope(host, value, publicSuffix) {
 const domain = value.toLowerCase().replace(/^\./,'');
 return Boolean(domain && !domain.endsWith('.') &&
  (domain===host || host.endsWith('.'+domain)) &&
  domain!==publicSuffix(domain,{allowPrivateDomains:true}));
}

export function isHttpOnly(value) {
 return value.split(';').slice(1).some(attribute=>attribute.split('=')[0].trim().toLowerCase()==='httponly');
}

export function patchCookieIsolation(source, suffixParser) {
 const steps = [
  ['setCookies(e,t){for(let r of(0,n.Ay)(e)){let e=r.name.toLowerCase();',
   'setCookies(e,t,fromScript=false){for(let r of(0,n.Ay)(e)){if(r.domain&&!poxeyCookieScope(t.hostname,r.domain,poxeySuffix.getPublicSuffix)||r.secure&&t.protocol!=="https:"||fromScript&&r.httpOnly)continue;if(r.domain)r.domain=r.domain.toLowerCase();let e=r.name.toLowerCase();'],
  ['s=e.hostname,o=e.pathname,a=[],A=s;', 's=e.hostname,o=e.pathname,a=[],A=s;const secure=e.protocol==="https:";'],
  ['i.hostOnly&&A!==s||i.httpOnly&&t','i.hostOnly&&A!==s||i.secure&&!secure||i.httpOnly&&t'],
  ['if("number"==typeof a.maxAge)', 'if(fromScript&&this.cookies[A]?.httpOnly)continue;if("number"==typeof a.maxAge)'],
  ['n.push({url:r.url,cookie:s})', '!poxeyIsHttpOnly(s)&&n.push({url:r.url,cookie:s})'],
  ['dump(){return(0,i.Xj)(this.cookies)}',
   'dump(){return(0,i.Xj)(this.cookies)}dumpForDocument(url){const host=url.hostname;return (0,i.Xj)(Object.fromEntries(Object.entries(this.cookies).filter(([,c])=>!c.httpOnly&&(!c.secure||url.protocol==="https:")&&(c.hostOnly?c.domain==="."+host:poxeyCookieScope(host,c.domain,poxeySuffix.getPublicSuffix)))))}'],
  ['e.context.cookieJar.setCookies(r,e.url),e.init.sendSetCookie([{url:e.url,cookie:r}])',
   'e.context.cookieJar.setCookies(r,e.url,true),!poxeyIsHttpOnly(r)&&e.init.sendSetCookie([{url:e.url,cookie:r}])']
 ];
 // No blind replacements in the pinned third-party runtime.
 for(const [before, after] of steps) {
  if(source.split(before).length!==2)throw Error('Pinned cookie isolation patch target changed: '+before.slice(0,85));
  source=source.replace(before,()=>after);
 }
 const entry='(()=>{';
 if(!source.startsWith(entry))throw Error('Pinned Scramjet entry changed');
 const parser=suffixParser.replace(/^#![^\n]*\n/,'').replace(/\n\/\/# sourceMappingURL=.*$/m,'');
 return entry+'const poxeySuffix=(()=>{const exports={},module={exports};'+parser+'\nreturn module.exports;})();const poxeyCookieScope='+cookieScope.toString()+';const poxeyIsHttpOnly='+isHttpOnly.toString()+';'+source.slice(entry.length);
}
