// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { withApnsSession, resolveApnsEnv, sendPushToUser } from '@/lib/apns';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { getPlanLimitValue } from '@/lib/plans';
import { isExpertThreadsEnabled } from '@/lib/expertConfig';

const CRON_NAME = 'send-push';

// EXPERT_THREADS Wave 3 — alert types added to the cron's recognised-push set.
// Existing types (breaking_news, replies, etc.) keep their default-on behaviour.
// These two are default-OFF per spec §2 "Mentionability vs push" and §10 Wave 3:
// absence of an alert_preferences row drops the push (no implicit opt-in).
// Quiet-hours-deferred mentions are silently dropped for now; Wave 3.5 adds the
// digest bundler. Both gated on the master kill switch via expertConfig.
const EXPERT_THREADS_ALERT_TYPES = new Set(['mention', 'category_arrival']);

// Urgent-priority allowlist + (priority,type) → APNs opts mapping lives in
// web/src/lib/pushPriority.js so it can be unit-tested in isolation and so
// other dispatch paths (if any future ones are added) can share enforcement.
import { resolvePushPriority } from '@/lib/pushPriority';

// Auth: CRON_SECRET via verifyCronAuth. Fail-closed 403.
// Push delivery worker. Mirrors /api/cron/send-emails in shape: picks
// unsent notifications whose channel isn't 'in_app' (quiet hours force
// channel='in_app' via create_notification), honours per-user
// alert_preferences.channel_push, and dispatches via APNs.
// APNs-only by design — see CLAUDE.md kill-switch row 11.
//
// Schedule: */5 * * * * (drain-until-empty per call; respects 25s
// wall-clock budget under the Vercel function 60s ceiling).
// See Sessions/Session_02_Cron.md S2-A34 for design rationale and
// OWNER-ANSWERS Q4.2 for the locked decision.
//
// Drain semantics:
//   - claim_push_batch (FOR UPDATE SKIP LOCKED) lets overlapping ticks
//     claim disjoint rows; if a tick is still draining when the next
//     */5 fires, the new tick picks up where the prior left off.
//   - WALL_CLOCK_BUDGET_MS leaves headroom for the cron-log heartbeat
//     to write the final webhook_log row before Vercel kills the
//     function.
//   - MAX_ITERATIONS is a hard safety bound against pathological
//     queues; in practice the wall-clock budget triggers first.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// L3: BATCH_SIZE lowered from 500 → 200 to stay under PostgREST's 8 KB URL
// cap on the downstream `.in('user_id', userIds)` queries. A batch of 500
// distinct UUID v4 strings joins to ~18 KB which PostgREST silently truncates
// mid-list (no 414 error surfaced to the client), so the alert_preferences /
// user_push_tokens / users lookups returned partial data for most batches.
// 200 keeps the URL under ~7.4 KB with a comfortable headroom. maxDuration=60
// still clears a full fan-out in multiple cron ticks.
const BATCH_SIZE = 200;
// H19 — CONCURRENCY lowered from 50 → 20. At 50, a breaking-news
// fan-out could pin ~83% of Supabase's default 60-connection pool for
// the batch duration, starving other routes (reader fetches, RPC
// calls from other crons). 20 is a safer ceiling that still drains
// a 200-row batch in seconds via APNs pipelining. Bump back up once
// we upsize the Supabase pool or confirm the prior saturation
// headroom via live observation.
const CONCURRENCY = 20;

// A34 drain budget. Vercel function ceiling is 60s (maxDuration); we
// leave 5s of margin so the cron-log wrapper has time to write the
// terminal webhook_log row before the platform kills the invocation.
const WALL_CLOCK_BUDGET_MS = 25_000;
// Hard safety bound. With BATCH_SIZE=200 this caps a single call at
// 200k rows regardless of wall clock — but in practice the budget hits
// first under any realistic queue depth.
const MAX_ITERATIONS = 1000;

