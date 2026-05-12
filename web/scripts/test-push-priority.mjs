#!/usr/bin/env node
/**
 * Unit test for resolvePushPriority — the (priority, type) → APNs opts
 * mapper used by the send-push cron. Run:
 *
 *   node web/scripts/test-push-priority.mjs
 *
 * Exits 0 on pass, 1 on first failed assertion (with a clear message).
 * No external test harness — the send-push route doesn't have one yet and
 * this mapper is small enough that a tiny assert script is the right scale.
 */
import { resolvePushPriority, URGENT_TYPE_ALLOWLIST } from '../src/lib/pushPriority.js';

let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log('  ok  -', msg);
  } else {
    console.error('  FAIL -', msg);
    failed += 1;
  }
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${msg}  (got ${a}, want ${e})`);
}

console.log('resolvePushPriority:');

// 1. urgent + allowlisted type → priority 10, time-sensitive, not downgraded.
for (const type of URGENT_TYPE_ALLOWLIST) {
  eq(
    resolvePushPriority('urgent', type),
    { priority: 10, interruptionLevel: 'time-sensitive', downgraded: false },
    `urgent + allowlisted type='${type}' → priority 10 / time-sensitive`
  );
}

// 2. urgent + non-allowlisted type → downgraded to priority 5 / active.
const NON_ALLOWLISTED = [
  'comment_reply',
  'breaking_news',
  'mention',
  'category_arrival',
  'follow',
  '',
  'totally_made_up_type',
];
for (const type of NON_ALLOWLISTED) {
  eq(
    resolvePushPriority('urgent', type),
    { priority: 5, interruptionLevel: 'active', downgraded: true },
    `urgent + non-allowlisted type='${type}' → downgraded`
  );
}

// 3. normal/null/anything-not-urgent → priority 5 / active, not downgraded
//    (even when type is on the allowlist — the urgent ride-along must come
//    from the row's priority column, not the type alone).
for (const priority of ['normal', null, undefined, 'low', 'high', '', 'URGENT' /* wrong case */]) {
  eq(
    resolvePushPriority(priority, 'magic_link_code'),
    { priority: 5, interruptionLevel: 'active', downgraded: false },
    `priority='${String(priority)}' (not the literal 'urgent') + allowlisted type → priority 5 / active`
  );
}

// 4. Empty/unknown type with non-urgent priority → priority 5 / active.
eq(
  resolvePushPriority('normal', 'whatever'),
  { priority: 5, interruptionLevel: 'active', downgraded: false },
  'normal + unknown type → priority 5 / active'
);

// 5. Allowlist sanity — spec contract: exactly these five types.
const expected = [
  'magic_link_code',
  'new_device_signin',
  'password_changed',
  'account_suspended',
  'parental_consent_required',
];
eq(
  [...URGENT_TYPE_ALLOWLIST].sort(),
  expected.sort(),
  'URGENT_TYPE_ALLOWLIST matches the spec contract'
);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log('\nAll assertions passed.');
