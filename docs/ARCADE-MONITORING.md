# Arcade monitoring — Stage 7.2

## Meanings and consent

- **Arcade Clients Online**: distinct temporary Poxey workspace-page IDs with at least one open registered game frame. One workspace is one client, not one person; two outer tabs are two clients. Inner games/connections reuse that workspace ID.
- **Open Game Sessions**: distinct `(workspace, launch-session)` pairs currently reported by connected telemetry sockets. Multiple games do not inflate the overall distinct-client count. Per-game clients can overlap; never sum them to infer overall clients.
- **Total Game Launches**: counted user actions that created a registered game frame, with the separate **Optional Arcade launch totals** choice enabled at launch, outside Private mode. Not successful-gameplay, time-played or completion counts. Frame loading can subsequently fail; the attempted launch remains counted. No launch is recorded if no frame was created. Menu rerenders and the game's Reload button do not create another launch. A new card launch does.
- **Most Popular Game**: highest counted launch total among currently enabled registered games. Ties use name then stable ID. Zero history displays “No launches yet.”

Live operational presence is automatic, including Private mode, and independent of visitor analytics, optional activity reports and Wisp. Historical counting uses a NEW default-off consent key (`arcadeLaunchAnalytics`), so an old activity-analytics opt-in never silently enables a new reporting purpose. Its control is under Advanced privacy. Existing preferences are unchanged. Private mode pauses historical reporting without erasing the saved choice. Revocation is checked against both local state and durable settings before every payload. No retroactive launch is sent when consent is enabled later. Already aggregated counts cannot identify a person and cannot be selectively removed by client.

Older workspace pages loaded before this code have no Arcade telemetry. Reload when convenient; zero means no *instrumented, reporting* open game frames, not proof that nobody is gaming. Secure UUID or WebSocket failure leaves games playable but presence unavailable for that client. No fallback fingerprint or persistent identity is created.

## Wire lifecycle and limits

The existing UI listener accepts `/arcade-presence/<temporary UUID>/` WebSockets with exact UI Host/Origin. It is not a Wisp transport and does not increment Connected Clients or Wisp statistics. One socket normally exists only while a game frame is open. States contain sequence number plus bounded session records: random per-launch UUID, game ID, launch timestamp and history consent boolean. There are no names, IPs, game inputs, search queries, URLs, page text, device IDs or credentials in event records.

The authoritative registry is `public/arcade/catalog.json`, also used by Arcade; it is revalidated when its mtime changes. Stable IDs retain history across renames/retirement/restoration. Disabled and retired games cannot receive new live sessions or launches. Never reuse a retired ID for a different game. Duplicate display names are permitted and sorted by stable ID; duplicate IDs invalidate registry measurements. Existing game files and proxy catalog are unchanged.

State updates every 15 seconds while open; server pings every 15 seconds and expires absent pongs **or absent application state** after 45 seconds (sweep gives at most about 60 seconds). A normal close removes presence immediately. Game switching removes the old session; quitting/remounting Arcade closes its transport. BFCache suspension closes transport; resumption reuses its original launch ID. Reconnect uses bounded exponential delay (1–30 seconds), at most 10 consecutive failed attempts, reset by a successful connection or new launch. An extended outage can therefore require reopening the game. No claim of infinite automatic recovery.

Bounds: 64 telemetry sockets, 120 upgrade attempts/minute, 8 sessions/socket, 8 KiB payload, 120 state events/minute/socket, 1,200 global state events/minute. Strict UUIDv4/game IDs, increasing safe-integer sequence, exact field validation, binary/oversized events rejected. New registry max 500 entries; 160 UTF-8 bytes/name, 80 ASCII characters/ID. Up to 500 historical game IDs are retained; registry growth past that fails closed instead of silently dropping history. These are local guards, not validated public capacity.

## Persistence and failure handling

`arcade-telemetry/.state/arcade.sqlite` is private, excluded from Git/source packages, under a 0700 directory with 0600 files. SQLite WAL + FULL synchronous transactions atomically deduplicate and increment. Aggregates store only game IDs, current names and launch counts; metadata stores schema version and collection-start time. New collection starts at zero, with no historical reconstruction.

Random launch IDs are SHA-256 hashed with the game ID for deduplication; hashes are not linked to workspace IDs. They expire after 24 hours, cleaned on new launches and at most once/minute when metrics are read, and at next startup/snapshot after downtime. Fresh history events must be within ten minutes of launch and no more than five seconds into the server's future; the live connection otherwise still requires valid timestamp shape. Very wrong client clocks can prevent a state being accepted. This is a local beta limitation. Max 20,000 unexpired receipts, fixed database page limit, bound registry prevent unbounded disk growth. A database failure makes history unavailable, without resetting counts or stopping games/live monitoring. Corruption needs owner backup recovery; do not delete/recreate a bad database to obtain passing counters.

The service never trusts client-supplied totals. However same-origin code or a scripted nonbrowser client can fabricate valid launch IDs or lie about consent. Origin validation and bounds reduce basic abuse; they are not proof of human activity, publisher gameplay, unique devices, or fraud-resistant analytics. This local service has no public exposure or cross-machine authenticated client enrollment.

## Admin and expansion

The existing owner-authenticated Unix service returns `arcade` inside its existing aggregate metrics. There is no public Arcade-statistics endpoint. Native Admin adds Arcade to its existing six sections, reusing five-second polling/coalescing, visibility and stale-data behavior. Search, five sort orders, retired/disabled rows, unavailable and empty states use the registry-driven records. All other Admin controls, identity, Keychain access and authorization remain unchanged.

10/30/50/100-game fixtures run only in disposable directories. Production remains ten games. Swift projection checks do not substitute for native table acceptance. Multi-server deployment would require shared transactional aggregates/deduplication plus a coordinated ephemeral presence store and cross-node rate bounds; do not sum server distinct-client totals or copy this local DB to concurrent nodes.
