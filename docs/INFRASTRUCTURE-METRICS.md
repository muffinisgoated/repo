# Internal monitoring contract — schema 1

`startServers(uiPort, runtimePort, overrides)` accepts trusted server-side integer settings validated by `capacityLimits`. Overrides are not accepted from HTTP, WebSocket payloads, query parameters or browser settings. Unknown/invalid values fail startup; each value has a finite upper bound (16× its default). Settings take effect on a controlled restart, not live mutation. No limit was increased in the default preview on the strength of a connection count.

The returned object exposes `limits`, `monitoring()` (aggregate snapshot), `diagnostics()` (legacy WebSocket count), and `stop()`. These are in-process Node interfaces only. There is NO `/admin`, `/metrics` or monitoring HTTP endpoint. Public static boundaries do not serve these source modules, report files or config. The optional `scripts/monitor-preview.mjs` is a development collector: it overwrites one local mode0600 JSON file every5seconds, skips overlapping writes and does not crash browsing if snapshot persistence fails. It is not a downloadable Admin application or remote authentication system.

Every snapshot has an ISO UTC `timestamp`; measurements below are as of that timestamp unless their period says otherwise. Uptime/counters reset on process restart. The snapshot does not contain URLs, hostnames, IPs, installation/user IDs, cookies, documents, raw errors, prompts or conversations. No persistent user tracking or public-content cache is introduced.

| Field / group | Unit and meaning | Source | Period / availability |
|---|---|---|---|
| `available` | Boolean: collector lifecycle active | Monitor lifecycle | Current; not an external health probe |
| `service.listenersReady` | Boolean: both local HTTP listeners report listening | Node server.listening | Current; not internet reachability |
| `uptimeSeconds` | Seconds since monitor creation | monotonic performance.now | Process lifetime |
| `system.rssBytes` | Process RSS bytes | process.memoryUsage | Current process, not system RAM |
| `system.heapUsedBytes` | JS heap used bytes | process.memoryUsage | Current |
| `system.cpuCorePercent` | CPU time/wall time×100;100=one core, may exceed100 | process.cpuUsage delta | `cpuSampleSeconds`, between snapshots |
| `system.eventLoopP95Ms` | p95 event-loop scheduling delay | Node monitorEventLoopDelay,20ms resolution | Since creation; null before samples |
| `active.http` | Admitted unfinished local HTTP responses | Admission/release callbacks | Current; excludes rejections |
| `active.webSockets` | Accepted upgrade sockets, including pending handshakes | Validated upgrade/close | Current; not people/sessions |
| `active.streams` | Reserved Wisp stream slots, including pending setup | Synchronous reservation/release | Current; not successful TCP count |
| `active.tcp` | Connected Wisp destination TCP streams | Socket connect/close | Current; not all system sockets |
| `active.acceptedTcp` | Accepted inbound TCP sockets on the two local servers | Node connection/close events | Current; includes upgrades, do not add it to webSockets as unique clients |
| `active.queuedBytes` | Bytes retained in managed receive/stream queues | Queue push/pop/close accounting | Current; excludes in-flight writes, browser memory, OS socket buffers and outbound WS buffers |
| `peaks.*` | Highest corresponding gauge | Same gauge updates | Process lifetime |
| `counters.httpRequests` | All local HTTP request attempts, including denied ones | HTTP handler | Lifetime |
| `httpFailures` / `httpCancelled` | Responses≥400 or aborted; abort subset separately | finish/close | Lifetime; not remote website HTTP statuses |
| `httpBodyBytes` | Body bytes submitted to local Node response writes, compressed when applicable; excludes headers/HEAD bodies | response write/end length | Lifetime; not confirmed client delivery |
| `httpOverloads` / `rateLimits` | Overload/drop events and rate/budget events | Admission, Node drop, byte/rate guard | Lifetime; events may overlap |
| `wsOpened` / `wsClosed` / `wsRejected` | Successful upgrades / admitted socket closes / refused upgrades | WS/upgrade handlers | Lifetime; closed includes failed pending handshakes |
| `wsFailures` | WS/setup/protocol execution failure events | WS error / session catch | Lifetime; may include multiple events for one failure |
| `wsTimeouts` / `tcpTimeouts` | Handshake/send deadline events / connect or idle TCP deadline events | Bounded timers/adapters | Lifetime |
| `streamOpened` / `streamClosed` | Stream reservations/release events | Admission and idempotent release | Lifetime; opened can subsequently fail |
| `streamRejected` / `streamFailures` | Invalid/resource/host refusals / destination connection failures | Guard/library close reasons/socket adapter | Lifetime; not a unique failed-user count |
| `queueOverflows` | Byte/item/global receive budget violation events | Managed queues | Lifetime; causes connection closure, not silent dropping |
| `wsInputBytes` / `wsOutputBytes` | Received WS payload bytes / submitted protocol payload bytes | WS messages/send adapter | Lifetime; excludes wire/TLS overhead, initial server handshake may precede send instrumentation |
| `http.requestsPerSecond` | Request attempts divided by observed recent window |60 fixed per-second buckets | Trailing≤60s; `windowSeconds` included |
| `http.bodyBytesPerSecond` | Local response-body submitted bytes/window | Same buckets | Trailing≤60s |
| `http.p50Ms` / `http.p95Ms` | Local request-to-response-finish/abort durations | Monotonic HTTP timing | Last≤1024 completed requests (not the60s bucket window); null with no samples |
| `http.latencySamples` | Number of retained durations | Bounded sample list |≤1024 |
| `recentErrors` | UTC seconds with aggregate HTTP/connection/stream failures or timeouts | Fixed60-bucket event totals | Trailing≤60s; no raw error strings |
| `unavailable.ai` | Unavailable: no provider connected | Explicit capability state | No token/model/quota numbers invented |
| `unavailable.uniqueUsers` | Unavailable: no authenticated identity | Explicit capability state | Connections must never be labeled users |
| `unavailable.reconnections` | Unavailable: no cross-connection identity | Explicit capability state | wsOpened is NOT a reconnect count |
| `unavailable.externalRequestLatency` | Unavailable in this collector | Explicit scope | Local static HTTP timings are not website browsing timings |

