import {randomUUID} from 'node:crypto';
import {validHostname} from '../security.mjs';

export function upstreamOrigin(value) {
 const url=new URL(value);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||
    !validHostname(url.hostname)||url.port)throw Error('Upstream destination denied');
 return url.origin;
}

export function createOriginRegistry({contentBase,localPort,originForId,now=Date.now, lifetimeMs=30*60_000, maximum=256, perWorkspace=32}={}) {
 const records=new Map(),hosts=new Map(),workspaces=new Map();
 function remove(route){
  records.delete(route.id);hosts.delete(route.authority);
  const workspace=workspaces.get(route.workspace);
  workspace.delete(route.upstream);
  if(!workspace.size)workspaces.delete(route.workspace);
 }
 function active(route){
  if(!route)return null;
  if(route.expires<=now()){remove(route);return null;}
  return route;
 }
 function allocate(workspace,value,{fixtureOrigin}={}){
  if(typeof workspace!=='string'||!workspace||workspace.length>128)throw Error('Invalid workspace');
  const upstream=upstreamOrigin(value);
  const existing=active(workspaces.get(workspace)?.get(upstream));
  if(existing)return existing;
  for(const route of records.values())active(route);
  const sites=workspaces.get(workspace)||new Map();
  if(records.size>=maximum||sites.size>=perWorkspace)throw Error('Origin allocation limit reached');
  const id=randomUUID();
  const localAuthority = localPort && `r-${id}.test:${localPort}`;
  const url=new URL(fixtureOrigin||originForId?.(id)||`https://${localAuthority||id+'.'+contentBase}`);
  if(fixtureOrigin){
   if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Fixture origin must be loopback');
  }else if(localPort) {
   if(url.host!==localAuthority || !Number.isInteger(localPort) || localPort<1024 || localPort>65535) {
    throw Error('Invalid local content authority');
   }
  }else if(originForId){
   if(url.protocol!=='https:')throw Error('Invalid configured content origin');
  }else if(!contentBase||!validHostname(url.hostname)||url.protocol!=='https:'||
     url.hostname!==id+'.'+contentBase)throw Error('Invalid content namespace');
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||hosts.has(url.host))throw Error('Origin already assigned or invalid');
  const route=Object.freeze({id,workspace,upstream,origin:url.origin,authority:url.host,expires:now()+lifetimeMs});
  records.set(id,route);hosts.set(route.authority,route);sites.set(upstream,route);workspaces.set(workspace,sites);
  return route;
 }
 function authorize(workspace,id){const route=active(records.get(id));return route?.workspace===workspace?route:null;}
 function resolveHost(authority){return active(hosts.get(authority));}
 function revokeWorkspace(workspace){for(const route of workspaces.get(workspace)?.values()||[])remove(route);}
 return {allocate,authorize,resolveHost,revokeWorkspace};
}
