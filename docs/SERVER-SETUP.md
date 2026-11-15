# PoxeyX1 server setup

Use Node.js **24.22.3 LTS**, pinned in `.nvmrc`. This release provides `node:sqlite` for Conversations quotas, Arcade monitoring and visitor analytics. Use the npm bundled with the selected Node release. [Official Node release and installers](https://nodejs.org/en/blog/release/v24.22.3/)

## Install and start

Run from the server checkout as an unprivileged user:

```sh
node --version
npm ci --ignore-scripts --engine-strict
npm run build
npm run check
npm start
```

`npm run build` generates the local Conversations rendering assets and copies and patches the pinned Scramjet/controller/transport assets. For a server host that does not run tests, install with `npm ci --omit=dev --ignore-scripts --engine-strict`. The build uses production dependencies. `npm start` also runs the build. A supervisor can run `node server.mjs` after the build step.

- **macOS:** Use Terminal with the pinned Node on PATH. `Launch PoxeyX1 Web.command` also uses Node on PATH, with fallback locations for system installations.
- **Windows:** Use WSL2 with a Linux distribution. Install Node inside WSL and keep the checkout, game files and state on the Linux filesystem. Start from the WSL terminal. The Windows browser can use the loopback preview when WSL localhost forwarding is available. The relay operator and server state rely on Unix sockets and POSIX permissions. The Swift Admin app is macOS-only.
- **Private Linux/cloud VM:** Build and run under the same unprivileged service user with a fixed checkout path and persistent storage. Use the same service user, checkout and Linux temp-directory setting when approving relay requests. Allow the service to write its private temp and state locations. Both HTTP listeners bind to loopback and use fixed ports. This supports a private host-side preview. Public ingress needs the separate production HTTPS authority and security work described in the Stage 1E handoff. A managed platform that requires a publicly reachable `PORT` listener cannot run the current entry point as a public web process.

The preview uses `http://127.0.0.1:8800/` for the shell and `http://localhost:8801/` for the page runtime. Package-backed Beta games use their existing dedicated loopback ports. For ordinary preview browsing, the server operator approves an issued code with `node relay-operator.mjs <pairing-code>` from the same checkout. Relay approval stays on a private Unix socket.

## Opt-in HTTPS preview

Run `npm run build`, then `npm run start:isolated`. Set `POXEY_LOCAL_TLS_DIRECTORY` to an absolute owner-controlled path outside the checkout containing the local CA. The existing initialization command is `npm run start:isolated -- --init-ca` and requires OpenSSL. It creates a new CA directory. The browser must use an explicitly trusted local test CA and a scoped resolver for `.test` pointing to the loopback DNS listener on UDP 8853. The shell uses TCP 8843. See `reports/POXEYX1_STAGE1E_SECURITY_COMPLETION.md` for the existing macOS setup. On WSL or a VM, the browser needs access to that host's DNS and HTTPS listeners and a matching trust setup. The macOS host resolver commands are specific to macOS.

## Configuration and persistent data

| Setting or path | Purpose |
|---|---|
| `TMPDIR` | Optional on Linux. If provided, use the same value for the service and relay approval command. The Unix socket path must fit the operating system limit. |
| `POXEY_LOCAL_TLS_DIRECTORY` | Required for the isolated preview. Store the CA certificate and private key outside the checkout. Keep the key private to the service operator. |
| `POXEY_VISITOR_ANALYTICS=off` | Optional. Disables visitor analytics storage in the standard launcher and monitor preview. |
| `POXEY_GAME_LAB=1` | Optional owner-lab setting for `scripts/monitor-preview.mjs`. Leave unset for a standard server installation. |
| `features-backend/.state/` | Persist the owner-only directory and its `usage.sqlite` database. Optional Gemini uses owner-only `config.json` with `provider: "gemini"`, `enabled: true`, `freeOnlyConfirmed: true`, `geminiFreeOnlyConfirmed: true` and `geminiKeyFile` pointing to an operator-provisioned secret file outside the checkout. Use directory mode 0700 and private files mode 0600. Missing configuration leaves the provider unavailable. |
| `arcade-telemetry/.state/`, `analytics/.state/` | Persistent private SQLite stores for enabled monitoring. Keep the directory and DB together, including SQLite sidecars when present. |
| `admin/.state/` | Persistent owner-only registry, controls and audit state for private Admin. The separate native app retains its identity in macOS Keychain. Follow `admin/README.md` for its private collector and IPC startup. |
| `local-games/` | Install the owner's existing authorized game packages under their original paths. Keep the selected `gn-stage86` or `gn-beta` installation, its manifests and matching files, plus `tunnel-rush`. Package validation depends on file size and timestamps or manifest hashes. Preserve timestamps when moving the installed files and verify all 35 entries on the destination. Git and npm do not supply these packages. |

Browser preferences, bookmarks, history and game saves use browser storage on their original origins. Server state volumes cover server databases, while browser data remains in the user's browser profile. Isolated workspaces, route grants and relay admission are process-local. For an installation check, use fresh state and provision secrets separately from source and game files.

## Compatibility verification

The server compatibility checkpoint was verified with the official macOS arm64 Node 24.22.3 archive and bundled npm 11.19.1. A disposable source checkout used the existing installed game packages through a link to the existing local game directory. Both the standard `npm ci --engine-strict` and the documented `--ignore-scripts` install built successfully. npm reported an install-script advisory for `bufferutil` during the standard install. The production-only install started successfully, served the built assets and all 35 enabled Arcade entries, approved a relay pairing over private IPC, created the local SQLite stores and reported AI unavailable with no private provider config. The 53 focused tests covered isolated HTTPS and all 24 game origins, relay authorization, SQLite persistence, Conversations API boundaries and private Admin IPC.

WSL2 and Linux host instructions still need execution on those platforms. The existing loopback and test-CA boundaries remain in place.
