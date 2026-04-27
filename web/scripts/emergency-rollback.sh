#!/bin/bash
# Roll production back to the previous commit on main. Use sparingly —
# prefer git revert + push for anything that can wait an hour.
set -e
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "Not on main"; exit 1; }
last=$(git rev-parse HEAD)
prev=$(git rev-parse HEAD~1)
echo "About to revert main from $last to $prev"
echo "Press Enter to continue or Ctrl-C to abort..."
read
git revert --no-edit "$last"
git push origin main
