# Security and privacy

Use the package as a private, access-controlled handoff. Production requires trusted TLS/WSS, an exclusively controlled browser-recognized private Public Suffix List entry, and separate registrable shell and Arcade sites. An ordinary wildcard beneath a shared registrable domain leaves sibling cookie scope. The production listener rejects the legacy Wisp endpoints and requires shell access authentication. Never log authorization headers, workspace capabilities, or WSS grant data. Keep Admin and its collector private.

Before release, verify real DNS and certificate trust, TLS SNI/HTTP Host enforcement, absence of the legacy listener, and workspace/relay limits and revocation through the intended ingress. In Safari and Atlas, verify DOM, cookie, storage, credential and worker isolation, redirects, and expiry/restart. Test all shipped game flows, publisher embeds and authenticated Arcade telemetry. Follow [Production HTTPS](docs/PRODUCTION-HTTPS.md) for the full checklist.

No live hosting verification was performed for this handoff. The staged export was installed and built on macOS arm64 and tested using HTTPS loopback fixtures with generated test certificates.
