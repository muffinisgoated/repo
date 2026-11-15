# Conversations AI configuration

Conversations can run with Gemini once the operator provisions the provider separately. Copy `config-examples/gemini.config.example.json` into `features-backend/.state/config.json` on the server, and update its absolute `geminiKeyFile` path to a mounted secret file outside the checkout. The state directory must be mode 0700 and the config and secret files mode 0600. Use a fresh server-side key, confirm the provider's free-only limits, and then deliberately set the enable and confirmation fields true. Keep the SQLite quota database in that private state directory.

The provider remains unavailable without valid private configuration. Never put the provider key in browser files, commits, or archives. When staging, confirm that cloud AI starts with consent off and explicitly approve active-page and image sharing for synthetic test input. Verify one follow-up and confirm quota handling.
