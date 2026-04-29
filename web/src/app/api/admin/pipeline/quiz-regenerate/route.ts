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
import Anthropic from '@anthropic-ai/sdk';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import {
  QUIZ_PROMPT,
  KIDS_QUIZ_PROMPT,
  TWEENS_QUIZ_PROMPT,
} from '@/lib/pipeline/editorial-guide';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const HAIKU_MODEL = 'claude-haiku-4-5';
const SONNET_MODEL = 'claude-sonnet-4-6';

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

  const anthropic = getAnthropicClient();

  // Step 1 — Quiz generation
  let quizText: string;
  try {
    const res = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 2000,
      system: quizSystem,
      messages: [{ role: 'user', content: quizUser }],
    });
    quizText = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
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
    const res = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1000,
      system: verifySystem,
      messages: [{ role: 'user', content: verifyUser }],
    });
    verifyText = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  } catch (err) {
    console.error('[quiz-regenerate] verify step failed', err);
    return NextResponse.json({ error: 'Quiz verification failed. Try again.' }, { status: 500 });
  }

  try {
    const verifyParsed = QuizVerifySchema.parse(extractJSON(verifyText));
    if (verifyParsed.fixes.length > 0) {
      return NextResponse.json(
        {
          error: `Quiz verification found ${verifyParsed.fixes.length} mis-keyed question(s). Try again.`,
        },
        { status: 422 }
      );
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
    is_active: true,
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