async function run(request) {
  // Cron auth — must verify CRON_SECRET header before any work; see
  // web/src/lib/cronAuth.js for the timing-safe compare history.
  if (!verifyCronAuth(request).ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await logCronHeartbeat(CRON_NAME, 'start');

  if (!process.env.APNS_AUTH_KEY) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: 'APNS_AUTH_KEY not configured' });
    return NextResponse.json({ error: 'APNS_AUTH_KEY not configured', sent: 0 }, { status: 503 });
  }

  // EXPERT_THREADS Wave 3 — read the kill switch ONCE per cron tick (mitigation
  // §2 #12, read-once-per-TXN). Threaded into every drainOneBatch call so an
  // admin flipping the switch mid-drain can't produce inconsistent dispatch.
  // When false, mention + category_arrival rows are dropped as unrecognised
  // AND the Wave 3.5 quiet-hours-end digest pass is skipped entirely.
  const expertThreadsEnabled = await isExpertThreadsEnabled().catch((err) => {
    console.error('[cron.send-push] isExpertThreadsEnabled lookup failed', err);
    return false;
  });

  // EXPERT_THREADS Wave 3.5 — quiet-hours-end digest. Runs once per tick,
  // before the regular drain loop, so digest sends don't compete with the
  // 25 s wall-clock budget for ordinary push delivery. Failures here log + skip
  // and never fail the cron tick (other notifications must still drain).
  const digestSummary = { candidates: 0, dispatched: 0, empty: 0, failed: 0 };
  if (expertThreadsEnabled) {
    try {
      const r = await runQuietHoursDigest();
      Object.assign(digestSummary, r);
    } catch (err) {
      console.error('[cron.send-push] quiet-hours digest pass failed', err);
      digestSummary.failed += 1;
    }
  }

  // Drain loop — keep claiming + dispatching until the queue is empty
  // (drained=true), the wall-clock budget is exhausted, or we hit the
  // hard iteration ceiling. Per OWNER-ANSWERS Q4.2 (drain-until-empty,
  // not Vercel Pro upgrade).
  const t0 = Date.now();
  const totals = { iterations: 0, batch: 0, sent: 0, skipped: 0, failed: 0, invalidated: 0 };
  let drained = false;

  try {
    while (totals.iterations < MAX_ITERATIONS) {
      if (Date.now() - t0 > WALL_CLOCK_BUDGET_MS) break;

      const result = await drainOneBatch({ expertThreadsEnabled });
      totals.iterations += 1;
      totals.batch += result.batch;
      totals.sent += result.sent;
      totals.skipped += result.skipped;
      totals.failed += result.failed;
      totals.invalidated += result.invalidated;

      if (result.fatal) {
        await logCronHeartbeat(CRON_NAME, 'error', {
          error: result.fatal,
          stage: result.stage,
          iterations: totals.iterations,
          ...totals,
        });
        return NextResponse.json({ error: result.fatal, ...totals }, { status: 500 });
      }
      if (result.batch === 0) {
        drained = true;
        break;
      }
    }
  } catch (err) {
    await logCronHeartbeat(CRON_NAME, 'error', { error: err?.message || String(err), ...totals });
    throw err;
  }

  await logCronHeartbeat(CRON_NAME, 'end', {
    ...totals,
    drained,
    duration_ms: Date.now() - t0,
    digest: digestSummary,
  });
  return NextResponse.json({
    ...totals,
    drained,
    duration_ms: Date.now() - t0,
    digest: digestSummary,
  });
}

