# Completed tasks — 2026-04-24 Session 1

## L1 + maintenance copy bundle · `c012c3f`

**Scope:** master triage L1 (SEO leak via `/category` + `/card` in PROTECTED_PREFIXES) expanded per 4-agent consensus + owner directive to broadly open sitemap-published and kill-switched surfaces, plus a copy refresh on the coming-soon HoldingCard in preparation for an owner-flipped maintenance window.

**Files:** `web/src/middleware.js`, `web/src/app/welcome/page.tsx`.

**Middleware:**
- Removed from `PROTECTED_PREFIXES`: `/browse`, `/category`, `/card`, `/search`, `/u`.
- Retained: `/profile`, `/messages`, `/bookmarks`, `/notifications`, `/leaderboard`, `/recap`, `/expert-queue`, `/billing`, `/appeal`.
- Rewrote the anon-access-model comment (supersedes the 2026-04-23 articles-only directive).
- No change to the `NEXT_PUBLIC_SITE_MODE=coming_soon` redirect block — still routes every non-exempt public path to `/welcome` with `X-Robots-Tag: noindex, nofollow`, bypassed via the `vp_preview=ok` cookie set by `/preview?token=PREVIEW_BYPASS_TOKEN`.

**HoldingCard:**
- Replaced the pre-launch "Verity Post" wordmark-only plate with a three-tier layout: small eyebrow (`Verity Post`), headline (`Proofreading the proofreader.`), subline (`Back shortly.`).
- Responsive clamp sizing + `maxWidth: 12ch` on the headline for narrow phones. No new hooks; rules-of-hooks still satisfied on the outer onboarding component.

**4-agent pre-impl review (L1):**
- A, B, C converged on removing the three sitemap-published routes (A flagged `/browse` as the additional candidate beyond triage's original `/category` + `/card`).
- Adversary D surfaced 3 objections treated as out-of-scope (anon-bookmark CTA, `/card` OG leak for private profiles, `/card` canonical to `/u/<username>`). Logged as deferred items in the master triage L1 entry.

**2-agent post-impl verification:**
- Verifier 1: SHIP — anon render path verified for each opened route, no prefix collisions, maintenance-mode block intact, no external references to the reduced prefix list.
- Verifier 2 (adversary): returned NEEDS-REWORK claiming a session-cookie-refresh regression on opened routes. Ruled false positive — middleware.js:275-278 documents the skip-`getUser()`-on-public-routes behavior as an intentional p50 optimization that applies to every public route and has for months. Supabase browser client handles token refresh independently.

**Owner action items queued:**
1. Set `NEXT_PUBLIC_SITE_MODE=coming_soon` in Vercel (prod + preview) to activate the maintenance holding card site-wide.
2. Confirm `PREVIEW_BYPASS_TOKEN` is set in Vercel so `/preview?token=<TOKEN>` can grant the `vp_preview=ok` bypass cookie during maintenance.

**Session-entry owner action items (all cleared at session start):**
1. `schema/146_seed_verify_password_rate_limit.sql` — DONE. Row exists in `rate_limits` (5/hr, scope=user, active=true).
2. `schema/148_billing_rpcs_bump_perms_version.sql` — DONE. All four billing RPCs (`billing_cancel_subscription`, `billing_change_plan`, `billing_freeze_profile`, `billing_resubscribe`) live with `bump_user_perms_version` internal.
3. `NEXT_PUBLIC_SITE_URL` in Vercel — owner confirmed still set.

---

## Tier 2 band — 12 items closed

| # | Commit | Title |
|---|---|---|
| 10 | `5823194` | CommentThread + messages block POST/DELETE split |
| 11 | `d470e88` | notifications/preferences partial-PATCH semantics |
| 12 | `710be2b` + schema/152 | freeze username in update_own_profile post-set |
| 13 | `24c1a3d` | reject javascript:/data:/vbscript: in email action_url |
| 14 | `4ebb962` | iOS username ASCII-only + NFC normalize |
| 15 | `edf7791` | preserve OAuth callback ?next= through onboarding chain |
| 16 | `a227e8b` | sign out session after immediate account deletion |
| 17 | `baff805` | idempotent user_roles insert + post-write verification |
| 18 | `955af8e` + schema/151 | broker iOS username checks through /api/auth/check-username |
| 19 | `1c45eca` | graceful avatar-upload failure when bucket missing (bucket creation still owner-pending) |
| 20 | `93696f9` | narrow users select + Pick<> type (no more `select('*')`) |
| 21 | `77625e9` + schema/150 | stable [CODE] prefix on DM RPC errors |

Mid-run owner action items cleared: schema 150, 151, 152 all applied (verified via MCP).

---

## Tier 3 web band — 11 items closed, 2 STALE, 5 NOT-A-BUG

| # | Commit / status | Title |
|---|---|---|
| 22 | `86b0787` | escape LIKE metachars in promo-code lookup |
| 23 | STALE | ephemeral-client pattern already in place |
| 24 | `76a13fb` | route vote permission by type |
| 25 | `4eb37b4` | gate admin billing audit writes on billing-write perms |
| 26 | `9828613` | require same-origin on cookie-branch cancel-deletion (CSRF) |
| 27 | `6683aee` | events.batch — ignore client-supplied user_id |
| 28 | STALE | ephemeral-client pattern already in place |
| 29 | STALE | defense-in-depth user_id guard already in code at route.js:184 |
| 30 | `24b6675` | reclaim Apple notification rows stuck at 'received' |
| 31 | `08929cf` | uniform 200 on resolve-username — close enumeration |
| 32 | NOT-A-BUG | iOS async login via SDK is by design |
| 33 | `d025391` + `35c1035` | validate quiz answer length against actual quiz count |
| 34 | `3056bc5` | reject SVG avatars (stored XSS vector) |
| 35 | STALE | CRON_SECRET in Authorization header, not URL; Vercel cron uses GET |
| 36 | `34366c7` | Avatar initials split by code point, not UTF-16 unit |
| 37 | STALE | /u/[username] route exists; PUBLIC_PROFILE_ENABLED kill-switch = prelaunch-parked |
| 38 | STALE | /profile/settings/data route exists as redirect |
| 39 | `2b05dd4` | callback email_verified update uses service client (not RLS) |

---

## Admin band — 3 of 7 closed

| # | Commit | Title |
|---|---|---|
| AD1 | `aced725` | mount <ConfirmDialogHost /> on admin/words + admin/plans |
| AD2 | `63875c2` | strip raw error.message from admin toasts (DA-119 sweep, 7 files) |
| AD3 | `1d3585f` | remove DataTable keyboard shortcuts (j/k/Enter/Space) |

**Still open:** AD4 (client gate vs API perm mismatch), AD5 (role-threshold normalization), AD6 (pipeline/costs load-error toast), AD7 (design-token drift in story-manager pages).

---

## Owner action items still pending (post-session)

1. **Create `avatars` Supabase Storage bucket** (public read + own-folder upload RLS, mirror the `banners` bucket shape). Until then, avatar uploads show the graceful "not configured yet" toast from `1c45eca` instead of silently failing with raw `Bucket not found`.

---

## Handoff

Next session: read `/Users/veritypost/Desktop/verity-post/426_PROMPT.md` (committed at `f6c07f2`). It contains the full 4-agent cross-check consensus on the remaining ~50 items (Admin AD4–AD7, Kids K1–K11 + K13, Billing B2 + B4–B20, Cron/lib L2–L20) plus the STALE/NOT-A-BUG decisions so the next run doesn't re-investigate what's already been settled.
