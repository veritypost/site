#!/bin/bash
# Deploy to Vercel production. Assumes you're on main with a clean tree.
set -e
git diff --quiet || { echo "Working tree is dirty"; exit 1; }
git diff --cached --quiet || { echo "Staged changes — commit first"; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "Not on main"; exit 1; }
git push origin main
echo "Pushed. Vercel auto-deploys; check https://vercel.com/<org>/<project>/deployments"
