# App Store Connect Submission Packet — Verity Post iOS

**Last updated:** 2026-04-18
**Owner:** paste into App Store Connect once developer account approval lands.
**Source truth:** this file is the submission draft. Cross-checked against `REFERENCE.md`, `FEATURE_LEDGER.md`, `site/src/app/page.tsx`, `site/src/app/how-it-works/page.tsx`, `00-Reference/Verity_Post_Design_Decisions.md`, and the live `plans` table on DB project `fyiwulqphgmoqullmrfn`.

Every field is kept within Apple's documented character limits. Character counts noted `[NN/MAX]`.

---

## 1. App identity

| Field | Value | Notes |
|---|---|---|
| App Name (primary, max 30) | `Verity Post` [11/30] | Clean, matches brand. |
| App Name (alt 1) | `Verity Post: News + Quiz` [23/30] | Signals the differentiator. |
| App Name (alt 2) | `Verity Post: Trusted News` [25/30] | Signals trust angle. |
| Subtitle (option A, max 30) | `News you can trust` [18/30] | Leads with trust. |
| Subtitle (option B) | `Read, quiz, and discuss news` [28/30] | Leads with the four-step loop. |
| Subtitle (option C) | `Smarter news, every day` [23/30] | Leads with outcome. |
| Bundle ID | `com.veritypost.app` | Extracted from `VerityPost/VerityPost.xcodeproj/project.pbxproj` (both Debug + Release configurations). |
| SKU | `VERITYPOST-IOS-001` | Internal only. |
| Primary Language | English (United States) | |

Recommendation: go with primary name `Verity Post` + subtitle option B (`Read, quiz, and discuss news`) — it tells a reviewer in 28 characters why the app is not just another news reader.

---

## 2. Category

- **Primary: News**
- **Secondary: Education**

Justification: the core loop is reading news articles, so News is obvious; the comprehension quiz after every article, the kids mode with age-tiered content, and the Ask-an-Expert feature make Education a stronger fit than Social Networking. Social Networking is tempting because comments and DMs exist, but the app is not primarily a social graph — messaging is paid-only and discussion is gated behind a quiz, so "social" is a second-order feature.

---

## 3. Description

**4000 char max. Current draft: ~1,920 chars (comfortable).**

```
Verity Post is a news app for people who want to read less slop and understand more.

Every article is curated, sourced, and paired with a short comprehension quiz so you can check your own understanding before you weigh in. Discussions only open after the quiz, which keeps the comment section thoughtful instead of reflexive. Verity Scores track what you actually know across categories — not how loud you are.

WHAT YOU GET

- Read. Articles from vetted sources with visible citations, timelines of how the story developed, and AI-assisted summaries you can expand or collapse.
- Quiz. A short comprehension check after every article. Two attempts on the free tier, unlimited on paid. Explanations after every answer.
- Discuss. Moderated comments with upvotes, downvotes, fact-check context tags, and mentions. Quiz-gated, so the thread stays on topic.
- Track. Personal Verity Score per category. Streaks, achievements, weekly recap quizzes.
- Ask an Expert. Submit a question; verified experts, educators, and journalists answer inside a moderated queue.
- Family and Kids Mode. Parents can add supervised kid profiles with age-tiered articles, PINs, streak freezes, and their own leaderboard. Kid profiles are undiscoverable by other users.

TRUST, BY DESIGN

- Every article shows its sources. Every claim can be checked.
- No hidden rankings: Verity Score is math, not opinion.
- Discussion is moderated by humans, with appeals.
- Kid content is age-tiered and parent-controlled.

SUBSCRIPTIONS

Reading stays free. Paid plans unlock deeper features.

- Verity ($3.99/month, $39.99/year): reduced ads, unlimited bookmarks, quiz retakes, text-to-speech, advanced search, direct messages, follows.
- Verity Pro ($9.99/month, $99.99/year): ad-free, Ask-an-Expert, streak freezes, unlimited DMs, priority support.
- Verity Family ($14.99/month, $149.99/year): Pro for two adults plus up to two kid profiles, family leaderboard, shared achievements.
- Verity Family XL ($19.99/month, $199.99/year): same as Family, up to four kids.

Subscriptions auto-renew monthly or yearly unless canceled at least 24 hours before the period ends. Manage or cancel anytime in Settings > Subscriptions.

Read the news. Check what you know. Have the conversation that actually moves you forward.
```

