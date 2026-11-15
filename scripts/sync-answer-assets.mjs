// Self-hosted, pinned rendering libraries. No CDN, external fonts or remote telemetry.
import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url),dest=new URL('public/vendor/answers/',root);
await fs.mkdir(dest,{recursive:true});
for(const [from,to]of [['markdown-it/dist/browser/markdown-it.esm.min.mjs','markdown-it.mjs'],['markdown-it/LICENSE','MARKDOWN-IT-LICENSE.txt'],['katex/dist/katex.mjs','katex.mjs'],['katex/dist/katex.min.css','katex.min.css'],['katex/LICENSE','KATEX-LICENSE.txt']])await fs.copyFile(new URL('node_modules/'+from,root),new URL(to,dest));
await fs.cp(new URL('node_modules/katex/dist/fonts/',root),new URL('fonts/',dest),{recursive:true});
