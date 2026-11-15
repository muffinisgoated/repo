import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readState,KEY} from '../public/arcade/state.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const catalog=JSON.parse(read('public/arcade/catalog.json'));
test('removed games and stale preferences migrate without losing retained favorites',()=>{
 for(const id of ['2048','sandspiel','snake','hextris','paperclips','dark-room'])assert.ok(!catalog.some(g=>g.id===id));
 const state=readState({getItem:key=>{assert.equal(key,KEY);return JSON.stringify({favorites:['2048','snake','night-crossing','hextris','sandspiel'],recent:['sandspiel','paperclips','dark-room','dino','2048']});}},catalog.map(g=>g.id));
 assert.deepEqual(state,{favorites:['night-crossing'],recent:['dino']});
 assert.doesNotMatch(read('public/web-edition.js'),/reset2048|draw2048|tiles-2048/);
});
test('game documents retain opaque isolation and fixed viewport observers are cleaned up',()=>{
 const host=read('proxy-public/arcade/host.mjs');
 assert.match(host,/\(game.type==='local'\|\|game.type==='unity-local'\|\|beta\)\?'allow-scripts allow-pointer-lock'/);
 assert.match(host,/frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'/);
 assert.match(host,/e.origin!=='null'/);assert.match(host,/viewportObserver\?\.disconnect/);
});
test('Downloads management is absent while bookmark export and Games access remain',()=>{
 for(const file of ['public/index.html','public/features/library.mjs','public/web-edition.js'])assert.doesNotMatch(read(file),/btn-downloads|settings-downloads|store\.downloads|browserStore\.downloads/);
 assert.doesNotMatch(read('public/features/library.mjs'),/Downloads/);
 assert.match(read('public/features/library.mjs'),/Export bookmarks/);
 assert.match(read('public/index.html'),/id="btn-arcade"/);
});

test('retired Hextris runtime and removed-game artwork are absent',()=>{
 assert.ok(!fs.existsSync(new URL('../proxy-public/arcade/games/hextris',import.meta.url)));
 for(const name of ['snake.svg','hextris-cover.svg','paperclips-cover.svg','dark-room-cover.svg'])assert.ok(!fs.existsSync(new URL('../public/arcade/art/'+name,import.meta.url)));
 assert.doesNotMatch(read('public/web-edition.js'),/resetSnake|snakeTimer|drawSnake|playGame/);
});
