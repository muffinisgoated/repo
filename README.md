# PoxeyX1 Web Edition — local development

Continue this recovered project; do not replace it with another browser. The original UI and supplied runtime files remain backed up under `originals/` with SHA-256 hashes.

## Install and run

See [Server setup](docs/SERVER-SETUP.md) for the pinned Node release, clean installation, macOS, Windows/WSL2 and private Linux host startup, and persistent data and credentials.

The checkout has two browser modes. `npm start` runs the existing loopback preview. The opt-in HTTPS launcher uses separate origins for sites and the Arcade. The 35-entry Arcade requires the existing local game packages, and Conversations uses the existing server-side provider configuration.

## Local development only

This is an experimental proxy compatibility preview, not a production security/privacy browser. It does not hide browsing from network administrators or guarantee website compatibility. Google may require its own verification; do not bypass it. Avoid private accounts and sensitive content while the alpha runtime awaits a broader review. Do not expose the Wisp listener publicly.

Private/local-network destinations, arbitrary ports, UDP and unauthorized WebSocket origins are denied. No destination/payload logging is enabled. These are useful boundaries, not a complete security audit of upstream rewriting.

## Stage 1 evidence

- `reports/stage1/REPORT.md`: actual consolidation, launch checks, tests and limitations.
- `reports/stage1/RESUME.md`: exact continuation boundary for Stage 2.
- `reports/stage1/USER-TESTING.md`: short manual game and browser checklist.
- `public/arcade/art/SOURCES.json`: artwork provenance and licenses.

## Checkpoints and evidence

- Current foundation branch: `stage1-foundation`. Interrupted expansion preserved at `60ca9f9`; historical recovery branch: `recovery`; stable baseline: `26a3418`, tag `supplied-source-20261104`.
- `reports/OPTIMIZATION-REPORT.md`: repairs, real checks, performance and limitations.
- `reports/CONTINUE.md`: precise next steps.
- Roll back without disturbing current work by creating a separate worktree: `git worktree add ../poxeyx1-web-baseline supplied-source-20261104`. That baseline is the supplied UI, not the recovered live runtime.
- Do not reset the working directory or merge into stable without the user's approval.

No GitHub account, cloud hosting, public deployment, Electron installer or unrelated browser data was changed.
