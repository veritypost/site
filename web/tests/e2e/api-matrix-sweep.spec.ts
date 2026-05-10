/**
 * api-matrix-sweep.spec.ts
 *
 * Pressure-test sweep: enumerate every /api/* route on disk, hit each
 * one as anon / free / admin / parent / expert, record 5xx + unexpected
 * cross-role 200s. Output: tests/.matrix-sweep.json (parsed by a triage
 * step, not asserted in-spec).
 *
 * Goal is bug discovery, not regression. The spec records findings;
 * a separate triage pass decides what's real vs noise.
 */

import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join, relative, dirname, resolve } from 'path';

const API_ROOT = resolve(__dirname, '../../src/app/api');
const OUTPUT_PATH = resolve(__dirname, '.matrix-sweep.json');
const SEED_PATH = resolve(__dirname, '.auth/seed.json');

const ROLE_EMAILS = {
  free: 'vp-e2e-seed-free@veritypost.test',
  admin: 'vp-e2e-seed-admin@veritypost.test',
  parent: 'vp-e2e-seed-parent@veritypost.test',
  expert: 'vp-e2e-seed-expert@veritypost.test',
} as const;
const SEED_PASSWORD = 'SeedPass1234!';
type Role = keyof typeof ROLE_EMAILS | 'anon';

interface RouteRecord {
  pattern: string;
  filePath: string;
  methods: string[];
  hasDynamic: boolean;
}

function listRoutes(dir: string): RouteRecord[] {
  const out: RouteRecord[] = [];
  function walk(d: string) {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/^route\.(ts|js)$/.test(name)) continue;
      const src = readFileSync(full, 'utf8');
      const methods: string[] = [];
      for (const m of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']) {
        // Match either `export async function GET` or `export const GET =`
        const re = new RegExp(`export\\s+(?:async\\s+function|const|let|var)\\s+${m}\\b`);
        if (re.test(src)) methods.push(m);
      }
      const rel = relative(API_ROOT, dirname(full));
      const pattern = '/api/' + rel.replace(/\\/g, '/');
      out.push({
        pattern,
        filePath: full,
        methods,
        hasDynamic: pattern.includes('['),
      });
    }
  }
  walk(dir);
  return out;
}

function fillDynamicPath(pattern: string, seed: any): string {
  // Substitute known-good values for common dynamic segments. If we
  // can't fill it sensibly, return null sentinel and skip.
  let p = pattern;
  // [slug] → seeded article slug
  p = p.replace(/\[slug\]/g, 'vp-e2e-seed-article-quiz-test');
  // [id], [uuid], [user_id], [comment_id], [conversation_id], [kid_id]
  // → a syntactically valid UUID; the route will 404 or 403, not 5xx
  p = p.replace(/\[(?:id|uuid|userId|user_id|kidId|kid_id|commentId|comment_id|conversationId|conversation_id|articleId|article_id|notificationId|notification_id|presetId|preset_id|messageId|message_id|reportId|report_id|appealId|appeal_id|sessionId|session_id|tokenId|token_id|placementId|placement_id|unitId|unit_id|campaignId|campaign_id|broadcastId|broadcast_id|categoryId|category_id|requestId|request_id|appId|app_id|paramId|param_id)\]/gi, '00000000-0000-0000-0000-000000000000');
  // [...slug] catch-all → a single segment
  p = p.replace(/\[\.\.\.(?:[^\]]+)\]/g, 'x');
  // Any remaining [...] segment → 'x'
  p = p.replace(/\[[^\]]+\]/g, 'x');
  return p;
}

async function mintToken(email: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const c = createClient(url, anonKey);
  const { data, error } = await c.auth.signInWithPassword({
    email,
    password: SEED_PASSWORD,
  });
  if (error || !data.session?.access_token) {
    throw new Error(`mintToken ${email}: ${error?.message ?? 'no session'}`);
  }
  return data.session.access_token;
}

interface CallResult {
  role: Role;
  pattern: string;
  filledPath: string;
  method: string;
  status: number;
  ms: number;
  bodyExcerpt: string; // first 240 chars
  bodyLen: number;
}

async function call(
  ctx: APIRequestContext,
  method: string,
  path: string,
  payload: unknown
): Promise<{ status: number; ms: number; bodyExcerpt: string; bodyLen: number }> {
  const t0 = Date.now();
  let res;
  try {
    if (method === 'GET' || method === 'DELETE' || method === 'OPTIONS') {
      res = await ctx.fetch(path, { method, timeout: 8000 });
    } else {
      res = await ctx.fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        data: payload,
        timeout: 8000,
      });
    }
  } catch (e: any) {
    return {
      status: -1,
      ms: Date.now() - t0,
      bodyExcerpt: `FETCH_ERROR: ${e.message ?? e}`,
      bodyLen: 0,
    };
  }
  const ms = Date.now() - t0;
  const text = await res.text().catch(() => '');
  return {
    status: res.status(),
    ms,
    bodyExcerpt: text.slice(0, 240),
    bodyLen: text.length,
  };
}

test.describe.configure({ mode: 'serial', timeout: 600_000 });

