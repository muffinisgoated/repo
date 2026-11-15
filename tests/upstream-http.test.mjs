import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import test from 'node:test';
import {createOriginRegistry} from '../isolation/origin-registry.mjs';
import {createUpstreamHTTP, redirectTarget} from '../isolation/upstream-http.mjs';

function fixture() {
 const registry = createOriginRegistry({contentBase:'content.example.net'});
 const a = registry.allocate('workspace-a','https://first.example.com');
 const b = registry.allocate('workspace-a','https://second.example.com');
 const other = registry.allocate('workspace-b',a.upstream);
 const calls = [];
 let outboundHeaders = {};
 const broker = createUpstreamHTTP({registry,resolve:async()=> '93.184.215.14',
  dial(secure,options,onResponse) {
   calls.push({secure, options});
   const outbound = new EventEmitter();
   outbound.end = ()=>{
    const response = Readable.from(['fixture']);
    response.statusCode = outboundHeaders.location ? 302 : 200;
    response.headers = outboundHeaders;
    response.rawHeaders = Object.entries(outboundHeaders).flatMap(([name,values])=>
     [].concat(values).flatMap(value=>[name,value]));
    onResponse(response);
   };
   return outbound;
  }});
 function request(route, options={}) {
  return broker.request({workspace:route.workspace,routeID:route.id,url:route.upstream,
   cookieContext:'same-site',...options});
 }
 return {registry,a,b,other,calls,request,respond(headers){outboundHeaders=headers;}};
}

test('origin-owned broker uses pinned address, verified TLS SNI, and its own Host and credentials',async()=>{
 const {a,b,other,calls,respond,request}=fixture();
 respond({'set-cookie':['own=synthetic; HttpOnly; Secure; SameSite=Strict',
  'lax=synthetic; HttpOnly; Secure; SameSite=Lax',
  'foreign=synthetic; HttpOnly; Secure; Domain=second.example.com',
  'badnone=synthetic; SameSite=None'], 'authentication-info':'synthetic'});
 const result=await request(a,{headers:[['Host','unrelated.example.com'],['Authorization','Bearer synthetic'],
  ['Cookie','forged=synthetic'],['Proxy-Authorization','synthetic']]});
 assert.deepEqual(result.headers,[]);
 assert.equal(calls[0].options.hostname,'93.184.215.14');
 assert.equal(calls[0].options.servername,'first.example.com');
 assert.equal(calls[0].options.rejectUnauthorized,true);
 assert.deepEqual(calls[0].options.headers,{host:'first.example.com','accept-encoding':'identity','user-agent':'PoxeyX1/1.0 (local interactive web browser)'});

 respond({});
 await request(a);
 assert.match(calls.at(-1).options.headers.cookie,/own=synthetic/);
 assert.doesNotMatch(calls.at(-1).options.headers.cookie,/foreign|badnone|forged/);
 await request(a,{cookieContext:'cross-site-navigation'});
 assert.equal(calls.at(-1).options.headers.cookie,'lax=synthetic');
 for(const [route,options] of [[a,{cookieContext:'omit'}],[b,{}],[other,{}]]) {
  await request(route,options);
  assert.equal(calls.at(-1).options.headers.cookie,undefined);
 }
});

test('wrong workspace, wrong destination, private IP, altered port, and expired routes never dial',async()=>{
 const {a,b,registry,calls,request}=fixture();
 for(const options of [{workspace:'workspace-b'},{url:b.upstream},{url:a.upstream+':444'},
  {url:'https://127.0.0.1'},{url:'https://operator:token@first.example.com'},
  {cookieContext:'cross-site-navigation',method:'POST',body:Buffer.from('payload')}]) {
  await assert.rejects(request(a,options));
 }
 const privateAnswer=createUpstreamHTTP({registry,resolve:async()=> '127.0.0.1',dial(){assert.fail('private dial');}});
 await assert.rejects(privateAnswer.request({workspace:a.workspace,routeID:a.id,url:a.upstream}));
 const revokedDuringDNS=createUpstreamHTTP({registry,resolve:async()=>{
  registry.revokeWorkspace(a.workspace);return '93.184.215.14';
 },dial(){assert.fail('revoked dial');}});
 await assert.rejects(revokedDuringDNS.request({workspace:a.workspace,routeID:a.id,url:a.upstream}));
 await assert.rejects(request(a));
 assert.equal(calls.length,0);
});

test('redirect method rules and private destinations are checked before a fresh route can be selected',async()=>{
 const {a,b,calls,respond,request}=fixture();
 for(const status of [301,302,303,307,308]) {
  assert.equal(redirectTarget(status,b.upstream,a.upstream,'POST').method,status<307?'GET':'POST');
  assert.equal(redirectTarget(status,'/local',a.upstream,'HEAD').url,a.upstream+'/local');
  assert.equal(redirectTarget(status,'/local',a.upstream,'HEAD').method,'HEAD');
  assert.throws(()=>redirectTarget(status,'//127.0.0.1/secret',a.upstream,'GET'));
  assert.throws(()=>redirectTarget(status,'https://a:b@second.example.com',a.upstream,'GET'));
 }
 respond({location:b.upstream});
 const response=await request(a,{method:'POST',body:Buffer.from('synthetic')});
 assert.equal(response.redirect.origin,b.upstream);
 assert.equal(response.redirect.method,'GET');
 assert.equal(calls.length,1);
});
