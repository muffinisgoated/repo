import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLink} from '../proxy-public/link-navigation.mjs';
const current='https://duckduckgo.com/?q=JavaScript+MDN',proxy='http://localhost:8801';
test('original search-result URLs are not decoded twice',()=>{
 assert.equal(resolveLink('https://developer.mozilla.org/en-US/docs/Web/JavaScript',current,proxy,()=>{throw Error('Must not decode original href');}),'https://developer.mozilla.org/en-US/docs/Web/JavaScript');
});
test('rewritten links decode once and relative links retain their real origin',()=>{
 assert.equal(resolveLink('/help','https://www.iana.org/',proxy,()=>{}),'https://www.iana.org/help');
 assert.equal(resolveLink(proxy+'/~/sj/x',current,proxy,()=> 'https://www.iana.org/help/example-domains'),'https://www.iana.org/help/example-domains');
});
test('invalid, executable, credential-bearing and fragment-only links are not intercepted',()=>{
 for(const raw of [null,'','javascript:alert(1)','data:text/html,test','https://user:pass@example.com','#section'])assert.equal(resolveLink(raw,current,proxy,()=>{}),null);
});
