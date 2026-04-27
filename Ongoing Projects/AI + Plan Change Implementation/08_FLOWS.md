# End-to-end flows

Walking through every flow that touches multiple surfaces. Each flow names the trigger, the steps, the surfaces, and the failure modes.

---

## Flow 1: Initial kid profile creation

**Trigger:** parent on Family plan adds a kid via `/profile/family` (web) or FamilyViews (iOS).

**Steps:**
1. UI form: display name, DOB (required, 3-12), avatar, optional PIN
2. Pre-flight: check `kid_seats_paid >= current_kid_count + 1`
   - If yes → proceed
   - If no AND `at included_kids cap` → show "$4.99/mo will be added" confirmation modal
   - On confirm: trigger seat upgrade (Stripe quantity++, or Apple SKU upgrade)
3. POST `/api/kids` with payload (existing endpoint)
4. Server validates DOB, checks COPPA consent, computes initial `reading_band` from DOB:
   - `kids` if age < 10
   - `tweens` if 10 ≤ age < 13
   - (Age ≥ 13 rejected at the validation layer — kid profiles for 13+ aren't allowed)
5. Insert `kid_profiles` row with `reading_band`, `band_changed_at = now()`, `band_history = [{...initial entry}]`
6. Audit: `kid_dob_history` row with `change_source='initial_creation'`
7. Return `id` to client
8. Client redirects to kid detail view

**Failure modes:**
- DOB invalid (range or format) → 400, parent fixes
- Over seat cap → 402, parent prompted to upgrade Family seats
- Subscription update failed (Stripe/Apple error) → 503, parent retries; no kid profile created
- Concurrent seat upgrade race → server-side mutex on `user_subscriptions` row

---

## Flow 2: Adding an extra kid (over included_kids)

**Trigger:** parent already has Family with 1 kid (included), tries to add 2nd.

**Steps:**
1. Pre-flight detects current kid count = `included_kids`
2. Modal: "Adding another kid increases your subscription by $4.99/mo. Continue?"
3. Parent confirms
4. **Web (Stripe):**
   - Server: increment `subscription_items[ExtraKid].quantity`
   - Stripe responds with prorated invoice (charged immediately for remainder of cycle)
   - Webhook `subscription.updated` → update `user_subscriptions.kid_seats_paid`
5. **iOS (Apple):**
   - Client calls `StoreManager.upgrade(toProduct: 'com.veritypost.family.{N+1}kids.monthly')`
   - Apple presents prorated charge UI, user confirms in Apple sheet
   - On success: receipt posted to server, `user_subscriptions` updated
6. Once seats++ confirmed: kid create form proceeds normally (Flow 1 from step 3)

**Failure modes:**
- Apple StoreKit error (cancelled, declined card) → kid create blocked, error toast
- Stripe charge failed → kid create blocked, parent updates payment method
- Webhook lag (kid_seats_paid not updated yet) → optimistic UI shows pending state, retries on next page load

---

## Flow 3: Removing a kid (parent-initiated, not graduation)

**Trigger:** parent deletes a kid in `/profile/kids/[id]`.

**Steps:**
1. Confirmation modal: "Permanently delete [name]'s profile? Reading history, streaks, and quiz scores will be deleted. Cannot be undone."
2. Parent confirms
3. DELETE `/api/kids/[id]?confirm=1`
4. Server: soft-delete `kid_profiles.is_active = false`. Verify it's a soft-delete (per Models.swift comments) so the row's history is preserved for audit.
5. Compute new `kid_seats_paid` count = current_active_kids
6. **If new count < paid_seats:**
   - Stripe: decrement subscription_item quantity (effective at next renewal)
   - Apple: queue downgrade SKU at next renewal
   - Show parent: "Your bill will drop to $X.XX/mo at next renewal on [date]"
7. Revoke kid sessions (`kid_sessions.revoked_at = now()`)
8. Audit log entry

**Failure modes:**
- Soft-delete race (kid using kid app at the moment of delete) → next API call from kid app sees revoked session, returns to login
- Stripe seat decrement webhook lag → DB shows new state immediately, sub state catches up within seconds

---

## Flow 4: Manual band advance (kids → tweens)

**Trigger:** parent in family settings clicks "Advance to Tweens" on a kid currently in `kids` band.

**Steps:**
1. Confirmation modal: "Move [name] to Tweens. They'll see articles for ages 10-12. This cannot be undone."
2. Parent confirms
3. POST `/api/kids/[id]/advance-band` with `{ to: 'tweens' }`
4. Server: validates parent owns kid, validates target band is forward-only
5. UPDATE `kid_profiles SET reading_band = 'tweens', band_changed_at = now(), band_history = band_history || [{ entry }]`
6. Trigger M7 enforces ratchet (reject if would regress)
7. Kid app on next data fetch sees new band, expands visible content
8. Audit log

**Failure modes:**
- Trigger rejects (somehow regressing) → 400, parent sees "cannot move backward"
- Parent doesn't own kid → 403

---

## Flow 5: Birthday auto-prompt (cron-driven)

**Trigger:** daily cron `/api/cron/birthday-band-check` runs at 03:00 UTC.

**Steps:**
1. Query: `SELECT * FROM kid_profiles WHERE is_active = true`
2. For each kid, compute age from DOB
3. Identify boundary crossings:
   - kids → tweens at age 10
   - tweens → graduated at age 13
4. If boundary crossed AND `reading_band` not yet advanced:
   - Insert into `notifications` table targeting `parent_user_id` with type `band_advance_prompt`
   - Email parent with "Your child turns 10/13. Time to advance their reading band?"
   - Set `kid_profiles.metadata.birthday_prompt_pending = true` (or use a separate column)
5. Parent receives notification + email
6. On parent's next login: family screen shows prompt banner
7. Parent clicks → confirmation → triggers Flow 4 (manual advance) or Flow 6 (graduation)

**Failure modes:**
- Cron job missed → re-runs next day; no harm (notifications idempotent)
- Parent ignores prompt → re-prompted weekly
- Auto-advance NEVER happens — parent must click

---

## Flow 6: Graduation (kid → adult account)

**Trigger:** kid hits age 13, parent triggers graduation manually OR via birthday prompt.

**Steps:**
1. Parent in family settings clicks "Move [name] to the adult app"
2. Confirmation modal:
   ```
   Moving [name] to the adult app:
   • Their kid profile will be retired (cannot be reversed)
   • They'll get a new adult account on your family plan
   • Reading history, streaks, quiz scores will NOT carry over
   • Their category preferences will carry over
   • They'll need to set their email and password
   ```
3. Parent confirms
4. Modal: parent enters new adult account email + temp password (or "send claim link to this email")
5. POST `/api/kids/[id]/advance-band` with `{ to: 'graduated', email, password }`
6. Server:
   - Creates `auth.users` row with submitted email + password (or generates claim token)
   - Links new user to family group (via `family_members` or whatever the existing relation is)
   - Copies kid's category prefs to new user prefs
   - UPDATE `kid_profiles` SET `reading_band = 'graduated', is_active = false, band_changed_at = now()`
   - Revokes all `kid_sessions`
   - Decrements `kid_seats_paid` if the kid had a paid extra-kid seat (graduation = net-zero on total seats, but if extras paid for, they refund)
   - Audit log
7. Send email to parent: "[name]'s adult account is ready. They can log in with [email]."
8. Send email to kid (if email provided): "Your account has graduated! Log in at..."
9. Kid on next launch of kid app:
   - Sees "You've moved to the main app!" screen
   - Deep link to VerityPost
10. Kid in VerityPost:
    - Sees graduated welcome screen (claim flow if used token, else logs in normally)
    - Categories are pre-selected from carry-over

**Failure modes:**
- Email already in use by another `auth.users` row → 409, parent picks different email
- Family seat math broken (over-cap somehow) → server validates, rejects, manual support resolution
- Adult account creation fails mid-graduation → kid profile NOT marked graduated; parent retries

---

## Flow 7: DOB correction request (younger band)

**Trigger:** parent realizes they entered DOB wrong, child is actually younger than indicated. Wants to move from tweens band to kids band.

**Steps:**
1. Parent on `/profile/kids/[id]` clicks "Was DOB entered incorrectly?"
2. DOB Correction Request modal opens
3. Parent fills:
   - Requested DOB (date picker)
   - Reason (10-280 chars, required)
4. Preview shows: "Will move [name] from Tweens (10-12) to Kids (7-9)"
5. Submit → POST `/api/kids/[id]/dob-correction`
6. Server validates:
   - One pending request per kid (M8 unique index)
   - Lifetime limit: zero approved corrections previously
   - Requested DOB shifts age by ≤ 3 years
   - Resulting age stays in 3-12 range
   - Resulting band is younger or equal to current → auto-eligible for cooldown
7. Insert `kid_dob_correction_requests` with `status='pending'`
8. Email parent: "Request received. We'll review within 7 days."
9. Cron `dob-correction-cooldown` runs daily:
   - For each pending request older than 7 days with younger-band move and no fraud flags → invoke `admin_apply_dob_correction(request_id, 'approved', 'Cooldown auto-approval')`
   - Status flips to `approved`, DOB updated, band recomputed
10. Email parent: "Approved. Your child's reading band is now Kids."
11. Audit: `kid_dob_history` row with `change_source='admin_correction'` (even though auto)

**Failure modes:**
- Lifetime limit exceeded (already used correction) → 409, parent must contact support
- Concurrent pending request → 409
- Fraud signals fire during cooldown → request escalates to manual admin review (status remains `pending`, no auto-approve, admin notified)

---

## Flow 8: DOB correction request (older band — requires docs)

**Trigger:** parent realizes child is actually older than indicated. Wants to move from kids band to tweens band.

**Steps:**
1. Parent opens DOB correction modal
2. Parent fills requested DOB → preview shows "Will move from Kids to Tweens"
3. UI surfaces: "Older-band corrections require birth-certificate documentation"
4. Parent uploads doc (encrypted at rest, 90-day TTL)
5. Submit → server inserts `kid_dob_correction_requests` with `status='pending'`, `documentation_url` set
6. Email parent: "Request received. Older-band corrections require manual review. We'll respond within 14 days."
7. Admin in DOB queue sees request, reviews doc + household context
8. Admin decides:
   - **Approve:** invoke `admin_apply_dob_correction(...)`. DOB updated, band recomputed. Email parent.
   - **Reject:** `kid_dob_correction_requests.status='rejected'`. Email parent with reason.
   - **Request more docs:** status flips to `documentation_requested`. Parent uploads more docs and resubmits.

**Failure modes:**
- Doc upload too large / wrong format → 413/415, parent retries
- Doc OCR fails (if you ever automate) → admin reviews manually
- Parent ignores doc-request response → request expires after 30 days, status flips to `rejected_no_response`

---

## Flow 9: Plan downgrade with kids (gating)

**Trigger:** Family-tier subscriber tries to downgrade to Verity solo or Free.

**Steps:**
1. Parent clicks "Change Plan" → "Verity Solo"
2. Server check: `current_kid_count > 0`?
3. If yes: hard-stop modal:
   ```
   You have N kid profiles on your Family plan.
   Verity Solo doesn't support kid profiles.
   To downgrade, first delete each kid profile.
   ```
4. UI provides "Manage kids" link → `/profile/family/page.tsx` for deletion (Flow 3)
5. After all kids deleted: parent retries downgrade
6. Now `current_kid_count = 0` → downgrade proceeds:
   - Stripe: subscription update to Verity SKU (effective at next renewal, or immediate prorated downgrade depending on policy)
   - Apple: SKU downgrade within group, scheduled for next renewal
7. On webhook: `user_subscriptions.tier = 'verity'`, `kid_seats_paid = 0`

**Failure modes:**
- Parent declines deletion modal → no plan change
- Webhook lag → UI shows downgrade pending; sub state updates within seconds

---

## Flow 10: Anon → Verified Free (verification)

**Trigger:** new user signs up with email, hasn't verified yet.

**Steps:**
1. Signup form on `/signup` (web) or `SignupView` (iOS)
2. POST `/api/auth/signup` (existing) → creates `auth.users` row with `email_confirmed_at = NULL`
3. Email sent with verification link
4. User clicks link → verification endpoint sets `email_confirmed_at = now()`
5. User redirected to home, can now bookmark/comment (subject to plan tier)

**Failure modes:**
- Email never received → resend flow
- Verification link expired → request new link

---

## Flow 11: Verity Pro grandfather migration (Option B)

**Trigger:** existing Pro subscriber's renewal date approaches.

**Steps (per the recommended Option B in `03_PAYMENTS.md`):**
1. 30 days before renewal: cron identifies all `user_subscriptions WHERE plan IN ('verity_pro_monthly', 'verity_pro_annual')`
2. Send email: "Verity Pro is now Verity (same features, $7.99/mo). Your next renewal will charge at the new lower price."
3. On renewal date: Stripe webhook `invoice.upcoming` triggers a subscription update from Pro SKU to Verity SKU
4. Stripe charges the new price ($7.99 instead of $9.99)
5. `user_subscriptions.plan` updates to `verity_monthly`
6. Email confirmation: "You're now on Verity at $7.99/mo. Welcome to the new plan."

**Failure modes:**
- Pro subscriber on Apple → Apple StoreKit doesn't allow programmatic plan-switch the same way. Either (a) require Apple Pro users to manually re-subscribe to Verity (with a friendly UI), or (b) wait for them to cancel naturally (Apple sub eventually expires) and re-onboard.
- Recommended: send Apple Pro users in-app banner asking them to "Switch to Verity to lock in your new lower price." Convert organically.

---

## Flow 12: Cross-platform sub conflict

**Trigger:** user has Stripe sub, opens iOS app, taps Subscribe.

**Steps:**
1. iOS app fetches `/api/me/subscription` on launch
2. Server returns: `{ plan: 'verity', platform: 'stripe' }`
3. iOS subscription view detects `platform != 'apple'`
4. Renders banner: "You have an active Verity subscription on web. Manage it at veritypost.com/profile/billing"
5. No purchase buttons shown
6. If user taps the link: Safari deep link to web billing

**Failure modes:**
- Phantom dual-sub (both Stripe and Apple have active subs somehow) → handled per `03_PAYMENTS.md` resolution UX

---

## Flow 13: Pipeline kid run produces 2 articles (banded)

**Trigger:** admin clicks "Generate" on a kid-safe cluster in `/admin/newsroom`.

**Steps:**
1. POST `/api/admin/pipeline/generate` with `{ cluster_id, audience: 'kid', ... }`
2. Pipeline (per `04_PIPELINE.md`):
   - audience_safety_check → passes
   - source_fetch → corpus assembled
   - categorization → kid-safe category picked
   - For both bands in parallel:
     - headline (kids voice or tweens voice)
     - summary
     - body
     - source_grounding
     - plagiarism_check
     - timeline
     - kid_url_sanitizer
     - quiz
     - quiz_verification
   - persist (twice — once per band)
3. Returns `{ ok: true, articles: [{ id, age_band: 'kids', slug }, { id, age_band: 'tweens', slug }] }`
4. Admin sees both articles in cluster detail view
5. Each article has its own status (draft → published)
6. Admin reviews + publishes Kids article via Kids Story Manager
7. Admin reviews + publishes Tweens article via Tweens Story Manager
8. Both visible to appropriate readers via RLS

**Failure modes:**
- Audience check rejects → no kid articles, run ends with `audience_mismatch`
- Single band fails (e.g., kids body throws schema_validation) → tweens article still persisted; kids retried separately, OR whole run fails depending on policy
- Recommendation: per-band failure isolation. If one band fails, the other persists. Run status reflects partial success.

---

## Flow 14: Kid app launches for graduated kid

**Trigger:** kid was graduated; opens kid app the next day.

**Steps:**
1. App auto-login attempt with stored kid session
2. Server: `kid_sessions.revoked_at IS NOT NULL` → 401
3. Kid app shows login screen
4. Kid enters PIN → server: `kid_profiles.is_active = false` → 403 with reason `graduated`
5. Kid app shows graduated handoff screen:
   ```
   You've moved to the main app!
   Your reading lives at Verity Post now.
   [Open Verity Post]
   ```
6. Tap → opens VerityPost via deep link with graduation context
7. VerityPost: kid logs in with new credentials (parent provided), or completes claim flow

---

## Flow 15: Kid app launches for kid whose band changed mid-session

**Trigger:** kid is using kid app; parent advances them from kids → tweens via web.

**Steps:**
1. Kid currently has feed open. RLS-enforced filter still in effect with old band claim in JWT.
2. JWT has limited TTL (verify how often it refreshes — likely every 5-15 min)
3. On next JWT refresh: new band reflected in claims → RLS allows tweens articles
4. Kid app on next feed fetch: sees both kids and tweens articles
5. Or: send a push notification "Your reading level has been updated!" prompting refresh

**Failure modes:**
- JWT not refreshing fast enough → stale view for up to JWT TTL. Acceptable.
- Could force JWT refresh on `kid_profiles.UPDATE` via Supabase realtime subscription, but adds complexity. Defer.

---

## Flow 16: Family with all kids graduated (empty kid section)

**Trigger:** last kid in family graduates.

**Steps:**
1. Flow 6 completes for last kid
2. `current_kid_count = 0`, `kid_seats_paid` decrements to 0 (since included_kid is now consumed by an empty seat)
3. Family plan: still active, just no kids on it. Stays Family because graduated kids occupy adult seats now.
4. Parent's family screen shows: "0 kids. 4 adults (you, partner, [graduated kid 1], [graduated kid 2])."
5. Optional: prompt "All kids have graduated. Want to keep Family or switch to Verity solo?" — but only if all 4 adult seats aren't filled. If they're at 4 adults, Family is the only option.

---

## Flow 17: Refund / accidental seat addition

**Trigger:** parent accidentally clicked "Add kid" on Family-1kid → triggered Family-2kid SKU upgrade. Wants refund.

**Steps:**
1. Parent contacts support (in-app contact form or email)
2. Support agent (admin user) opens admin subscriptions page, finds the user
3. Finds the recent seat-charge in `billing_events`
4. Decision:
   - If within 7 days of charge: issue partial refund via Stripe Dashboard (manual action)
   - If beyond 7 days: per policy, no refund; kid seat stays paid until next renewal
5. For Apple: redirect parent to Apple Support — Stripe equivalent doesn't apply
6. Admin records resolution in `admin_actions`

---

## Flow 18: Comments + bookmarks on graduated adult account

**Trigger:** new graduated adult account starts using comments/bookmarks.

**Steps:**
1. Adult account is on Family plan (via family link)
2. Plan-tier permission check: Family includes comments + bookmarks
3. New comment / bookmark → standard adult flow
4. **Note:** kid profile's old comments/bookmarks NEVER existed (kids don't comment or bookmark per Models.swift comment), so nothing to carry over.

