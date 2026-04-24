# Completed tasks — 2026-04-24 Session 2

Continuation session. Session 1 closed the Tier 2 band, Tier 3 web, and AD1-AD3. This run picked up from 351ef2e and closed the remaining Admin band, every Kids iOS item (K1-K11 + K13), the billing critical + most HIGH items, and the cron/lib critical + MEDIUM batch.

## Admin band — 4 of 4 remaining closed (7/7 total)

| # | Commit | Title |
|---|---|---|
| AD4 | `fdf02bb` | gate admin users + permissions pages on API perm, not ADMIN_ROLES |
| AD5 | `3f24c16` | gate prompt-presets + categories pages on API perm keys |
| AD6 | `91ea57e` | toast pipeline/costs load failures + strip raw error.message |
| AD7 | `b2e9f56` | promote now/nowBg to ADMIN_C, drop duplicate story-manager override |

## Kids iOS band — 11 of 11 closed

| # | Commit | Title |
|---|---|---|
| K1+K10 | `0295c41` | wire real quiz pass/fail into streak + scene chain |
| K2 | `f7ef24e` | rotate kid JWT when under 24h remaining (+ /api/kids/refresh, schema/153) |
| K3 | `cd894a2` | ArticleListView filters by categorySlug end-to-end |
| K4 | `500dfe2` | surface reading_log / quiz_attempts persistence failures to scene chain |
| K6+K7 | `bc08acf` | cancel GreetingScene choreography on disappear + name change (K7 folded — ASCII-indexing claim was stale) |
| K8 | `0908817` | drop URL force-unwraps on ProfileView legal rows |
| K9 | `cca0a6e` | Color(hex:) logs + returns visible fallback on parse failure |
| K11+K13 | `8729899` | real category leaderboard rank via RPC + wire category pill (+ schema/154) |

## Billing band — 12 of 17 closed

| # | Commit | Title |
|---|---|---|
| B2+B4+B6+B7 | `dc7b69d` | stripe webhook handlers (invoice.payment_succeeded, invoice.upcoming, customer.deleted) + stuck processing reclaim |
| B5 | `bbcd785` | route promo redemption through billing_change_plan / billing_resubscribe |
| B8 | `5d95f2b` | partial UNIQUE(user_id, apple_original_transaction_id) on subscriptions (schema/155) |
| B9+B12 | `91146cb` | appAccountToken orphan fallback + strip JWS error leaks |
| B10 | `0ca552e` | drop unused pending_stripe_sync metadata flag |
| B15+B16+B19 | `a1b30d7` | rate-limit iOS sync (schema/156), preserve unhandled Apple types, resolve free plan by tier |

## Cron / middleware / lib band — 11 of 20 closed (criticals + MEDIUM quick wins)

| # | Commit | Title |
|---|---|---|
| L2 | `0493050` | hard-clear permissions cache on version bump (revokes fail closed) |
| L3 | `9d04420` | cron/send-push BATCH_SIZE 500 → 200 (under PostgREST 8KB cap) |
| L4 | `8b304e7` | Promise.allSettled on send-emails setup fetch + partial-failure handling |
| L5 | `7a46e71` | parallelize cron/check-user-achievements with concurrency cap |
| L6 | `cd5b89a` | state-machine data-exports worker + drop orphan uploads on error |
| L7 | `a050234` | createClientFromToken shape-validates the bearer before PostgREST |
| L8+L10+L11+L17+L18 | `4cc5d56` | cron/lib MEDIUM batch (rateLimit fail-open opt-in, bundle-id env, featureFlags fail-closed, sitemap cap warn, apiErrors sanitize P0001) |

## Migrations queued (owner applies via Supabase SQL editor — MCP read-only)

1. `schema/153_seed_kids_refresh_rate_limit.sql` — kids_refresh rate_limits row
2. `schema/154_get_kid_category_rank.sql` — SECURITY DEFINER RPC for kid leaderboard rank
3. `schema/155_subscriptions_apple_user_unique.sql` — partial UNIQUE on (user_id, apple_original_transaction_id)
4. `schema/156_seed_ios_subscription_sync_rate_limit.sql` — ios_subscription_sync rate_limits row

Every route works pre-apply: K2 + B15 use code-default rate limits that match the seed values; K11 loadCategory errors gracefully with the retry-state if RPC absent; B8 unique index is defense-in-depth (no live duplicates per MCP check).

## STALE / NOT-A-BUG decisions

Verified against current code — not re-raised. Triage rows get STALE blocks in the next pass.

- **B13** — promo ABA on current_uses already guarded by optimistic `.eq('current_uses', promo.current_uses)` + `promo_uses` duplicate-use check. The rollback path also eq-guards. Real race is extremely narrow; not worth more code complexity.
- **B14** — Apple JWS header timestamp validation. Defer — no clear test surface without a real Apple JWS payload to craft against. Flag for follow-up.
- **B17** — `billing_cancel_subscription` frozen-user rejection. RPC-level behavior; separate RPC fix.
- **B18** — no audit_log on Stripe webhook errors. Defer — `webhook_log` already captures errors + reasons; second audit_log row would be duplicative.
- **B20** — `handleChargeRefunded` already creates a `billing_alert` notification (shipped in B11, commit 8984700 prior session). Triage entry stale.
- **L9** — APNs JWT max-age check. Verified: `jwtCache.expiresAt = now + 50min`; check `expiresAt > now + 60` refreshes before 50min elapses. Well under Apple's 60min invalidation. Claim stale.
- **L12** — plans.js TIERS/PRICING hardcoded. Real but LARGE; requires DB read path for admin display, client-side plan picker refactor. Keep as follow-up.
- **L13** — roles.js 60s cache. 60s staleness on admin role-dropdown is acceptable UX; don't thrash the cache for this.
- **L14** — pipeline/persist-article already guards `if (!row) throw`. Claim stale.
- **L15** — cost-tracker THROWS (fail-closed) on invalid cap value via parseNum. The `-1` sentinel is documented as the fail-closed breach signal, not a silent uncapped. Claim stale.
- **L16** — CSP Report-Only is intentional (scope item, not a bug).
- **L19** — cron/send-push concurrency lock. Needs schema (claim column or advisory-lock RPC). Defer.
- **L20** — cronAuth length-equality timing already mitigated by random secret. Claim stable.

## Owner action items still pending

1. **Apply schema/153, 154, 155, 156** via Supabase SQL editor.
2. **Create `avatars` Supabase Storage bucket** (carried from Session 1).

## Handoff

Next session: read `/Users/veritypost/Desktop/verity-post/427_PROMPT.md`.
