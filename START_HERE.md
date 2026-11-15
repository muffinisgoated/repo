# PoxeyX1 Web Edition
**Private hosting handoff. Public release approval is pending.**

This export is based on the exact Git revision in `SOURCE_REVISION.txt`. Use **Node.js 24.22.3** and its bundled npm. See [macOS](MAC_SETUP.md), [Windows/WSL2](WINDOWS_SETUP.md), or [private Linux hosting](LINUX_HOSTING_SETUP.md).

After extracting the ZIP, run this from the project folder before starting it:

```sh
node scripts/verify-handoff.mjs --restore-arcade-times
npm ci --omit=dev --ignore-scripts --engine-strict
npm run build
npm run check
```

The verifier checks SHA-256 for the supplied files before restoring the precise timestamps required by the Beta runtime manifest. Running it without the flag performs hash verification only. Run verification before configuring local state or replacing generated files.

[Server requirements](SERVER_REQUIREMENTS.md) lists storage, ports and prerequisites. [Security and privacy](SECURITY_AND_PRIVACY.md) gives the staging and release gates. [AI configuration](AI_CONFIGURATION.md) explains how to use a separate server-side Gemini key. Templates are in `config-examples/`.

**Arcade:** The catalog retains all 35 entries. The 24 Beta packages, two local HTML games and Tunnel Rush have their runtime files here. Eight games remain publisher-hosted, as in the working site, and require the publisher's external runtime. See `ARCADE_INVENTORY.json`. No self-hosted copy of those eight publisher runtimes is supplied.

The archive omits dependency caches, Git metadata, inactive game candidates, personal state and recovery archives. The generated runtime assets shipped in this copy can be regenerated with the locked dependencies. The production HTTPS, isolation and relay fixtures are included. Historical developer suites can depend on the original Git history or owner-only fixtures.
