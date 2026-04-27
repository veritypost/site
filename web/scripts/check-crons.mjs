#!/usr/bin/env node
/**
 * T231 — vercel.json ↔ cron route handler integrity check.
 *
 * Reads `web/vercel.json` and `web/src/app/api/cron/<name>/route.{js,ts,tsx,jsx}`
 * and verifies a 1:1 correspondence:
 *
 *   - every `crons[].path` in vercel.json has a matching route handler
 *     on disk; and
 *   - every cron route handler on disk has a vercel.json entry.
 *
 * Exits 0 on match. Exits 1 with a printed diff on mismatch. Designed to
 * be wired into CI / Vercel build step later (`npm run check-crons`);
 * for now it is a standalone tool an operator can run locally.
 *
 * Run: `node scripts/check-crons.mjs` from `web/` (or `npm run check-crons`).
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, '..');
const VERCEL_JSON = path.join(WEB_ROOT, 'vercel.json');
const CRON_DIR = path.join(WEB_ROOT, 'src/app/api/cron');
const ROUTE_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx']);

async function readVercelCronPaths() {
  let raw;
  try {
    raw = await readFile(VERCEL_JSON, 'utf8');
  } catch (err) {
    throw new Error(`Could not read ${VERCEL_JSON}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Could not parse ${VERCEL_JSON}: ${err.message}`);
  }
  const crons = Array.isArray(parsed?.crons) ? parsed.crons : [];
  /** @type {Set<string>} */
  const out = new Set();
  for (const entry of crons) {
    if (entry && typeof entry.path === 'string') {
      out.add(entry.path);
    }
  }
  return out;
}

async function readDiskCronPaths() {
  /** @type {Set<string>} */
  const out = new Set();
  let entries;
  try {
    entries = await readdir(CRON_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out;
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sub = path.join(CRON_DIR, entry.name);
    let files;
    try {
      files = await readdir(sub);
    } catch {
      continue;
    }
    const hasRoute = files.some((f) => {
      const ext = path.extname(f);
      return f.startsWith('route.') && ROUTE_EXTS.has(ext);
    });
    if (hasRoute) {
      out.add(`/api/cron/${entry.name}`);
    } else {
      // Nested dynamic segments aren't expected under cron routes today;
      // emit a debug line if encountered so the audit captures it.
      let nested = false;
      for (const f of files) {
        try {
          const s = await stat(path.join(sub, f));
          if (s.isDirectory()) {
            nested = true;
            break;
          }
        } catch {
          // ignore
        }
      }
      if (nested) {
        console.error(
          `[check-crons] WARN: nested directory under ${entry.name} not parsed; manual inspection required`
        );
      }
    }
  }
  return out;
}

function diff(a, b) {
  /** @type {string[]} */
  const out = [];
  for (const v of a) if (!b.has(v)) out.push(v);
  return out.sort();
}

async function main() {
  const declared = await readVercelCronPaths();
  const onDisk = await readDiskCronPaths();

  const missingHandlers = diff(declared, onDisk);
  const missingScheduled = diff(onDisk, declared);

  if (missingHandlers.length === 0 && missingScheduled.length === 0) {
    console.log(
      `[check-crons] OK — ${declared.size} cron path(s) in vercel.json all match route handlers on disk`
    );
    process.exit(0);
  }

  if (missingHandlers.length > 0) {
    console.error(
      `[check-crons] FAIL — ${missingHandlers.length} cron path(s) in vercel.json have NO route handler:`
    );
    for (const p of missingHandlers) console.error(`  - ${p}`);
  }
  if (missingScheduled.length > 0) {
    console.error(
      `[check-crons] FAIL — ${missingScheduled.length} cron route handler(s) on disk have NO vercel.json entry:`
    );
    for (const p of missingScheduled) console.error(`  - ${p}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('[check-crons] threw:', err?.message || err);
  process.exit(1);
});
