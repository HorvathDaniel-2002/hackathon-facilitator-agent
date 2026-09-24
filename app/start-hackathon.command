#!/bin/sh
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Install Node.js 24 LTS from https://nodejs.org, then reopen this launcher.'
  printf '%s' 'Press Enter to close...'
  read -r answer
  exit 1
fi
node ./scripts/start-demo.mjs "$@"
result=$?
if [ "$result" -ne 0 ]; then
  printf '\n%s\n' 'Read the message above or docs/local-demo-setup.md.'
  printf '%s' 'Press Enter to close...'
  read -r answer
fi
exit "$result"