// drainOneBatch — claim one BATCH_SIZE-sized window, dispatch via APNs,
// ack each row's terminal status. Returns counts + drained-batch flag.
// `fatal` indicates a structural failure that should abort the whole
// drain loop (e.g., RPC missing, claim error). A 0-batch result means
// the queue is empty for this tick.
//
// `expertThreadsEnabled` is the snapshot read once at run() entry (EXPERT_THREADS
// Wave 3). When false, notifications with type ∈ EXPERT_THREADS_ALERT_TYPES are
// dropped as unrecognised so pre-launch surfaces never fire push.
async function drainOneBatch({ expertThreadsEnabled = false } = {}) {
  const service = createServiceClient();

  // L19: atomic claim via claim_push_batch RPC (FOR UPDATE SKIP LOCKED so
  // overlapping cron invocations see disjoint rows). Replaces the prior
  // SELECT-then-mark pattern, which let two concurrent runs pick up the
  // same 200 notifications and dispatch each one twice. Stale claims
  // (>5 min old) are reclaimable inside the RPC so a crashed prior run
  // doesn't permanently lock notifications.
  const { data: queued, error: loadErr } = await service.rpc('claim_push_batch', {
    p_limit: BATCH_SIZE,
  });
  if (loadErr) {
    console.error('[cron.send-push] claim failed:', loadErr);
    return {
      batch: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      invalidated: 0,
      fatal: `claim_push_batch failed: ${loadErr.message}`,
      stage: 'claim',
    };
  }
  if (!queued?.length) {
    return { batch: 0, sent: 0, skipped: 0, failed: 0, invalidated: 0 };
  }

  const userIds = [...new Set(queued.map((n) => n.user_id))];
  // H15 — Promise.allSettled matches send-emails' resilience pattern.
  // Prior Promise.all aborted the entire setup on a single DB failure,
  // leaving the claimed notifications stuck in 'processing' state
  // until the stale-claim reclaim window (5 min) freed them. Any of
  // these three fetches can now fail independently; the batch
  // continues with empty results for the failed queries (downstream
  // logic already tolerates empty prefs / tokens / planRows via the
  // per-notification checks). Log each failure loudly so ops notices.
  const [prefsRes, tokensRes, plansRes] = await Promise.allSettled([
    service
      .from('alert_preferences')
      .select('user_id, alert_type, channel_push, is_enabled, quiet_hours_start, quiet_hours_end')
      .in('user_id', userIds),
    service
      .from('user_push_tokens')
      .select('id, user_id, push_token, environment')
      .in('user_id', userIds)
      .eq('provider', 'apns')
      .is('invalidated_at', null),
    service.from('users').select('id, timezone, plans(tier)').in('id', userIds),
  ]);
  if (prefsRes.status === 'rejected')
    console.error('[cron.send-push] alert_preferences fetch failed', prefsRes.reason);
  if (tokensRes.status === 'rejected')
    console.error('[cron.send-push] user_push_tokens fetch failed', tokensRes.reason);
  if (plansRes.status === 'rejected')
    console.error('[cron.send-push] users fetch failed', plansRes.reason);
  const prefs = prefsRes.status === 'fulfilled' ? (prefsRes.value.data ?? []) : [];
  const tokens = tokensRes.status === 'fulfilled' ? (tokensRes.value.data ?? []) : [];
  const planRows = plansRes.status === 'fulfilled' ? (plansRes.value.data ?? []) : [];

  // Bug 98: belt-and-suspenders quiet-hours check. The create_notification RPC
  // already forces channel='in_app' when quiet hours are active — but it evaluates
  // against server-UTC time. At dispatch we re-check in the caller's timezone so a
  // direct notifications INSERT or a timezone-aware preference is still honoured.
  const userTz = Object.fromEntries((planRows || []).map((u) => [u.id, u.timezone || 'UTC']));
  function nowMinutesInTz(tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      }).formatToParts(new Date());
      const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
      const m = Number(parts.find((p) => p.type === 'minute')?.value || 0);
      return h * 60 + m;
    } catch {
      return null;
    }
  }
  function parseTimeToMinutes(t) {
    if (!t) return null;
    const [hh, mm] = String(t).split(':');
    return Number(hh) * 60 + Number(mm || 0);
  }
  function insideQuietHours(pref, tz) {
    const s = parseTimeToMinutes(pref.quiet_hours_start);
    const e = parseTimeToMinutes(pref.quiet_hours_end);
    if (s == null || e == null) return false;
    const now = nowMinutesInTz(tz);
    if (now == null) return false;
    return s < e ? now >= s && now < e : now >= s || now < e;
  }

  // D14: free Verified users get a capped number of breaking-news
  // pushes per day. The cap itself is now DB-driven via
  // plan_features.breaking_alerts (limit_value=1, limit_type='per_day'
  // for the free plan). T-016 — the `>= 1` hardcode lower down reads
  // this resolved value.
  const freeUserIds = (planRows || [])
    .filter((u) => !u.plans?.tier || u.plans.tier === 'free')
    .map((u) => u.id);
  const freePlanId =
    (planRows || []).find((u) => u.plan_id && u.plans?.tier === 'free')?.plan_id ?? null;
  const breakingDailyCap =
    (await getPlanLimitValue(service, freePlanId, 'breaking_alerts', 1)) ?? 1;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const breakingSentToday = {};
  if (freeUserIds.length > 0) {
    const { data: sentRows } = await service
      .from('notifications')
      .select('user_id')
      .in('user_id', freeUserIds)
      .eq('type', 'breaking_news')
      .eq('push_sent', true)
      .gte('push_sent_at', todayStart.toISOString());
    for (const r of sentRows || []) {
      breakingSentToday[r.user_id] = (breakingSentToday[r.user_id] || 0) + 1;
    }
  }
  const freeSet = new Set(freeUserIds);

  const prefKey = (uid, type) => `${uid}:${type}`;
  const prefsMap = Object.fromEntries(
    (prefs || []).map((p) => [prefKey(p.user_id, p.alert_type), p])
  );

  const tokensByUser = {};
  for (const t of tokens || []) {
    (tokensByUser[t.user_id] ||= []).push(t);
  }

  let sent = 0,
    skipped = 0,
    failed = 0,
    invalidated = 0;

  // First pass: dispositions that don't need APNs at all.
  const needsDispatch = [];
  for (const n of queued) {
    const pref = prefsMap[prefKey(n.user_id, n.type)];

    // EXPERT_THREADS Wave 3 — `mention` and `category_arrival` are gated on
    // the master kill switch AND default-OFF opt-in (spec §2 Mentionability vs
    // push, §10 Wave 3). Existing alert types keep their default-on behaviour
    // below; this branch only runs for the new types.
    if (EXPERT_THREADS_ALERT_TYPES.has(n.type)) {
      if (!expertThreadsEnabled) {
        await service
          .from('notifications')
          .update({
            push_sent: true,
            push_sent_at: new Date().toISOString(),
            metadata: {
              ...(n.metadata || {}),
              push_skip_reason: 'expert_threads_disabled',
            },
          })
          .eq('id', n.id);
        skipped++;
        continue;
      }
      // Default-off semantics: absence of an alert_preferences row drops the
      // push. (Existing types fall through to dispatch in the same case.)
      if (!pref) {
        await service
          .from('notifications')
          .update({
            push_sent: true,
            push_sent_at: new Date().toISOString(),
            metadata: {
              ...(n.metadata || {}),
              push_skip_reason: 'opted_out_default',
            },
          })
          .eq('id', n.id);
        skipped++;
        continue;
      }
      // pref present — fall through to the existing opted_out + quiet_hours
      // checks below. Wave 3 leaves quiet-hours mentions silently dropped;
      // Wave 3.5 adds the digest bundler.
    }

    if (pref && (pref.is_enabled === false || pref.channel_push === false)) {
      await service
        .from('notifications')
        .update({
          push_sent: true,
          push_sent_at: new Date().toISOString(),
          metadata: { ...(n.metadata || {}), push_skip_reason: 'opted_out' },
        })
        .eq('id', n.id);
      skipped++;
      continue;
    }
    // Belt-and-suspenders quiet-hours check at dispatch time.
    if (pref && insideQuietHours(pref, userTz[n.user_id])) {
      await service
        .from('notifications')
        .update({
          channel: 'in_app',
          push_sent: true,
          push_sent_at: new Date().toISOString(),
          metadata: { ...(n.metadata || {}), push_skip_reason: 'quiet_hours' },
        })
        .eq('id', n.id);
      skipped++;
      continue;
    }
    // D14 cap: free users get a capped number of breaking-news pushes
    // per day (DB-driven — see plan_features.breaking_alerts and the
    // `breakingDailyCap` resolution above). Each drop bumps
    // breakingSentToday so same-batch duplicates also honour the cap.
    if (n.type === 'breaking_news' && freeSet.has(n.user_id)) {
      const already = breakingSentToday[n.user_id] || 0;
      if (already >= breakingDailyCap) {
        await service
          .from('notifications')
          .update({
            channel: 'in_app',
            push_sent: true,
            push_sent_at: new Date().toISOString(),
            metadata: { ...(n.metadata || {}), push_skip_reason: 'breaking_news_daily_cap' },
          })
          .eq('id', n.id);
        skipped++;
        continue;
      }
      breakingSentToday[n.user_id] = already + 1;
    }
    const userTokens = tokensByUser[n.user_id];
    if (!userTokens?.length) {
      await service
        .from('notifications')
        .update({
          push_sent: true,
          push_sent_at: new Date().toISOString(),
          metadata: { ...(n.metadata || {}), push_skip_reason: 'no_token' },
        })
        .eq('id', n.id);
      skipped++;
      continue;
    }
    needsDispatch.push({ n, tokens: userTokens });
  }

  if (!needsDispatch.length) {
    return { batch: queued.length, sent, skipped, failed, invalidated };
  }

  // Flatten to (notification, token) pairs and partition by the token's
  // APNs environment. A user with mixed TestFlight-sandbox + App Store-
  // production devices shows up in both buckets; each bucket runs against
  // its own HTTP/2 session so sandbox tokens don't silently get BadDeviceToken
  // on the production host (and vice versa).
  const dispatchByEnv = { production: [], sandbox: [] };
  for (const { n, tokens: userTokens } of needsDispatch) {
    for (const t of userTokens) {
      const env = resolveApnsEnv(t.environment);
      dispatchByEnv[env].push({ n, token: t });
    }
  }

  const deliveredNotifIds = new Set();

  for (const env of ['production', 'sandbox']) {
    const pairs = dispatchByEnv[env];
    if (!pairs.length) continue;

    await withApnsSession(
      async ({ send }) => {
        let i = 0;
        while (i < pairs.length) {
          const wave = pairs.slice(i, i + CONCURRENCY);
          i += CONCURRENCY;

          await Promise.all(
            wave.map(async ({ n, token: t }) => {
              // Map the row's priority + type to APNs apns-priority +
              // aps interruption-level. Urgent is allowlist-gated; rows that
              // ask for urgent with a non-allowlisted type are downgraded
              // here and a warning is logged so abuse is visible in cron logs.
              const { priority, interruptionLevel, downgraded } = resolvePushPriority(
                n.priority,
                n.type
              );
              if (downgraded) {
                console.warn(
                  '[cron.send-push] downgraded urgent push: type not on URGENT_TYPE_ALLOWLIST',
                  { notification_id: n.id, type: n.type }
                );
              }
              const r = await send(
                t.push_token,
                {
                  title: n.title,
                  body: n.body,
                  url: n.action_url,
                  metadata: n.metadata || undefined,
                },
                { priority, interruptionLevel }
              );
              await service.from('push_receipts').insert({
                notification_id: n.id,
                user_id: n.user_id,
                provider: 'apns',
                push_token: t.push_token,
                status: r.ok ? 'delivered' : 'failed',
                provider_message_id: r.apnsId || null,
                error_code: r.reason || null,
                error_message: r.ok ? null : r.reason || `http ${r.status}`,
                token_invalidated: !!r.invalidated,
                sent_at: new Date().toISOString(),
              });
              if (r.ok) deliveredNotifIds.add(n.id);
              if (r.invalidated) {
                invalidated += 1;
                await service.rpc('invalidate_user_push_token', { p_token: t.push_token });
              }
            })
          );
        }
      },
      { environment: env }
    );
  }

  // Mark every notification push_sent once both envs have drained. A
  // non-retryable failure on any device shouldn't cause replay.
  for (const { n } of needsDispatch) {
    await service
      .from('notifications')
      .update({
        push_sent: true,
        push_sent_at: new Date().toISOString(),
      })
      .eq('id', n.id);
    if (deliveredNotifIds.has(n.id)) sent += 1;
    else failed += 1;
  }

  return { batch: queued.length, sent, skipped, failed, invalidated };
}

