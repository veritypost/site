#!/usr/bin/env node
/* eslint-disable no-console */
//
// Drift fence for admin mutation routes. Runs `git ls-files` against
// web/src/app/api/admin/** and flags any route that:
//
//   - Inserts directly into `audit_log` instead of using
//     recordAdminAction (the canonical helper writes to admin_audit_log
//     via the SECDEF RPC).
//
//   - Calls `rpc('require_outranks', ...)` inline instead of using
//     requireAdminOutranks (helper centralizes the rank check + the
//     short-circuit response on failure).
//
//   - Skips checkRateLimit (every admin POST/PATCH/DELETE must rate
//     limit per CLAUDE.md canonical pattern).
//
// Run: `node scripts/check-admin-routes.js`. Exit 1 if drift found.
// Wire this into CI when there's a CI to wire it into.
//
// Intentionally a script, not an ESLint rule — the rule would require
// a custom plugin and the drift surface is small enough that a grep
// pass per commit is sufficient.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

function listAdminRoutes() {
  const out = execSync(
    "git ls-files 'web/src/app/api/admin/**/route.js' 'web/src/app/api/admin/**/route.ts'",
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function hasMutationHandler(src) {
  // Treat any of these as "mutation" — POST / PATCH / PUT / DELETE.
  return /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/.test(src);
}

function check(src, file) {
  const violations = [];

  if (/\.from\(['"]audit_log['"]\)/.test(src)) {
    violations.push(
      "writes to `audit_log` directly — use recordAdminAction (admin_audit_log)"
    );
  }
  if (/\.rpc\(['"]require_outranks['"]/.test(src)) {
    violations.push(
      "calls require_outranks RPC inline — use requireAdminOutranks helper"
    );
  }
  if (!/\bcheckRateLimit\s*\(/.test(src)) {
    violations.push("missing checkRateLimit");
  }

  return violations;
}

function main() {
  const routes = listAdminRoutes();
  let totalViolations = 0;

  for (const file of routes) {
    const full = path.join(REPO_ROOT, file);
    let src;
    try {
      src = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    if (!hasMutationHandler(src)) continue;
    const v = check(src, file);
    if (v.length === 0) continue;
    totalViolations += v.length;
    console.log(`\n${file}`);
    for (const msg of v) console.log(`  - ${msg}`);
  }

  if (totalViolations > 0) {
    console.log(
      `\n${totalViolations} admin-route drift violation(s). See web/src/lib/adminMutation.ts for the canonical pattern.`
    );
    process.exit(1);
  }
  console.log(`\n${routes.length} admin route file(s) checked, no drift found.`);
}

main();
