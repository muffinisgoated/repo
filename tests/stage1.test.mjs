import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const games=JSON.parse(read('public/arcade/catalog.json'));
const stage1=JSON.parse(read('tests/fixtures/stage1-catalog.json'));
const retained=['geometry-dash','night-crossing','sprint','dino','hexgl','moto-x3m'];
test('Stage 2 preserves the six requested Stage 1 game configurations exactly',()=>{
 assert.equal(stage1.length,10);
 for(const id of retained)assert.deepEqual(games.find(g=>g.id===id),stage1.find(g=>g.id===id));
 assert.deepEqual(games,JSON.parse(read('proxy-public/arcade/catalog.json')));
});
test('all game covers exist, use consistent dimensions and cannot fetch unrelated remote resources',()=>{
 for(const g of games){assert.match(g.cover,/^\/arcade\/art\/[a-z0-9-]+\.svg$/);const svg=read('public'+g.cover);assert.match(svg,/<svg[^>]+width="400"[^>]+height="400"/);assert.match(svg,/viewBox="0 0 400 400"/);assert.doesNotMatch(svg,/<script|<foreignObject|\bonload=|\bonerror=/i);for(const m of svg.matchAll(/(?:href|xlink:href)="([^"]+)"/g))assert.match(m[1],/^(?:data:image\/(?:png|webp|jpeg);base64,|#)/);}
 assert.equal(JSON.parse(read('public/arcade/art/SOURCES.json')).length,games.length);
});
test('blocked candidates are archived rather than published as playable entries',()=>{
 const blocked=JSON.parse(read('reports/stage1/blocked-candidates.json'));
 assert.ok(blocked.length>0);for(const g of blocked){assert.equal(g.verified,false);const replacement=games.find(x=>x.id===g.id);if(replacement){assert.notEqual(replacement.url,g.url);assert.equal(replacement.verification.replacesBlockedSource,g.url);}}
});
