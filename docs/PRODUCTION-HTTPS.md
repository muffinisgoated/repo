# Production HTTPS ingress

Build with the pinned Node version in [Server setup](SERVER-SETUP.md). Run `npm run build` and then `npm run start:production`. The production command starts one TLS listener with the Stage 1E gateway. It serves isolated browsing and rejects legacy relay sessions and raw Wisp. Keep the development commands out of the public service configuration.

## DNS and TLS

Set all of the following in the service environment:

| Variable | Value |
|---|---|
| `POXEY_SHELL_HOSTNAME` | A dedicated shell hostname |
| `POXEY_ARCADE_HOSTNAME` | A hostname on a different registrable site from the shell |
| `POXEY_CONTENT_SUFFIX` | An exclusively controlled private Public Suffix List entry recognized by target browsers. `r-<uuid>.<suffix>` and `game-<id>.<suffix>` must each be a separate registrable site. |
| `POXEY_TLS_CERT_FILE` | Absolute path to a trusted leaf plus intermediate chain covering the two exact hostnames and `*.<suffix>` |
| `POXEY_TLS_KEY_FILE` | Absolute path to the matching owner-only private key outside the checkout |
| `POXEY_ACCESS_TOKEN_FILE` | Absolute path to an owner-only file outside the checkout containing a random base64url token, generated from at least 32 random bytes |
| `POXEY_HTTPS_PORT` | Public and listener port. Defaults to 443. |
| `POXEY_BIND_ADDRESS` | Explicit IP address for the listener. Defaults to loopback. |

Point the shell and Arcade records and the wildcard content record at the ingress. Configure direct TLS or a layer-4 TCP passthrough that preserves TLS SNI and the HTTP Host authority. TLS termination in front of this listener and forwarded Host headers are outside this configuration. Port 443 needs the host's usual privileged-port mechanism. Use one server instance per authority set. In-memory routes and WebSocket grants are tied to that process.

An ordinary wildcard under a registrable domain leaves a shared parent-domain cookie boundary. Startup rejects that configuration. The runtime checks the suffix against its pinned PSL data. Eligibility and support in the actual Safari and Atlas versions must be verified before use. The localhost test suite uses reserved example names and a known PSL entry against loopback only. It does not imply ownership or availability of that DNS namespace.

This entry point is for an access-controlled deployment. Sign in to the shell with the username `poxey` and the operator-provisioned token. Share it only with approved testers. Workspace creation requires shell authentication and the shell Origin. Routed HTTP and WSS use the existing scoped capabilities and one-use socket grants. Replacing the token or certificate and restarting invalidates active workspaces and relay grants. Keep authorization data and route or ticket material out of request logs.

## Verify on the intended host

- Confirm public trust and DNS for shell, Arcade, two random content hosts and the published game authorities. Verify unknown or mismatched SNI/Host is denied and only the isolated listener is reachable.
- In Safari and Atlas, check login and authenticated Arcade telemetry, two unrelated routed pages, and native denial of foreign DOM, parent-domain cookies, local/session storage, IndexedDB, worker registration, and credentialed reads. Confirm worker root-scope denial, real redirects and credential scoping, and delegated WSS issuance and replay rejection. Test through the intended ingress.
- Confirm an expired or restarted workspace cannot reconnect on its old origin. Reload a saved destination and verify the shell obtains a fresh route. Live routes and site credentials are ephemeral. Browser shell preferences and persistent server databases follow the storage paths in the server setup guide.
- Verify all 35 entries with the transferred game packages, local-only Admin operations, temporary sessions, and Conversations consent and image flows. Verify rate limits and private-network egress blocking from the hosting network. Confirm certificate renewal and that the service is reachable only on the intended interface.

The production command leaves visitor analytics disabled. Arcade and Conversations use the existing private state directories and provider setup. Admin remains a separate local operator service.

## Checkpoint evidence

Node 24.22.3 ran 65 focused tests with zero failures or skips. The production configuration was exercised through a real loopback HTTPS listener with a generated test CA and hostname verification enabled. The probes covered rejected configuration, unauthenticated workspace denial, the isolated-only listener, Host/SNI mismatch, raw Wisp denial, HTTPS Arcade catalog and game serving, brokered credential separation, the worker scope header, expiry, and restart revocation. Prior Safari and in-app browser evidence covers the local Stage 1E namespace. The target hostname, public CA, deployed ingress, and browser enforcement on that namespace remain unverified.
