import 'server-only';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';
import { callModel } from '@/lib/pipeline/call-model';
import { captureException } from '@/lib/observability';

const CRON_NAME = 'score-comments';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// Stable lock id for this cron. hashtext('cron_score_comments') as a JS constant
// so we don't need a DB call to compute it.
const SCORE_COMMENTS_LOCK_ID = 1_506_720_048; // hashtext('cron_score_comments')

async function run(request: Request) {
  if (!verifyCronAuth(request).ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await logCronHeartbeat(CRON_NAME, 'start');

  try {
    const service = createServiceClient();

    // Advisory lock — prevent concurrent runs (Vercel retries / manual triggers).
    // Cast to unknown first because the generated RPC type union doesn't include
    // the advisory lock wrappers yet (migration pending owner apply).
    const { data: lockRows } = await (service.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null }>)('pg_try_advisory_lock', { key: SCORE_COMMENTS_LOCK_ID });
    const lockAcquired = lockRows === true;
    if (!lockAcquired) {
      await logCronHeartbeat(CRON_NAME, 'end', { skipped: 'concurrent-run' });
      return NextResponse.json({ skipped: 'concurrent-run' });
    }

    // Read settings
    const { data: settingsRows } = await service
      .from('settings')
      .select('key, value')
      .in('key', ['ai_comment_toxicity_flag_threshold', 'ai_comment_score_window_hours']);

    const settings = Object.fromEntries(
      (settingsRows || []).map((r: { key: string; value: string }) => [r.key, parseFloat(r.value)])
    );
    const threshold = settings['ai_comment_toxicity_flag_threshold'] ?? 0.7;
    const windowHours = settings['ai_comment_score_window_hours'] ?? 24;

    const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

    // Per-tick budget: max 50 comments OR max 30s wall time to keep cron within maxDuration.
    const TICK_MAX_COMMENTS = 50;
    const TICK_MAX_MS = 30_000;
    const CHUNK_SIZE = 5; // parallel calls per batch

    const { data: commentsRaw } = await (service
      .from('comments')
      .select('id, body, article_id, ai_score_attempts')
      .is('ai_toxicity_score', null)
      .eq('status', 'visible')
      .is('deleted_at', null)
      .gte('created_at', since)
      .lt('ai_score_attempts', 3)
      .limit(TICK_MAX_COMMENTS) as unknown as Promise<{ data: { id: string; body: string | null; article_id: string | null; ai_score_attempts: number }[] | null }>);
    const comments = commentsRaw;

    if (!comments || comments.length === 0) {
      await logCronHeartbeat(CRON_NAME, 'end', { scored: 0, flagged: 0 });
      return NextResponse.json({ scored: 0, flagged: 0, ran_at: new Date().toISOString() });
    }

    const runId = crypto.randomUUID();
    let scored = 0;
    let flagged = 0;
    // BugList #6 follow-on — Sentry quota guard. An Anthropic outage
    // could otherwise emit 50 (TICK_MAX_COMMENTS) × 12 ticks/hr × 24h
    // = 14.4k events/day from this cron alone. Cap at 5/run.
    const SENTRY_CAP = 5;
    let sentryEmitted = 0;
    const captureCapped = async (err: unknown, ctx: Record<string, unknown>) => {
      if (sentryEmitted >= SENTRY_CAP) return;
      sentryEmitted += 1;
      await captureException(err, { ...ctx, suppressed_after: SENTRY_CAP });
    };

    const MODERATION_SYSTEM =
      'You are a content moderation system. Respond ONLY with valid JSON and nothing else. Format: {"toxicity":0.0,"sentiment":"neutral","tag":"clean"} where toxicity is 0.0-1.0, sentiment is positive|neutral|negative, tag is spam|harassment|misinformation|graphic|clean.';

    async function scoreOne(comment: { id: string; body: string | null; article_id: string | null; ai_score_attempts: number }, signal: AbortSignal): Promise<void> {
      if (!comment.body?.trim()) return;
      try {
        const res = await callModel({
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001',
          system: MODERATION_SYSTEM,
          prompt: `Score this comment:\n${comment.body.slice(0, 2000)}`,
          max_tokens: 256,
          pipeline_run_id: runId,
          step_name: 'score_comment',
          article_id: comment.article_id,
          audience: 'adult',
          signal,
        });

        let parsed: { toxicity?: number; sentiment?: string; tag?: string } = {};
        try {
          parsed = JSON.parse(res.text.trim());
        } catch (err) {
          // BugList #6 — surface in Sentry; raw console-only meant a
          // model returning malformed JSON across an outage window
          // looked identical to "no comments to score."
          console.error('[score-comments] json-parse failed on comment', comment.id, err);
          await captureCapped(err, { cron: CRON_NAME, comment_id: comment.id, phase: 'json_parse' });
          return;
        }

        const toxicity =
          typeof parsed.toxicity === 'number'
            ? Math.min(1, Math.max(0, parsed.toxicity))
            : null;
        const sentiment = ['positive', 'neutral', 'negative'].includes(
          parsed.sentiment ?? ''
        )
          ? parsed.sentiment
          : null;
        const tag = ['spam', 'harassment', 'misinformation', 'graphic', 'clean'].includes(
          parsed.tag ?? ''
        )
          ? parsed.tag
          : null;

        await service
          .from('comments')
          .update({
            ai_toxicity_score: toxicity,
            ai_sentiment: sentiment,
            ai_tag: tag,
            ai_tag_confidence: tag ? 0.9 : null,
          })
          .eq('id', comment.id);

        scored++;

        if (toxicity !== null && toxicity >= threshold) {
          await service.from('moderation_actions').insert({
            comment_id: comment.id,
            moderator_id: null,
            action: 'ai_flagged',
            reason: `AI toxicity score: ${toxicity.toFixed(2)}`,
          });
          flagged++;
        }
      } catch (err) {
        // BugList #6 — same reason as above. Bedrock/OpenAI outage
        // visibility used to require a human to notice the queue
        // wasn't draining.
        console.error('[score-comments] error on comment', comment.id, err);
        await captureCapped(err, { cron: CRON_NAME, comment_id: comment.id, phase: 'score' });
        await (service
          .from('comments')
          .update({ ai_score_attempts: comment.ai_score_attempts + 1 } as never)
          .eq('id', comment.id));
      }
    }

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), TICK_MAX_MS);

    const eligibleComments = (comments as { id: string; body: string | null; article_id: string | null; ai_score_attempts: number }[]);
    try {
      for (let i = 0; i < eligibleComments.length; i += CHUNK_SIZE) {
        if (abortController.signal.aborted) break;
        const chunk = eligibleComments.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map((c) => scoreOne(c, abortController.signal)));
      }
    } finally {
      clearTimeout(timeoutHandle);
    }

    await logCronHeartbeat(CRON_NAME, 'end', { scored, flagged });
    const rpcUnlock = service.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>;
    await rpcUnlock('pg_advisory_unlock', { key: SCORE_COMMENTS_LOCK_ID });
    return NextResponse.json({ scored, flagged, ran_at: new Date().toISOString() });
  } catch (err) {
    await logCronHeartbeat(CRON_NAME, 'error', {
      error: (err as Error)?.message || String(err),
    });
    const service2 = createServiceClient();
    const rpcUnlock2 = service2.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>;
    await rpcUnlock2('pg_advisory_unlock', { key: SCORE_COMMENTS_LOCK_ID });
    throw err;
  }
}

export const GET = withCronLog(CRON_NAME, run);
export const POST = withCronLog(CRON_NAME, run);
