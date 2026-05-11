#!/usr/bin/env node
/**
 * Audit ad placement names: catch drift between code references and a
 * checked-in DB snapshot. Designed to run pre-commit / pre-merge so the
 * kind of drift Wave 1 cleaned up after the fact gets caught before merge.
 *
 * Walks three roots — web/src, VerityPost/, VerityPostKids/ — and greps
 * each .ts/.tsx/.js/.jsx/.swift file for placement-name string literals
 * in known shapes (see PATTERNS below). Compares the collected set against
 * `web/scripts/ad-placements.snapshot.json`.
 *
 * Reports two diffs:
 *   - code refs not in DB at all     → will fail to serve
 *   - active DB rows not in code     → orphan seed rows / wasted config
 *
 * Inactive DB rows are tolerated as code refs (the row exists, the placement
 * is intentionally parked) but do NOT count against the active-orphan check.
 *
 * Usage:
 *   node scripts/audit-ad-placements.mjs           # audit (default)
 *   node scripts/audit-ad-placements.mjs --regen   # regen snapshot (stub)
 *   npm run audit:ads                              # via package.json
 *
 * Exit codes:
 *   0 — no drift
 *   1 — drift found
 *   2 — snapshot missing or unreadable
 *
 * Snapshot regeneration: today the snapshot is refreshed by hand via the
 * Supabase MCP (`SELECT name, is_active, page, position FROM ad_placements
 * ORDER BY name;`) and pasted into `ad-placements.snapshot.json`. The
 * `--regen` flag is reserved for a future service-role wiring; right now
 * it prints the SQL and exits.
 *
 * Repo style note: web/scripts/ uses `.mjs` Node scripts (see
 * `check-crons.mjs`). The task brief suggested `.ts` + tsx, but tsx is
 * not a dev dependency. Sticking with .mjs to match the cron checker.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WEB_ROOT, '..');
const SNAPSHOT = path.join(__dirname, 'ad-placements.snapshot.json');

const ROOTS = [
  path.join(REPO_ROOT, 'web/src'),
  path.join(REPO_ROOT, 'VerityPost'),
  path.join(REPO_ROOT, 'VerityPostKids'),
];

const FILE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.swift']);

// Directories to skip while walking each root. Migrations / SQL / scripts
// reference placement names for seeding, not at runtime; counting them as
// "code refs" would mask real drift.
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  'coverage',
  'scripts', // self
  'supabase', // migrations + edge fns
  '__tests__',
  'test',
  'tests',
  'Pods',
  'DerivedData',
  '.build',
]);

// Files to skip even if extension matches.
const SKIP_FILE_BASENAMES = new Set([
  'database.ts', // generated supabase types contain placement_id/_name noise
]);

// Patterns that count as a runtime placement reference. Each pattern's
// first capture group must be the placement name. Accept both " and '
// quote styles (TS/JS both legal; Swift uses " only).
//
//  - JSX prop:                <Ad placement="foo" .../>            (web)
//  - JSON-ish key:            "placement": "foo"                   (web/iOS)
//  - Swift labeled arg / TS:  placement: "foo"  /  placement: 'foo'
//
// Variable forms like  placement={p}  /  placement={placement}  are
// intentionally skipped — those resolve at runtime from a registry, and
// the registry literals (e.g. ['home_discovery_1', ...]) are caught by
// the placement-context-gated bare-literal pass below.
const QUOTED_PATTERNS = [
  /placement\s*=\s*["']([a-z][a-z0-9_]+)["']/g, // JSX
  /["']placement["']\s*:\s*["']([a-z][a-z0-9_]+)["']/g, // JSON-ish
  /\bplacement\s*:\s*["']([a-z][a-z0-9_]+)["']/g, // Swift labeled arg + TS object key
];

// data-placement="..." HTML attribute (used by DiscoveryFeed for hydration).
const DATA_PLACEMENT_PATTERN = /data-placement\s*=\s*["']([a-z][a-z0-9_]+)["']/g;

// Bare string-literal placement keys inside arrays/object literals
// (registry lists, admin/home stacking order). Tightly scoped: requires
// the literal to share a window with the word "placement" (see scanFile).
const PLACEMENT_NAME_LITERAL = /['"]((?:home|article|category|mobile)_[a-z0-9_]+)['"]/g;
const BARE_LITERAL_CONTEXT_WINDOW = 3; // lines

// Lines/contexts to ignore (comments-only matches still count — placement
// names mentioned in comments often signal a real ref nearby, but we still
// want to flag mismatches).
function isLikelyComment(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/**
 * @typedef {{ file: string, line: number, name: string }} Ref
 */

