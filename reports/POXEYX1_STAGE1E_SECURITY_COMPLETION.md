# PoxeyX1 Stage 1E verification record

**Security verdict — FAIL pending native browser verification and compatibility.** The opt-in application allocates isolated HTTPS routes for ordinary upstream sites. The regular local launcher starts the previous shared-origin browser. The HTTPS mode never switches to that proxy.

| Control or attempted attack | Expected outcome | Observed result |
|---|---|---|
| Substitute a shell Host on a content TLS connection, or request an unknown SNI | Reject | HTTP 421 for mismatched Host/SNI. TLS handshake rejected for an unknown name. |
| Steal a route capability across workspaces or use a foreign Origin | Deny access | HTTPS broker returned 403. The same upstream received different content origins in separate workspaces. |
| Obtain shell capabilities or open a workspace from an untrusted origin | Deny access | Content-side AI API returned 404. Foreign Origin could not open a workspace. The shell bootstrap contained no workspace credential. |
| Seed Strict and Lax HttpOnly cookies, then access another destination or workspace | Keep cookies server-side and scoped | Neither foreign fixture received another route's cookie. A cross-site navigation sent only the Lax cookie. No Set-Cookie or Service-Worker-Allowed header reached the browser transport. |
| Fetch foreign resources with or without upstream CORS | Allow only safe credential-free reads | The broker denied the response without CORS, reconstructed Origin, omitted credentials, exposed only permitted headers, and rejected the foreign POST. |
| Reuse a WSS grant on the wrong route, replay it, or attempt raw Wisp | Deny all three | All three upgrades failed. Legitimate same-origin echo worked over WSS. Tab revocation closed the socket. |
| Reuse routes or grants after expiry or navigation cancellation | Deny access | Replaced and closed tabs returned 403 on the old grant. Expired workspaces could no longer establish TLS. |
| Cross-site redirect with a POST body | Do not forward the body to another origin | 303 supplied a GET target. 307 returned 409. The broker tests cover 301, 302, 303, 307, and 308 method selection. |

These tests used actual local TLS and WebSocket clients against the PoxeyX1 server and controlled upstream fixtures. They do not establish browser enforcement of parent-domain cookies, rendered-frame isolation, or Service Worker scope.

Public HTTPS broker requests returned recognizable bodies for Example Domain, Google and DuckDuckGo. Wikipedia required a User-Agent and returned 200 after the fix. The English MDN endpoint returned 200. Native rendering, search-result clicks, browser-level isolation and active-page Gemini remain unverified in the HTTPS mode. Credentialed cross-site requests, cross-site embeds and body-preserving cross-site redirects fail closed. Arcade and Admin files are unchanged and their behavior on the new shell has not been verified.

**Full regression suite:** 1,085 passed, 0 failed, 0 skipped. Runtime sync, npm check and Git whitespace checks passed. Initial worker and focused CORS test failures were fixed and retested.

## Mac verification blocker

Safari could not find the server. The ChatGPT in-app browser reported `ERR_NAME_NOT_RESOLVED`. This Mac has no `/etc/resolver/test` and requires an administrator password to configure it. The test CA is not trusted by the browsers.

With the loopback build running, a Mac administrator can add the scoped resolver and approve SSL trust for the temporary test CA. The command refuses to overwrite an existing resolver file.

```sh
sudo mkdir -p /etc/resolver
sudo sh -c 'set -C; printf "nameserver 127.0.0.1\nport 8853\n" > /etc/resolver/test'
security add-trusted-cert -r trustRoot -p ssl -k "$HOME/Library/Keychains/login.keychain-db" /tmp/poxey-stage1e-browser-tls/root.pem
```

Open `https://shell.test:8843/` after configuration. To restart the test server from the repository, run `POXEY_LOCAL_TLS_DIRECTORY=/tmp/poxey-stage1e-browser-tls node scripts/start-isolated-local.mjs`. Remove the test SSL trust entry and the newly created resolver file when testing ends. Keep the CA key outside the repository.

## Recovery

`before-stage1e-https` points to `b671c2c`. The previous `before-isolation-integration` tag still points to `68634b3`. The existing archive matched the recorded 5,701,322,527 bytes. No browser data or game assets were deleted. To return to regular local operation, stop the isolated listener and use the existing launcher. To roll back the code, preserve subsequent work, revert the isolated gateway commits, then run `node scripts/sync-runtime.mjs`.

## Native-browser verification after macOS setup

The owner added the scoped resolver and trusted the local SSL CA. macOS resolves `shell.test` to `127.0.0.1` through port 8853. The DNS and HTTPS checks for Example Domain also passed on the ordinary internet path. The installed login-keychain CA matches the intended certificate file. Its SHA-256 fingerprint is `3C:56:34:D3:B6:83:B7:EA:9C:CA:5C:4D:B4:B5:63:0F:3E:9B:60:35:4F:FB:51:1F:7C:99:C2:FC:8B:A9:C0:4B` and its critical DNS constraint permits `.test`. Neither browser needed a certificate exception.

| Browser | Observed in the actual isolated PoxeyX1 interface |
|---|---|
| Safari | The HTTPS shell showed the secure certificate control. Example Domain loaded. Wikipedia rendered. Its English link crossed into a new `.test` origin and rendered the English Wikipedia main page. |
| ChatGPT in-app browser | Example Domain, Google results, DuckDuckGo results, Wikipedia, and MDN rendered. A DuckDuckGo result opened Example Domain on a new origin. A Google text result opened the IPWAY IANA article on a new origin using keyboard activation. Back returned to DuckDuckGo. Separate PoxeyX1 tabs rendered Google and MDN. In a separate top-level workspace, the same Wikipedia URL rendered on a different origin. Refresh retained that workspace's Wikipedia origin. |

