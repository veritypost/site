/**
 * POST /api/admin/pipeline/quiz-regenerate
 *
 * Manual quiz regeneration for a saved article. Re-runs the quiz +
 * quiz_verification LLM steps against the current article body, soft-deletes
 * the existing questions, and inserts a fresh set.
 *
 * Permission: admin.pipeline.run_generate (same gate as the full pipeline).
 * Does NOT create a pipeline_runs row — this is a targeted admin action, not
 * a full generate run.
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
import {
  QUIZ_PROMPT,
  KIDS_QUIZ_PROMPT,
  TWEENS_QUIZ_PROMPT,
} from '@/lib/pipeline/editorial-guide';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-6';

async function getPerRunCapUsd(service: ReturnType<typeof createServiceClient>): Promise<number> {
  const { data, error } = await service
    .from('settings')
    .select('value')
    .eq('key', 'pipeline.per_run_cost_usd_cap')
    .maybeSingle();
  if (error || !data) return 1.0;
  const n = Number(data.value);
  return Number.isFinite(n) && n > 0 ? n : 1.0;
}

function assertPerRunCap(totalCostUsd: number, capUsd: number): void {
  if (totalCostUsd > capUsd) {
    throw new Error(`[quiz-regenerate] per-run cost cap exceeded: $${totalCostUsd.toFixed(6)} > $${capUsd.toFixed(2)}`);
  }
}

const RequestSchema = z.object({
  article_id: z.string().uuid(),
});

const QuizOptionSchema = z.object({
  text: z.string().min(1),
  is_correct: z.boolean().optional(),
});

const QuizQuestionSchema = z.object({
  question_text: z.string().min(1),
  options: z.array(QuizOptionSchema).min(2).max(6),
  correct_index: z.number().int().min(0).optional(),
  correct_answer: z.number().int().min(0).optional(),
  explanation: z.string().optional(),
  difficulty: z.string().optional(),
  points: z.number().int().optional(),
  section_hint: z.string().optional(),
});

const QuizSchema = z.union([
  z.array(QuizQuestionSchema),
  z.object({ questions: z.array(QuizQuestionSchema) }),
  z.object({ quiz: z.array(QuizQuestionSchema) }),
]);

const QuizVerifySchema = z.object({
  fixes: z.array(
    z.object({
      question_index: z.number().int(),
      correct_answer: z.number().int(),
      reason: z.string().optional(),
    })
  ),
});

function extractJSON<T = unknown>(text: string): T {
  if (!text) throw new Error('Empty LLM response');
  const t = text.trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    // fall through
  }
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // fall through
    }
  }
  const objMatch = t.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as T;
    } catch {
      // fall through
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
    key: `admin.pipeline.regenerate.quiz:${actor.id}`,
    policyKey: 'admin.pipeline.regenerate.quiz',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const perRunCapUsd = await getPerRunCapUsd(service);

  const { data: article, error: articleErr } = await service
    .from('articles')
    .select('id, body, is_kids_safe, age_band')
    .eq('id', input.article_id)
    .single();

  if (articleErr || !article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }
  const body = (article as unknown as Record<string, unknown>).body as string | null;
  if (!body || body.trim().length < 50) {
    return NextResponse.json({ error: 'Article body too short to generate quiz' }, { status: 422 });
  }

  const isKid = Boolean((article as unknown as Record<string, unknown>).is_kids_safe);
  const ageBand = (article as unknown as Record<string, unknown>).age_band as string | null;
  const quizSystem = isKid
    ? ageBand === 'tweens'
      ? TWEENS_QUIZ_PROMPT
      : KIDS_QUIZ_PROMPT
    : QUIZ_PROMPT;

  const quizUser = `ARTICLE BODY:\n${body}\n\nGenerate 5 Quick Check questions as JSON. Return EXACTLY this shape:
{
  "questions": [
    {
      "question_text": "...",
      "options": [
        { "text": "..." },
        { "text": "..." },
        { "text": "..." },
        { "text": "..." }
      ],
      "correct_index": 0,
      "section_hint": "..."
    }
  ]
}
Each option MUST be an object with a "text" field — never a bare string.`;

  const runId = crypto.randomUUID();
  const audience: 'adult' | 'kid' = isKid ? 'kid' : 'adult';

  // Step 1 — Quiz generation
  let quizText: string;
  let totalCostUsd = 0;
  try {
    const res = await callModel({
      provider: 'anthropic',
      model: SONNET_MODEL,
      system: quizSystem,
      prompt: quizUser,
      max_tokens: 2000,
      pipeline_run_id: runId,
      step_name: 'quiz',
      article_id: input.article_id,
      audience,
    });
    quizText = res.text;
    totalCostUsd += res.cost_usd;
    assertPerRunCap(totalCostUsd, perRunCapUsd);
  } catch (err) {
    console.error('[quiz-regenerate] quiz step failed', err);
    return NextResponse.json({ error: 'Quiz generation failed. Try again.' }, { status: 500 });
  }

  let quizQuestions: Array<{
    question_text: string;
    options: Array<{ text: string; is_correct?: boolean }>;
    correct_index: number;
    explanation?: string;
    difficulty?: string;
    points?: number;
  }>;
  try {
    const parsedRaw = QuizSchema.parse(extractJSON(quizText));
    const rawQuestions = Array.isArray(parsedRaw)
      ? parsedRaw
      : 'questions' in parsedRaw
        ? parsedRaw.questions
        : parsedRaw.quiz;

    quizQuestions = rawQuestions.map((q) => {
      let correct_index = -1;
      if (q.options.some((o) => o.is_correct)) {
        correct_index = q.options.findIndex((o) => o.is_correct);
      } else if (typeof q.correct_index === 'number') {
        correct_index = q.correct_index;
      } else if (typeof q.correct_answer === 'number') {
        correct_index = q.correct_answer;
      }
      if (correct_index < 0 || correct_index >= q.options.length) correct_index = 0;
      return { ...q, correct_index };
    });
  } catch (err) {
    console.error('[quiz-regenerate] quiz parse failed', err);
    return NextResponse.json({ error: 'Quiz parse failed. Try again.' }, { status: 500 });
  }

  // Step 2 — Quiz verification
  const quizJSON = JSON.stringify(
    quizQuestions.map((q, i) => ({
      index: i,
      question_text: q.question_text,
      options: q.options.map((o) => o.text),
      correct_index: q.correct_index,
    }))
  );
  const verifySystem = `You are a fact-checker. Verify each quiz question's "correct_index" actually matches what the article says. Return JSON:\n{"fixes": [{"question_index": 0, "correct_answer": 2, "reason": "..."}]}\nEmpty array if all correct.`;
  const verifyUser = `ARTICLE:\n${body}\n\nQUIZ:\n${quizJSON}`;

  let verifyText: string;
  try {
    const res = await callModel({
      provider: 'anthropic',
      model: HAIKU_MODEL,
      system: verifySystem,
      prompt: verifyUser,
      max_tokens: 1000,
      pipeline_run_id: runId,
      step_name: 'quiz_verification',
      article_id: input.article_id,
      audience,
    });
    verifyText = res.text;
    totalCostUsd += res.cost_usd;
    assertPerRunCap(totalCostUsd, perRunCapUsd);
  } catch (err) {
    console.error('[quiz-regenerate] verify step failed', err);
    return NextResponse.json({ error: 'Quiz verification failed. Try again.' }, { status: 500 });
  }

  try {
    const verifyParsed = QuizVerifySchema.parse(extractJSON(verifyText));
    for (const fix of verifyParsed.fixes) {
      if (fix.question_index >= 0 && fix.question_index < quizQuestions.length) {
        quizQuestions[fix.question_index].correct_index = fix.correct_answer;
      }
    }
  } catch (err) {
    console.error('[quiz-regenerate] verify parse failed', err);
    return NextResponse.json({ error: 'Quiz verification parse failed. Try again.' }, { status: 500 });
  }

  // Step 3 — Soft-delete existing quizzes
  await service
    .from('quizzes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('article_id', input.article_id)
    .is('deleted_at', null);

  // Step 4 — Insert new quizzes (options include is_correct — same format as admin save route)
  const quizRows = quizQuestions.map((q, i) => ({
    article_id: input.article_id,
    title: q.question_text.slice(0, 200),
    question_text: q.question_text,
    question_type: 'multiple_choice',
    options: q.options.map((o, oi) => ({ text: o.text, is_correct: oi === q.correct_index })),
    explanation: q.explanation || '',
    difficulty: q.difficulty || null,
    points: q.points || 10,
    sort_order: i,
  }));

  const { error: insertErr } = await service.from('quizzes').insert(quizRows as never);
  if (insertErr) {
    console.error('[quiz-regenerate] insert failed', insertErr);
    return NextResponse.json({ error: 'Failed to save regenerated quiz' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'quiz.regenerate',
    targetTable: 'quizzes',
    targetId: input.article_id,
    newValue: {
      article_id: input.article_id,
      count: quizRows.length,
      actor_id: actor.id,
    },
  });

  return NextResponse.json({ ok: true, count: quizRows.length });
}
