# Server requirements

- Node.js 24.22.3 and bundled npm. Install locked packages from the npm registry. Generated Scramjet, controller, transport and answer-rendering assets are already included.
- An unprivileged POSIX service account for private state and relay IPC. Use OpenSSL for the included local HTTPS fixtures or for creating a local test CA.
- Standard preview uses TCP 8800/8801 on loopback and dedicated local Beta game ports. Isolated local preview uses TCP 8843 and UDP 8853. Production uses the configured single HTTPS listener, with 443 as the default.
- Persist `features-backend/.state/` and `arcade-telemetry/.state/` where enabled. Development visitor analytics and the Admin registry use `analytics/.state/` and `admin/.state/`. Keep SQLite files and their sidecars together. Private state and secrets are provisioned separately.
- Keep the supplied `local-games/gn-stage86/` and `local-games/tunnel-rush/` paths. Restore verified timestamps after ZIP extraction as shown in [Start here](START_HERE.md).

See [Server setup](docs/SERVER-SETUP.md) for the operating paths, optional environment settings and local modes.
