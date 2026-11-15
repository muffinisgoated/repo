export function resolveAddress(input, engine='duckduckgo') {
  const value=String(input||'').trim();
  if(!value || value.length>4096)throw Error('Enter a website or a shorter search.');
  if(/^(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:[/?#]|$)/i.test(value))throw Error('Local and private-network addresses are not available through the page reader.');
  if(/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:/i.test(value))throw Error('Only public HTTP and HTTPS websites are supported.');
  const url=/^https?:\/\//i.test(value)?new URL(value):/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(value)?new URL('https://'+value):new URL((engine==='bing'?'https://www.bing.com/search?q=':engine==='google'?'https://www.google.com/search?q=':'https://duckduckgo.com/?q=')+encodeURIComponent(value));
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port&&!['80','443'].includes(url.port))throw Error('Use a website without embedded passwords or custom ports.');
  if(url.hostname==='duckduck.go'&&!url.port)url.hostname='duckduckgo.com';
  if(!url.hostname.includes('.')||/^(?:\d+\.){3}\d+$/.test(url.hostname)||url.hostname.includes(':')||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname))throw Error('Local and private-network addresses are not available through the page reader.');
  return url.href;
}
export function readPreferences(storage) {
  try {const d=JSON.parse(storage.getItem('poxey-web-recovery-v1')||'{}');return {wallpaper:Number.isInteger(d.wallpaper)&&d.wallpaper>=-1&&d.wallpaper<47?d.wallpaper:-1,theme:['black','light','dark'].includes(d.theme)?d.theme:'black',rememberTabs:d.rememberTabs===true,tabs:d.rememberTabs===true&&Array.isArray(d.tabs)?d.tabs.filter(t=>t&&typeof t==='object'&&typeof t.input==='string'&&t.input.length<=4096).slice(0,12):[]};}catch{return {wallpaper:-1,theme:'black',rememberTabs:false,tabs:[]};}
}
