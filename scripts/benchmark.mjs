import http from 'node:http';
import fs from 'node:fs/promises';
const base='http://127.0.0.1:8800';
function get(file,gzip){return new Promise((resolve,reject)=>{const start=performance.now();http.get(base+file,{headers:{'Accept-Encoding':gzip?'gzip':'identity','Cache-Control':'no-cache'}},res=>{let bytes=0;res.on('data',chunk=>bytes+=chunk.length);res.on('end',()=>resolve({file,status:res.statusCode,bytes,ms:performance.now()-start,encoding:res.headers['content-encoding']||'identity'}));}).on('error',reject);});}
const baseline=[],recovered=[];
for(let i=0;i<5;i++){baseline.push(await get('/baseline.html',true));recovered.push(await get('/',true));}
const assets=['/','/styles.css','/atelier.css','/arcade.css','/onboarding-shell.css','/web-edition.css','/recovery.css','/runtime-config.js','/web-edition.js','/navigation.mjs','/assets/logo-icon.png','/onboarding/wallpapers/lunar-earthrise.jpg'];
const payload=await Promise.all(assets.map(file=>get(file,true)));
const rawBefore=await get('/baseline.html',false),rawAfter=await get('/',false);
const result={scope:'Loopback HTTP payload benchmark; not a physical mobile startup benchmark',runs:5,rawHtmlBefore:rawBefore.bytes,rawHtmlAfter:rawAfter.bytes,htmlReductionPercent:(1-rawAfter.bytes/rawBefore.bytes)*100,baselineGzip:baseline,recoveredGzip:recovered,recoveredInitialGraph:payload,recoveredInitialWireBytes:payload.reduce((n,item)=>n+item.bytes,0)};
await fs.writeFile(new URL('../reports/payload-benchmark.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify({rawHtmlBefore:result.rawHtmlBefore,rawHtmlAfter:result.rawHtmlAfter,htmlReductionPercent:result.htmlReductionPercent,recoveredInitialWireBytes:result.recoveredInitialWireBytes},null,2));
