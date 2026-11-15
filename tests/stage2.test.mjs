import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {isLibraryEntry,filterGames,readState,KEY} from '../public/arcade/state.mjs';
import {RETIRED_GAME_IDS} from '../public/arcade/retired.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url));
const games=JSON.parse(read('public/arcade/catalog.json'));
test('retired entries cannot return even with accidental verification flags',()=>{
 for(const id of RETIRED_GAME_IDS){assert.equal(isLibraryEntry({id,verified:true}),false);assert.equal(isLibraryEntry({id,releaseStatus:'awaiting-user-gameplay',verification:{launch:'verified-stage2'}}),false);}
 const saved={favorites:[...RETIRED_GAME_IDS,'dino'],recent:[...RETIRED_GAME_IDS,'dino']};const storage={getItem:k=>k===KEY?JSON.stringify(saved):null};assert.deepEqual(readState(storage,[...RETIRED_GAME_IDS,'dino']),{favorites:['dino'],recent:['dino']});
});
test('only explicit launch checked candidates may enter the library without gameplay verification',()=>{
 assert.equal(isLibraryEntry({id:'new',verified:false}),false);
 assert.equal(isLibraryEntry({id:'new',releaseStatus:'awaiting-user-gameplay',verification:{launch:'pending'}}),false);
 assert.equal(isLibraryEntry({id:'new',releaseStatus:'awaiting-user-gameplay',verification:{launch:'verified-stage2'}}),true);
});
test('retained covers preserve Stage 1 baseline; Sprint replacement is independently bound to its original icon',()=>{
 const hashes=JSON.parse(read('tests/fixtures/stage1-retained-artwork-sha256.json'));
 for(const [id,hash]of Object.entries(hashes)){const g=games.find(g=>g.id===id);assert.equal(crypto.createHash('sha256').update(id==='sprint'?read('tests/fixtures/stage83-sprint-cover.svg'):read('public'+g.cover)).digest('hex'),hash);}
});
test('new publisher players retain honest status and advertising configuration',()=>{
 for(const g of games.filter(g=>!g.verified)){assert.equal(g.releaseStatus,'awaiting-user-gameplay');assert.equal(g.verification.gameplay,'unverified');assert.equal(g.verification.currentUserTesting,'pending');assert.equal(g.verification.launch,'verified-stage2');}
 for(const id of ['duck-life','duck-life-2']){const g=games.find(g=>g.id===id);assert.equal(new URL(g.url).hostname,'www.wix.games');assert.equal(new URL(g.url).searchParams.get('wg_ads_enabled'),'1');assert.deepEqual(g.viewport,{width:800,height:600});}
 assert.equal(filterGames(games).length,games.length);
 assert.match(read('public/arcade/ui.mjs').toString(),/Awaiting User Gameplay Test/);
});
