import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createBetaArcade} from '../beta-arcade/routes.mjs';
import {isLibraryEntry} from '../public/arcade/state.mjs';
const json=p=>JSON.parse(fs.readFileSync(p));
const catalog=json('public/arcade/beta-catalog.json');
const additions=catalog.filter(g=>g.beta?.ownerTesting);
test('35 visible entries retain the complete 25-game baseline and add ten explicitly unverified owner candidates',()=>{
 const original=JSON.parse(execFileSync('git',['show','333e028:public/arcade/beta-catalog.json']));
 assert.deepEqual(catalog.filter(g=>!g.beta?.ownerTesting),original);
 assert.deepEqual(fs.readFileSync('public/arcade/catalog.json'),execFileSync('git',['show','333e028:public/arcade/catalog.json']));
 assert.equal(additions.length,10);assert.equal(catalog.filter(isLibraryEntry).length+json('public/arcade/catalog.json').filter(isLibraryEntry).length,35);
 for(const game of additions){assert.equal(game.verified,false);assert.equal(game.verification.launch,'ready-for-owner-testing');assert.equal(game.verification.gameplay,'unverified');assert.equal(game.disabled,false);}
});
test('every new runtime file and authentic cover matches the installed manifest and registers on its own origin',()=>{
 const beta=createBetaArcade({root:process.cwd(),uiOrigin:'http://127.0.0.1:8800',proxyOrigin:'http://localhost:8801'});
 const packages=json('local-games/gn-stage86/installed.json').games;
 for(const game of additions){
  assert.ok(beta.games.some(g=>g.id===game.id),game.id+' runtime rejected');assert.ok(beta.origins.some(o=>o.game.id===game.id));
  const pack=packages.find(g=>g.id===game.id);assert.ok(pack.launchable);assert.equal(pack.packageHash,game.packageHash);
  for(const f of pack.files){const file='local-games/gn-stage86/packages/'+game.id+'/'+f.path;const data=fs.readFileSync(file);assert.equal(data.length,f.bytes,file);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),f.sha256,file);assert.ok(Math.abs(fs.statSync(file).mtimeMs-f.mtimeMs)<=1,file);}
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync('public'+game.cover)).digest('hex'),game.beta.artworkSHA256);
 }
});
test('Flash candidates contain complete original SWFs and the real GN-bundled Ruffle wasm runtime',()=>{
 const packages=json('local-games/gn-stage86/installed.json').games;
 for(const id of ['gn-175','gn-176','gn-178']){const pack=packages.find(g=>g.id===id);assert.ok(pack.files.some(f=>f.path.endsWith('.swf')&&f.bytes>800000));assert.ok(pack.files.some(f=>f.path.endsWith('.wasm')&&f.bytes>12000000));const entry=fs.readFileSync('local-games/gn-stage86/packages/'+id+'/index.beta.html','utf8');assert.doesNotMatch(entry,/<object|<embed|https:\/\/cdn/);assert.match(entry,/allowScriptAccess:false/);}
});
