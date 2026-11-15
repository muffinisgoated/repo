# PoxeyX1 Web Edition — Arcade Implementation Task

This task is for ChatGPT Work with access to the user's **already-running local VS Code project**. The source catalog JSON in this package contains exact historical repository links recovered from previous conversations; it is a starting point, not an install-ready playable manifest.

## Current recovery checkpoint
- The local app was reported running at http://127.0.0.1:8800/.
- Branch `recovery`, checkpoint commit `038e219`, stable branch untouched.
- Last recovered test report: 15/15 passed, simulated Chromium mobile startup 0.91s DCL, 1.37s page load.
- Another developer owns Scramjet/Wisp/link navigation and browsing-transport changes. **Do not edit those modules.**

## Objective
Restore and expand **PoxeyX1 Web Edition Arcade** using exact independent public sources listed in `source-catalog.json`, especially `gn-math/html`, `gn-math/assets`, and `gn-math/covers`. Keep the existing PoxeyX1 UI. No hiii121hub repos or GitHub authentication through the suspended account.

## Required steps
1. Inspect the open VS Code Web Edition workspace and identify Arcade launcher, manifests, assets, existing entries, tests, and how the game frame is isolated. Do not mistake the Electron desktop browser project for Web Edition.
2. Back up the working local project and create a separate feature branch off `recovery` without changing stable. Avoid overlaps with the other developer's source files.
3. Enumerate real game files from the public GN-Math repositories, including non-single-file asset trees and covers. Capture game ID/title/source mapping from the original manifests or actual source code, **not guesses based on numeric filenames**.
4. Check games already present, deduplicate, and retain those working. Use the priority candidates in the catalog. Additional standalone open-source game repositories are optional, not grounds to sacrifice the most recognizable titles.
5. Inspect licensing and embedding/rehosting rights. Prefer authorized sources. Mark unapproved redistribution as a blocker rather than copying questionable assets to a distributable build.
6. Implement a maintainable manifest-driven Arcade: source URL or local asset root, category, controls, mobile compatibility, fullscreen behavior, offline status (only if proven), cover, save-data behavior, and detailed load/failure state.
7. Keep actual gameplay **inside PoxeyX1 Arcade**; do not navigate the user's browser to an unrelated gaming portal. Preserve the game-only visual region in windowed and fullscreen modes where permitted. Do not break keyboard controls, saves, exits, audio toggle, or return to Library. Do not use unsupported fullscreen tricks, modify third-party sites to defeat restrictions, or assume arbitrary external embeds work.
8. Verify each game **actually plays interactively** in a real browser, with controls, game load, return to Arcade, and fullscreen where supported. Test mobile controls when applicable. Keep unverified or broken candidates hidden from the playable catalog and in a report instead.
9. Run the full existing PoxeyX1 regression suite; test tabs, bookmarks, themes/wallpapers, AI dock, mobile layout, and basic navigation without modifying networking code. Measure startup and memory regressions.
10. Commit working features on the feature branch, save test evidence and report exact playable titles + blocked titles + sources. Do not merge until approved. Preserve backups and stable.

## Constraints
- User wants a popular, recognizable game library, not filler. Aim at 15–25 real playable games if realistically supportable, fewer if necessary.
- Do not add the user's rejected `subway-surfers-flame-alpha.vercel.app` clone.
- Night Crossing and Saurabh's Sprint were user-approved alternatives after bad publisher-embed experiences; treat them as their own titles.
- Google/other website transport is the other developer's responsibility.
- Never expose tokens or private data to third-party game frames. Sandbox untrusted game code.
- Work autonomously and fix failures; avoid speculative success claims.

## Definition of done
Each shown game is identified, permitted, launchable, interactively tested, closes cleanly, does not break the parent app, and its source is traceable. Provide a per-title test matrix and commit hash.
