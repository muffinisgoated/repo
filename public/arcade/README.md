# Poxey Arcade — Web Edition

The playable catalog is public/arcade/catalog.json. Only entries with verified:true appear normally. The isolated host keeps an identical allowlist at proxy-public/arcade/catalog.json; the test suite enforces equality. Never promote an entry merely because an iframe load event fires.

Library/player implementation: ui.mjs, state.mjs, arcade.css. The existing web-edition.js contains only the small mount/cleanup adapter and preserved Snake/2048 logic. Hosted games use HTTPS directly; local licensed games use an opaque srcdoc frame and bounded per-game saves. No Scramjet or Wisp code is changed or invoked by Arcade.

Local licenses and adaptation notes: proxy-public/arcade/games/ATTRIBUTIONS.md. Results and exact blockers: reports/arcade/ARCADE-REPORT.md and GAME-RESULTS.json. Game image covers are local testing screenshots or original SVG illustrations.

Start the existing project as before. Normal URL: http://127.0.0.1:8800/ then Arcade. The query ?arcade-qa=1 is a development-only candidate view, not proof that those games work. Keep failures and unverified candidates hidden in the normal library.

No new npm dependency is needed. Run npm test and npm run check after relevant changes. Keep both manifests synchronized and capture real gameplay evidence before publishing a game.