---

## Each flow's audit log entries

| Flow | Action key |
|---|---|
| 1 | `kid_profile.create` |
| 2 | `family.seat.add` |
| 3 | `kid_profile.delete` + `family.seat.remove` |
| 4 | `kid_profile.advance_band` |
| 5 | (cron, no per-action log; cron run logged) |
| 6 | `kid_profile.graduate` + `auth.user.create` |
| 7 | `kid_dob_correction.submit` then `kid_dob_correction.approve` |
| 8 | `kid_dob_correction.submit` + `kid_dob_correction.documentation_request` + `kid_dob_correction.approve/reject` |
| 9 | `subscription.downgrade` |
| 10 | (auth events; existing) |
| 11 | `subscription.migrate.pro_to_verity` (one-time bulk action) |
| 12 | (no audit; just gating UX) |
| 13 | `pipeline.generate` (existing, with banded outputs) |
| 14, 15 | (no audit; UX-only) |
| 17 | `subscription.refund` + admin reason |

---

## Edge cases not in flows above

These are covered in `09_SCENARIOS.md` because they're rarer:
- Custody change / parent transfer of family
- Multiple parents in one family with conflicting settings
- COPPA consent revocation
- Account deletion (full GDPR delete)
- Kid app PIN reset / lock-out
- Sub-cycle cancellation + immediate downgrade vs grace
