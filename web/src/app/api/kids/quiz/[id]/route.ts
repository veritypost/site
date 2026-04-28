// GET /api/kids/quiz/[id]
//
// S10-A6 — kid quiz fetch that strips `is_correct` from option payloads.
//
// Pre-A6 the iOS kids app fetched quizzes directly from
// `public.quizzes` via supabase-swift, decoding QuizQuestion + QuizOption
// (which carries `is_correct`). RLS allowed the read but did not project-
// filter the column, so every kid quiz response carried the answer key
// embedded in the wire payload — defeating the entire pass-to-comment
// pass-to-streak mechanic for any kid (or parent) inspecting the
// HTTPS response with a proxy or shared device tooling.
//
// This route reads the same rows server-side via the service client
// (kid JWT bearer is verified up front, kid_profile_id is constrained
// to the bearer's claim), strips `is_correct` from each option, and
// emits the sanitized shape iOS now decodes. The server-side
// `get_kid_quiz_verdict` RPC remains the source of truth for grading;
// iOS never sees the answer key.
//
// Input:  Authorization: Bearer <kid JWT>; path param `id` = article_id.
// Output: { questions: [{ id, article_id, question_text, question_type,
//                          options: [{ text }, ...], explanation,
//                          difficulty, points, pool_group, sort_order }] }
//
// Failure modes:
//   401 — missing / invalid / non-kid bearer
//   404 — article doesn't exist or isn't kids-safe (defense-in-depth
//         on top of RLS — same kids-safe check the iOS reader does)
//   429 — rate limited
//   500 — unexpected server error

import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

interface RawOption {
  text?: string;
  is_correct?: boolean;
  [k: string]: unknown;
}

interface RawQuestion {
  id: string;
  article_id: string;
  question_text: string;
  question_type: string | null;
  options: RawOption[] | null;
  explanation: string | null;
  difficulty: string | null;
  points: number | null;
  pool_group: number | null;
  sort_order: number | null;
}

interface SafeOption {
  text: string;
}

interface SafeQuestion {
  id: string;
  article_id: string;
  question_text: string;
  question_type: string | null;
  options: SafeOption[];
  explanation: string | null;
  difficulty: string | null;
  points: number | null;
  pool_group: number | null;
  sort_order: number | null;
}

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const svc = createServiceClient();
    const ip = await getClientIp();

    const rate = await checkRateLimit(svc, {
      key: `kids-quiz:${ip}`,
      policyKey: 'kids_quiz_fetch',
      max: 60,
      windowSec: 60,
    });
    if (rate.limited) {
      return NextResponse.json(
        { error: 'Too many requests — try again shortly' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rate.windowSec || 60),
            ...NO_STORE,
          },
        }
      );
    }

    // Bearer-auth: kid JWT only. Reject adult GoTrue access tokens
    // even if they were minted with the same secret — the
    // is_kid_delegated claim shape is what scopes this endpoint.
    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json(
        { error: 'Missing bearer token' },
        { status: 401, headers: NO_STORE }
      );
    }
    const token = match[1];

    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      return NextResponse.json(
        { error: 'Server misconfigured' },
        { status: 503, headers: NO_STORE }
      );
    }

    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;
    } catch {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers: NO_STORE }
      );
    }
    if (
      !decoded ||
      decoded.is_kid_delegated !== true ||
      typeof decoded.kid_profile_id !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401, headers: NO_STORE }
      );
    }

    const { id: articleId } = await params;
    if (!articleId || typeof articleId !== 'string') {
      return NextResponse.json(
        { error: 'Missing article id' },
        { status: 400, headers: NO_STORE }
      );
    }

    // Defense-in-depth: refuse to return quiz rows for an article
    // that isn't kids-safe. RLS on `articles` for the kid JWT does the
    // primary enforcement, but this route runs as service so we
    // re-check explicitly. Mirrors the kid reader's pre-flight.
    const { data: articleRow, error: articleErr } = await svc
      .from('articles')
      .select('id, is_kids_safe, status')
      .eq('id', articleId)
      .maybeSingle();
    if (articleErr) {
      console.error('[kids.quiz] article lookup:', articleErr);
      return NextResponse.json(
        { error: 'Could not load quiz' },
        { status: 500, headers: NO_STORE }
      );
    }
    if (
      !articleRow ||
      articleRow.is_kids_safe !== true ||
      articleRow.status !== 'published'
    ) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: NO_STORE }
      );
    }

    const { data: rawRows, error: quizErr } = await svc
      .from('quizzes')
      .select(
        'id, article_id, question_text, question_type, options, explanation, difficulty, points, pool_group, sort_order'
      )
      .eq('article_id', articleId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .limit(10);

    if (quizErr) {
      console.error('[kids.quiz] quizzes fetch:', quizErr);
      return NextResponse.json(
        { error: 'Could not load quiz' },
        { status: 500, headers: NO_STORE }
      );
    }

    const rows = (rawRows ?? []) as RawQuestion[];

    // Strip `is_correct` from every option. We project to a closed
    // SafeOption shape rather than a delete-key approach so a future
    // schema change that adds another sensitive column won't leak
    // through silently — anything not in SafeOption is dropped.
    const sanitized: SafeQuestion[] = rows.map((q) => ({
      id: q.id,
      article_id: q.article_id,
      question_text: q.question_text,
      question_type: q.question_type,
      options: Array.isArray(q.options)
        ? q.options.map((o) => ({ text: typeof o.text === 'string' ? o.text : '' }))
        : [],
      explanation: q.explanation,
      difficulty: q.difficulty,
      points: q.points,
      pool_group: q.pool_group,
      sort_order: q.sort_order,
    }));

    return NextResponse.json({ questions: sanitized }, { headers: NO_STORE });
  } catch (err) {
    console.error('[kids.quiz]', err);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: NO_STORE }
    );
  }
}