Safari MDN and the complete Safari search and navigation matrix remain unverified. The live Gemini check is pending consent for sharing public test-page text. No provider request was sent. Native cookie and Service Worker attack cases remain open. The complete regression suite passed again with 1,085 tests, including a clock-controlled check that rejects a WSS ticket after ten seconds while its route is still active.

**Security verdict remains FAIL.** In particular, the opt-in HTTPS shell exposes a null legacy proxy origin while Arcade still builds its game-host URL from that field. Game assets and the regular local Arcade were preserved. The HTTPS shell must launch its Arcade successfully before promotion. The regular launcher remains the default. The additional rollback tag `before-stage1e-native-test` points to `80e309c`.

To roll back only the Mac setup, remove the `/etc/resolver/test` file added for this test and remove the SSL trust entry for the exact CA fingerprint above from login-keychain trust. The original DNS configuration and game and browsing storage need no reset.

## HTTPS Arcade and native browser checkpoint

The isolated launcher now serves its Arcade host at `https://arcade.test:8843` and assigns each of the 24 installed Beta games a separate `game-*.test` origin. The same loopback TLS gateway checks SNI against Host before selecting an authority. The Arcade authority serves its launcher, catalog and local runtimes. Website routes cannot serve the Arcade host, and Arcade and game authorities cannot serve the shell's AI or browsing endpoints. The two local HTML games use opaque srcdoc frames. Tunnel Rush also receives a server-enforced sandbox. The HTTPS shell can use the existing origin-checked Arcade telemetry WebSocket. Raw Wisp remains forbidden on the isolated listener, and normal Wisp still requires its existing single-use ticket.

The isolated website runtime serves its trusted worker with `Service-Worker-Allowed: /~/sj/`. This narrows the maximum scope of the worker script, which lives at the origin root. The upstream broker still strips upstream scope overrides.

| Check | Result |
|---|---|
| Native DOM, cookies and storage | Safari and the ChatGPT in-app browser denied reads of a different site's document, cookies, localStorage, sessionStorage and IndexedDB. Same-origin local and session storage worked. Both blocked native cookies in the embedded test context. At the top level, both accepted a host-only cookie and rejected a cookie with `Domain=test`. |
| Native worker and credentials | Both browsers registered the real PoxeyX1 worker at its intended scope. Both rejected registration at the origin root, a foreign scope or a foreign script URL. Both rejected lookup of a foreign registration and blocked a credentialed fetch from reading a foreign response. |
| Navigation and redirects | Both loaded fixture A through the normal shell and followed its in-page link through a 302 to fixture B on a different physical origin. B reported that it received no foreign cookie. The broker suite also verified workspace-bound credentials, credential-free CORS, and body handling for cross-site redirects. |
| Relay | Loopback regression tests passed for ticket binding, expiry, replay rejection, tab revocation, and denial of raw Wisp on the shell and content route. |
| Arcade | The shell and HTTPS Arcade returned all 35 enabled entries. Every installed Beta entry responded to an HTTPS HEAD request on its own origin. Chrome Dino reached its start screen in Safari and the in-app browser. Safari rendered PolyTrack on its dedicated game origin. Tunnel Rush reached its Unity frame and cleared the launcher loading state in the in-app browser. Full gameplay and external publisher compatibility across all 35 remain unverified. |
| Conversations | In the in-app browser, cloud AI began off. With temporary cloud and active-page consent enabled, a question about the isolated Example Domain tab attached the page citation and Gemini answered. The first request timed out and manual retry succeeded. Gemini answered a follow-up using the same page and identified the title and number in a synthetic image after separate image consent. Test consent settings were restored. The native Safari AI flow remains unverified. |
| Regression | Focused run passed 92 tests. The final complete run passed 1,086 tests with zero failures or skips. Runtime synchronization, `npm run check` and Git whitespace checks passed. Existing unrelated workspace changes were left outside the commit. |

To repeat the native checks, stop the isolated launcher, then use the existing private CA and scoped local DNS resolver with `POXEY_LOCAL_TLS_DIRECTORY=/tmp/poxey-stage1e-browser-tls node tests/native-https-browser-fixture.mjs`. Open `https://shell.test:8843/__native-qa` in each browser and run its top-level cookie control. Then open the regular shell at `https://shell.test:8843/`, enter `https://native-a.example/` in the PoxeyX1 address bar and follow the redirect link. The synthetic upstream and probe endpoints exist only while this test command is running.

**Public beta gate remains closed.** The isolated path is still opt-in. It uses the local resolver and CA. End-to-end saved browser profile and Arcade progress migration across changing origins, authenticated real-site compatibility, native Admin coverage, and publisher game compatibility are still open. Existing saved state was retained on its original origins. No provider credential was copied into the frontend or commit.

To return to the regular browser, stop the test listener and run the existing `Launch PoxeyX1 Web.command`. To roll back the code while retaining later history, revert this checkpoint commit and run `node scripts/sync-runtime.mjs`. Tag `before-stage1e-https-arcade` resolves to the exact starting point `c17356e`. Keep pre-existing worktree changes in place during rollback.
