# Edge cases + scenarios

What can go wrong, what's ambiguous, what's rare-but-real. Each one needs an answer before launch.

---

## Family + parental scenarios

### S1. Custody change — parent transfer
Parent A has Family plan with 2 kids. Parent A and Parent B divorce. Parent B gets custody of one kid.

**Question:** can Parent B claim the kid profile from Parent A's family?

**Recommendation:** no automatic transfer. Manual support flow. Either:
- Parent A deletes kid profile, Parent B creates new one (kid loses history)
- Support manually re-parents the kid profile (preserves history; requires both parents' written consent)

**Rationale:** parents fight about kids. Auto-transfer flows get weaponized. Manual review is the right friction.

**Build:** no code change. Document the support workflow.

---

### S2. Two parents on one family — who has admin rights?
Family plan supports "up to 2 adults." How are family settings (add kid, advance band, request DOB correction) gated?

**Recommendation:** any adult on the family plan can perform parent actions. No "primary parent" concept. Both have full rights.

**Edge case:** Parent A wants to advance kid to tweens; Parent B doesn't. Whoever clicks first wins. Audit log shows who.

**Build:** no special role logic. RLS check is `parent_user_id IN (family.adults)`.

---

### S3. Single parent
1 adult, N kids. Family plan still works. `max_total_seats = 6` so plenty of room. No special handling.

---

### S4. Parent removes other parent from family
Parent A removes Parent B (divorce, etc.).

**Recommendation:** the removed parent loses kid-management rights but keeps reading access (their adult Verity Family seat). They can subscribe independently after.

**Build:** existing family-member removal flow needs updating to handle this gracefully. Verify path in `web/src/app/profile/family/`.

---

### S5. Family plan owner cancels — what happens to other family members?
Parent A owns Family sub. Cancels. Parent B (added adult) and the kids lose access.

**Recommendation:** at cancel, all family members get a 7-day grace period. Then:
- Parent B drops to Free tier (their account stays)
- Kids' kid profiles get marked `is_paused=true` (preserved, not deleted; can be reactivated if Parent A or B re-subscribes within 30 days)
- After 30 days: kid profiles soft-deleted

**Build:** new `subscription.cancel.cascade` cron job that handles the cascade after 7 + 30 days.

---

### S6. Kid hits 13 mid-session in kid app
Birthday passes during a reading session.

**Recommendation:** kid app doesn't auto-graduate. Continues normally until parent triggers graduation or birthday-prompt cron runs. Parent gets prompted, decides when to actually graduate.

**Build:** ensure kid app doesn't enforce age >= 13 client-side as a hard block; only the band ratchet is enforced.

---

### S7. DOB correction shifts kid past 13
Parent submits DOB correction that would make kid 13+.

**Recommendation:** server rejects at submission. Modal error: "Corrections cannot move a child past 13. Use the graduation flow if your child is 13 or older."

**Build:** validation in `/api/kids/[id]/dob-correction` POST handler.

---

### S8. Multiple kids in family with same DOB (twins, triplets)
Legitimate case.

**Recommendation:** allow it. Don't trigger fraud signal "multiple kids with same DOB" — instead trigger "multiple kids with same DOB AND parent has lifetime correction history" or other compound signals.

**Build:** fraud signal logic in the admin DOB queue should handle twins gracefully.

---

### S9. Family plan with 4 kids, parent adds 5th
Hard cap.

**Recommendation:** UI says "Verity Family supports up to 4 kids. Need more? Contact support." Big-family edge cases handled manually.

**Build:** seat-add endpoint returns 400 with `over_kid_cap` error type. Support manually overrides via admin tool.

---

### S10. Family with paid kid seats — kid graduates, refund window?
Parent paid $4.99/mo for extra kid 4. Kid 4 graduates. Bill drops $4.99 next cycle. Mid-cycle?

**Recommendation:** no mid-cycle refund. Bill drops at next renewal. Standard subscription behavior.

**Build:** documented in payment-flow logic. No special refund code.

---

## Account + auth scenarios

### S11. Graduated kid forgets adult password
Parent set up the adult account email, gave kid the temp password. Kid lost it.

**Recommendation:** standard password reset flow via the email parent provided. Email goes to whoever owns that mailbox (parent or kid, depending on what email they used).

**Build:** existing password reset works.

---

### S12. Parent enters wrong email at graduation
Adult account created with typo'd email. Email never delivers.

**Recommendation:** support flow. Admin can update the email on the adult account via existing admin user-management. Kid claims the now-correct account.

**Build:** existing admin user edit. No new code.

---

### S13. Kid graduated but doesn't claim adult account
Account created, but kid never logs in.

**Recommendation:** account stays. Family seat still occupied. After 90 days inactive, send reminder email. After 1 year inactive, optionally archive (returns the seat). Configurable via setting.

**Build:** new cron `inactive-graduate-reminder` (low priority, post-launch).

---

### S14. Two graduated kids share an email
Twins, parent uses one email for both with `+1`/`+2` aliases.

**Recommendation:** allow distinct emails (with aliases) but block exact-duplicate. Standard `auth.users.email` unique constraint.

---

### S15. Family-tier sub on web; kid uses iOS kid app
Cross-platform: parent subscribed via Stripe, kid app on iOS.

**Recommendation:** works fine. Kid app uses delegated kid JWT, doesn't care what platform the family sub lives on. Server checks family plan via `users.family_id` linkage.

**Build:** verify kid auth flow doesn't break across platforms.

---

### S16. User has Free account on web, signs up via iOS
Web user opens iOS app for first time. Logs in. Goes to subscribe. Apple paywall.

**Recommendation:** Apple sub created. `user_subscriptions.platform = 'apple'`. Web account now sees iOS-billed sub. No conflict.

---

### S17. Web Free user → iOS Free user → Stripe sub on web → Apple sub on iOS
Edge case. Possible if user double-subscribes despite warnings.

**Recommendation:** detect at next webhook + show resolution UX (per Flow 12). Allow user to keep one, cancel other.

**Build:** dual-sub detection + resolution UI.

---

## Subscription scenarios

### S18. Stripe sub, kid_seats_paid out of sync with Stripe quantity
Webhook lost or DB write failed.

**Recommendation:** daily reconciliation cron pulls Stripe state for all active subs, fixes DB drift.

**Build:** new cron `subscription-reconcile-stripe`. Compares `user_subscriptions.kid_seats_paid` to Stripe `subscription_items[ExtraKid].quantity`. Logs diffs, optionally auto-fixes.

---

### S19. Apple sub, SKU doesn't match kid count in DB
Apple notification missed or mishandled.

**Recommendation:** same reconciliation pattern. Cron pulls App Store Server API for active subs, fixes drift.

**Build:** new cron `subscription-reconcile-apple`.

---

### S20. Subscription expires due to payment failure
Card declined, sub enters dunning.

**Recommendation:**
- Stripe: 3 retry attempts over 7 days. After all fail, sub cancels. Family loses access immediately.
- Apple: Apple handles dunning (16 days standard). After all fail, sub expires. Family loses access.

**Build:** webhook handlers for `invoice.payment_failed` + `DID_FAIL_TO_RENEW`. Send email to parent at each retry. Final cancel triggers Flow S5 (cancel cascade).

---

### S21. Family plan churns mid-cycle, parent re-subs immediately
Cancel + re-sub within 24 hours.

**Recommendation:** kid profiles preserved (within the 30-day soft-delete window). Re-sub picks up where they left off.

**Build:** existing logic should handle. Verify kid profiles aren't hard-deleted on cancel.

---

### S22. Family plan upgrades from 2 kids to 4 kids in single transaction
Parent adds 3 kids in rapid succession.

**Recommendation:**
- Web (Stripe): each "add kid" submits a separate API call → 3 webhook events. UI debounces or shows "in progress" state during the burst.
- iOS (Apple): each upgrade requires Apple sheet confirmation. Parent does 3 confirmations.

**Build:** UI handles in-flight seat-update state to prevent double-click adding the same kid twice.

---

## DOB correction edge cases

### S23. Parent submits correction during cooldown
Parent A submits younger-band correction; cooldown counting. Parent B (other parent) submits ANOTHER correction for same kid.

**Recommendation:** unique index `idx_dob_corrections_one_pending` blocks. Parent B sees "A correction is already pending."

---

### S24. Younger-band correction during cooldown raises new fraud signal
Day 5 of cooldown: parent upgrades to Family XL paid tier. New signal fires.

**Recommendation:** cron job re-evaluates pending requests daily. If signals change → escalate to manual. Prevents auto-approval if context changes mid-cooldown.

**Build:** cron logic checks signals at each daily run, not only at submission.

---

### S25. Documentation upload contains PII for the kid
Birth certificate has SSN, full address.

**Recommendation:** parent-facing UI says "Redact sensitive info before uploading. We only need DOB and name to verify." Encrypt at rest, auto-delete 90 days post-decision (M9). Limit admin access to permission-gated users.

**Build:** UI copy + storage encryption + 90-day TTL cron.

---

### S26. Admin disagrees with cron auto-approval
Cron auto-approves request, admin later thinks it should have been escalated.

**Recommendation:** approved corrections cannot be reverted (band ratchet). Admin notes their disagreement in audit. Future fraud signal logic improved.

**Build:** no reversal mechanism. Audit-only.

---

### S27. DOB correction when kid is currently in middle of using kid app
Cron auto-approves at 03:30. Kid wakes up, opens kid app. Sees their band changed.

**Recommendation:** silent transition (per decisions). Kid app shows new content for new band. No notification.

**Build:** ensure kid app handles JWT band claim refresh gracefully.

---

### S28. Parent attempts second correction after first was approved
Lifetime limit enforced.

**Recommendation:** UI blocks at submission with "You've already used your one correction for [name]. Contact support for further help."

**Build:** unique index `idx_dob_corrections_lifetime` enforces at DB level. UI checks first to give friendly error.

---

## Pipeline + content scenarios

### S29. Cluster generates kids version, fails tweens version
Per-band failure isolation.

**Recommendation:** kids article persists; tweens marked failed. Pipeline run shows partial success. Admin can retry tweens-only generation from the cluster detail view.

**Build:** route handles per-band errors independently. New "Retry tweens" button.

---

### S30. Audience safety check rejects cluster
Adult-only content (war, drugs, scandal). Kid pipeline aborts.

**Recommendation:** discovery_items marked `state='ignored'` for that cluster's kid generation. Audit reason: `audience_mismatch`. Admin can override and force-generate (`audience_safety_check_override` flag) — rare, manual case.

**Build:** existing audience_safety_check; add admin override button (gated by permission).

---

### S31. Article published with wrong age_band
Editor accidentally published Kids article tagged as Tweens.

**Recommendation:** `age_band` is editable in admin. Editor changes it, RLS instantly affects visibility. Audit log records the change.

**Build:** admin manager allows `age_band` edit. Verify audit log captures.

---

### S32. Pipeline cost spike — kid generation runs hot
2× cost ceiling exceeded due to retries or large clusters.

**Recommendation:** existing daily cost cap (`pipeline.daily_cost_usd_cap`) enforces hard stop. Settings configurable.

**Build:** existing kill switch holds.

---

### S33. Existing pre-banding kid articles need migration
Articles with `is_kids_safe=true` exist with no `age_band` set.

**Recommendation:** M5 backfill sets all to `age_band='tweens'` (closer to current 8-14 voice). Admin can re-tag manually if some are kids-tier.

**Build:** M5 migration. Optional admin re-tag UI.

---

## Plan + grandfather scenarios

### S34. Grandfathered Pro user adds a family member
Wants to upgrade Pro → Family.

**Recommendation:** allow. Standard upgrade flow. Pro sub cancels, Family sub starts. Doesn't matter that Pro was a legacy plan.

**Build:** existing upgrade flow handles via Stripe/Apple. No special logic.

---

### S35. Grandfathered Pro user's renewal date passes (Option B migration)
Cron migrates them to Verity at renewal.

**Recommendation:** documented in `08_FLOWS.md` Flow 11. Email sent in advance.

**Build:** new cron + email template.

---

### S36. New user signs up before launch with Pro tier
Closed-beta or developer tier.

**Recommendation:** owner-tier referral codes (per `web/src/app/api/admin/referrals/mint/route.ts`) — update them to grant Verity instead of Pro post-migration.

**Build:** update mint endpoint to use Verity tier.

---

### S37. Plan tier mid-cycle change
User on Verity, upgrades to Family on day 15 of monthly cycle.

**Recommendation:**
- Stripe: prorates immediately
- Apple: handles via subscription group upgrade (immediate or end-of-cycle, configurable)

**Build:** existing payment infra handles. Verify behavior on test sub.

---

## Permission + ad scenarios

### S38. Free user hits article cap mid-read
User reads 5 articles, opens 6th, hits cap.

**Recommendation:** soft paywall — show partial article (lede only), CTA "Subscribe to read more."

**Build:** new metered-paywall component. Server returns truncated article body if over cap. Free-tier-only.

---

### S39. Family parent on adult app sees ads (should not, since they're paid)
Parents on Family tier accidentally see ads.

**Recommendation:** subscriber check before rendering AdMob banner. Plan tier in user state.

**Build:** `AdProvider.swift` reads subscription state, only renders for free-tier users.

---

### S40. Kid app accidentally shows ads
Critical bug — COPPA violation.

**Recommendation:** kid app NEVER imports AdMob SDK. Linter/CI check enforces this. Audit before every release.

**Build:** add CI rule that fails build if AdMob SDK appears in VerityPostKids targets.

---

## Auth + COPPA scenarios

### S41. Parent revokes COPPA consent
Parent decides they no longer consent. Wants kid data deleted.

**Recommendation:** COPPA-compliant deletion flow. Parent-initiated via family settings:
- Soft-delete kid profile
- Hard-delete kid reading_log, quiz_attempts, streaks, sessions within 30 days
- Audit log retained (admin decisions, billing events) — anonymized
- Kid_dob_history retained for legal record (anonymized after retention period)

**Build:** new endpoint `/api/kids/[id]/coppa-revoke` + cron `coppa-deletion-30day`.

---

### S42. GDPR user deletion request
Adult user requests full account deletion (Right to Erasure).

**Recommendation:** existing GDPR flow (verify it exists at `/profile/settings/data`). Ensure it handles:
- Cancel subscription
- Delete or anonymize all PII
- If user is family parent: cascade to kid profiles (forced COPPA deletion of kids)
- If user has graduated-kid history: their kid_profile (now graduated) also deletes

**Build:** verify existing GDPR endpoint is thorough. Augment for graduated-kid cascade.

---

### S43. Kid app PIN locked out
Kid enters wrong PIN too many times. `pin_locked_until` set.

**Recommendation:** existing logic. Parent unlocks via parental gate or PIN reset.

**Build:** existing.

---

### S44. Kid loses interest, parent stops paying for extra seat
Child 3 hasn't logged in for 60 days. Parent removes seat.

**Recommendation:** Flow 3 (kid removal). Bill drops at next renewal.

---

## Operational scenarios

### S45. Pipeline kill switch flipped while a kid run is in flight
Admin disables `ai.kid_band_generation_enabled` mid-run.

**Recommendation:** kill switch checked at run start; in-flight runs continue to completion. Subsequent runs blocked. Admin can also force-cancel via cancel route.

**Build:** existing kill switch behavior. Verify mid-run check isn't required.

---

### S46. Migration M2 (drop kid_articles) runs while pipeline still writes there
Race condition.

**Recommendation:** rollout sequence:
1. Deploy code update that writes kid runs to `articles` (with `is_kids_safe=true`)
2. Verify zero new writes to `kid_articles` for 24 hours
3. Run M2 (drop tables)
4. Old reads (from admin tools — already pointed at `articles`) keep working

**Build:** strict deploy ordering. M2 must NOT run before code deploy + soak.

---

### S47. RLS migration M10 deploys with broken policy
RLS rejects all reads.

**Recommendation:** test M10 in staging first. Rollback plan: drop new policies, restore old `kid_articles_*` policies (kept around in `kid_articles_legacy_*` form for 30 days).

**Build:** dual-policy window during rollout.

---

### S48. Cron job missed run
Vercel/Supabase cron infra has issues.

**Recommendation:** crons are idempotent (per-day checks). Missing one day means one day delay. Acceptable.

**Build:** ensure all crons can re-run safely.

---

### S49. App Store rejects new SKUs
Apple review rejects family-tier SKUs (e.g., "deceptive kid pricing").

**Recommendation:** before submission, verify pricing copy is unambiguous. Provide review notes describing the family-seat model. Be ready to defend "Up to 4 kids for $4.99/mo each."

**Build:** clear App Store Connect copy + review notes.

---

### S50. Webhook delivery delayed beyond 24h
Stripe or Apple webhook processing delayed.

**Recommendation:** reconciliation crons (S18/S19) catch drift within 24 hours. User-facing UI shows pending state during the gap.

**Build:** existing reconciliation pattern.

---

## Decision-needed scenarios (deferred)

These are real cases without a chosen answer yet:

| Scenario | Decision needed |
|---|---|
| S5 (cancel cascade timing) | Confirm 7-day grace + 30-day soft-delete window |
| S11 (graduated kid password) | Confirm parent-set initial password → kid-resets is the right path |
| S13 (inactive graduate cleanup) | Confirm 1-year inactivity threshold |
| S20 (sub expiration grace) | Confirm 7-day grace post-payment-fail aligns with payment policies |
| S39 (ad-free for subscribers) | Confirm: do annual subscribers see fewer ads, or zero? Recommendation: zero across all paid tiers |
| S41 (COPPA revocation cascade) | Confirm 30-day deletion window |
| Kid app entry age (3-6) | Owner decision: gate out, or curated kids-band feed? |

These don't block early phases but should be decided before Phase 5.
