import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {cookieScope,patchCookieIsolation} from '../scripts/patch-cookie-isolation.mjs';
import {getPublicSuffix} from 'tldts';

test('cookie domain admission blocks sibling, unrelated, and public suffix writes', () => {
 for(const [host,domain] of [['a.example.com','b.example.com'], ['a.example.com','example.net'],
  ['a.example.co.uk','co.uk'], ['a.github.io','github.io'], ['a.example.com','example.com.']])
  assert.equal(cookieScope(host,domain,getPublicSuffix),false);
 assert.equal(cookieScope('sub.example.com','.EXAMPLE.COM',getPublicSuffix),true);
});

test('pinned runtime denies a foreign cookie that the original jar accepts, and fences bootstrap exports', () => {
 const raw=readFileSync(new URL('../node_modules/@mercuryworkshop/scramjet/dist/scramjet.js',import.meta.url),'utf8');
 const parser=readFileSync(new URL('../node_modules/tldts/dist/index.umd.min.js',import.meta.url),'utf8');
 const dom=new JSDOM('',{runScripts:'outside-only'});
 try {
  const w=dom.window;
  w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Response=Response;w.Headers=Headers;w.Request=Request;w.fetch=fetch;
  w.URL.createObjectURL=URL.createObjectURL;w.URL.revokeObjectURL=URL.revokeObjectURL;
  function jar(source){w.eval(source);return new w.$scramjet.CookieJar();}
  const a=new w.URL('https://a.example.com/'), b=new w.URL('https://b.example.net/');
  const before=jar(raw);
  before.setCookies('foreign=canary; Domain=b.example.net; Path=/',a);
  assert.match(before.getCookies(b,false),/foreign=canary/);
  const after=jar(patchCookieIsolation(raw,parser));
  after.setCookies('foreign=canary; Domain=b.example.net; Path=/',a);
  after.setCookies('own=present; Secure; Path=/',a);
  after.setCookies('js_forbidden=1; HttpOnly; Path=/',a,true);
  assert.equal(after.getCookies(b,false),'');
  assert.equal(after.getCookies(new w.URL('http://a.example.com/'),false),'');
  assert.equal(after.getCookies(a,false),'own=present');
  assert.doesNotMatch(after.dumpForDocument(b),/own|foreign/);
  assert.match(after.dumpForDocument(a),/own/);
  assert.doesNotMatch(after.dumpForDocument(new w.URL('http://a.example.com/')),/own/);
  after.setCookies('session=server-only; HttpOnly; Secure; Path=/',a);
  after.setCookies('session=overwrite; Secure; Path=/',a,true);
  after.setCookies('session=; Secure; Path=/; Max-Age=0',a,true);
  assert.match(after.getCookies(a,false),/session=server-only/);
  assert.doesNotMatch(after.getCookies(a,true),/session|server-only/);
  assert.doesNotMatch(after.dumpForDocument(a),/session|server-only/);
 } finally {dom.window.close();}
});
