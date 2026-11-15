import test from 'node:test';
import assert from 'node:assert/strict';
import {createOriginRegistry,upstreamOrigin} from '../isolation/origin-registry.mjs';

test('canonical upstream keys remain separate across workspaces and schemes',()=>{
 const registry=createOriginRegistry({contentBase:'content.example'});
 const a=registry.allocate('one','https://EXAMPLE.com:443/path');
 assert.equal(registry.allocate('one','https://example.com/other'),a);
 const b=registry.allocate('two','https://example.com/');
 assert.notEqual(a.origin,b.origin);
 assert.notEqual(a.origin,registry.allocate('one','http://example.com/').origin);
 assert.equal(registry.resolveHost(a.authority),a);
 assert.equal(registry.resolveHost(a.authority+':8443'),null);
 assert.equal(registry.authorize('two',a.id),null);
 for(const value of ['http://localhost','http://127.0.0.1','https://user@example.com/','https://example.com:81','file:///etc/hosts'])
  assert.throws(()=>upstreamOrigin(value));
});

test('expiry, quotas and revocation retire bindings without reusing generated origins',()=>{
 let at=0;
 const registry=createOriginRegistry({contentBase:'content.example',now:()=>at,lifetimeMs:10,maximum:2,perWorkspace:1});
 const a=registry.allocate('one','https://example.com');
 assert.throws(()=>registry.allocate('one','https://example.org'));
 assert.throws(()=>registry.allocate('two','https://example.com',{fixtureOrigin:a.origin}));
 registry.allocate('two','https://example.com');
 assert.throws(()=>registry.allocate('three','https://example.com'));
 registry.revokeWorkspace('two');
 at=10;
 assert.equal(registry.authorize('one',a.id),null);
 assert.equal(registry.resolveHost(a.authority),null);
 assert.notEqual(registry.allocate('one','https://example.com').origin,a.origin);
});

test('explicit proof host cannot serve two active bindings',()=>{
 const registry=createOriginRegistry();
 const options={fixtureOrigin:'http://localhost:8801'};
 const first=registry.allocate('one','http://site-a.example',options);
 assert.equal(registry.resolveHost('localhost:8801'),first);
 assert.throws(()=>registry.allocate('two','http://site-a.example',options));
 assert.equal(registry.resolveHost('127.0.0.1:8801'),null);
});
