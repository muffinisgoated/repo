# Export verification

- Source revision `c5d0e1a`. Files were staged from committed source and the existing installed game runtime manifests. The original checkout, Admin and recovery backups were left in place.
- All 35 catalog entries were enabled in the staged runtime. All 891 files for the 24 active packaged Beta entries and all 18 Tunnel Rush manifest files matched the source-recorded SHA-256 values. The two local HTML games and their committed assets are included. See `ARCADE_INVENTORY.json` for the eight publisher-hosted entries whose runtime files are supplied by the external publisher.
- On macOS arm64 with Node 24.22.3, the production-only locked install, build and syntax check passed. Seven focused loopback tests passed, including production HTTPS ingress with a generated test CA, the isolated Arcade catalog and game handlers, and ticketed relay checks.
- The export excludes private configuration, databases, credentials, recovery archives and dependency caches. A filename and signature scan reviewed matches in third-party assets. These include an existing publisher Firebase client identifier and binary library markers, separate from server credentials.
- `SHA256SUMS.json` covers every supplied file other than the hash manifest itself. The ZIP was checked by reading all entries and comparing content hashes with the folder. Use `scripts/verify-handoff.mjs` after extraction.
- Windows/WSL2, Linux hosting, live Gemini using a new key, public DNS/TLS, and public browser gameplay were outside this export test.
