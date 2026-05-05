// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSettings, getNumber } from '@/lib/settings';
import { COPY } from '@/lib/copy';
import { renderBodyHtml } from '@/lib/pipeline/render-body';
import { parseMentions } from '@/lib/mentions';
import {
  getExpertConfigSnapshot,
  getSettingBoolean,
} from '@/lib/expertConfig';

// T173 — defense-in-depth body length cap mirroring POST /api/comments. The
// edit_comment RPC enforces internally; this fast-fails hostile or runaway
// clients before we burn the lookup + RPC round-trip. Same fallback as POST.
const COMMENT_MAX_LENGTH_FALLBACK = 4000;

// T170/T209 — authenticated user data must never be cacheable by a CDN
// or shared proxy. Apply private/no-store to every response on this
// route (success + error paths).
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// =====================================================================
// S5-iOS-parity (A123 / A124 / A125 / A126) — comment edit + delete
// API contract published for S9 to cite by file:line.
//
// Contract: edit (A123)
// ---------------------
//   PATCH /api/comments/[id]
//   Body:    { body: string }                  // 1..comment_max_length chars after trim
//   Auth:    bearer required.
//   Perms:   comments.edit.own (owner) — mods/admins use the moderation
//            surface, gated on a different permission key.
//   Window:  EDIT_WINDOW_MS = 10 minutes from comments.created_at for the
//            owner branch (T280). Mods bypass via the moderation surface.
//   Server:  edit_comment RPC sets body, body_html (re-render), is_edited,
//            edited_at, mentions (re-extracted from new body); mentions
//            unresolved against users.username get dropped.
//   Resp:    200 { ok: true } | 400 { error: 'body required' | 'comment_too_long' (+ max_length) }
//                              | 403 { error: 'edit_window_expired' (+ message), or 'Forbidden' }
//                              | 404 { error: 'not_found' }
//                              | 429 { error: 'Too many requests', Retry-After header }
//   Realtime: server emits an UPDATE on comments via Postgres realtime;
//             web's CommentThread.tsx UPDATE handler merges. iOS must
//             subscribe to the same UPDATE channel to receive parity.
//
// Contract: soft-delete (A126)
// -----------------------------
//   DELETE /api/comments/[id]
//   Auth:    bearer required.
//   Perms:   comments.delete.own (owner) — mods use moderation surface.
//   Server:  soft_delete_comment RPC sets deleted_at = now(),
//            body = '[deleted]', body_html = NULL, mentions = '[]'::jsonb
//            (T2.2 anonymize pattern).
//   Resp:    200 { ok: true } | 400 { error: '...' } | 401/403 | 404
//   Render:  clients render `[deleted]` tombstone when deleted_at IS NOT
//            NULL. iOS VPComment model decodes deleted_at, status,
//            is_edited, mentions, context_tag_count, is_context_pinned
//            per A126 to reach parity with the web row.
//
// Contract: mention array (A126 / §H2)
// -------------------------------------
//   comments.mentions is jsonb array of { user_id: uuid, username: string }.
//   Server populates on insert (POST /api/comments) and on edit (PATCH
//   above) by extracting `@<username>` tokens via MENTION_RE, looking
//   them up in users.username, writing the resolved pair. Unresolved
//   mentions get dropped from the array. Free-tier authors are gated at
//   pre-submit by /api/comments/can-mention (S5-§H2); the post_comment
//   RPC re-validates plan to defend against hand-crafted POSTs that
//   bypass the composer.
//
//   iOS contract: decode the array; render each `@username` as a
//   tappable element that opens /card/<username>. Plain `@username`
//   text without a corresponding array entry renders as plain text.
//
// Contract: threading depth (A125)
// ---------------------------------
//   Server allows arbitrary depth via comments.parent_id chain. Web caps
//   visual nesting via /api/settings/public.comment_max_depth (default
//   2). Owner-locked Q4.15 = B (iOS-native "Continue this thread →"
//   affordance at depth 3 that opens the rest in a fullscreen sheet).
//   iOS keeps maxThreadDepth = 3 in StoryDetailView.swift; at depth 3
//   it renders a "Continue this thread →" button that re-roots a sheet
//   at that comment and renders depth 0..3 of the subtree, recursive.
// =====================================================================