/** @returns {Promise<Ref[]>} */
async function collectRefs() {
  /** @type {Ref[]} */
  const refs = [];
  for (const root of ROOTS) {
    let exists = false;
    try {
      const s = await stat(root);
      exists = s.isDirectory();
    } catch {
      // root missing — skip silently
    }
    if (!exists) continue;
    await walk(root, refs);
  }
  return refs;
}

/**
 * @param {string} dir
 * @param {Ref[]} refs
 */
async function walk(dir, refs) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      await walk(full, refs);
    } else if (entry.isFile()) {
      if (SKIP_FILE_BASENAMES.has(entry.name)) continue;
      const ext = path.extname(entry.name);
      if (!FILE_EXTS.has(ext)) continue;
      await scanFile(full, refs);
    }
  }
}

/**
 * @param {string} file
 * @param {Ref[]} refs
 */
async function scanFile(file, refs) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return;
  }
  const lines = text.split('\n');

  // First pass: structured patterns (JSX prop / "placement": "..." / Swift
  // labeled / data-placement). These are unambiguous and apply everywhere.
  const structuredPatterns = [...QUOTED_PATTERNS, DATA_PLACEMENT_PATTERN];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pat of structuredPatterns) {
      pat.lastIndex = 0;
      let m;
      while ((m = pat.exec(line)) !== null) {
        const name = m[1];
        // Skip SwiftUI's `placement: .topBarLeading` etc. — those use a
        // leading dot and won't match our quoted regexes, but belt-and-
        // suspenders: drop obvious SwiftUI tokens defensively.
        if (isSwiftUIPlacementToken(name)) continue;
        refs.push({ file, line: i + 1, name });
      }
    }
  }

  // Second pass: bare placement-name literals inside arrays/objects
  // (registry lists like HOME_PLACEMENT_ORDER, BAKED_IN_PLACEMENTS,
  // PLACEMENT_NAMES, etc.). Gating: walk lines stateful — open a
  // "placement scope" when we see a declarator/comment that names
  // placements, close it when we hit `]` or `}` at the start of a line
  // (allowing leading whitespace) or a blank line outside a literal.
  //
  // This avoids the false positives we'd get from a fixed ±N-line
  // window: column names (article_id, category_id), table names
  // (home_slots, home_layouts), discriminated-union tags (article_cell),
  // and Reason enum values (article_ineligible, article_sensitive) all
  // share the placement-name shape and live near the word "placement" in
  // unrelated ways.
  let inScope = false;
  let scopeBracketDepth = 0;
  // Open scope when a declarator-shaped line names placements AND ends
  // with an open bracket/brace. Require `=` before the opener so that
  // function-call shorthand args like `URLSearchParams({ placement })`
  // — which sit next to a real placement variable but don't introduce
  // a placement *list* — don't open the scope.
  // Match "placement"/"PLACEMENT" as a token OR as an embedded word in a
  // declarator name (HOME_PLACEMENT_ORDER, SLOT_KIND_TO_PLACEMENT,
  // BAKED_IN_PLACEMENTS). Then require `=` and an opener at end of line.
  const SCOPE_OPENER = /(?:placement|PLACEMENT)[^=]*=\s*[^=]*[\[{]\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inScope) {
      // Open scope if this line both mentions "placement" (any case) AND
      // ends with an open bracket/brace (array or object literal start).
      // Examples that open scope:
      //   const HOME_PLACEMENT_ORDER: Record<string, number> = {
      //   const BAKED_IN_PLACEMENTS: readonly string[] = [
      //   const PLACEMENTS = [
      //   const PLACEMENT_NAMES = [
      if (SCOPE_OPENER.test(line)) {
        inScope = true;
        scopeBracketDepth = 1;
      }
      continue;
    }
    // In scope — count brackets to know when the literal closes.
    for (const ch of line) {
      if (ch === '[' || ch === '{') scopeBracketDepth++;
      else if (ch === ']' || ch === '}') scopeBracketDepth--;
    }
    if (!isLikelyComment(line)) {
      PLACEMENT_NAME_LITERAL.lastIndex = 0;
      let m;
      while ((m = PLACEMENT_NAME_LITERAL.exec(line)) !== null) {
        const name = m[1];
        if (isSwiftUIPlacementToken(name)) continue;
        refs.push({ file, line: i + 1, name });
      }
    }
    if (scopeBracketDepth <= 0) {
      inScope = false;
      scopeBracketDepth = 0;
    }
  }
}

