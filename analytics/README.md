# First-party visitor analytics

All-Time Visitors and Last30Days are **estimated opt-in browsers**, not verified people, accounts or page requests. Collection starts when the enabled store is created; no historical traffic is inferred. ActiveSessions remains a separate, short-lived metric with its existing consent control.

## Identity and retention

Visitor counting is off by default and paused in PrivateSession. Same-origin WebLocks serialize enrollment across documents. The browser saves a random128-bit client nonce *before* its first request, then a server-signed receipt. Lost responses/reloads reuse the nonce; later visits reuse the receipt. Only fixed JSON fields(client,receipt,consent) go to the first-party endpoint with `credentials:omit`and`referrerPolicy:no-referrer`. No browsing cookies, URLs, searches, content, IP fingerprints, names, hardware IDs or provider credentials are supplied to analytics.

The private SQLite store keeps HMAC-hashed nonces and last-seen timestamps for30days. Expired rows are pruned; a valid returning signed receipt reinstates a row without increasing the all-time aggregate. The lifetime aggregate, original collection date and signing secret persist indefinitely. Server records do not retain raw browser nonces/receipts. Local browser receipts persist until site storage is cleared; turning consent off stops future reporting but does not erase previously consented aggregate history. Clearing site data, changing profiles/devices, losing a receipt after its server row expires, or automated clients can cause overcounting: these are estimates, not abuse-proof people measurement. No cross-site fingerprinting or third-party analytics.

Last30Days means a rolling30×24hours since the last observed report, not a calendar-month reset. Long-lived visible pages report at most every15minutes per document; initial/reload enrollments within5seconds are suppressed across tabs. The server deduplicates all reports. Opt-out/private/hidden/closed documents stop reporting. Public aggregate GET requests never enroll or increment visitors.

## Persistence and limits

Requires a Node runtime with built-in `node:sqlite`; verified on this Mac's installed runtime. Other runtimes/storage errors display Unavailable rather than resetting counts. Files live under Git-ignored `analytics/.state`, directory0700, database/WAL/SHM0600. SQL transactions atomically couple first enrollment and lifetime increments; WAL and FULL synchronization protect committed counts across restarts. Never delete/recreate the database to handle an error. Missing/corrupt existing metadata fails closed.

Maximum100000recent rows, SQLite max8192pages,1000new-browser enrollments perUTCday,1new enrollment/second with10burst,5analytics requests/second with20burst, plus existing HTTP admission guards. Inputs have exact allowlisted fields,512-byte body ceiling,2-second body timeout, exact Origin and no cross-site browser requests. Malformed signatures/foreign receipts are rejected. These are basic counter-manipulation/resource guards; anonymous clients cannot be proven to be people. Do not advertise these storage limits as tested production capacity.

`GET /api/analytics/summary`returns only status,startedAt,allTimeVisitors,last30Days,windowDays,definition. `POST /api/analytics/visit`records consented activity and returns only the anonymous receipt; it sends no cookies. A proof-authorized forget operation is implemented at the API level; ordinary opt-out stops collection without subtracting history. No raw database/secret/identifier endpoint exists. This development server is loopback-only; no public deployment has occurred.

Set `POXEY_VISITOR_ANALYTICS=off`before starting the preview to disable analytics while retaining the existing database. Status becomes Disabled, without fake zero counts. Factory/startServers defaults remain disabled for isolated test servers unless a private analyticsDirectory is explicitly provided. The monitored preview and direct local server CLI enable the private directory by default.

## Backup and recovery

Source recovery bundles exclude the database and its signing secret. Keep the private state separately; use a consistent SQLite backup rather than copying only the mainfile while WAL writes are active. Do not publish runtime backups. Restoring only old source does not require deleting browser profiles, Keychain, Admin registry or analytics state. The original collection date and all-time total survive normal service restarts, as verified in automated and actual local restart tests.
