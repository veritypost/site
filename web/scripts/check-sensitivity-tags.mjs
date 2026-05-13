#!/usr/bin/env node
/**
 * G2.5 — sensitivity-tag drift guard.
 *
 * The list of ad-blocking sensitivity tags is duplicated by design in three
 * surfaces:
 *
 *   1. web/src/lib/sensitivityTags.ts                          (web TS)
 *   2. web/supabase/migrations/20260511130000_article_ad_eligibility.sql
 *                                                              (serve_ad RPC)
 *   3. VerityPost/VerityPost/HomeView.swift                    (iOS Swift)
 *
 * The 2026-05-13 design panel weighed centralizing into a DB table and
 * rejected it 1-of-4 with the strongest empirical argument: `git log -S`
 * shows zero drift events across these three files since the tags were
 * authored in Wave 2 / 2.5b / 2.5c. The hazard is theoretical. The cure
 * (table + cache + admin UI + async isHomeBlocked + iOS network fetch + new
 * Apple-review surface) is significantly larger than this guard.
 *
 * This script reads all three files, extracts each list via regex anchored
 * on the known declaration shape, and asserts that all three sets are
 * equal. Exit 0 on match, exit 1 with a printed diff on drift. Wire into
 * CI (and pre-push hook eventually) so a partial edit fails the build
 * before it can ship.
 *
 * Run: `node scripts/check-sensitivity-tags.mjs` from `web/`
 *      (or `npm run check:sensitivity-tags` from `web/`).
 *
 * If the declaration shape in any source changes, update the regex in the
 * relevant reader below — the regexes are tight on purpose so unrelated
 * edits in those files don't false-positive.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WEB_ROOT, '..');

const TS_PATH = path.join(WEB_ROOT, 'src/lib/sensitivityTags.ts');
const SQL_PATH = path.join(
  WEB_ROOT,
  'supabase/migrations/20260511130000_article_ad_eligibility.sql'
);
const SWIFT_PATH = path.join(REPO_ROOT, 'VerityPost/VerityPost/HomeView.swift');

/**
 * web TS — SENSITIVITY_TAGS = [ { id: 'tragedy', label: '…', blocking: true }, … ]
 * Returns the set of ids where `blocking: true`.
 */
async function readTsBlockingTags() {
  const src = await readFile(TS_PATH, 'utf8');
  const arrMatch = src.match(/SENSITIVITY_TAGS\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);
  if (!arrMatch) throw new Error(`Could not locate SENSITIVITY_TAGS array in ${TS_PATH}`);
  const body = arrMatch[1];
  const re = /\{\s*id:\s*['"]([a-z0-9_]+)['"][^}]*blocking:\s*(true|false)[^}]*\}/g;
  const tags = new Set();
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m[2] === 'true') tags.add(m[1]);
  }
  if (tags.size === 0) throw new Error(`Parsed zero blocking tags from ${TS_PATH}`);
  return tags;
}

/**
 * Postgres RPC — `IF v_sensitivity_tags && ARRAY[ 'tragedy', … ]::text[] THEN`
 */
async function readSqlBlockingTags() {
  const src = await readFile(SQL_PATH, 'utf8');
  const block = src.match(
    /v_sensitivity_tags\s*&&\s*ARRAY\s*\[([\s\S]*?)\]\s*::\s*text\s*\[\s*\]/
  );
  if (!block) throw new Error(`Could not locate v_sensitivity_tags ARRAY[...] in ${SQL_PATH}`);
  const tags = new Set();
  const re = /'([a-z0-9_]+)'/g;
  let m;
  while ((m = re.exec(block[1])) !== null) tags.add(m[1]);
  if (tags.size === 0) throw new Error(`Parsed zero blocking tags from ${SQL_PATH}`);
  return tags;
}

/**
 * iOS Swift — `private static let blockingSensitivityTags: Set<String> = [ "tragedy", … ]`
 */
async function readSwiftBlockingTags() {
  const src = await readFile(SWIFT_PATH, 'utf8');
  const block = src.match(
    /blockingSensitivityTags\s*:\s*Set<String>\s*=\s*\[([\s\S]*?)\]/
  );
  if (!block) throw new Error(`Could not locate blockingSensitivityTags Set in ${SWIFT_PATH}`);
  const tags = new Set();
  const re = /"([a-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(block[1])) !== null) tags.add(m[1]);
  if (tags.size === 0) throw new Error(`Parsed zero blocking tags from ${SWIFT_PATH}`);
  return tags;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function fmtSet(s) {
  return Array.from(s).sort().join(', ');
}

function reportDrift(label, missing, extra) {
  const lines = [];
  if (missing.size > 0) lines.push(`  ${label}: missing ${fmtSet(missing)}`);
  if (extra.size > 0) lines.push(`  ${label}: has extra ${fmtSet(extra)}`);
  return lines;
}

async function main() {
  let ts, sql, swift;
  try {
    [ts, sql, swift] = await Promise.all([
      readTsBlockingTags(),
      readSqlBlockingTags(),
      readSwiftBlockingTags(),
    ]);
  } catch (err) {
    console.error(`[check-sensitivity-tags] parse failure: ${err.message}`);
    console.error(
      '  If a declaration shape changed in one of the three sources, ' +
        'update the regex in this script.'
    );
    process.exit(2);
  }

  // Canonical = the TS source (where the labels also live). The other two
  // are followers.
  const drift = [];
  if (!setsEqual(ts, sql)) {
    const missing = new Set([...ts].filter((t) => !sql.has(t)));
    const extra = new Set([...sql].filter((t) => !ts.has(t)));
    drift.push(...reportDrift('serve_ad RPC (sql)', missing, extra));
  }
  if (!setsEqual(ts, swift)) {
    const missing = new Set([...ts].filter((t) => !swift.has(t)));
    const extra = new Set([...swift].filter((t) => !ts.has(t)));
    drift.push(...reportDrift('iOS HomeView.swift', missing, extra));
  }

  if (drift.length === 0) {
    console.log(
      `[check-sensitivity-tags] OK — ${ts.size} blocking tag(s) consistent ` +
        `across web TS, serve_ad RPC, and iOS Swift: ${fmtSet(ts)}`
    );
    process.exit(0);
  }

  console.error('[check-sensitivity-tags] DRIFT DETECTED');
  console.error(`  Canonical (web TS): ${fmtSet(ts)}`);
  drift.forEach((line) => console.error(line));
  console.error('');
  console.error(
    '  Fix: align the diverging file(s) to the canonical TS list, OR if the TS ' +
      'file is the one that drifted, edit all three together.'
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(`[check-sensitivity-tags] unexpected: ${err.message}`);
  process.exit(2);
});