function isSwiftUIPlacementToken(name) {
  // SwiftUI ToolbarItem placement values that look like our regex bait.
  // Our quoted patterns wouldn't capture `.topBarLeading` (no quotes), so
  // this is purely defensive against pattern drift.
  return /^(topBar|navigationBar|bottomBar|cancellation|confirmation|keyboard|primaryAction)/.test(
    name,
  );
}

async function readSnapshot() {
  let raw;
  try {
    raw = await readFile(SNAPSHOT, 'utf8');
  } catch (err) {
    console.error(`[audit-ad-placements] FAIL — cannot read ${SNAPSHOT}: ${err.message}`);
    process.exit(2);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[audit-ad-placements] FAIL — cannot parse ${SNAPSHOT}: ${err.message}`);
    process.exit(2);
  }
  if (!Array.isArray(parsed?.placements)) {
    console.error(`[audit-ad-placements] FAIL — snapshot missing placements[]`);
    process.exit(2);
  }
  return parsed;
}

function shortPath(p) {
  return path.relative(REPO_ROOT, p);
}

async function audit() {
  const snap = await readSnapshot();
  /** @type {Set<string>} */
  const dbAll = new Set();
  /** @type {Set<string>} */
  const dbActive = new Set();
  for (const row of snap.placements) {
    if (!row?.name) continue;
    dbAll.add(row.name);
    if (row.is_active) dbActive.add(row.name);
  }

  const refs = await collectRefs();
  /** @type {Map<string, Ref[]>} */
  const byName = new Map();
  for (const r of refs) {
    const list = byName.get(r.name);
    if (list) list.push(r);
    else byName.set(r.name, [r]);
  }
  const codeNames = new Set(byName.keys());

  /** @type {string[]} */
  const missingInDb = [];
  for (const n of codeNames) if (!dbAll.has(n)) missingInDb.push(n);
  missingInDb.sort();

  /** @type {string[]} */
  const orphanActive = [];
  for (const n of dbActive) if (!codeNames.has(n)) orphanActive.push(n);
  orphanActive.sort();

  if (missingInDb.length === 0 && orphanActive.length === 0) {
    console.log(
      `[audit-ad-placements] OK — ${codeNames.size} placement name(s) in code, ${dbAll.size} in DB (${dbActive.size} active); no drift`,
    );
    process.exit(0);
  }

  if (missingInDb.length > 0) {
    console.error(
      `[audit-ad-placements] FAIL — ${missingInDb.length} placement(s) referenced in code but NOT in DB (will fail to serve):`,
    );
    for (const name of missingInDb) {
      console.error(`  • ${name}`);
      for (const ref of byName.get(name) || []) {
        console.error(`      ${shortPath(ref.file)}:${ref.line}`);
      }
    }
  }
  if (orphanActive.length > 0) {
    console.error(
      `[audit-ad-placements] FAIL — ${orphanActive.length} active DB placement(s) with NO code reference (orphan / wasted seed):`,
    );
    for (const name of orphanActive) {
      console.error(`  • ${name}`);
    }
  }
  process.exit(1);
}

async function regen() {
  // Service-role wiring isn't here yet. Print the SQL the operator should
  // run via the Supabase MCP (or the SQL editor) and exit. The result goes
  // into web/scripts/ad-placements.snapshot.json with generated_at = today.
  const today = new Date().toISOString().slice(0, 10);
  console.log(
    `[audit-ad-placements] --regen: run this SQL against prod and paste the result into ad-placements.snapshot.json (set generated_at to "${today}"):`,
  );
  console.log('');
  console.log('  SELECT name, is_active, page, position FROM ad_placements ORDER BY name;');
  console.log('');
  console.log(
    `[audit-ad-placements] (a future revision can pull this directly via a SUPABASE_SERVICE_ROLE_KEY env var; intentionally not wired now to avoid stashing creds in scripts.)`,
  );
  process.exit(0);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--regen')) {
    await regen();
    return;
  }
  await audit();
}

main().catch((err) => {
  console.error('[audit-ad-placements] threw:', err?.message || err);
  process.exit(1);
});
