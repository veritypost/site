# Q09 — Web Push: ship it, or formally document iOS-only?

**Source finding:** PM-10 — "Web has no push-notification surface at all; iOS-adult ships full APNs registration + delivery" (REVIEW_REPORT.md:1967-1988, P1 parity).

**TL;DR recommendation:** **Document iOS-only for launch.** Reword existing copy to drop the "yet" implication, push the kill-switch entry into `CLAUDE.md`, and revisit Web Push only after the web has measurable returning-user volume. Estimate to ship Web Push end-to-end is **5-7 working days**; estimate to formally document is **~30 minutes**. Pre-launch traffic data (1 active user, 12 events / 30d) makes the ship-now ROI indefensible.

---

## 1. PM-10's finding (verified on disk)

- iOS-adult: full APNs pipeline.
  - `VerityPost/VerityPost/PushRegistration.swift` (118 lines) — `UNUserNotificationCenter.current().requestAuthorization`, `registerForRemoteNotifications`, `handleDeviceToken` upserts via `upsert_user_push_token` RPC.
  - `VerityPost/VerityPost/PushPromptSheet.swift` — pre-prompt sheet so a "Not now" doesn't burn the iOS one-shot system permission.
  - `VerityPost/VerityPost/PushPermission.swift`, `AlertsView.swift` — registration trigger.
- Web: zero. Confirmed:
  - `grep -rn "serviceWorker\|push_subscription\|PushSubscription\|VAPID\|pushManager\|webpush\|web_push" web/src web/public` → 0 hits.
  - `web/public/` has only `ads.txt`. No `manifest.json`, no service worker.
  - Existing copy at `web/src/app/profile/settings/_cards/NotificationsCard.tsx:43`: `'Time-sensitive notifications on the iOS app. iOS only — no web push yet.'` — the "yet" mildly violates `feedback_no_user_facing_timelines.md`; should be reworded.

PM-10 stated the choice clearly: "(a) ship Web Push (service worker + VAPID + browser notification API + `push_tokens` table extension), or (b) document the asymmetry as intentional in CLAUDE.md so it's not flagged on every review. Path (a) is the parity fix; (b) is the launch-pragmatic move."

---

## 2. Notification surface inventory (what would need a web fanout)

Notification types currently created via `create_notification` RPC across web + DB:

| Type | Source | Push-worthy? |
|---|---|---|
| `breaking_news` | `supabase/migrations/2026-04-29_slice06_fix_send_breaking_news_rpc.sql` (fan-out from `/api/admin/broadcasts/breaking`) | Yes — primary push case |
| `expert_answered` | `supabase/migrations/2026-04-29_slice06_fix_approve_expert_answer_rpc.sql` | Yes |
| `billing_alert` | `web/src/app/api/stripe/webhook/route.js` (refund, dispute, refund-pending, sub-cancelled, etc.) | Marginal — email/in-app already cover it |
| `data_export_ready` | `web/src/app/api/cron/process-data-exports/route.js` | Marginal |
| `system` | misc | No |

The full list of `alert_type` rows (from `web/src/app/api/notifications/preferences/route.js`) is `channel_defaults` plus per-category — but the only *user-visible category UI* is the channel-defaults row (`NotificationsCard.tsx:109`). Per-category alert prefs exist in DB but no settings UI exposes them today.

So Web Push for adult would be primarily breaking-news-driven, secondarily expert-answered. ~2 high-value categories, not 10.

---

## 3. Queueing layer: platform-agnostic or APNs-specific?

**Answered: queue is platform-agnostic; dispatch is APNs-specific.**

- `notifications` table (`web/src/types/database.ts:7399-7489`) — generic columns: `channel` ('in_app'|'email'|...), `push_sent`, `push_sent_at`, `push_claimed_at`, `push_receipt`. Nothing platform-coupled.
- `user_push_tokens` table (lines 10545-10610) — already has `provider`, `platform`, `environment` columns. A web-push subscription would slot in as `provider='webpush'`, `platform='web'`, `push_token=<JSON-encoded subscription>`.
- `claim_push_batch` RPC — generic; claims any pending notifications for `channel != 'in_app'`.
- **`/api/cron/send-push/route.js:174` — APNs-specific:** `.eq('provider', 'apns')`. To support web push you'd add a parallel branch (or change the cron to fetch both providers and dispatch by-provider).
- `/api/push/status/route.js:48` already lists `web` as a platform key in its response shape — the schema was sketched cross-platform from day one. The data shape and `aggregateByPlatform` would surface a web-platform row immediately if any existed.