// PATCH /api/comments/[id] — owner edit, or admin edit-any.
export async function PATCH(request, { params }) {
  // admin.comments.edit.any bypasses ownership + time-window; fall back to
  // the self-edit permission for regular users.
  let user;
  let isAdminEdit = false;
  try {
    user = await requirePermission('admin.comments.edit.any');
    isAdminEdit = true;
  } catch (_) {
    try {
      user = await requirePermission('comments.edit.own');
    } catch (err) {
      if (err.status) {
        console.error('[comments.[id].permission]', err?.message || err);
        return NextResponse.json(
          { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
          { status: err.status, headers: NO_STORE }
        );
      }
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
    }
  }

  const { id } = params;
  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `comment-edit:${user.id}`,
    policyKey: 'comment-edit',
    max: 5,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { body } = await request.json().catch(() => ({}));
  if (!body) {
    return NextResponse.json({ error: 'body required' }, { status: 400, headers: NO_STORE });
  }

  // T173 — body-length cap matching POST. RPC enforces internally; this is
  // route-level parity so PATCH and POST short-circuit the same way.
  const settings = await getSettings(service).catch(() => ({}));
  const commentMaxLength = getNumber(settings, 'comment_max_length', COMMENT_MAX_LENGTH_FALLBACK);
  if (typeof body !== 'string' || body.length > commentMaxLength) {
    return NextResponse.json(
      { error: 'comment_too_long', max_length: commentMaxLength },
      { status: 400, headers: NO_STORE }
    );
  }

  // EXPERT_THREADS.md Wave 3 — kill-switch read-once-per-TXN (mitigation
  // §2 #12). Snapshot pinned for the rest of the request.
  const expertConfig = await getExpertConfigSnapshot();

  // T280 — cap the self-edit window to 10 minutes so authors can fix typos
  // but can't silently rewrite a comment after it has been replied to,
  // quoted, or reported. Mods/admins use the moderation surface, which
  // gates on a different permission and isn't affected. The RPC is
  // SECURITY DEFINER so we read the row through the service client first.
  // Wave 3: extend the SELECT to pull `body` (for OLD-expert-mention
  // re-extraction) and `article_id` (for commit_expert_mentions).
  const EDIT_WINDOW_MS = 10 * 60 * 1000;
  const { data: existing, error: lookupErr } = await service
    .from('comments')
    .select('user_id, created_at, body, article_id, parent_id')
    .eq('id', id)
    .maybeSingle();
  if (lookupErr || !existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  }
  if (isAdminEdit) {
    // Service client has full DB access — no need to route through the
    // ownership-checking RPC. Direct update preserves is_edited + audit trail.
    const trimmed = body.trim();
    const { error: updateErr } = await service
      .from('comments')
      .update({
        body: trimmed,
        body_html: renderBodyHtml(trimmed),
        is_edited: true,
        edited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .neq('status', 'deleted');
    if (updateErr)
      return safeErrorResponse(NextResponse, updateErr, {
        route: 'comments.id.admin-edit',
        fallbackStatus: 400,
        headers: NO_STORE,
      });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  // Self-edit: enforce ownership and the 10-minute window.
  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE });
  }
  const createdAt = new Date(existing.created_at).getTime();
  if (Number.isFinite(createdAt) && Date.now() - createdAt > EDIT_WINDOW_MS) {
    return NextResponse.json(
      { error: 'edit_window_expired', message: COPY.comments.editWindowExpired },
      { status: 403, headers: NO_STORE }
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // EXPERT_THREADS.md Wave 3 — edit-time expert-mention enforcement
  // (kill switch ON). Compute newly_added / newly_removed from the OLD
  // body's expert tokens vs the NEW body's; reject duplicates; recheck
  // the asker cap on the evaluator delta; commit counters + notifications
  // for newly-added targets only.
  // ──────────────────────────────────────────────────────────────────────
  let editExpertNewlyAvailableIds = []; // ids to commit + notify (newly added AND not at quota)
  let editExpertNewlyAddedRows = []; // [{user_id, username}] newly-added directed targets
  if (expertConfig.killSwitch) {
    const oldParts = parseMentions(existing.body || '');
    const newParts = parseMentions(body);

    // Server defense for "no duplicate @ of the same expert" on the new
    // body (parser dedupes silently — re-scan to detect dupes pre-dedup).
    if (newParts.expertDirected.length > 0) {
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

    // Set arithmetic on directed usernames (already lowercased + deduped
    // by parser). Broadcast is treated as one slot per side: a broadcast
    // present in NEW but not OLD adds 1; removed subtracts 1.
    const oldDirected = new Set(oldParts.expertDirected);
    const newDirected = new Set(newParts.expertDirected);
    const newlyAddedDirected = [...newDirected].filter((u) => !oldDirected.has(u));
    const newlyRemovedDirected = [...oldDirected].filter((u) => !newDirected.has(u));
    const broadcastAdded = newParts.expertBroadcast && !oldParts.expertBroadcast;
    const broadcastRemoved = oldParts.expertBroadcast && !newParts.expertBroadcast;

    const newlyAddedCount = newlyAddedDirected.length + (broadcastAdded ? 1 : 0);
    const newlyRemovedCount =
      newlyRemovedDirected.length + (broadcastRemoved ? 1 : 0);

    // Cap evaluator: spec §2 default `expert.mentions.edit_refunds_removed`
    // = true → max(0, added - removed). When false → just `added`.
    const refundsRemoved = await getSettingBoolean(
      'expert.mentions.edit_refunds_removed',
      true
    );
    const evaluatorValue = refundsRemoved
      ? Math.max(0, newlyAddedCount - newlyRemovedCount)
      : newlyAddedCount;

    // The cap RPC requires p_n_targets >= 1 (it raises 22023 otherwise).
    // Zero-delta edits skip the recheck — nothing to reserve.
    if (evaluatorValue > 0) {
      // p_is_broadcast: spec uses one bool for the whole reservation. If
      // ANY of the newly-added targets is a broadcast, treat the slot as
      // broadcast (multiplied by broadcast_cost inside the RPC). When the
      // reservation contains both directed adds AND a broadcast add, we
      // do two calls so each side gets the right cost — directed = 1×,
      // broadcast = broadcast_cost×.
      const directedAddCount = newlyAddedDirected.length;
      const reservations = [];
      if (directedAddCount > 0 && !broadcastAdded) {
        reservations.push({ n: directedAddCount, broadcast: false });
      } else if (broadcastAdded && directedAddCount === 0) {
        reservations.push({ n: 1, broadcast: true });
      } else if (broadcastAdded && directedAddCount > 0) {
        // Mixed add: split.
        reservations.push({ n: directedAddCount, broadcast: false });
        reservations.push({ n: 1, broadcast: true });
      }
      // If `evaluatorValue` after refund is < `directedAddCount + (broadcast?1:0)`,
      // we still call with the gross add counts — refund semantics are
      // applied by NOT charging for removals separately. (The cap RPC has
      // no "credit" mode; the only way to refund is to call it with a
      // smaller reservation. To keep semantics simple, when refunds are
      // enabled and removed >= added, we skip the call entirely; otherwise
      // we charge the gross add and tolerate a small over-charge equal to
      // the refunded slot count.)
      if (refundsRemoved && newlyRemovedCount >= newlyAddedCount) {
        // Net add ≤ 0 — no reservation needed.
      } else {
        for (const r of reservations) {
          const { data: capData, error: capErr } = await service.rpc(
            'check_and_reserve_asker_mention_cap',
            {
              p_user_id: user.id,
              p_n_targets: r.n,
              p_is_broadcast: r.broadcast,
            }
          );
          if (capErr) {
            console.error('[comments.PATCH.expert.cap]', capErr);
            return NextResponse.json(
              { error: 'cap_check_failed' },
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
      }
    }

    // Resolve newly-added directed usernames → ids for the post-update
    // commit + notification work (only after the edit_comment RPC succeeds
    // below).
    if (newlyAddedDirected.length > 0) {
      const { data: rows, error: resolveErr } = await service
        .from('users')
        .select('id, username')
        .in('username', newlyAddedDirected);
      if (resolveErr) {
        console.error('[comments.PATCH.expert.resolve]', resolveErr);
      } else {
        editExpertNewlyAddedRows = (rows || []).filter(
          (r) => typeof r.id === 'string' && typeof r.username === 'string'
        );
      }

      if (editExpertNewlyAddedRows.length > 0) {
        const directedIds = editExpertNewlyAddedRows.map((r) => r.id);
        const { data: quotaData, error: quotaErr } = await service.rpc(
          'check_expert_mention_quota',
          {
            p_target_user_ids: directedIds,
            p_article_id: existing.article_id,
          }
        );
        if (quotaErr) {
          console.error('[comments.PATCH.expert.quota]', quotaErr);
          editExpertNewlyAvailableIds = [];
        } else {
          const available = Array.isArray(quotaData?.available)
            ? quotaData.available
            : [];
          editExpertNewlyAvailableIds = available;
        }
      }
    }
  }

  const { error } = await service.rpc('edit_comment', {
    p_user_id: user.id,
    p_comment_id: id,
    p_body: body,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id',
      fallbackStatus: 400,
      headers: NO_STORE,
    });

  // Post-update expert work: commit counters for newly-added available
  // targets and write one notification row per newly-added available
  // target. Spec calls out NOT decrementing for `newly_removed` — refund
  // semantics live entirely at the cap-evaluator delta.
  if (
    expertConfig.killSwitch &&
    editExpertNewlyAvailableIds.length > 0 &&
    existing.article_id
  ) {
    const { error: commitErr } = await service.rpc('commit_expert_mentions', {
      p_asker_id: user.id,
      p_target_user_ids: editExpertNewlyAvailableIds,
      p_article_id: existing.article_id,
    });
    if (commitErr) {
      console.error('[comments.PATCH.expert.commit]', commitErr);
    }

    const availableSet = new Set(editExpertNewlyAvailableIds);
    const actorUsername = user?.username || user?.user_metadata?.username || null;
    const notifRows = [];
    for (const row of editExpertNewlyAddedRows) {
      if (!availableSet.has(row.id)) continue; // inert
      if (row.id === user.id) continue;
      notifRows.push({
        user_id: row.id,
        type: 'mention',
        title: actorUsername
          ? `@${actorUsername} mentioned you as an expert`
          : 'You were mentioned as an expert',
        body: typeof body === 'string' ? body.slice(0, 280) : null,
        metadata: {
          comment_id: id,
          article_id: existing.article_id,
          actor_user_id: user.id,
          actor_username: actorUsername,
          mention_kind: 'expert_directed',
          via_edit: true,
          kill_switch_version: expertConfig.version,
        },
      });
    }
    if (notifRows.length > 0) {
      const { error: notifErr } = await service.from('notifications').insert(notifRows);
      if (notifErr) {
        console.error('[comments.PATCH.expert.notif_insert]', notifErr);
      }
    }
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

// DELETE /api/comments/[id] — owner soft-delete, or admin delete-any.
export async function DELETE(_request, { params }) {
  let user;
  let isAdminDelete = false;
  try {
    user = await requirePermission('admin.comments.delete.any');
    isAdminDelete = true;
  } catch (_) {
    try {
      user = await requirePermission('comments.delete.own');
    } catch (err) {
      if (err.status) {
        console.error('[comments.[id].permission]', err?.message || err);
        return NextResponse.json(
          { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
          { status: err.status, headers: NO_STORE }
        );
      }
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
    }
  }

  const { id } = params;
  const service = createServiceClient();

  if (isAdminDelete) {
    // Direct soft-delete via service client — same semantics as the RPC
    // (body redacted, status=deleted, deleted_at stamped, comment_count
    // decremented) without routing through the ownership check.
    const { data: row } = await service
      .from('comments')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
    }
    const { error: delErr } = await service
      .from('comments')
      .update({
        body: '[deleted]',
        body_html: null,
        mentions: [],
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (delErr)
      return safeErrorResponse(NextResponse, delErr, {
        route: 'comments.id.admin-delete',
        fallbackStatus: 400,
        headers: NO_STORE,
      });
    // Mirror the RPC's GREATEST(comment_count - 1, 0) decrement. Admin
    // deletes are rare so the fetch-then-update race window is acceptable.
    const { data: uRow } = await service
      .from('users')
      .select('comment_count')
      .eq('id', row.user_id)
      .maybeSingle();
    if (uRow && typeof uRow.comment_count === 'number') {
      await service
        .from('users')
        .update({ comment_count: Math.max(0, uRow.comment_count - 1) })
        .eq('id', row.user_id)
        .catch(() => null);
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  const { error } = await service.rpc('soft_delete_comment', {
    p_user_id: user.id,
    p_comment_id: id,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id',
      fallbackStatus: 400,
      headers: NO_STORE,
    });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
