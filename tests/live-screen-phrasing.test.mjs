import test from 'node:test';
import assert from 'node:assert/strict';
import {pageIntent} from '../public/features/page-context.mjs';
import {uiFixture} from './screen-reading-harness.mjs';
import {JSDOM} from 'jsdom';
import {extractPage} from '../proxy-public/page-evidence.mjs';

test('live webpage-on-screen phrasing reads current evidence and obeys consent', async()=>{
 const question='What does the webpage on my screen say, and what is it used for?';
 const f=uiFixture({html:'<main><p>Documentation examples for readers.</p></main>'});
 try {
  await f.ai.open(); await f.send(question);
  assert.equal(f.calls.length,1);
  assert.match(f.calls[0].pageContext.text,/Documentation examples/);
  f.settings.pageAI=false;
  await f.send(question);
  assert.equal(f.calls.length,1);
  assert.match(f.shell.window.document.body.textContent,/Page sharing is turned off/);
 } finally {f.close();}
});

test('screen-location paraphrases route locally without general screen-topic sharing',()=>{
 for(const noun of ['webpage','web page','website','article','document'])
  assert.equal(pageIntent(`Explain the ${noun} on my screen.`),true,noun);
 for(const question of ['Explain webpage rendering on a screen.','How do I display a website on multiple screens?','Write an article about screen readers.'])
  assert.equal(pageIntent(question),false,question);
});

test('explicit heading requests retain all section items despite stronger unrelated keyword matches',()=>{
 const dom=new JSDOM('<main><h2>Beginner</h2><ul><li>Beginner’s Guide</li><li>Python FAQs</li></ul><h2>Python 3.x Resources</h2><p>Resources listed here, resources and topic.</p><h2>Other</h2><p>Webpage screen topic resources resources.</p></main>');
 try {
  const result=extractPage(dom.window.document,{url:'https://www.python.org/doc/',question:'What does the webpage on my screen say? Name its topic and two resources listed under Beginner.'});
  assert.match(result.text,/Beginner’s Guide/);
  assert.match(result.text,/Python FAQs/);
  assert.doesNotMatch(result.text,/Python 3.x Resources|Webpage screen topic/);
 } finally {dom.window.close();}
});