The internal histogram is fixed-size; errors use60 buckets and latency retains1024 numbers. Cumulative counters have fixed names and are capped at Number.MAX_SAFE_INTEGER. Current queue/global counters are bounded by capacity settings. Native event-loop monitoring is disabled on stop.

## Default capacity / semantics

6 accepted WS connections;20 upgrades/minute;32 stream slots/connection,8/host,128 global reservations;64 admitted HTTP requests;120 local HTTP requests/second plus240 burst tokens. The pinned library still applies its existing stream checks and can refuse the last slot because it counts a just-created stream; configured ceilings are maxima, not guaranteed successful stream counts.

1MiB WS message;2MiB WS receive queue;128 queued items;8MiB per-stream queue;16MiB combined receive/stream queues per connection;64MiB combined globally. Each current read/write can additionally hold in-flight data. Existing outbound WS high-water mark remains32MiB per connection. These are NOT a total process-memory guarantee or a browser-memory bound. Byte ceilings may close a very large/slow upload before all nominal packet credits are used; publisher file-upload workloads need separate acceptance. Per-connection stream-start16/s with32 burst and packet2000/s with4000 burst also apply. Total wire/payload connection budget256MiB; send and handshake deadlines15s; TCP idle timeout120s. SSE/very long idle sites need workload-specific checks before public deployment.

All overloads are explicit:503/Retry-After for local HTTP/admitted upgrade capacity,403 for untrusted upgrade origin/host/path,1009 for oversized frames,1008 for protocol/receive budgets, or Wisp stream-close for stream admission. Active work is retained when only a new stream is refused. Queue overflow terminates its offending connection and clears queued data. Streams release their slot even after a destination fails while the client remains connected.

This local-only relay still binds loopback, validates the exact runtime Origin/Host/path, restricts destinations to public hostnames on80/443, rejects private/loopback IPs and pins validated DNS results. No security relaxation or public bind was added. Per-connection fairness is implemented; authenticated per-person/device fairness is NOT. One process currently supports one configured service instance because the pinned library has process-global destination options. Native DNS lookup cancellation is not provided by the pinned stack; long resolver/transport interruptions need further operational testing. Do not expose this development relay publicly.

## Stage5 boundary (disabled)

The separate future downloadable Admin application may consume schema1 only through a server-authorized local IPC or authenticated HTTPS service. Device enrollment, explicit owner approval, short-lived proof-of-possession credentials, revocation, TLS, authorization on EVERY read/configuration operation, anti-replay and rate limits must be implemented/tested before remote access. No credentials or reusable owner key belong in the public browser. Configuration changes must validate the same capacity schema, require authorization, preserve rollback and drain/restart safely. No remote route, account, downloader or Admin UI is created here.

## Stage5.1 local anonymous activity extension

The current private snapshot adds `sessions.activeSessions` (distinct opt-in browser-session cookies seen within300seconds), `sessions.activityWindowSeconds=300`, and `sessions.expirySeconds=1800`. These are reporting sessions, **not verified unique people, accounts or total installations**. Reporting is off by default and suppressed in private mode. Same-origin Web Locks serialize heartbeat enrollment across browser documents; an HttpOnly/SameSiteStrict random128-bit cookie deduplicates tabs and connections. Browsers without Web Locks do not report. Heartbeats are at most once per60seconds per visible document; multiple documents update one server record, never separate user counts. Hidden/closed documents stop heartbeats. Explicit opt-out removes the session; otherwise it becomes inactive at5minutes and is deleted after30minutes idle. The bounded10000-entry map stores only random token→last heartbeat time in process memory, without browsing history/IP/useragent, and resets on server restart. Existing request admission and rate limits apply; the map ceiling is not a throughput claim or abuse-proof people count.

The fixed loopback-only reporting POST `/api/session/activity` accepts only `{}`or`{"remove":true}`with exact Origin, bounded body/deadline and returns204without exposing identities or counts. It is not an Admin/metrics API. No remote bind, CORS grant, public service or proxy-origin reporting is added. Cookie scope prevents sending the activity token to proxied sites. HTTPS/Secure-cookie requirements must be revisited before any separately authorized remote deployment.

The separate native Admin now consumes the existing private snapshot through authenticated local Unix IPC. This supersedes the older “Stage5boundary(disabled)” planning text for local access only; remote administration remains disabled. Native reads use the original Keychain/enrolled-device proof and reject stale snapshots. Overview shows **Active Sessions**; Traffic retains the original Wisp connection gauges.

## Stage5.2 visitor analytics

Schema1snapshots now include `visitors`. With `status:available`, `allTimeVisitors` is a persistent lifetime estimate of opt-in browsers, `last30Days` is the rolling30-day count of recent hashed browser IDs, and `startedAt` is the original collection start in ISO UTC. `status:disabled`or`unavailable`omits counts; consumers must not substitute zeros. These are not verified people, registered accounts, sessions, Wisp connections, requests or historical guesses. Public summary exposes only the same visitor aggregates, not private operational metrics or device records. SQLite retention, consent, signed-receipt deduplication, limits and backup requirements are documented in analytics/README.md. Current live source is the local development preview only; Cloudflare/public deployment was not part of this change.