test('matrix sweep: every /api/* route × {anon, free, admin, parent, expert}', async ({
  baseURL,
}) => {
  test.setTimeout(600_000);

  const routes = listRoutes(API_ROOT);
  console.log(`[matrix] discovered ${routes.length} routes`);

  let seed: any = null;
  try {
    seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  } catch {
    // seed not present — globalSetup may not have populated it. Use
    // empty defaults; dynamic-path fills will use UUID placeholders.
    seed = {};
  }

  // Mint tokens once.
  const tokens: Record<Exclude<Role, 'anon'>, string> = {
    free: await mintToken(ROLE_EMAILS.free),
    admin: await mintToken(ROLE_EMAILS.admin),
    parent: await mintToken(ROLE_EMAILS.parent),
    expert: await mintToken(ROLE_EMAILS.expert),
  };

  // Build one request context per role with auth header pre-set.
  const ctxs: Record<Role, APIRequestContext> = {
    anon: await pwRequest.newContext({ baseURL }),
    free: await pwRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${tokens.free}` },
    }),
    admin: await pwRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${tokens.admin}` },
    }),
    parent: await pwRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${tokens.parent}` },
    }),
    expert: await pwRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${tokens.expert}` },
    }),
  };

  const results: CallResult[] = [];
  const roles: Role[] = ['anon', 'free', 'admin', 'parent', 'expert'];

  // Skip routes that are known to be genuinely dangerous to hit blindly
  // even on local dev — Stripe webhook (signature-verifies, not interesting),
  // explicit dev/dev-only stubs.
  const SKIP = new Set<string>([
    '/api/stripe/webhook',
    '/api/csp-report', // already e2e'd, returns 204 anyway
  ]);

  for (const r of routes) {
    if (SKIP.has(r.pattern)) continue;
    const filled = r.hasDynamic ? fillDynamicPath(r.pattern, seed) : r.pattern;
    if (filled.includes('[')) continue; // unfilled dynamic segment — skip
    for (const method of r.methods) {
      for (const role of roles) {
        const payload = method === 'GET' || method === 'DELETE' || method === 'OPTIONS' ? undefined : {};
        const out = await call(ctxs[role], method, filled, payload);
        results.push({
          role,
          pattern: r.pattern,
          filledPath: filled,
          method,
          ...out,
        });
      }
    }
  }

  // Triage flags applied at write time so the JSON is self-describing.
  const flagged = results.filter((r) => {
    // 5xx anywhere is a bug
    if (r.status >= 500) return true;
    // Fetch error
    if (r.status === -1) return true;
    return false;
  });

  // Cross-role analysis: for each (pattern, method), find anomalies.
  type Key = string;
  const byKey = new Map<Key, CallResult[]>();
  for (const r of results) {
    const k = `${r.method} ${r.pattern}`;
    const arr = byKey.get(k) ?? [];
    arr.push(r);
    byKey.set(k, arr);
  }
  const crossRoleAnomalies: Array<{ key: string; reason: string; rows: CallResult[] }> = [];
  for (const [key, rows] of byKey.entries()) {
    const map = new Map<Role, CallResult>();
    for (const r of rows) map.set(r.role, r);
    const anonOK = (map.get('anon')?.status ?? 0) >= 200 && (map.get('anon')?.status ?? 0) < 300;
    const freeOK = (map.get('free')?.status ?? 0) >= 200 && (map.get('free')?.status ?? 0) < 300;
    const adminOK = (map.get('admin')?.status ?? 0) >= 200 && (map.get('admin')?.status ?? 0) < 300;
    // Anon allowed but free not? Weird (probably means JWT validation rejected free harder than no auth).
    if (anonOK && !freeOK && map.get('free')?.status === 401) {
      crossRoleAnomalies.push({ key, reason: 'anon-200-but-free-401 (auth gate inverted?)', rows });
    }
    // Free can hit /api/admin/* and gets 200? Privilege escalation.
    if (key.includes('/api/admin/') && freeOK) {
      crossRoleAnomalies.push({ key, reason: 'FREE-USER-200-on-ADMIN-route', rows });
    }
    // Anon can hit /api/admin/* and gets 200? Even worse.
    if (key.includes('/api/admin/') && anonOK) {
      crossRoleAnomalies.push({ key, reason: 'ANON-200-on-ADMIN-route', rows });
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    routesDiscovered: routes.length,
    callsMade: results.length,
    statusCounts: results.reduce<Record<string, number>>((acc, r) => {
      const bucket = r.status === -1 ? 'fetch_error' : `${Math.floor(r.status / 100)}xx`;
      acc[bucket] = (acc[bucket] ?? 0) + 1;
      return acc;
    }, {}),
    flagged5xx: flagged,
    crossRoleAnomalies,
    allResults: results,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(summary, null, 2));
  console.log(`[matrix] wrote ${OUTPUT_PATH}`);
  console.log(`[matrix] status counts:`, summary.statusCounts);
  console.log(`[matrix] flagged 5xx: ${flagged.length}`);
  console.log(`[matrix] cross-role anomalies: ${crossRoleAnomalies.length}`);

  // Soft assertion — don't fail the spec, we want the JSON file. The
  // triage agent will read it and decide.
  expect(routes.length).toBeGreaterThan(20);
});
