import {patchWispTransport} from './patch-wisp-transport.mjs';
import {patchCssUrlPatterns,patchHistory,patchTemporaryWebsiteStorage} from './patch-scramjet.mjs';
import {patchCookieIsolation} from './patch-cookie-isolation.mjs';
import {patchController} from './patch-controller.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
for(const [name,directory] of [['scramjet','scramjet'],['scramjet-controller','controller'],['libcurl-transport','transport']]){
 const src=path.join(root,'node_modules/@mercuryworkshop',name,'dist'),dest=path.join(root,'proxy-public',directory);
 await fs.cp(src,dest,{recursive:true});
}

const runtime=path.join(root,"proxy-public/scramjet/scramjet.js");
const suffixParser=await fs.readFile(path.join(root,"node_modules/tldts/dist/index.umd.min.js"),"utf8");
await fs.writeFile(runtime,patchCookieIsolation(patchTemporaryWebsiteStorage(patchCssUrlPatterns(patchHistory(await fs.readFile(runtime,"utf8")))),suffixParser));

for (const bundle of ['api', 'sw', 'inject']) {
 const controller = path.join(root, 'proxy-public/controller', 'controller.' + bundle + '.js');
 await fs.writeFile(controller, patchController(await fs.readFile(controller, 'utf8'), bundle));
}

const transport=path.join(root,'proxy-public/transport/index.mjs');
await fs.writeFile(transport,patchWispTransport(await fs.readFile(transport,'utf8')));
