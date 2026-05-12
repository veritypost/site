// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requireAuth, hasPermissionServer } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { scoreCommentPost } from '@/lib/scoring';
import { v2LiveGuard } from '@/lib/featureFlags';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSettings, getNumber } from '@/lib/settings';
import { trackServer } from '@/lib/trackServer';
import { parseMentions } from '@/lib/mentions';
import { getExpertConfigSnapshot } from '@/lib/expertConfig';

// T173 — defense-in-depth body length cap. The post_comment RPC has its
// own enforcement, but capping at the API layer fast-fails hostile or
// runaway clients before we burn a quiz check + scoring round-trip. The
// limit is sourced from the same `comment_max_length` setting that
// /api/settings/public exposes to the client (default 4000 chars).
const COMMENT_MAX_LENGTH_FALLBACK = 4000;

// T170/T209 — authenticated user data must never be cacheable by a CDN
// or shared proxy. Apply private/no-store to every response on this
// route (success + error paths).
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// POST /api/comments — create a top-level comment or threaded reply.
// Body: { article_id, body, parent_id?, mentions? }
// mentions is an array of { user_id, username }; the RPC strips it
// for free-tier users (D21).
export async function POST(request) {
  // M11 — order: auth → rate-limit → permission → quiz → RPC. Rate-limit
  // fires before the perms RPC so an authenticated attacker probing for
  // a permission flip (or running the quiz pre-check as a recon side
  // channel) gets gated at 10/min instead of being able to spam the
  // expensive perms+quiz lookups.
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    if (err.status) {
      console.error('[comments.POST]', err);
      return NextResponse.json(
        { error: 'Unauthenticated' },
        { status: err.status, headers: NO_STORE }
      );
    }
    console.error('[comments.POST]', err);
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  // Owner Mode bypass: holders are exempt from maintenance gate, rate
  // limits, and quiz gate. Resolved from DB grants — sole identification
  // path per DECISION #013.
  const isOwnerMode = await hasPermissionServer('admin.owner_mode');

  if (!isOwnerMode) {
    const blocked = await v2LiveGuard();
    if (blocked) return blocked;
  }

  const service = createServiceClient();

  if (!isOwnerMode) {
    const rate = await checkRateLimit(service, {
      key: `comments:${user.id}`,
      policyKey: 'comments_post',
      max: 10,
      windowSec: 60,
    });
    if (rate.limited) {
      const retryAfter = String(rate.windowSec ?? 60);
      return NextResponse.json(
        { error: 'Posting too quickly. Wait a moment and try again.' },
        { status: 429, headers: { ...NO_STORE, 'Retry-After': retryAfter } }
      );
    }
  }

  const allowed = await hasPermissionServer('comments.post');
  if (!allowed) {
    return NextResponse.json(
      { error: 'Not allowed to post comments' },
      { status: 403, headers: NO_STORE }
    );
  }

  // T171 — bound the request size before JSON.parse so a hostile caller
  // can't force the runtime to buffer/parse an unbounded body. 50 KB is
  // ample for any legitimate comment / reply payload.
  const text = await request.text().catch(() => '');
  if (text.length > 50_000) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413, headers: NO_STORE });
  }
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    /* malformed JSON falls through to the empty-object validation below */
  }
  const {
    article_id,
    body,
    parent_id,
    mentions,
    real_world_experience,
    intent,
  } = parsed;
  if (!article_id || !body) {
    return NextResponse.json(
      { error: 'article_id and body required' },
      { status: 400, headers: NO_STORE }
    );
  }

  // Unified intent column: same enum is valid on both top-level + replies.
  // DB CHECK is `intent IN ('question','add_context','different_take') OR
  // intent IS NULL`; intent is independent of parent_id.
  const ALLOWED_INTENTS = new Set(['question', 'add_context', 'different_take']);
  let intentClean = null;
  if (intent != null) {
    if (typeof intent !== 'string' || !ALLOWED_INTENTS.has(intent)) {
      return NextResponse.json(
        { error: 'invalid_intent' },
        { status: 400, headers: NO_STORE }
      );
    }
    intentClean = intent;
  }

  // Defense-in-depth — DB CHECK enforces 80 chars, but reject early so
  // the client gets an actionable error instead of a generic 500.
  let rweClean = null;
  if (typeof real_world_experience === 'string') {
    const trimmed = real_world_experience.trim();
    if (trimmed.length > 80) {
      return NextResponse.json(
        { error: 'real_world_experience exceeds 80 chars' },
        { status: 400, headers: NO_STORE }
      );
    }
    rweClean = trimmed.length > 0 ? trimmed : null;
  } else if (real_world_experience !== undefined && real_world_experience !== null) {
    return NextResponse.json(
      { error: 'real_world_experience must be a string or null' },
      { status: 400, headers: NO_STORE }
    );
  }

  // T173 — enforce comment body length at the app layer (defense-in-depth).
  // Pull the limit from settings so changing the cap is a one-row update
  // instead of a redeploy; fall back to 4000 if settings is unreachable.
  const settings = await getSettings(service).catch(() => ({}));
  const commentMaxLength = getNumber(settings, 'comment_max_length', COMMENT_MAX_LENGTH_FALLBACK);
  if (typeof body !== 'string' || body.length > commentMaxLength) {
    return NextResponse.json(
      { error: 'comment_too_long', max_length: commentMaxLength },
      { status: 400, headers: NO_STORE }
    );
  }

  // H4 — surface the quiz-gate failure as a specific 403 before
  // hitting the post_comment RPC. Skipped for Owner Mode holders.
  if (!isOwnerMode) {
    const { data: passed, error: passErr } = await service.rpc('user_passed_article_quiz', {
      p_user_id: user.id,
      p_article_id: article_id,
    });
    if (passErr) {
      console.error('[comments.POST.quiz_check]', passErr.message || passErr);
    } else if (!passed) {
      return NextResponse.json(
        { error: 'Pass the quiz on this article to join the discussion.' },
        { status: 403, headers: NO_STORE }
      );
    }
  }

  // Preview intercept (DECISION #033): when the target article is non-published
  // and the actor is an editor/owner, return a preview signal without writing.
  // Also pull category_id while we're here — needed for the expert-thread
  // broadcast fan-out below (kill-switch ON path).
  const { data: targetArticle } = await service
    .from('articles')
    .select('status, category_id')
    .eq('id', article_id)
    .maybeSingle();
  if (targetArticle && targetArticle.status !== 'published') {
    const isEditor =
      isOwnerMode ||
      (await hasPermissionServer('articles.edit')) ||
      (await hasPermissionServer('admin.articles.edit.any'));
    if (isEditor) {
      return NextResponse.json({ preview: true }, { headers: NO_STORE });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // EXPERT_THREADS.md Wave 3 — kill-switch read-once-per-TXN (mitigation
  // §2 #12). The snapshot pinned here is threaded through the expert
  // enforcement block below; an admin flipping the switch mid-request can
  // no longer produce orphan `is_expert_thread_root=true` rows.
  // ──────────────────────────────────────────────────────────────────────
  const expertConfig = await getExpertConfigSnapshot();
  let expertParts = { bare: [], expertDirected: [], expertBroadcast: false };
  let expertDirectedRows = []; // [{ user_id, username }] resolved + DEDUPED
  let expertAvailableIds = []; // user_ids NOT at-quota (eligible for notifications + counter ticks)

  if (expertConfig.killSwitch) {
    expertParts = parseMentions(body);

    // Server defense for "no duplicate @ of the same expert" (spec §2). The
    // composer prevents this client-side; here we re-detect by raw scan
    // (parser dedupes silently). Walk the body's expert tokens with a
    // count map; reject on first duplicate.
    if (expertParts.expertDirected.length > 0) {
      const counts = new Map();
      const EXPERT_TOKEN_RE_LOCAL =
        /(?<![a-zA-Z0-9_])@expert(?:_([a-zA-Z0-9_]{2,30}))?(?![a-zA-Z0-9_])/g;
      for (const m of body.matchAll(EXPERT_TOKEN_RE_LOCAL)) {
        const u = m[1];
        if (!u) continue;
        const lc = u.toLowerCase();
        counts.set(lc, (counts.get(lc) || 0) + 1);
        if (counts.get(lc) > 1) {
          return NextResponse.json(
            {
              error: 'duplicate_expert_mention',
              composer_message: "you've already @'d this expert in this comment.",
            },
            { status: 400, headers: NO_STORE }
          );
        }
      }
    }

    const directedUsernames = expertParts.expertDirected; // already lowercased + deduped
    const isBroadcast = expertParts.expertBroadcast;
    const hasAnyExpertMention = directedUsernames.length > 0 || isBroadcast;

    if (hasAnyExpertMention) {
      // Resolve directed usernames → user_ids in one query.
      if (directedUsernames.length > 0) {
        const { data: rows, error: resolveErr } = await service
          .from('users')
          .select('id, username')
          .in('username', directedUsernames);
        if (resolveErr) {
          console.error('[comments.POST.expert.resolve]', resolveErr);
          return NextResponse.json(
            { error: 'Could not post comment. Try again in a moment.' },
            { status: 500, headers: NO_STORE }
          );
        }
        expertDirectedRows = (rows || []).filter(
          (r) => typeof r.id === 'string' && typeof r.username === 'string'
        );
      }

      // Defense-in-depth: re-call the asker cap RPC to commit the
      // reservation made at compose time. A concurrent post on another
      // tab can race the cap between `can-mention` and here; the RPC
      // re-evaluates atomically and returns 429 on rejection.
      const nTargets = expertDirectedRows.length + (isBroadcast ? 1 : 0);
      if (nTargets > 0) {
        const { data: capData, error: capErr } = await service.rpc(
          'check_and_reserve_asker_mention_cap',
          {
            p_user_id: user.id,
            p_n_targets: nTargets,
            p_is_broadcast: isBroadcast,
          }
        );
        if (capErr) {
          console.error('[comments.POST.expert.cap]', capErr);
          return NextResponse.json(
            { error: 'Could not post comment. Try again in a moment.' },
            { status: 500, headers: NO_STORE }
          );
        }
        if (capData && capData.allowed === false) {
          return NextResponse.json(
            {
              error: 'mention_cap_hit',
              composer_message: 'you reached your mentions for today.',
              detail: capData,
            },
            { status: 429, headers: NO_STORE }
          );
        }
      }

      // Filter directed targets to those NOT at quota — only those receive
      // notifications and tick the per-(expert, article) + per-day
      // counters. At-quota mentions are inert (spec §2 Inert mentions).
      if (expertDirectedRows.length > 0) {
        const directedIds = expertDirectedRows.map((r) => r.id);
        const { data: quotaData, error: quotaErr } = await service.rpc(
          'check_expert_mention_quota',
          {
            p_target_user_ids: directedIds,
            p_article_id: article_id,
          }
        );
        if (quotaErr) {
          console.error('[comments.POST.expert.quota]', quotaErr);
          // Non-fatal — fall through with empty available; the cap was
          // already reserved so the asker isn't double-charged.
          expertAvailableIds = [];
        } else {
          const available = Array.isArray(quotaData?.available)
            ? quotaData.available
            : [];
          expertAvailableIds = available;
        }
      }
    }
  }

  const { data, error } = await service.rpc('post_comment', {
    p_user_id: user.id,
    p_article_id: article_id,
    p_body: body,
    p_parent_id: parent_id || null,
    p_mentions: Array.isArray(mentions) ? mentions : [],
    p_real_world_experience: rweClean,
    p_intent: intentClean,
  });
  if (error) {
    console.error('[comments.POST]', error);
    // Ext-F1 — surface known RPC failure modes as actionable copy.
    // Server log keeps the raw cause; client gets a hint they can act on.
    const code = error.code;
    const msg = (error.message || '').toLowerCase();
    if (code === 'P0001' && (msg.includes('quiz') || msg.includes('not allowed'))) {
      return NextResponse.json(
        { error: 'Pass the quiz on this article to join the discussion.' },
        { status: 403, headers: NO_STORE }
      );
    }
    if (code === '23505' || msg.includes('duplicate')) {
      return NextResponse.json(
        { error: 'Looks like that comment already posted.' },
        { status: 409, headers: NO_STORE }
      );
    }
    if (msg.includes('parent')) {
      return NextResponse.json(
        { error: 'Reply target not found — it may have been removed.' },
        { status: 404, headers: NO_STORE }
      );
    }
    return NextResponse.json(
      { error: 'Could not post comment. Try again in a moment.' },
      { status: 400, headers: NO_STORE }
    );
  }

  // Phase 14: award post_comment points + advance streak.
  const scoring = await scoreCommentPost(service, { userId: user.id, commentId: data.id });
  if (scoring?.error) console.error('score_on_comment_post failed', scoring.error);

  // T322 — fire comment_post analytics event after the authoritative
  // RPC + scoring write succeeds. Fire-and-forget; telemetry must
  // never block the response.
  void trackServer('comment_post', 'product', {
    user_id: user.id,
    article_id,
    request,
    payload: {
      comment_id: data.id,
      is_reply: !!parent_id,
      has_mentions: Array.isArray(mentions) && mentions.length > 0,
    },
  });

  // ──────────────────────────────────────────────────────────────────────
  // EXPERT_THREADS.md Wave 3 — post-insert expert work (kill-switch ON).
  // - Stamp `is_expert_thread_root` / `expert_thread_root_id`.
  // - Tick per-(expert,article) + per-day counters via commit_expert_mentions.
  // - Fan out notifications: one per available directed mention; one per
  //   opted-in in-category expert for broadcast.
  // None of this is in the post_comment RPC body (Wave 2 didn't touch it),
  // so we layer it here. Failures are logged but do not roll back the
  // comment row — the cap reservation already committed and the asker's
  // reservation was real.
  // ──────────────────────────────────────────────────────────────────────
  if (expertConfig.killSwitch) {
    const isBroadcast = expertParts.expertBroadcast;
    const hasAnyExpertMention = expertDirectedRows.length > 0 || isBroadcast;

    if (hasAnyExpertMention) {
      // 1. Compute thread root.
      //   - depth-0 (parent_id IS NULL): this row IS the root.
      //   - depth-1 (parent has is_expert_thread_root=true): inherit
      //     parent_id as the root.
      //   - deeper: inherit parent.expert_thread_root_id (the root walk
      //     up the chain is already encoded in that column on the parent).
      // The single-SELECT app-level walk is sufficient because the
      // invariant is maintained on every insert.
      let isExpertThreadRoot = false;
      let expertThreadRootId = null;
      if (!parent_id) {
        isExpertThreadRoot = true;
        expertThreadRootId = data.id;
      } else {
        const { data: parentRow, error: parentErr } = await service
          .from('comments')
          .select('id, is_expert_thread_root, expert_thread_root_id')
          .eq('id', parent_id)
          .maybeSingle();
        if (parentErr) {
          console.error('[comments.POST.expert.parent_lookup]', parentErr);
        } else if (parentRow) {
          if (parentRow.is_expert_thread_root) {
            expertThreadRootId = parentRow.id;
          } else if (parentRow.expert_thread_root_id) {
            expertThreadRootId = parentRow.expert_thread_root_id;
          }
          // else: this @expert sits in a non-expert thread — directed
          // mention still counts (counters tick, picker shows, asker cap
          // fires) but no chain row / 2-cap / grant button. Spec §2
          // "Expert thread mode" paragraph 1.
        }
      }

      if (isExpertThreadRoot || expertThreadRootId !== null) {
        const { error: stampErr } = await service
          .from('comments')
          .update({
            is_expert_thread_root: isExpertThreadRoot,
            expert_thread_root_id: expertThreadRootId,
          })
          .eq('id', data.id);
        if (stampErr) {
          console.error('[comments.POST.expert.stamp]', stampErr);
        }
      }

      // 2. Tick counters for the available (NOT at-quota) directed
      //    targets. At-quota targets were filtered out above; they are
      //    inert per spec §2 (no counter tick, no notification row).
      if (expertAvailableIds.length > 0) {
        const { error: commitErr } = await service.rpc('commit_expert_mentions', {
          p_asker_id: user.id,
          p_target_user_ids: expertAvailableIds,
          p_article_id: article_id,
        });
        if (commitErr) {
          console.error('[comments.POST.expert.commit]', commitErr);
        }
      }

      // 3. Fan out notifications.
      //    - Directed: one row per available target with type='mention'.
      //      Push delivery + alert_preferences filter happens in send-push
      //      cron at dispatch time (existing pattern).
      //    - Broadcast: one row per opted-in in-category expert with
      //      type='category_arrival'. Opt-in source: expert_applications
      //      .notify_push_on_category_arrival = true on the most-recent
      //      approved application. The cron applies the alert_preferences
      //      filter on top at dispatch.
      const notifRows = [];
      const actorUsername = user?.username || user?.user_metadata?.username || null;
      const baseMetadata = {
        comment_id: data.id,
        article_id,
        actor_user_id: user.id,
        actor_username: actorUsername,
        kill_switch_version: expertConfig.version,
      };

      // Directed.
      const availableSet = new Set(expertAvailableIds);
      for (const row of expertDirectedRows) {
        if (!availableSet.has(row.id)) continue; // inert
        if (row.id === user.id) continue; // self-mention
        notifRows.push({
          user_id: row.id,
          type: 'mention',
          title: actorUsername
            ? `@${actorUsername} mentioned you as an expert`
            : 'You were mentioned as an expert',
          body: typeof body === 'string' ? body.slice(0, 280) : null,
          metadata: { ...baseMetadata, mention_kind: 'expert_directed' },
        });
      }

      // Broadcast — fan out to opted-in in-category experts.
      if (isBroadcast && targetArticle?.category_id) {
        const { data: optedIn, error: optInErr } = await service
          .from('expert_applications')
          .select('user_id, expert_application_categories!inner(category_id)')
          .eq('status', 'approved')
          .eq('notify_push_on_category_arrival', true)
          .eq('expert_application_categories.category_id', targetArticle.category_id);
        if (optInErr) {
          console.error('[comments.POST.expert.broadcast_lookup]', optInErr);
        } else {
          const broadcastUserIds = Array.from(
            new Set(
              (optedIn || [])
                .map((r) => r.user_id)
                .filter((id) => typeof id === 'string' && id !== user.id)
            )
          );
          for (const uid of broadcastUserIds) {
            notifRows.push({
              user_id: uid,
              type: 'category_arrival',
              title: actorUsername
                ? `@${actorUsername} asked the experts in this category`
                : 'A reader asked the experts in this category',
              body: typeof body === 'string' ? body.slice(0, 280) : null,
              metadata: { ...baseMetadata, mention_kind: 'expert_broadcast' },
            });
          }
        }
      }

      if (notifRows.length > 0) {
        const { error: notifErr } = await service.from('notifications').insert(notifRows);
        if (notifErr) {
          console.error('[comments.POST.expert.notif_insert]', notifErr);
        }
      }
    }
  }

  // Re-fetch the row so the client gets the full shape (counts etc.).
  const { data: full } = await service
    .from('comments')
    .select(
      '*, users!fk_comments_user_id(id, username, avatar_color, avatar_url, is_verified_public_figure, is_expert, plans(tier))'
    )
    .eq('id', data.id)
    .maybeSingle();

  return NextResponse.json(
    {
      comment: full || { id: data.id },
      scoring: scoring?.error ? null : scoring,
    },
    { headers: NO_STORE }
  );
}
