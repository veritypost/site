/**
 * Session A — POST /api/admin/articles/new-draft
 *
 * Backend for the "+ New article" Newsroom button (Decision 19). Two
 * modes:
 *
 *   manual:      pick audience + URL → empty draft articles row →
 *                response carries article_id + slug; client lands on
 *                /<slug> in admin edit mode (Session C wires the page).
 *
 *   ai_generate: pick audience + paste source URLs (or a topic). The
 *                route delegates to /api/admin/pipeline/generate with
 *                mode='standalone' so the synthetic-cluster, lock,
 *                audience-state, and cost-reservation flows all match
 *                the cluster-card path.
 *
 * Permission: dual-check (articles.edit, admin.articles.create) so the
 *   existing admin role works without re-grant during the bridge;
 *   Session E drops the legacy half.
 *
 * URL collisions: system-side first save silently appends -2, -3, …
 *   via findFreeSlug (Decision 20). Manual edits later go through the
 *   article-page editor and use the 409 path; that endpoint lives in
 *   Session C.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { findFreeSlug } from '@/lib/pipeline/slug-collide';
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
    slug: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({
    mode: z.literal('ai_generate'),
    audience: z.enum(['adult', 'tweens', 'kids']),
    source_urls: z.array(SourceUrlSchema).min(1).max(10),
    topic: z.string().trim().max(500).optional(),
    provider: z.enum(['anthropic', 'openai']).optional(),
    model: z.string().min(3).max(100).optional(),
  }),
]);

// 6-char lowercase-alphanumeric suffix. Self-contained — avoids pulling
// nanoid into the deps for one callsite.
function slugSuffix(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
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
        .eq('is_active', true)
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

    const candidateRaw =
      input.slug && input.slug.length > 0 ? input.slug : `untitled-${slugSuffix()}`;
    const candidate = candidateRaw.toLowerCase();
    if (!SLUG_SAFE.test(candidate)) {
      return NextResponse.json(
        { error: 'slug must be lowercase alphanumerics or hyphens (start/end alphanumeric)' },
        { status: 422 }
      );
    }
    const finalSlug = await findFreeSlug(service, candidate);
    const { data: row, error: insertErr } = await service
      .from('articles')
      .insert({
        title: 'Untitled draft',
        slug: finalSlug,
        body: '',
        status: 'draft',
        age_band: audienceBand,
        author_id: actorId,
        category_id: categoryId,
        is_ai_generated: false,
      })
      .select('id, slug')
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
        newValue: { mode: 'manual', audience: input.audience, slug: row.slug },
      });
    } catch (auditErr) {
      console.error('[admin.articles.new-draft.audit]', auditErr);
    }

    return NextResponse.json({ ok: true, article_id: row.id, slug: row.slug });
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
