/**
 * POST /api/admin/articles/new-draft — backend for the "+ New article"
 * newsroom button.
 *
 *   manual:      audience + operator-typed slug → empty stories+articles
 *                rows. Slug is required and must be unique against
 *                stories.slug; collisions return 409 so the operator
 *                picks another. No AI is invoked.
 *
 *   ai_generate: audience + source URLs (and optional topic seed).
 *                Delegates to /api/admin/pipeline/generate with
 *                mode='standalone' so the synthetic-cluster, lock,
 *                audience-state, and cost-reservation flows match the
 *                cluster-card path. The pipeline owns slug generation
 *                + dedupe.
 *
 * Permission: dual-check (articles.edit, admin.articles.create).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { pipelineLog } from '@/lib/pipeline/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SourceUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (u) => {
      try {
        const parsed = new URL(u);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'must be a valid http(s) URL' }
  );

const RequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('manual'),
    audience: z.enum(['adult', 'tweens', 'kids']),
    slug: z.string().trim().min(1).max(120),
  }),
  z.object({
    mode: z.literal('ai_generate'),
    audience: z.enum(['adult', 'tweens', 'kids']),
    source_urls: z.array(SourceUrlSchema).min(1).max(20),
    topic: z.string().trim().max(500).optional(),
    provider: z.enum(['anthropic', 'openai']).optional(),
    model: z.string().min(3).max(100).optional(),
  }),
]);

const SLUG_SAFE = /^[a-z0-9][a-z0-9-]{0,118}[a-z0-9]$|^[a-z0-9]$/;

function audienceToBand(audience: 'adult' | 'tweens' | 'kids'): 'adult' | 'tweens' | 'kids' {
  return audience;
}

function audienceToLegacy(audience: 'adult' | 'tweens' | 'kids'): 'adult' | 'kid' {
  return audience === 'adult' ? 'adult' : 'kid';
}

export async function POST(req: Request) {
  // 1. Permission gate — bridge to existing admin role via dual-check.
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission(['articles.edit', 'admin.articles.create'], supabase);
  } catch (err) {
    return permissionError(err);
  }
  const actorId = actor.id as string;

  // 2. Rate limit — share the cluster-mutate bucket, conservative.
  const service = createServiceClient();
  const rl = await checkRateLimit(service, {
    key: `admin_cluster_mutate:${actorId}`,
    policyKey: 'admin_cluster_mutate',
    max: 60,
    windowSec: 60,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  // 3. Body parse.
  let parsed;
  try {
    const body = await req.json();
    parsed = RequestSchema.safeParse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed || !parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const input = parsed.data;
  const audienceBand = audienceToBand(input.audience);

  if (input.mode === 'manual') {
    // 4a. Manual draft — pick a default category (articles.category_id is
    //     NOT NULL), generate a default slug, free-slug it, INSERT.
    //     Session C's article-page editor lets the admin change the
    //     category before publish.
    const { data: catSetting } = await service
      .from('settings')
      .select('value')
      .eq('key', 'pipeline.default_category_id')
      .maybeSingle();
    let categoryId: string | null = catSetting?.value ?? null;
    if (!categoryId) {
      const { data: firstCat } = await service
        .from('categories')
        .select('id')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
        .limit(1)
        .maybeSingle();
      categoryId = firstCat?.id ?? null;
    }
    if (!categoryId) {
      return NextResponse.json(
        { error: 'No active category available — seed at least one category before creating drafts' },
        { status: 500 }
      );
    }

    const finalSlug = input.slug.toLowerCase();
    if (!SLUG_SAFE.test(finalSlug)) {
      return NextResponse.json(
        { error: 'slug must be lowercase alphanumerics or hyphens (start/end alphanumeric)' },
        { status: 422 }
      );
    }
    const { data: collision, error: collisionErr } = await service
      .from('stories')
      .select('id')
      .eq('slug', finalSlug)
      .maybeSingle();
    if (collisionErr) {
      console.error('[admin.articles.new-draft.manual.slug_check]', collisionErr.message);
      return NextResponse.json({ error: 'Could not validate slug' }, { status: 500 });
    }
    if (collision) {
      return NextResponse.json(
        { error: 'Slug already taken — pick another' },
        { status: 409 }
      );
    }

    // Slice 05: create story first (slug lives on stories), then article.
    const { data: newStory, error: storyInsertErr } = await service
      .from('stories')
      .insert({ slug: finalSlug, title: 'Untitled draft' })
      .select('id')
      .single();
    if (storyInsertErr || !newStory) {
      console.error('[admin.articles.new-draft.manual.story]', storyInsertErr?.message);
      return NextResponse.json({ error: 'Could not create story' }, { status: 500 });
    }

    // Wave D — manual drafts intentionally leave subcategory_id NULL. The
    // editor (StoryEditor / KidsStoryEditor) renders a Subcategory dropdown
    // populated from the chosen category's children and the operator picks
    // before publish. Picking a default sub here would be wrong: the
    // operator hasn't yet typed a headline/body, so we have nothing to pick
    // from. The articles/save PATCH and PUT paths both accept subcategory_id
    // updates so the value lands before the article goes public.
    const { data: row, error: insertErr } = await service
      .from('articles')
      .insert({
        story_id: newStory.id,
        title: 'Untitled draft',
        body: '',
        status: 'draft',
        age_band: audienceBand,
        author_id: actorId,
        category_id: categoryId,
        is_ai_generated: false,
      })
      .select('id')
      .single();
    if (insertErr || !row) {
      console.error('[admin.articles.new-draft.manual]', insertErr?.message);
      return NextResponse.json({ error: 'Could not create draft' }, { status: 500 });
    }

    try {
      await recordAdminAction({
        action: 'article.new_draft',
        targetTable: 'articles',
        targetId: row.id as string,
        newValue: { mode: 'manual', audience: input.audience, slug: finalSlug },
      });
    } catch (auditErr) {
      console.error('[admin.articles.new-draft.audit]', auditErr);
    }

    return NextResponse.json({ ok: true, article_id: row.id, slug: finalSlug });
  }

  // 4b. AI-generate-from-scratch — delegate to pipeline/generate with
  //     mode='standalone'. The generate route synthesizes the cluster,
  //     reserves cost, runs the chain, persists, and returns the
  //     article_id + slug. Cookie pass-through preserves the admin
  //     session so generate's own permission gate resolves against the
  //     same actor (M1 dual-check from Session A's bridge).
  const generateUrl = new URL('/api/admin/pipeline/generate', req.url);
  const cookieHeader = req.headers.get('cookie') ?? '';
  const audienceLegacy = audienceToLegacy(input.audience);
  const ageBandForRequest: 'kids' | 'tweens' | undefined =
    input.audience === 'kids' ? 'kids' : input.audience === 'tweens' ? 'tweens' : undefined;

  const generateBody: Record<string, unknown> = {
    audience: audienceLegacy,
    mode: 'standalone',
    source_urls: input.source_urls,
    provider: input.provider ?? 'anthropic',
    model: input.model ?? 'claude-sonnet-4-6',
  };
  if (ageBandForRequest) generateBody.age_band = ageBandForRequest;
  if (input.topic) generateBody.freeform_instructions = `Topic seed: ${input.topic}`;

  let response: Response;
  try {
    response = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify(generateBody),
    });
  } catch (fetchErr) {
    pipelineLog.error('admin.articles.new-draft.dispatch_failed', {
      step: 'standalone_generate',
      error_type: 'unknown',
      error_message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
    });
    return NextResponse.json({ error: 'Generate dispatch failed' }, { status: 500 });
  }

  let bodyJson: Record<string, unknown> = {};
  try {
    bodyJson = (await response.json()) as Record<string, unknown>;
  } catch {
    bodyJson = {};
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: bodyJson.error ?? 'Generate failed', ...bodyJson },
      { status: response.status }
    );
  }

  try {
    await recordAdminAction({
      action: 'article.new_draft',
      targetTable: 'articles',
      targetId: (bodyJson.article_id as string | undefined) ?? null,
      newValue: {
        mode: 'ai_generate',
        audience: input.audience,
        run_id: bodyJson.run_id ?? null,
        source_urls: input.source_urls,
      },
    });
  } catch (auditErr) {
    console.error('[admin.articles.new-draft.audit]', auditErr);
  }

  return NextResponse.json({
    ok: true,
    article_id: bodyJson.article_id ?? null,
    slug: bodyJson.slug ?? null,
    run_id: bodyJson.run_id ?? null,
  });
}
