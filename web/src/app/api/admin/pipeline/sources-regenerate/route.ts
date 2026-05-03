/**
 * POST /api/admin/pipeline/sources-regenerate
 *
 * Manual source-list regeneration for a saved article. Re-runs an LLM
 * extraction step against the article body to pull citations (outlet,
 * URL, headline, optional pull-quote), inserts a fresh set, and deletes
 * the prior rows after the insert succeeds.
 *
 * Permission: admin.pipeline.run_generate (same gate as the full pipeline).
 * Does NOT create a pipeline_runs row — this is a targeted admin action.
 *
 * Atomicity note: we insert new rows BEFORE deleting old ones. If the
 * insert fails, the article keeps its existing sources; if the delete
 * fails after insert, the article ends up with both sets (degraded but
 * recoverable — admin can manually clean up). This avoids the failure
 * mode where a bad LLM response leaves the article with zero sources.
 */

import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { checkRateLimit } from '@/lib/rateLimit';
import { callModel } from '@/lib/pipeline/call-model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SONNET_MODEL = 'claude-sonnet-4-6';

const RequestSchema = z.object({
  article_id: z.string().uuid(),
});

const SourceItemSchema = z.object({
  outlet: z.string().min(1).max(200),
  url: z.string().min(1).max(2000),
  headline: z.string().min(1).max(500),
  quote: z.string().max(2000).optional().nullable(),
});

const SourcesPayloadSchema = z.union([
  z.array(SourceItemSchema),
  z.object({ sources: z.array(SourceItemSchema) }),
]);

const SOURCES_SYSTEM_PROMPT = `You extract source citations from a published news article.

Read the article body. Identify every distinct outside source the article cites by name (named publication, named outlet, named report, named official document, named expert with affiliation). For each, return:
- outlet: the publication or organization name as printed (e.g. "Reuters", "the New York Times", "the Department of Defense")
- url: the canonical homepage URL of that outlet if obvious from context, otherwise an empty string
- headline: a short label describing what the outlet was cited for (max 12 words)
- quote: a single direct pull-quote from the article that attributes a fact to this outlet, or empty string if none

Only include sources actually named in the article body. Do NOT invent. Do NOT include the publishing outlet itself (Verity Post). Do NOT duplicate the same outlet twice unless cited for distinct facts.

Return EXACTLY this JSON shape:
{
  "sources": [
    { "outlet": "...", "url": "...", "headline": "...", "quote": "..." }
  ]
}
If the article cites no outside sources, return: { "sources": [] }`;

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
    key: `admin.pipeline.regenerate.sources:${actor.id}`,
    policyKey: 'admin.pipeline.regenerate.sources',
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
    .select('id, body, title')
    .eq('id', input.article_id)
    .single();

  if (articleErr || !article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }
  const body = (article as unknown as Record<string, unknown>).body as string | null;
  if (!body || body.trim().length < 50) {
    return NextResponse.json({ error: 'Article body too short to extract sources' }, { status: 422 });
  }

  const userTurn = `ARTICLE TITLE: ${(article as unknown as Record<string, unknown>).title ?? ''}\n\nARTICLE BODY:\n${body}\n\nReturn the sources JSON.`;

  const runId = crypto.randomUUID();

  let llmText: string;
  try {
    const res = await callModel({
      provider: 'anthropic',
      model: SONNET_MODEL,
      system: SOURCES_SYSTEM_PROMPT,
      prompt: userTurn,
      max_tokens: 2000,
      pipeline_run_id: runId,
      step_name: 'sources',
      article_id: input.article_id,
      audience: 'adult',
    });
    llmText = res.text;
  } catch (err) {
    console.error('[sources-regenerate] LLM step failed', err);
    return NextResponse.json({ error: 'Source extraction failed. Try again.' }, { status: 500 });
  }

  let sources: Array<{ outlet: string; url: string; headline: string; quote?: string | null }>;
  try {
    const parsed = SourcesPayloadSchema.parse(extractJSON(llmText));
    const raw = Array.isArray(parsed) ? parsed : parsed.sources;
    sources = raw.map((s) => ({
      outlet: s.outlet.trim(),
      url: s.url.trim(),
      headline: s.headline.trim(),
      quote: s.quote?.trim() || null,
    }));
  } catch (err) {
    console.error('[sources-regenerate] parse failed', err);
    return NextResponse.json({ error: 'Source extraction returned malformed JSON. Try again.' }, { status: 422 });
  }

  // Snapshot existing source ids — used for delete-after-insert.
  const { data: oldRows } = await service
    .from('sources')
    .select('id')
    .eq('article_id', input.article_id);
  const oldIds = (oldRows ?? []).map((r) => (r as unknown as { id: string }).id);

  // Insert FIRST. If this fails, the existing sources remain intact.
  const insertRows = sources.map((s, i) => ({
    article_id: input.article_id,
    publisher: s.outlet,
    url: s.url,
    title: s.headline,
    quote: s.quote,
    sort_order: i,
  }));

  if (insertRows.length > 0) {
    const { error: insertErr } = await service.from('sources').insert(insertRows as never);
    if (insertErr) {
      console.error('[sources-regenerate] insert failed', insertErr);
      return NextResponse.json({ error: 'Failed to save regenerated sources' }, { status: 500 });
    }
  }

  // Delete old rows after the insert succeeded. If delete fails the
  // article ends up with both sets — degraded but no data loss.
  if (oldIds.length > 0) {
    const { error: deleteErr } = await service.from('sources').delete().in('id', oldIds);
    if (deleteErr) {
      console.error('[sources-regenerate] delete-old failed (degraded state — admin must clean up)', deleteErr);
    }
  }

  await recordAdminAction({
    action: 'sources.regenerate',
    targetTable: 'sources',
    targetId: input.article_id,
    newValue: {
      article_id: input.article_id,
      count: insertRows.length,
      replaced_count: oldIds.length,
      actor_id: actor.id,
    },
  });

  return NextResponse.json({ ok: true, count: insertRows.length });
}
