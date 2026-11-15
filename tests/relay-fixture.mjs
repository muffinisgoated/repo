import assert from 'node:assert/strict';

export function fixtureRelayKey(app) {
 const pending = app.relay.authorize(null);
 assert.ok(app.relay.approve(pending.code));
 return pending.key;
}

export function ticketedWisp(app, key, url, client=null) {
 const ticket = app.relay.issue(key,client);
 assert.ok(ticket);
 return url+'?ticket='+ticket;
}
