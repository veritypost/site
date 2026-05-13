#!/usr/bin/env node
/**
 * Canonical URL Stage 2 (2026-05-13) — denylist drift guard.
 *
 * The list of top-level path segments that are NEVER article slugs lives
 * in two places that MUST stay in lockstep:
 *
 *   1. VerityPost/VerityPost/VerityPostApp.swift   (ArticleRouter.nonArticlePrefixes)
 *   2. web/public/.well-known/apple-app-site-association   (exclude entries)
 *
 * If they drift, a tap on (say) `https://veritypost.com/admin/foo` will
 * open the iOS app on devices whose AASA still excludes /admin but iOS
 * doesn't (or vice versa), and the in-app slug lookup will resolve a
 * non-article path as an article. This script extracts both lists,
 * normalises them (strips trailing `*` from AASA patterns; strips
 * leading `/`), and asserts equality.
 *
 * Run: `node scripts/check-canonical-url-denylist.mjs` from `web/`
 *      (or `npm run check:canonical-url-denylist` from `web/`).
 *
 * Exit 0 on match, exit 1 with a diff on drift, exit 2 if a parse fails
 * (regex couldn't find one of the lists — usually means the declaration
 * shape was edited and this script needs updating).
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WEB_ROOT, '..');

const SWIFT_PATH = path.join(REPO_ROOT, 'VerityPost/VerityPost/VerityPostApp.swift');
const AASA_PATH = path.join(WEB_ROOT, 'public/.well-known/apple-app-site-association');

/**
 * Extract `nonArticlePrefixes: Set<String> = [ "admin", "api", ... ]`
 * from the Swift file. Returns a Set of bare segments (no leading slash).
 */
async function readSwiftDenylist() {
  const src = await readFile(SWIFT_PATH, 'utf8');
  const block = src.match(
    /nonArticlePrefixes\s*:\s*Set<String>\s*=\s*\[([\s\S]*?)\]/
  );
  if (!block) throw new Error(`Could not locate nonArticlePrefixes Set in ${SWIFT_PATH}`);
  const tokens = new Set();
  const re = /"([a-zA-Z0-9._/-]+)"/g;
  let m;
  while ((m = re.exec(block[1])) !== null) tokens.add(m[1]);
  if (tokens.size === 0) throw new Error(`Parsed zero tokens from ${SWIFT_PATH}`);
  return tokens;
}

/**
 * Extract AASA `components[].exclude=true` entries. Strips leading `/`
 * and trailing `*` so we get bare segments comparable to the Swift Set.
 *
 * Returns a Set with one wildcard sentinel `__MULTISEG__` if the
 * `/*\/*` (multi-segment) exclude is present; ignored when comparing
 * against the Swift list since Swift handles multi-segment via the
 * `segments.count == 1` guard, not via the denylist.
 */
async function readAasaDenylist() {
  const raw = await readFile(AASA_PATH, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`AASA is not valid JSON (${err.message})`);
  }
  const details = parsed?.applinks?.details ?? [];
  if (details.length === 0) throw new Error(`AASA has no applinks.details`);
  const components = details[0]?.components ?? [];
  if (components.length === 0) throw new Error(`AASA details[0] has no components`);

  const tokens = new Set();
  let sawMultiSeg = false;
  let sawCatchAll = false;
  for (const c of components) {
    if (c.exclude !== true) continue;
    let p = String(c['/'] ?? '');
    if (!p.startsWith('/')) continue;
    p = p.slice(1); // drop leading /
    if (p === '*/*') {
      sawMultiSeg = true;
      continue;
    }
    // Drop trailing * (path-prefix wildcard) and trailing /*
    p = p.replace(/\/\*$/, '').replace(/\*$/, '');
    if (p.length === 0) continue;
    // Drop trailing slash if present (e.g. ".well-known/")
    p = p.replace(/\/$/, '');
    tokens.add(p);
  }
  for (const c of components) {
    if (c.exclude === true) continue;
    if (c['/'] === '/*') sawCatchAll = true;
  }
  return { tokens, sawMultiSeg, sawCatchAll };
}

function fmtSet(s) {
  return Array.from(s).sort().join(', ');
}

async function main() {
  let swift, aasa;
  try {
    [swift, aasa] = await Promise.all([readSwiftDenylist(), readAasaDenylist()]);
  } catch (err) {
    console.error(`[check-canonical-url-denylist] parse failure: ${err.message}`);
    console.error(
      '  If a declaration shape changed in one of the two sources, update ' +
        'the regex / JSON parsing in this script.'
    );
    process.exit(2);
  }

  if (!aasa.sawCatchAll) {
    console.error(
      '[check-canonical-url-denylist] AASA is missing the catch-all `"/*": "..."` component. ' +
        'Without it, canonical /{slug} URLs will not trigger Universal Link → app open. ' +
        'Add a non-exclude component with `"/": "/*"` after the excludes.'
    );
    process.exit(1);
  }
  if (!aasa.sawMultiSeg) {
    console.error(
      '[check-canonical-url-denylist] AASA is missing the multi-segment exclude ' +
        '`{ "/": "/*/*", "exclude": true }`. Without it, any /a/b/c URL would match ' +
        'the catch-all and open the iOS app for non-article paths.'
    );
    process.exit(1);
  }

  // Normalise both sets for set comparison.
  const swiftNorm = new Set(Array.from(swift).map((s) => s.replace(/^\//, '')));
  const aasaNorm = aasa.tokens;

  const missingFromAasa = new Set([...swiftNorm].filter((t) => !aasaNorm.has(t)));
  const missingFromSwift = new Set([...aasaNorm].filter((t) => !swiftNorm.has(t)));

  if (missingFromAasa.size === 0 && missingFromSwift.size === 0) {
    console.log(
      `[check-canonical-url-denylist] OK — ${swiftNorm.size} non-article ` +
        `prefix(es) consistent between iOS ArticleRouter.nonArticlePrefixes and AASA excludes.`
    );
    process.exit(0);
  }

  console.error('[check-canonical-url-denylist] DRIFT DETECTED');
  console.error(`  iOS Swift  (ArticleRouter.nonArticlePrefixes): ${swiftNorm.size} entries`);
  console.error(`  AASA file  (exclude components):                ${aasaNorm.size} entries`);
  if (missingFromAasa.size > 0) {
    console.error(`  Missing from AASA (only in Swift): ${fmtSet(missingFromAasa)}`);
  }
  if (missingFromSwift.size > 0) {
    console.error(`  Missing from Swift (only in AASA): ${fmtSet(missingFromSwift)}`);
  }
  console.error('');
  console.error(
    '  Fix: align the diverging file. The two lists serve the same Universal Link ' +
      'routing decision and must contain the same path segments.'
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(`[check-canonical-url-denylist] unexpected: ${err.message}`);
  process.exit(2);
});