**Copy is honest:** every feature listed maps to a shipping file in the repo (see FEATURE_LEDGER.md). Pricing matches the `plans` table exactly. No trial is promised because `plans.trial_days = 0` for every row (see §11).

---

## 4. Keywords

**100 char max, comma-separated, no spaces after commas.**

- Option A (recommended, 98/100): `news,verity,trust,bias,quiz,reader,journalism,fact,source,media,articles,expert,fact-check,daily`
- Option B (99/100): `news,trusted news,quiz,journalism,fact check,bias,source,media,reader,articles,expert,family`
- Option C (94/100): `news,quiz,journalism,fact check,bias,verity,trust,source,expert,kids news,family,daily,reader`

Do NOT repeat the app name (`Verity Post`) here — Apple indexes the app name and subtitle separately, so spending 11 chars on it is a waste.

---

## 5. Promotional text

**170 char max. Editable post-launch without re-review.**

- Option A (126/170): `Read the news, then quiz yourself on it. Verity Post's four-step loop — read, quiz, discuss, track — makes every article count.`
- Option B (158/170): `New on Verity Post: Ask an Expert, weekly recap quizzes, and a Family plan with kid profiles. Get smarter about the news, together. Try it free today.`

---

## 6. "What's New in This Version" (initial launch)

**4000 char max. Current draft: ~540 chars.**

```
This is the first public release of Verity Post. You get:

- A full news reader with source citations, timelines, and AI summaries.
- A comprehension quiz on every article.
- Moderated discussions (quiz-gated so the conversation stays sharp).
- Personal Verity Scores, streaks, and weekly recap quizzes.
- Ask-an-Expert for paid members.
- Kids mode with age-tiered content, PINs, and a family leaderboard.

Free to read. Paid plans unlock ad-free reading, unlimited bookmarks, DMs, follows, and expert access.
```

---

## 7. Age rating questionnaire

Apple age-rating questionnaire answers with rationale. **Expected rating: 12+** (driven by the Unrestricted Web Access answer; moving any individual content slider above Infrequent/Mild would push to 17+).

| Question | Answer | Why |
|---|---|---|
| Cartoon or Fantasy Violence | None | No fantasy content. |
| Realistic Violence | Infrequent / Mild | News articles may reference violent events (war, crime). Not graphic; text with optional images. |
| Prolonged Graphic or Sadistic Realistic Violence | None | We do not publish graphic violence. |
| Profanity or Crude Humor | Infrequent / Mild | User-submitted comments may contain occasional profanity despite moderation. |
| Sexual Content or Nudity | None | None published; filtered in moderation. |
| Graphic Sexual Content and Nudity | None | — |
| Mature / Suggestive Themes | Infrequent / Mild | Adult news topics (politics, relationships, addiction) may surface. |
| Horror / Fear Themes | Infrequent / Mild | Crime and disaster reporting. |
| Medical / Treatment Information | None | We do not provide medical advice. Health news is informational only. |
| Alcohol, Tobacco, or Drug Use | Infrequent / Mild | Referenced in news reporting. |
| Simulated Gambling | None | — |
| Contests | None | Quizzes are for learning; no prizes, no cash. |
| Unrestricted Web Access | **Yes** | Comments, DMs, expert answers, and article bodies may contain user-contributed text and outbound source links. |
| Gambling | None | — |

**Flag for 17+ risk:** none at launch. If a future feature allows arbitrary external link sharing inside comments with no URL allow-list, re-answer "Unrestricted Web Access" with awareness that Apple may insist on a higher age tier. Kids mode does not change the adult-app rating — it is a separate per-profile mode; we do not ship a standalone kids app.

---

## 8. Privacy Nutrition Label

For each Apple data-type category. "Collected" = we store it server-side; "Linked" = tied to user identity; "Tracking" = used for cross-app/website advertising (we do none of that, so all Tracking answers are No).

### Contact Info
- **Email address:** Collected. Purposes: App Functionality, Customer Support, Account Management. Linked: Yes. Tracking: No.
- **Name:** Collected. We store a chosen display name and optional `full_name`. Purposes: App Functionality. Linked: Yes. Tracking: No.
- **Phone number:** Not Collected.
- **Physical address:** Not Collected.
- **Other user contact info:** Not Collected.

### Health & Fitness
- Not Collected.

