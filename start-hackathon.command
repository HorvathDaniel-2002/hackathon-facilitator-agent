#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Install Node.js 24 from https://nodejs.org/en/download, then run this launcher again.'
  exit 1
fi
exec node app/scripts/start-demo.mjs "$@"