**Bottom line:** the *data model* needs no migration to support web push. Only the dispatcher and registration/permission code are missing.

---

## 4. Web Push ship cost (full implementation)

### Required pieces

1. **VAPID keys** — generate, store as env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Trivial; `web-push` npm CLI: `web-push generate-vapid-keys`.
2. **Service worker** at `web/public/sw.js` — handles `push` event, calls `self.registration.showNotification()`, handles `notificationclick` to focus/open the action_url. ~80 lines.
3. **`web/public/manifest.json`** — minimal PWA manifest (name, icons, display). ~20 lines. Adds an icon set requirement (192px, 512px PNGs).
4. **Registration client component** — request `Notification.permission`, call `navigator.serviceWorker.register('/sw.js')`, then `swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })`, POST the subscription JSON to a new `/api/push/web/subscribe` route.
5. **Pre-prompt UI** — copy `PushPromptSheet.swift`'s pattern (don't burn the one-shot browser permission). Reuse the iOS copy. Add to `NotificationsCard.tsx` as a "Turn on browser notifications" affordance.
6. **`/api/push/web/subscribe` route** — auth gate, write `provider='webpush', platform='web', push_token=<JSON.stringify(subscription)>` row via the existing `upsert_user_push_token` RPC (RPC accepts arbitrary `p_provider` already).
7. **Dispatcher branch in `cron/send-push`** — split the token query by provider, route apns rows through `withApnsSession` (existing) and webpush rows through new `lib/webpush.js` using `web-push` npm package's `sendNotification(subscription, payload, options)`. Handle dead-token reasons (410 Gone → `invalidate_user_push_token`, same DB shape as APNs).
8. **`lib/webpush.js`** — wrapper; ~60 lines using the `web-push` npm package (well-maintained, MIT, no native deps).
9. **iOS-Safari caveat** — Web Push works on iOS Safari only as installed PWA (Add to Home Screen). Document this in the registration copy or skip iOS-Safari gracefully via UA detection.
10. **HTTPS-only** — already true on production (Vercel) and dev (next dev with localhost is allowed).

### Day estimate (single dev, no surprises)

| Day | Work |
|---|---|
| 1 | VAPID setup, service worker, manifest, icons, register subscribe endpoint with RLS + auth gate |
| 2 | Client registration component + pre-prompt sheet + settings card wiring + permission state UX |
| 3 | Cron dispatcher branch + `lib/webpush.js` + dead-token handling + sandbox/prod parity |
| 4 | Cross-browser testing (Chrome/Edge/Firefox desktop, iOS-Safari PWA, Android Chrome), iconography, manifest polish |
| 5 | Polish + edge cases: tab-already-open click handling, expired subscriptions, prefs UI per-category if owner wants it, observability |
| 6-7 | Buffer for browser quirks (Firefox VAPID format, Safari PWA detection, iOS Safari requires `display: standalone`) |

**Floor: 5 days. Realistic with browser quirks: 7 days.** This is single-dev focused work; cross-platform memory says every change must cover web + iOS + kids iOS — kids is N/A (no push UI on kid surfaces, COPPA), iOS-adult already done, so this is web-only.

---

## 5. Audience math — does web push retention pay back?

Live numbers from MCP query at time of writing:

```
analytics_events 30d: platform=web, events=12, distinct_users=1
user_push_tokens:    apns/ios — 1 token total, 0 active
notifications 30d:    8 rows, all type=system, all channel=in_app, 0 pushed
```

**Translation:** the product is pre-launch. Owner is the only user. Web Push retention math at this scale is meaningless — there are no returning web users to retain. Push reactivation curves only earn back the build cost above ~5-10K WAU (industry rule of thumb: 2-5% push CTR × email-or-better cadence × marginal retention lift needs a non-trivial denominator to justify a week of engineering).

`engagement_growth_bar.md` sets a 90% retention / ~100%/day growth quality floor for agent-touched features. That bar is **about polish on what ships**, not about shipping every retention surface. Push without an audience is craft-without-leverage; it stays polished by *not shipping yet*.

---

## 6. Memory checks