### Financial Info
- **Payment info:** Not Collected. (Stripe on web and Apple on iOS process payments; we never see card numbers.)
- **Credit info:** Not Collected.
- **Other financial info:** Collected (subscription status, plan id, grace period). Purposes: App Functionality. Linked: Yes. Tracking: No.

### Location
- **Precise location:** Not Collected.
- **Coarse location:** Not Collected.

### Sensitive Info
- Not Collected.

### Contacts
- Not Collected.

### User Content
- **Email or text messages:** Collected (DMs between paid users, support tickets, appeal submissions). Purposes: App Functionality, Customer Support. Linked: Yes. Tracking: No.
- **Photos or videos:** Collected (optional avatar upload). Purposes: App Functionality. Linked: Yes. Tracking: No.
- **Audio data:** Not Collected. (TTS is output only; we do not record voice.)
- **Gameplay content:** Not Collected.
- **Customer support:** Collected (support ticket bodies). Purposes: Customer Support. Linked: Yes. Tracking: No.
- **Other user content:** Collected (article comments, expert answers, recap submissions, fact-check context tags). Purposes: App Functionality. Linked: Yes. Tracking: No.

### Browsing History
- Not Collected. (We do not track browsing outside the app.)

### Search History
- **Search history:** Collected. (Per `search.history.view|clear` permission keys; users can clear this.) Purposes: App Functionality, Personalization. Linked: Yes. Tracking: No.

### Identifiers
- **User ID:** Collected (our internal user UUID plus the Supabase auth UUID). Purposes: App Functionality, Analytics. Linked: Yes. Tracking: No.
- **Device ID (IDFA/IDFV):** Not Collected. (We do not currently use AdAttribution or IDFA.)

### Purchases
- **Purchase history:** Collected (Apple IAP transaction IDs, subscription start/end, renewal state). Purposes: App Functionality. Linked: Yes. Tracking: No.

### Usage Data
- **Product interaction:** Collected (reading log, quiz attempts, scroll depth, bookmark events, achievement unlocks, scoring events). Purposes: App Functionality, Analytics, Personalization. Linked: Yes. Tracking: No.
- **Advertising data:** Not Collected. (Ads use `serve_ad` RPC with tier-aware suppression; no per-user ad tracking.)
- **Other usage data:** Collected (per-article read completion). Purposes: Analytics. Linked: Yes. Tracking: No.

### Diagnostics
- **Crash data:** Collected (if Sentry or equivalent is wired). Purposes: App Functionality, Analytics. Linked: No. Tracking: No. **FLAG FOR OWNER:** confirm whether Sentry is actually initialized in the iOS target before marking this "Collected." Default to Not Collected until verified.
- **Performance data:** Same as crash data — verify before marking.
- **Other diagnostic data:** Not Collected.

### Other Data
- **Other data:** Collected (device push token for APNs, notification preferences, kid profiles when on Family plan). Purposes: App Functionality. Linked: Yes. Tracking: No.

**Summary line for the label UI:**
- Data Used to Track You: **None**.
- Data Linked to You: Contact Info, Financial Info (subscription status), User Content, Search History, Identifiers, Purchases, Usage Data, Other Data.
- Data Not Linked to You: Diagnostics (if Sentry is wired with anonymized reports).

---

## 9. App Review Information

### Sign-in demo account
- **Email:** `free@test.veritypost.com`
- **Password:** `TestFree1!`
- **What it shows:** free tier — full reading, quiz + two retakes, limited bookmarks, capped commenting (5/day), ad visible. Good default because it exercises the permission gates most likely to confuse a reviewer.

### Additional demo accounts (offer if reviewer asks)
- **Premium (paid):** `premium@test.veritypost.com` / `TestPremium1!` — unlocks DMs, follows, TTS, unlimited bookmarks, ad-free reading.
- **Family:** `family@test.veritypost.com` / `TestFamily1!` — unlocks the kid-profile parent dashboard and family leaderboard.
- **Admin surface:** admin is **web only** at `admin.veritypost.com` (Next.js routes under `site/src/app/admin/**`). Not exposed on iOS. If the reviewer wants to see it, provide `admin@test.veritypost.com` / `TestAdmin1!` and point them at the web URL.

### Contact Information
- **First name:** [OWNER TO FILL]
- **Last name:** [OWNER TO FILL]
- **Phone:** [OWNER TO FILL]
- **Email:** `admin@veritypost.com`

### Review notes (4000 char max, current draft ~2,640 chars)

