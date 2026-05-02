/**
 * Loads system prompts from the settings table, falling back to the
 * hardcoded constants from editorial-guide.ts when:
 *   - The DB row has an empty or whitespace-only value
 *   - Any DB/network error occurs
 *
 * 60-second module-level TTL cache. On Vercel serverless, cache resets
 * on cold starts — each cold-start pays one DB round trip.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EDITORIAL_GUIDE,
  HEADLINE_PROMPT,
  QUIZ_PROMPT,
  TIMELINE_PROMPT,
  KIDS_ARTICLE_PROMPT,
  KIDS_HEADLINE_PROMPT,
  KIDS_QUIZ_PROMPT,
  KIDS_TIMELINE_PROMPT,
  TWEENS_ARTICLE_PROMPT,
  TWEENS_HEADLINE_PROMPT,
  TWEENS_QUIZ_PROMPT,
  TWEENS_TIMELINE_PROMPT,
} from './editorial-guide';

export type AudiencePrompts = {
  body: string;
  headline: string;
  quiz: string;
  timeline: string;
};

export type SystemPrompts = {
  adult: AudiencePrompts;
  kids: AudiencePrompts;
  tweens: AudiencePrompts;
};

const HARDCODED: SystemPrompts = {
  adult: {
    body: EDITORIAL_GUIDE,
    headline: HEADLINE_PROMPT,
    quiz: QUIZ_PROMPT,
    timeline: TIMELINE_PROMPT,
  },
  kids: {
    body: KIDS_ARTICLE_PROMPT,
    headline: KIDS_HEADLINE_PROMPT,
    quiz: KIDS_QUIZ_PROMPT,
    timeline: KIDS_TIMELINE_PROMPT,
  },
  tweens: {
    body: TWEENS_ARTICLE_PROMPT,
    headline: TWEENS_HEADLINE_PROMPT,
    quiz: TWEENS_QUIZ_PROMPT,
    timeline: TWEENS_TIMELINE_PROMPT,
  },
};

const PROMPTS_TTL_MS = 60_000;
let _promptsCache: (SystemPrompts & { expiresAt: number }) | null = null;

export async function loadSystemPrompts(service: SupabaseClient): Promise<SystemPrompts> {
  const now = Date.now();
  if (_promptsCache && _promptsCache.expiresAt > now) {
    return {
      adult: _promptsCache.adult,
      kids: _promptsCache.kids,
      tweens: _promptsCache.tweens,
    };
  }

  try {
    const { data, error } = await service
      .from('settings')
      .select('key, value')
      .like('key', 'pipeline.prompt.%');

    if (error) throw error;

    const byKey = new Map<string, string>();
    for (const row of data ?? []) {
      byKey.set(row.key as string, String(row.value));
    }

    // Use DB value only when it is a non-empty string after trimming.
    const pick = (k: string, fallback: string): string => {
      const v = byKey.get(k);
      return v && v.trim().length > 0 ? v : fallback;
    };

    const resolved: SystemPrompts = {
      adult: {
        body: pick('pipeline.prompt.adult.body', HARDCODED.adult.body),
        headline: pick('pipeline.prompt.adult.headline', HARDCODED.adult.headline),
        quiz: pick('pipeline.prompt.adult.quiz', HARDCODED.adult.quiz),
        timeline: pick('pipeline.prompt.adult.timeline', HARDCODED.adult.timeline),
      },
      kids: {
        body: pick('pipeline.prompt.kids.body', HARDCODED.kids.body),
        headline: pick('pipeline.prompt.kids.headline', HARDCODED.kids.headline),
        quiz: pick('pipeline.prompt.kids.quiz', HARDCODED.kids.quiz),
        timeline: pick('pipeline.prompt.kids.timeline', HARDCODED.kids.timeline),
      },
      tweens: {
        body: pick('pipeline.prompt.tweens.body', HARDCODED.tweens.body),
        headline: pick('pipeline.prompt.tweens.headline', HARDCODED.tweens.headline),
        quiz: pick('pipeline.prompt.tweens.quiz', HARDCODED.tweens.quiz),
        timeline: pick('pipeline.prompt.tweens.timeline', HARDCODED.tweens.timeline),
      },
    };

    _promptsCache = { ...resolved, expiresAt: now + PROMPTS_TTL_MS };
    return resolved;
  } catch (err) {
    console.warn('[system-prompt-loader] DB error — using hardcoded fallbacks:', err);
    return HARDCODED;
  }
}
