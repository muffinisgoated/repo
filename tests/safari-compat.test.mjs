import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {createBodyTransfer} from '../scripts/body-transfer.mjs';
import {patchCssUrlPatterns} from '../scripts/patch-scramjet.mjs';

test('Scramjet CSS URL patterns preserve matches and captures without scoped modifiers', () => {
 const original = fs.readFileSync(new URL('../node_modules/@mercuryworkshop/scramjet/dist/scramjet.js', import.meta.url), 'utf8');
 const patched = patchCssUrlPatterns(original);
 const patterns = source => [...source.matchAll(/\.replace\((\/(?:[^/\\]|\\.)+\/[a-z]+),/g)]
  .map(match => match[1]).filter(pattern => pattern.includes('(?i:url)') || pattern.includes('[uU][rR][lL]'));
 const before = patterns(original);
 const after = patterns(patched);
 assert.equal(before.length, 2);
 assert.equal(after.length, 2);
 const css = '@import UrL("theme.css"); @IMPORT URL("unchanged.css"); a {background: uRl(img.png)} b {background: URL(\'more.png\')}';
 for (let i = 0; i < before.length; i++) {
  const matches = pattern => [...css.matchAll(vm.runInNewContext(pattern))].map(match => [...match]);
  assert.deepEqual(matches(after[i]), matches(before[i]));
 }
 assert.equal(patchCssUrlPatterns(patched), patched);
});

test('worker body fallback sends chunks on demand through a transferred port and propagates cancellation', async () => {
 let probe = true;
 function ChannelWithoutStreamTransfer() {
  if (!probe) return new MessageChannel();
  probe = false;
  return {port1: {postMessage() { throw new DOMException('Unsupported', 'DataCloneError'); }, close() {}}, port2: {close() {}}};
 }
 const relay = vm.runInNewContext('(' + createBodyTransfer.toString() + ')()', {
  MessageChannel: ChannelWithoutStreamTransfer, MessagePort, ReadableStream, ArrayBuffer
 });
 let pulls = 0;
 let notifyCancel;
 const canceled = new Promise(resolve => { notifyCancel = resolve; });
 const stream = new ReadableStream({
  pull(controller) { controller.enqueue(Uint8Array.of(++pulls)); },
  cancel() { notifyCancel(); }
 }, {highWaterMark: 0});
 const encoded = relay.encode(stream);
 const received = structuredClone(encoded.body, {transfer: [...encoded.transfer]});
 const reader = relay.decode(received).getReader();
 assert.equal(pulls, 0);
 assert.deepEqual(await reader.read(), {done: false, value: Uint8Array.of(1)});
 assert.deepEqual(await reader.read(), {done: false, value: Uint8Array.of(2)});
 assert.ok(pulls >= 2 && pulls <= 4, `bounded read-ahead: ${pulls}`);
 await reader.cancel();
 await canceled;
});