```
Thanks for reviewing Verity Post.

The app is a news reader with three differentiators you will see during review:

1) QUIZ-GATED COMMENTING. Every article has a short comprehension quiz. Users must pass the quiz before they can post a comment on that article. Free users get two attempts; paid users can retake. This is intentional and central to the product — it is not a bug. Explanations are shown after every attempt (right or wrong).

2) PERMISSION-DRIVEN UI. The app is built on a permission system (hasPermission on the client, requirePermission on the server) rather than hardcoded role checks. That means certain buttons appear or disappear based on whether your demo account's tier owns that permission. If you log in as the free demo account and do not see a "Message" button on another user's profile, that is correct — DMs are a paid feature. Switch to the premium demo account (premium@test.veritypost.com / TestPremium1!) to see them.

3) PAID TIERS. Four paid plans are sold via In-App Purchase: Verity (3.99/mo or 39.99/yr), Verity Pro (9.99/mo or 99.99/yr), Verity Family (14.99/mo or 149.99/yr), and Verity Family XL (19.99/mo or 199.99/yr). Reading the news is always free. Paid tiers unlock ad-free reading, unlimited bookmarks, DMs, follows, Ask-an-Expert, and family features. Pricing matches the on-device product IDs listed in this submission.

4) KIDS MODE. The Family plans allow parents to add kid profiles with age-tiered content, PINs, and their own leaderboard. Important: the native iOS COPPA flow is currently deferred — creating or editing a kid profile on iOS opens an informational panel that redirects the parent to the web app to complete COPPA consent. This is intentional while we ship the full native flow; it is not a broken screen. Kid content itself reads fine on iOS once a kid profile exists. (See the "Kids" section in Settings.)

5) BIAS / SOURCE TRANSPARENCY. Every article lists its sources. We do not rate articles or sources on a political-bias axis; the only user-visible score is the personal Verity Score, which measures the user's own comprehension across categories.

ACCOUNT + DELETION. Users can delete their account from Settings > Account > Delete. Deletion is a scheduled anonymization (7-day grace) with immediate DM cutoff, documented in our privacy policy.

CONTENT MODERATION. Comments and DMs are moderated; users can report abusive content and appeal moderation actions from Settings > Appeals. Expert answers and breaking-news broadcasts are reviewed by editors before publishing.

If any screen looks locked behind a paid wall during review and you cannot tell why, please log in as premium@test.veritypost.com / TestPremium1! and retry — that account owns nearly every feature gate.

Happy to answer follow-ups at admin@veritypost.com.
```

---

## 10. URLs

| Field | URL | Status |
|---|---|---|
| Marketing URL | `https://veritypost.com/` | Exists — `site/src/app/page.tsx`. |
| Support URL | `https://veritypost.com/help` | Exists — `site/src/app/help/page.tsx`. Public; auth-branches the "Still need help?" block. |
| Privacy Policy URL | `https://veritypost.com/privacy` | Exists — `site/src/app/privacy/page.tsx`. |
| Terms of Service URL | `https://veritypost.com/terms` | Exists — `site/src/app/terms/page.tsx`. |
| How It Works | `https://veritypost.com/how-it-works` | Exists — `site/src/app/how-it-works/page.tsx`. Optional for ASC but useful as a marketing URL backup. |

**Support URL — closed.** Public `/help` page shipped in Round 13 (`site/src/app/help/page.tsx`). Server-rendered so the HTML is reachable without JS for reviewers and crawlers. Page contains: Help & Support hero, 7 FAQ entries (what Verity Post is, quizzes, plan tiers, email verification, cancel, delete account, Kids Mode), and an auth-branched "Still need help?" block — signed-in users see a "Send a message" CTA to `/profile/contact`; anon users see Sign up / Sign in buttons plus a fallback mailto to `admin@veritypost.com`. Apple's public-reachability requirement is satisfied.

`/profile/contact` stays auth-gated (posts to `create_support_ticket` RPC which requires an authed session); anon users who want to reach us go through the mailto fallback until they sign up.

---

## 11. In-App Purchase list (draft for ASC setup)

All 8 paid plans from the live `plans` table. Already have `apple_product_id` set in DB — use those verbatim so the subscription reconciliation on `/api/ios/subscriptions/sync` and the App Store Server Notifications at `/api/ios/appstore/notifications` match.

**Subscription Group:** `Verity Post Subscriptions` (single group so users can upgrade / downgrade / switch period without losing subscription continuity).

