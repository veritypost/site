import 'server-only';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';

const CRON_NAME = 'score-comments';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

async function run(request: Request) {
  if (!verifyCronAuth(request).ok)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await logCronHeartbeat(CRON_NAME, 'start');

  try {
    const service = createServiceClient();

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

    const { data: comments } = await service
      .from('comments')
      .select('id, body')
      .is('ai_toxicity_score', null)
      .eq('status', 'visible')
      .is('deleted_at', null)
      .gte('created_at', since)
      .limit(100);

    if (!comments || comments.length === 0) {
      await logCronHeartbeat(CRON_NAME, 'end', { scored: 0, flagged: 0 });
      return NextResponse.json({ scored: 0, flagged: 0, ran_at: new Date().toISOString() });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let scored = 0;
    let flagged = 0;

    for (const comment of comments as { id: string; body: string | null }[]) {
      if (!comment.body?.trim()) continue;
      try {
        const msg = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          system:
            'You are a content moderation system. Respond ONLY with valid JSON and nothing else. Format: {"toxicity":0.0,"sentiment":"neutral","tag":"clean"} where toxicity is 0.0-1.0, sentiment is positive|neutral|negative, tag is spam|harassment|misinformation|graphic|clean.',
          messages: [
            {
              role: 'user',
              content: `Score this comment:\n${comment.body.slice(0, 2000)}`,
            },
          ],
        });

        const text =
          msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
        let parsed: { toxicity?: number; sentiment?: string; tag?: string } = {};
        try {
          parsed = JSON.parse(text);
        } catch {
          continue;
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
        console.error('[score-comments] error on comment', comment.id, err);
      }
    }

    await logCronHeartbeat(CRON_NAME, 'end', { scored, flagged });
    return NextResponse.json({ scored, flagged, ran_at: new Date().toISOString() });
  } catch (err) {
    await logCronHeartbeat(CRON_NAME, 'error', {
      error: (err as Error)?.message || String(err),
    });
    throw err;
  }
}

export const GET = withCronLog(CRON_NAME, run);
export const POST = withCronLog(CRON_NAME, run);
