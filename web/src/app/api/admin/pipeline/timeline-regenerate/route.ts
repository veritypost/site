/**
 * POST /api/admin/pipeline/timeline-regenerate
 *
 * Manual timeline regeneration for a saved article. Re-runs the timeline
 * extraction LLM step against the article body, replaces the story's
 * type='event' rows with a fresh set, and leaves the type='article' anchor
 * row alone (it links the article into the story timeline and is owned by
 * the persist step).
 *
 * Permission: admin.pipeline.run_generate (same gate as the full pipeline).
 *
 * Atomicity note: we insert new event rows BEFORE deleting old events. If
 * the insert fails, the prior timeline remains intact. If the delete fails
 * after the insert, the timeline ends up with both sets (degraded but
 * recoverable). The type='article' anchor row is never touched.
 */

import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  TIMELINE_PROMPT,
  KIDS_TIMELINE_PROMPT,
  TWEENS_TIMELINE_PROMPT,
} from '@/lib/pipeline/editorial-guide';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SONNET_MODEL = 'claude-sonnet-4-6';

const RequestSchema = z.object({
  article_id: z.string().uuid(),
});

const TimelineEventSchema = z.object({
  event_label: z.string().min(1).max(500),
  event_date: z.string().min(1).max(50),
  event_body: z.string().max(2000).optional().nullable(),
});

const TimelinePayloadSchema = z.union([
  z.array(TimelineEventSchema),
  z.object({ events: z.array(TimelineEventSchema) }),
]);

function extractJSON<T = unknown>(text: string): T {
  if (!text) throw new Error('Empty LLM response');
  const t = text.trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    /* fall through */
  }
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      /* fall through */
    }
  }
  const objMatch = t.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as T;
    } catch {
      /* fall through */
    }
  }
  throw new Error(`Malformed JSON in LLM output (first 500 chars): ${t.slice(0, 500)}`);
}

function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey: key });
}

export async function POST(req: Request) {
  let actor: { id: string };
  try {
    const cookieClient = createClient();
    actor = await requirePermission('admin.pipeline.run_generate', cookieClient);
  } catch (err) {
    return permissionError(err);
  }

  let input: { article_id: string };
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'article_id (UUID) required' }, { status: 400 });
    }
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.pipeline.regenerate.timeline:${actor.id}`,
    policyKey: 'admin.pipeline.regenerate.timeline',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { data: article, error: articleErr } = await service
    .from('articles')
    .select('id, body, title, story_id, is_kids_safe, age_band')
    .eq('id', input.article_id)
    .single();

  if (articleErr || !article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }
  const articleAny = article as unknown as Record<string, unknown>;
  const storyId = articleAny.story_id as string | null;
  const body = articleAny.body as string | null;
  if (!storyId) {
    return NextResponse.json({ error: 'Article has no story — cannot regenerate timeline' }, { status: 422 });
  }
  if (!body || body.trim().length < 50) {
    return NextResponse.json({ error: 'Article body too short to extract timeline' }, { status: 422 });
  }

  const isKid = Boolean(articleAny.is_kids_safe);
  const ageBand = articleAny.age_band as string | null;
  const timelineSystem = isKid
    ? ageBand === 'tweens'
      ? TWEENS_TIMELINE_PROMPT
      : KIDS_TIMELINE_PROMPT
    : TIMELINE_PROMPT;

  const userTurn = `ARTICLE TITLE: ${articleAny.title ?? ''}\n\nARTICLE BODY:\n${body}\n\nReturn the timeline events JSON.`;

  const anthropic = getAnthropicClient();

  let llmText: string;
  try {
    const res = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 3000,
      system: timelineSystem,
      messages: [{ role: 'user', content: userTurn }],
    });
    llmText = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  } catch (err) {
    console.error('[timeline-regenerate] LLM step failed', err);
    return NextResponse.json({ error: 'Timeline extraction failed. Try again.' }, { status: 500 });
  }

  let events: Array<{ event_label: string; event_date: string; event_body: string | null }>;
  try {
    const parsed = TimelinePayloadSchema.parse(extractJSON(llmText));
    const raw = Array.isArray(parsed) ? parsed : parsed.events;
    events = raw.map((e) => ({
      event_label: e.event_label.trim(),
      event_date: e.event_date.trim(),
      event_body: e.event_body?.trim() || null,
    }));
  } catch (err) {
    console.error('[timeline-regenerate] parse failed', err);
    return NextResponse.json({ error: 'Timeline extraction returned malformed JSON. Try again.' }, { status: 422 });
  }

  // Snapshot existing event ids — used for delete-after-insert. Only
  // type='event' rows are touched; the type='article' anchor (created by
  // the persist step) is preserved.
  const { data: oldEventRows } = await service
    .from('timelines')
    .select('id')
    .eq('story_id', storyId)
    .eq('type', 'event');
  const oldIds = (oldEventRows ?? []).map((r) => (r as unknown as { id: string }).id);

  const insertRows = events.map((e, i) => ({
    story_id: storyId,
    type: 'event',
    event_label: e.event_label,
    event_date: e.event_date,
    event_body: e.event_body,
    sort_order: i,
  }));

  if (insertRows.length > 0) {
    const { error: insertErr } = await service.from('timelines').insert(insertRows as never);
    if (insertErr) {
      console.error('[timeline-regenerate] insert failed', insertErr);
      return NextResponse.json({ error: 'Failed to save regenerated timeline' }, { status: 500 });
    }
  }

  if (oldIds.length > 0) {
    const { error: deleteErr } = await service.from('timelines').delete().in('id', oldIds);
    if (deleteErr) {
      console.error('[timeline-regenerate] delete-old failed (degraded state — admin must clean up)', deleteErr);
    }
  }

  await recordAdminAction({
    action: 'timeline.regenerate',
    targetTable: 'timelines',
    targetId: storyId,
    newValue: {
      article_id: input.article_id,
      story_id: storyId,
      count: insertRows.length,
      replaced_count: oldIds.length,
      actor_id: actor.id,
    },
  });

  return NextResponse.json({ ok: true, count: insertRows.length });
}
