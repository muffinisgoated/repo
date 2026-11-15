# PoxeyX1 Admin — Stage5 local application

Separate native SwiftUI app, independent of the public browser. No public Admin route, embedded website, universal owner key, AI provider, or internet listener.

## Start (development Mac)

Keep the existing preview running. `node admin/service.mjs` starts the local-only private Unix-socket service. Build with `admin/build-mac.sh`, then open `outputs/stage5-live-refresh/PoxeyX1 Admin.app`. The ZIP contains only the app, not the server, device registry, invitations or keys. Use the server checkout and the Node release pinned in `.nvmrc`; this is not a self-contained remote hosting product.

Choose **Connect and request enrollment** once. Compare the full public-key fingerprint displayed in the app with `inspect REQUEST_ID` in the local service console. Authorize that exact key with `approve REQUEST_ID FINGERPRINT`. Choose **Check approval**. Subsequent launches use the same Keychain-held Ed25519 private key. Copying the app grants no access. Routine reads refresh every5 seconds and require a fresh operation-bound, single-use30-second challenge. A request deadline and stale-data rejection prevent disconnected snapshots being shown as live.

Owner can create a five-minute, one-use viewer invitation. The invited device generates its own key; the owner approves its pending request. Device authorization/revocation is checked on every operation. Viewer cannot invite, revoke or stage settings. Remote transport is intentionally absent; sharing to another Mac needs a separately approved authenticated TLS service before it can connect. There is no insecure remote fallback.

## Controls

Four allowlisted settings can be staged: Wisp connections1–6; global streams8–128; HTTP requests/sec10–120; TCP idle timeout15000–120000ms. No increases above Stage4defaults, arbitrary files, shell commands or destination-policy switches. Settings are written atomically to private server storage and audited. They take effect only on the next deliberate restart of `node scripts/monitor-preview.mjs`; running clients are never silently disconnected by Apply. Rollback swaps the prior staged settings and is also applied on restart. Running values are shown only when the updated collector reports `appliedLimits`.

## Boundaries

Unix socket0600 under a0700same-user directory. Registry/config0600 under0700`admin/.state` (Git-ignored). Keychain private key never crosses IPC. Device public keys and at most200 action-only audit records persist locally. Pending invitations/challenges do not survive server restart. No browsing histories, destinations, prompts or private application data enter Admin metrics. Same OS-user control of the server checkout/state is a trusted boundary; this does not protect against a compromised administrator account. No accounts/tracking of public browser users.

Metrics reuse Stage4schema1, source `reports/stage4/live-monitoring.json`, updated5s, invalid after15s. CPU/RSS describe the server process; local HTTP latencies are not remote website performance. Connections are not unique users. AI, unique users and unsupported measurements remain Unavailable. There is no fabricated historical series.

Build targets Apple Silicon macOS13+, unverified on Intel/older hardware. Current packaging is ad-hoc signed, not DeveloperID signed/notarized. Do not disable Gatekeeper; ordinary external distribution remains blocked pending legitimate signing/notarization and separate remote-service work.

## Recovery

Stop only the Admin app and `admin/service.mjs` to remove Admin runtime activity. The browser can continue independently. Preserve Keychain, app preferences and `admin/.state` for identity/revocation continuity. Never clear the registry to bypass enrollment. Pre-Stage5bundle preserves Stage4; preexisting workspace-file deletion remains separate. See `reports/stage5/CONTINUE.md` for exact test coverage and limitations.

A local convenience launcher is generated beside the app: **Start PoxeyX1 Admin.command**. It starts the separate backend only when the private socket is absent, then opens the app. It references this checkout and requires Node. An existing stale socket is deliberately not deleted automatically: inspect the stopped service rather than overwriting a running one. First-owner setup still requires the explicit service console; the launcher cannot grant access. Native Keychain may require OS approval after an ad-hoc-signed rebuild; never remove the key or reset enrollment to evade that prompt.


##0.5.1session/refresh update

Overview now shows **Active Sessions**, not people. Optional browser activity reporting is off by default, disabled in private mode and disclosed in Settings→Privacy & sessions. One server-issued128-bit HttpOnly/SameSiteStrict cookie is shared across same-origin documents; Web Locks serialize enrollment/heartbeats across tabs. The cookie is scoped to the reporting path and never sent to proxied websites. No IDs enter aggregate monitoring. Active means reporting within5minutes; session records expire after30minutes idle. Records are bounded to10000in-memory entries and reset on server restart; this ceiling is not a capacity promise. Compatible Web Locks support is required to report, otherwise no invented count is sent. Multiple browser profiles/devices can represent one person, and automated clients can imitate sessions: this is not verified unique people or abuse-proof identity.

Only the fixed same-origin POST /api/session/activity accepts `{}`or`{"remove":true}`with bounded bodies/deadline and existing server admission/rate limits. It returns no aggregate data or token in its body. There is no public Admin endpoint. HTTP is loopback-only; remote deployment would require TLS and Secure cookies before use. Turning reporting off removes the current session. Closed/hidden pages stop heartbeats; naturally inactive sessions age out. Server snapshotting prunes expiry without storing browsing URLs/IPs/user agents. No long-term usage history is added.

The native app owns one lifecycle-managed polling task and one request gate. It fetches on launch/reopen/return/reconnect/settings changes, refreshes every5seconds while its window is open, pauses when closed or minimized, coalesces concurrent refresh triggers, and rejects results from a closed-window generation. Returning from another app forces a refresh; background-open windows continue the intended5-second polling. Source snapshot time is displayed, and stale/offline metrics are cleared. This supersedes the old view-lifetime polling loop. The existing Keychain service/bundle identifier is unchanged; ad-hoc binary changes can still require OS approval.

Previous0.5.0app/ZIP remain under outputs/stage5. This branch builds0.5.1under outputs/stage5-live-refresh. No public deployment or browser/Arcade redesign.

##0.5.2visitor counters

Current branch builds the separate native app/ZIP under `outputs/stage5-visitors`, version0.5.2. Older0.5.1outputs remain under `outputs/stage5-live-refresh`. Overview adds All-TimeVisitors and Last30Days alongside ActiveSessions, with the analytics start date and estimated-browser disclosure. Disabled/unavailable visitor stores are labeled explicitly rather than shown as zero. Refresh behavior, Keychain identity, roles and controls are unchanged. See analytics/README.md and reports/stage5-visitors/REPORT.md.