- **`feedback_no_user_facing_timelines.md`** — current copy "iOS only — no web push yet" violates this. Drop the "yet". The doc-only path fixes this in one line.
- **`feedback_genuine_fixes_not_patches.md`** — both paths are genuine. Doc-only is honest about the asymmetry. Ship-now is full integration. Neither is a TODO/HACK.
- **`feedback_cross_platform_consistency.md`** — explicitly says "state 'not applicable' explicitly if one is exempt". The doc-only path discharges this requirement; the ship-now path closes it harder.
- **`feedback_kill_switched_work_is_prelaunch_parked.md`** — Web Push is a feature you'd intentionally launch-hide if you had to choose. That's exactly the kill-switch pattern. Web Push fits the Kill-Switch Inventory table cleanly.
- **`engagement_growth_bar.md`** — high quality bar applies *to what ships*. Shipping push to an empty audience is the opposite of quality — it's surface area for bugs (browser quirks, expired subscriptions, dead tokens) with zero offsetting retention.

---

## 7. The two paths, costed and honest

### Path A — Ship Web Push end-to-end

- **Cost:** 5-7 dev days; ~250 LOC across 8 files; one new npm dep (`web-push`).
- **Reward:** parity with iOS, no asymmetry to document, future-proof for when web traffic scales.
- **Risk:** browser-quirk bug surface (Firefox VAPID padding, iOS-Safari PWA gating, Chrome's notification UX changes), maintenance overhead on 3 codepaths (apns + webpush + in-app). Pre-launch dev time burned on a feature with no current audience.
- **When this is right:** if Web Push is on the launch feature list owner has already decided ships, OR if web traffic is already non-trivial and we're just behind.

### Path B — Document iOS-only (recommended)

- **Cost:** ~30 minutes.
- **Concrete edits:**
  1. `web/src/app/profile/settings/_cards/NotificationsCard.tsx:43` — rewrite line:
     - **From:** `'Time-sensitive notifications on the iOS app. iOS only — no web push yet.'`
     - **To:** `'Time-sensitive notifications on the iOS app. Web is in-app and email only.'`
  2. `CLAUDE.md` — append row to Kill-Switch Inventory table:
     ```
     | 11 | Web Push notifications | Not built — iOS-only by design | n/a (no scaffolding) | Build out service worker + VAPID + cron webpush branch when web returns warrant it |
     ```
  3. (Optional) Add a top-of-file comment in `web/src/app/api/cron/send-push/route.js` after line 17 stating "APNs-only by design; web push intentionally not implemented — see CLAUDE.md kill-switch row 11."
- **Reward:** PM-10's finding closes; future reviewers don't re-flag; copy stops promising what isn't built; engineer-time stays on launch-blocking work.
- **Risk:** if a launch-week web user expects browser-tab notifications, they won't get them. Mitigated by the rewritten copy explicitly saying "in-app and email only."

---

## 8. Recommendation

**Path B — document iOS-only.** Specifically:

1. Apply the two edits above (NotificationsCard + CLAUDE.md kill-switch row 11).
2. Drop the "yet" — explicit "Web is in-app and email only" satisfies the no-timelines memory and is true on launch day.
3. Park Web Push as a post-launch evaluation. The bar to revisit: web has >1K WAU AND breaking-news cadence is established AND `analytics_events` shows return-rate where push-retention math actually pencils.

**Why not Path A:** the queueing layer is already platform-agnostic, so deferring costs nothing structural — when audience justifies it, the lift is still 5-7 days, not "redo from scratch." There's no architectural debt being accrued by waiting. The only thing being deferred is feature parity at a moment when there's nobody to be at parity *for*.

**Decisive answer:** iOS-only at launch. Edit two files. Move on. Reopen the question when web has the audience to make push retention math non-zero.

---

## Appendix — files referenced

- `/Users/veritypost/Desktop/verity-post/REVIEW_REPORT.md:1967-1988` (PM-10 finding)
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/PushRegistration.swift`
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/PushPromptSheet.swift`
- `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/PushPermission.swift`
- `/Users/veritypost/Desktop/verity-post/web/src/lib/apns.js`
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/cron/send-push/route.js`
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/push/send/route.js`
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/push/status/route.js`
- `/Users/veritypost/Desktop/verity-post/web/src/app/api/notifications/preferences/route.js`
- `/Users/veritypost/Desktop/verity-post/web/src/app/profile/settings/_cards/NotificationsCard.tsx`
- `/Users/veritypost/Desktop/verity-post/web/src/types/database.ts` (`notifications`, `user_push_tokens` schemas)
- `/Users/veritypost/Desktop/verity-post/CLAUDE.md` (Kill-Switch Inventory)
