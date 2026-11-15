# Local game sources and adaptations

Chrome Dino: https://github.com/wayou/t-rex-runner (gh-pages). BSD-3-Clause copyright and conditions are retained in dino/LICENSE and upstream files. Derived from Chromium's offline runner; not represented as a newly authored Poxey game.

Saurabh's Sprint: https://github.com/Saurabh2005695/Saurabh-s-Sprint- (main). MIT license retained in sprint/LICENSE. Its procedural artwork and game source are provided under that repository's license. This is its own separately named runner, not the original Subway Surfers. Three.js r128 retains its MIT notice and lib/THREE-LICENSE.

Poxey adaptations: only the runtime files are included (no Unity project/build tools). Optional standalone PWA worker registration and install prompt are removed inside the sandbox. A scoped local-storage adapter is injected by the Arcade host, providing bounded per-game saves without granting the game access to the host's actual storage or browser profile. A restrictive per-game CSP denies network connections, workers, child frames and form submission. Third-party webfonts are blocked; local system fonts remain. Game logic is preserved.

External publisher games remain hosted by their publishers. No GN-Math game binaries, game assets or cover collection are redistributed. The input pack and reviewed mappings are preserved separately for investigation. A repository listing is not treated as permission to redistribute third-party assets.