// EXPERT_THREADS Wave 3.5 — quiet-hours-end digest dispatcher.
//
// Spec: EXPERT_THREADS.md §2 "Mentionability vs push" → "Quiet-hours-end
// digest"; §2 adversary mitigation #11 (multi-region cron dedup); §10 Wave 3.5.
//
// Flow per tick:
//   1. Call claim_quiet_hours_digest_candidates(p_limit) — the RPC takes
//      FOR UPDATE SKIP LOCKED on candidate expert_applications rows, bumps
//      last_quiet_hours_digest_at = now() inside the same TXN (so a racing
//      multi-region instance reading next sees the fresh timestamp and skips
//      this user), and returns (user_id, deferred_count).
//   2. For each candidate with deferred_count > 0, dispatch ONE summary push.
//      deferred_count = 0 candidates: no push, but the RPC already bumped
//      last_quiet_hours_digest_at so they don't re-scan next tick.
//   3. Per spec §2 line 103, the digest covers MENTIONS only — not
//      category-arrival broadcasts. The RPC already filters notifications.type
//      to 'mention' so the count returned here is mentions-only.
//
// Push body composition: we pluralize ("1 new mention from quiet hours."
// vs "N new mentions from quiet hours.") and deep-link to /notifications, the
// existing inbox surface (Wave 4b lays in a richer mentions surface; until
// then /notifications is the right destination). Title kept short for APNs
// notification-shade legibility.
//
// Note on receipt/notifications-row plumbing: this digest does NOT write a new
// notifications row — the underlying mention notifications already exist in
// the user's inbox (channel='in_app'). This is a transient summary push only.
// sendPushToUser writes push_receipts rows for delivery telemetry.
//
// Failure semantics: per-user dispatch errors are caught + logged + counted;
// they don't roll back the RPC's last_quiet_hours_digest_at bump. A failed
// dispatch means that user misses this digest, but the next quiet-hours window
// will produce a fresh one. This matches the claim_push_batch tradeoff: dedup
// safety > at-least-once delivery for digests.
async function runQuietHoursDigest() {
  const service = createServiceClient();
  const summary = { candidates: 0, dispatched: 0, empty: 0, failed: 0 };

  // 100 is generous — live expert count is in the single digits today; bump if
  // expert population grows past a few hundred per cron tick. RPC caps p_limit
  // at 1000.
  const { data: candidates, error } = await service.rpc(
    'claim_quiet_hours_digest_candidates',
    { p_limit: 100 }
  );
  if (error) {
    console.error('[cron.send-push] claim_quiet_hours_digest_candidates failed', error);
    summary.failed += 1;
    return summary;
  }
  if (!candidates?.length) return summary;

  summary.candidates = candidates.length;

  for (const c of candidates) {
    const count = Number(c.deferred_count ?? 0);
    if (!Number.isFinite(count) || count <= 0) {
      // Candidate's quiet hours ended but nothing accumulated. The RPC already
      // bumped their last_quiet_hours_digest_at so we won't re-scan them next
      // tick.
      summary.empty += 1;
      continue;
    }

    const noun = count === 1 ? 'mention' : 'mentions';
    const notification = {
      title: 'Quiet hours ended',
      body: `You have ${count} new ${noun} from quiet hours.`,
      url: '/notifications',
      metadata: {
        kind: 'quiet_hours_digest',
        deferred_count: count,
      },
    };

    try {
      await sendPushToUser(service, c.user_id, notification, {
        // notificationId is intentionally null — this digest doesn't have a
        // backing notifications row (see header note); push_receipts will store
        // the delivery telemetry without an FK back to notifications.
        notificationId: null,
      });
      summary.dispatched += 1;
    } catch (err) {
      console.error('[cron.send-push] digest dispatch failed', {
        user_id: c.user_id,
        message: err?.message || String(err),
      });
      summary.failed += 1;
    }
  }

  return summary;
}

export const GET = withCronLog('send-push', run);
export const POST = withCronLog('send-push', run);