### IAP.1 — Verity Monthly
- Product ID: `com.veritypost.verity.monthly`
- Reference Name: `Verity Monthly`
- Display Name: `Verity (Monthly)` [17/30]
- Description (max 255 for subscription desc): `Reduced ads, unlimited bookmarks, quiz retakes, TTS, advanced search, DMs, and follows. Billed monthly.`
- Price: $3.99 USD → Apple Tier 4
- Duration: 1 Month, auto-renewing
- Free Trial: **None** (plans.trial_days = 0 — do not invent one)
- Subscription Level (within group): 2 (Verity)

### IAP.2 — Verity Annual
- Product ID: `com.veritypost.verity.annual`
- Reference Name: `Verity Annual`
- Display Name: `Verity (Annual)` [15/30]
- Description: `Same Verity plan, billed once a year. About 17% off vs monthly.`
- Price: $39.99 USD → Apple Tier 40
- Duration: 1 Year, auto-renewing
- Free Trial: None
- Subscription Level: 2 (Verity)

### IAP.3 — Verity Pro Monthly
- Product ID: `com.veritypost.verity_pro.monthly`
- Reference Name: `Verity Pro Monthly`
- Display Name: `Verity Pro (Monthly)` [20/30]
- Description: `Ad-free reading, Ask an Expert, streak freezes, unlimited DMs, and priority support. Billed monthly.`
- Price: $9.99 USD → Apple Tier 10
- Duration: 1 Month
- Free Trial: None
- Subscription Level: 3 (Verity Pro)

### IAP.4 — Verity Pro Annual
- Product ID: `com.veritypost.verity_pro.annual`
- Reference Name: `Verity Pro Annual`
- Display Name: `Verity Pro (Annual)` [19/30]
- Description: `Verity Pro billed once a year. About 17% off vs monthly.`
- Price: $99.99 USD → Apple Tier 100
- Duration: 1 Year
- Free Trial: None
- Subscription Level: 3 (Verity Pro)

### IAP.5 — Verity Family Monthly
- Product ID: `com.veritypost.verity_family.monthly`
- Reference Name: `Verity Family Monthly`
- Display Name: `Verity Family (Monthly)` [23/30]
- Description: `Verity Pro for two adults plus up to two kid profiles. Family leaderboard and shared achievements. Billed monthly.`
- Price: $14.99 USD → Apple Tier 15
- Duration: 1 Month
- Free Trial: None
- Subscription Level: 4 (Verity Family)

### IAP.6 — Verity Family Annual
- Product ID: `com.veritypost.verity_family.annual`
- Reference Name: `Verity Family Annual`
- Display Name: `Verity Family (Annual)` [22/30]
- Description: `Verity Family billed once a year. About 17% off vs monthly.`
- Price: $149.99 USD → Apple Tier 150
- Duration: 1 Year
- Free Trial: None
- Subscription Level: 4 (Verity Family)

### IAP.7 — Verity Family XL Monthly
- Product ID: `com.veritypost.verity_family_xl.monthly`
- Reference Name: `Verity Family XL Monthly`
- Display Name: `Verity Family XL (Monthly)` [26/30]
- Description: `Verity Pro for two adults plus up to four kid profiles. Billed monthly.`
- Price: $19.99 USD → Apple Tier 20
- Duration: 1 Month
- Free Trial: None
- Subscription Level: 5 (Verity Family XL)

### IAP.8 — Verity Family XL Annual
- Product ID: `com.veritypost.verity_family_xl.annual`
- Reference Name: `Verity Family XL Annual`
- Display Name: `Verity Family XL (Annual)` [25/30]
- Description: `Verity Family XL billed once a year. About 17% off vs monthly.`
- Price: $199.99 USD → Apple Tier 200
- Duration: 1 Year
- Free Trial: None
- Subscription Level: 5 (Verity Family XL)

### Promo codes
Server-side promo codes are already implemented at `/api/promo/redeem` (see `subscription` feature in `FEATURE_LEDGER.md`). Those apply at Stripe checkout on web, not at Apple IAP. If the owner also wants ASC "Offer Codes" for iOS-side promotional pricing, that is a separate ASC setup step and will need a distinct code pool managed in ASC rather than the web DB — flag this decision for the owner. Launch can ship without ASC offer codes.

