#!/bin/bash
set -e
cd "$(dirname "$0")/.."
exec node scripts/launch.mjs
