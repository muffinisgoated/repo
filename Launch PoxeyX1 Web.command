#!/bin/zsh
cd "$(dirname "$0")" || exit 1
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 24 LTS is required. See .nvmrc for the verified version. Install it from nodejs.org, then reopen this launcher."
  read -r "?Press Return to close."
  exit 1
fi
node scripts/launch.mjs