### Subscription group notes
- Put all 8 IAPs into a single group (`Verity Post Subscriptions`). Apple only permits one active subscription per user per group, which is exactly the business rule we want — a user should not hold both Verity Pro Monthly and Verity Family Annual at the same time.
- Level ordering inside the group controls upgrade/downgrade prorations. Recommended ordering: Verity (lowest) → Verity Pro → Verity Family → Verity Family XL (highest). Monthly and Annual at the same tier share a level.

---

## 12. App Store Connect setup checklist

Single-page TL;DR for paste-to-ASC. Check items off as you complete them.

- [ ] Register bundle ID `com.veritypost.app` in the Apple Developer portal (Certificates, Identifiers, Profiles > Identifiers). Attach capabilities: Push Notifications, Sign in with Apple (if enabled), In-App Purchase, Associated Domains (if universal links wanted).
- [ ] Create the app record in App Store Connect. SKU `VERITYPOST-IOS-001`. Primary language English (US). Bundle ID as above.
- [ ] Set App Information > Categories: Primary = News, Secondary = Education.
- [ ] Upload App Icon: 1024x1024 PNG, no transparency, no rounded corners (Apple auto-masks).
- [ ] Upload Screenshots. Required modern device classes: 6.7" iPhone (e.g. iPhone 15 Pro Max, 1290x2796), 6.1" iPhone (iPhone 15, 1179x2556). Optional: 5.5" iPhone legacy, 12.9" iPad Pro if iPad target is shipped.
- [ ] Paste App Name, Subtitle, Description, Keywords, Promotional Text — use §1–§5 of this doc.
- [ ] Paste "What's New in This Version" — use §6.
- [ ] Fill Age Rating questionnaire — use §7. Expected result: 12+.
- [ ] Fill Privacy Nutrition Label — use §8. Confirm Sentry status before committing Diagnostics answers.
- [ ] Set Marketing URL, Support URL, Privacy Policy URL — use §10. Public `/help` page is live (Round 13) — set Support URL to `https://veritypost.com/help`.
- [ ] Create the 8 In-App Purchase products in a single subscription group `Verity Post Subscriptions` — use §11. Product IDs must match the `apple_product_id` column in the `plans` table exactly, otherwise iOS subscription sync breaks.
- [ ] Add App Review demo account + review notes — use §9.
- [ ] Enable TestFlight internal testing group; invite the owner email and any internal testers.
- [ ] Configure App Store Server Notifications v2 URL to `https://veritypost.com/api/ios/appstore/notifications` (production). Use the v2 format; our route is already built for v2 JWS payloads.
- [ ] Generate App Store Server API key (private key .p8, Key ID, Issuer ID). Store the .p8 in Vercel env vars, not in the repo. Fields expected by `/api/ios/subscriptions/sync`: `APPLE_APP_STORE_KEY_ID`, `APPLE_APP_STORE_ISSUER_ID`, `APPLE_APP_STORE_PRIVATE_KEY` (PEM body, newline-separated).
- [ ] Generate APNs auth key (.p8). Store in Vercel env vars under `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`. Confirm `/api/push/send` reads from these.
- [ ] Associated Domains entitlement: if universal links are planned (deep-linking into articles from shared URLs), add `applinks:veritypost.com` to the Xcode target and host `/.well-known/apple-app-site-association` on the site. Owner decision.
- [ ] Sign in with Apple: if enabled in the Xcode entitlement, add the "Sign in with Apple" capability in ASC + developer portal. Owner decision.
- [ ] Before tapping "Submit for Review": confirm the live site is responding at the Privacy / Terms / Support URLs (not a 404 or a Vercel build-in-progress screen).
- [ ] Before tapping "Submit for Review": run one end-to-end purchase in the sandbox environment using a sandbox Apple ID, verify it syncs to the `subscriptions` row in DB.

---

## Cross-references

- Permission system + tier definitions: `00-Where-We-Stand/REFERENCE.md` §3
- Per-feature completion state (for screenshot planning): `00-Where-We-Stand/FEATURE_LEDGER.md`
- Tier names rationale and D43 "no free trial" decision: `00-Reference/Verity_Post_Design_Decisions.md`
- Test account credentials: `test-data/accounts.json`
- Xcode project (bundle ID verified): `VerityPost/VerityPost.xcodeproj/project.pbxproj`
- Server routes Apple calls into:
  - `site/src/app/api/ios/appstore/notifications/route.js` (App Store Server Notifications v2)
  - `site/src/app/api/ios/subscriptions/sync/route.js` (reconcile latest receipt with DB)
