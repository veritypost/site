# Ads — decision-ready gameplan

This is a fill-in-the-blanks gameplan, not a spec. Work through it in order.
Each section has decisions you make (D), prep the owner does outside the
codebase (P), and the build-side tasks that follow (B). No code is written
yet; this doc makes it so that every build task has a known answer before
an engineer starts.

---

## 1. Decision summary (fill these in first)

Everything else in this plan depends on these eight answers. Pencil them
in before touching the rest of the document.

| # | Decision | Your answer | Notes |
|---|---|---|---|
| D1 | AdSense publisher ID (`ca-pub-xxxxxxxxxxxxxxxx`) | ____________________ | Create account at google.com/adsense, verify domain, wait for approval (1–14 days). |
| D2 | Other networks for launch (check all): ☐ GAM ☐ Amazon TAM ☐ Mediavine/Raptive ☐ Prebid ☐ none yet | ____________________ | Recommendation: start with AdSense only. Revisit at 100k sessions/month. |
| D3 | CMP choice: ☐ Google Funding Choices (free) ☐ CookieYes ☐ Didomi ☐ OneTrust | ____________________ | Funding Choices is easiest; pairs with AdSense. |
| D4 | Launch countries where ads are enabled (at first) | ____________________ | Full global ✓ or US-only to start. Doesn't change code — changes CMP settings. |
| D5 | Paid tiers that see ZERO ads | verity_pro, verity_family, verity_family_xl (current) | Change only if you want to add others. |
| D6 | Paid tier with REDUCED ads | verity (current — halved frequency caps) | Same. |
| D7 | Kids app serves ads? | **NO — permanent.** | COPPA + Apple Kids Category. Do not revisit. |
| D8 | iOS adult app serves ads at launch? | ☐ yes  ☐ no (recommended) | Default NO. Subscription + Apple IAP is the iOS revenue story. |

---

## 2. Placement catalog — the menu

These are every slot you could choose to turn on, with the decision per
slot. Mark each as ✓ **ship day 1**, ⌛ **later**, or ✗ **never**. Fill
in the ad source (which network fills it) and any targeting overrides.

Format per row: **slot name · page · position · dimensions · AdSense
format · policy notes · YOUR DECISION**.

### Home page (`/`)

| Slot | Position | Size (desktop / mobile) | AdSense format | Policy | Decision |
|---|---|---|---|---|---|
| `home_top_banner` | Above the feed, below masthead | 728×90 / 320×50 | Display, responsive | Safe | ☐ day 1  ☐ later  ☐ never |
| `home_feed_inline` | Between articles, every N feed items | Fluid / 300×250 | In-feed native | Safe, high fill | ☐ day 1  ☐ later  ☐ never |
| `home_hero_replacement` | Replaces feed item #1 at N% of sessions | Full-bleed | Native | Editorial risk | ☐ day 1  ☐ later  ☐ never |
| `home_sidebar_sticky` | Desktop only, right rail, sticky | 300×600 | Display | Safe | ☐ day 1  ☐ later  ☐ never |
| `home_footer_anchor` | Fixed bottom ribbon, dismissable | 320×50 | Anchor | Safe, mobile only | ☐ day 1  ☐ later  ☐ never |

**Feed cadence decision** — for `home_feed_inline`, how many stories
between ads? 3 = aggressive, 5 = balanced, 8 = tasteful. **Recommend 6**
(current setting; matches existing `Ad.jsx` mount at `page.tsx:849`).

### Story page (`/story/[slug]`)

| Slot | Position | Size | AdSense format | Policy | Decision |
|---|---|---|---|---|---|
| `article_top` | Above the headline | 728×90 / 320×100 | Display | **RISKY** — AdSense flags ads too close to article title | ☐ day 1  ☐ later  ☐ never |
| `article_in_body` | Between paragraph N of the body | Fluid | In-article | Safe, high revenue | ☐ day 1  ☐ later  ☐ never |
| `article_midscroll` | Injected at 40–50% scroll depth | Fluid | In-article | Safe | ☐ day 1  ☐ later  ☐ never |
| `article_bottom` | After article body, before receipt/quiz | 300×250 / fluid | Multiplex or display | Safe (currently mounted) | ✓ day 1 (already live) |
| `pre_quiz` | Between article end and the quiz CTA | 300×250 | Display | Safe — ad clearly distinct from quiz chrome | ☐ day 1  ☐ later  ☐ never |
| `post_quiz_locked` | After quiz pass, before discussion reveal | 300×250 | Display | Safe — paid users never see quiz pass | ☐ day 1  ☐ later  ☐ never |
| `article_sidebar` | Desktop only, right rail | 300×600 | Display | Safe | ☐ day 1  ☐ later  ☐ never |
| `article_sticky_bottom` | Fixed bottom ribbon while reading | 320×50 | Anchor | Safe | ☐ day 1  ☐ later  ☐ never |

**Paragraph-N decision** — for `article_in_body`, ad goes after paragraph
___ (recommend 3 — past the lede, before the user considers bailing).

### Category pages (`/category/[slug]`)

| Slot | Position | Size | AdSense format | Policy | Decision |
|---|---|---|---|---|---|
| `category_top_banner` | Above the category feed | 728×90 / 320×50 | Display | Safe | ☐ day 1  ☐ later  ☐ never |
| `category_feed_inline` | Every N items in category feed | Fluid | In-feed | Safe | ☐ day 1  ☐ later  ☐ never |

### Search (`/search`)

| Slot | Position | Size | AdSense format | Policy | Decision |
|---|---|---|---|---|---|
| `search_top` | Above results | Fluid | Custom search ads / display | Safe | ☐ day 1  ☐ later  ☐ never |
| `search_no_results` | When 0 results | 300×250 | Display | Safe | ☐ day 1  ☐ later  ☐ never |

### Leaderboard / profile / bookmarks / notifications

| Slot | Decision |
|---|---|
| `leaderboard_top` | ☐ day 1  ☐ later  ☐ never (low-value inventory) |
| `profile_public` | ☐ day 1  ☐ later  ☐ never (identity surface; ads feel wrong) |
| Bookmarks, messages, notifications | **never** — authenticated utility surfaces |

### Surfaces with ads permanently disabled (AdSense ToS + brand)

- `/login`, `/signup/*`, `/verify-email`, `/reset-password`, `/forgot-password`, `/welcome`
- `/admin/*`
- Error pages (`error.js`, `not-found.js`, `global-error.js`)
- Kids app landing (`/kids-app`) and the entire VerityPostKids iOS app
- The discussion section itself (post-quiz-unlocked comments) — ads inside comment threads cheapen the earned-commentary UX

Lock these in `ad_placements` as zero rows for these `page` values, and
add a linter check in CI that fails if anyone mounts `<Ad />` on one of
these routes.

---

## 3. Per-placement setup worksheet

For every slot you marked ✓ **day 1** or ⌛ **later**, fill this in. One
worksheet per slot. Copy as needed.

```
SLOT: ________________________________   PAGE: ______________   POSITION: ______________

NETWORK:
  ☐ Google AdSense
  ☐ Direct (advertiser: _________________)
  ☐ House (Verity Post in-house promo)
  ☐ Affiliate / commerce link
  ☐ Other: _________________

ADSENSE (if applicable):
  Ad unit ID:           ca-pub-___________ / ___________
  Ad format:            ☐ Display  ☐ In-feed  ☐ In-article  ☐ Multiplex  ☐ Anchor
  Responsive:           ☐ yes  ☐ no (fixed size ____×____)
  Paste code snippet below (the <ins> block from AdSense console):

  _________________________________________________________________
  _________________________________________________________________

DIRECT/HOUSE CREATIVE (if applicable):
  Creative URL (image):  _________________________________________
  Creative HTML:         (paste)
  Click URL:             _________________________________________
  Alt text:              _________________________________________
  CTA text:              _________________________________________

TARGETING:
  Tiers to SHOW to:      ☐ anon  ☐ free_verified  ☐ verity (reduced)  ☐ verity_pro/family/xl (never)
  Categories:            ☐ all  ☐ only: ______________________________
  Article-specific:      ☐ all  ☐ only these article IDs: ______________
  Device:                ☐ all  ☐ web only  ☐ ios only
  First visit / returning: ☐ both  ☐ first  ☐ returning
  Date range:            from _________ to _________ (blank = always)

FREQUENCY CAPS:
  Per user, per day:     ______
  Per session:           ______
  Weight (vs other units for this slot): ______

APPROVAL:
  ☐ Reviewed for AdSense policy
  ☐ Reviewed for brand fit
  ☐ Approved by owner
  ☐ Approved by editorial (for direct/sponsored only)
```

---

## 4. Network setup checklist

Once per network. Don't skip.

### Google AdSense (primary)

- [P] Apply at google.com/adsense. Provide veritypost.com.
- [P] Verify domain ownership (Google pastes a `<meta>` tag in your head).
- [P] Wait for policy review. Approval 1–14 days.
- [P] Once approved: in AdSense console → Ads → Ad units → create one unit per slot in the placement catalog that you marked ✓. Record the slot IDs in the worksheet above.
- [P] In AdSense console → Privacy & messaging → enable Google Funding Choices. Configure the GDPR + CCPA + CPRA messages.
- [B] Add `ads.txt` file at `web/public/ads.txt` with the line AdSense tells you (format: `google.com, pub-xxxxxxxxxxxxxxxx, DIRECT, f08c47fec0942fa0`). Ship via repo commit.
- [B] Add AdSense script tag to `web/src/app/layout.js` (`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-xxxx">`). **Load only when CMP consent is granted** — not unconditionally.
- [B] Extend `ad_units.ad_network` enum to include `google_adsense`. Add `ad_units.network_config jsonb` for the slot ID, format, size.
- [B] Add `AdSenseSlot` subcomponent in `web/src/components/`. Extend `Ad.jsx` to dispatch by `ad_network`.

### Consent Management Platform (Google Funding Choices — free)

- [P] Turn on in AdSense console under Privacy & messaging.
- [P] Configure regions (EU/UK, California, Brazil, Canada, Australia).
- [P] Customize banner copy. Keep it short and Verity-voice (no emoji, no marketing copy).
- [B] Ensure CMP script loads before any other third-party scripts in `layout.js`.
- [B] Block ad render until `__tcfapi` reports consent (TCF 2.2 signal).
- [B] Add a "Manage cookie preferences" link in the footer that re-opens the CMP UI.

### ads.txt

- [B] Create `web/public/ads.txt` with AdSense line. Commit.
- [B] Verify `https://www.veritypost.com/ads.txt` returns the file with content-type `text/plain`.
- [B] Re-verify after any network addition (every network wants its own line).

### Privacy policy (legal, not engineering)

- [P] Lawyer updates policy to name AdSense, describe cookies, describe retargeting, link to Google's privacy page.
- [P] Add a "Do Not Sell My Personal Information" link in footer (CCPA/CPRA).
- [P] Add a "Manage cookie preferences" link in footer (re-opens CMP).

### Google Ad Manager (phase 2 — skip at launch)

- [P] Only once you have 1–2 direct advertisers OR want header bidding.
- Carries AdSense as a demand source plus direct orders plus header bidding.
- Free up to ~90M impressions/month.

### Amazon Publisher Services / TAM (phase 3)

- Adds Amazon as a second auction participant. +20–30% CPM uplift typical.
- Requires header bidding infrastructure (Prebid.js or GAM).

### Mediavine / Raptive / Playwire (phase 3, optional)

- Full-service ad management. They take 30–40% rev share, handle everything.
- Traffic minimums: Mediavine 50k sessions/month, Raptive 100k. Skip until you're there.

---

## 5. Targeting worksheet

A single source of truth for which ads show to whom, where. Fill in per
active placement.

```
PLACEMENT: _____________________________

IF user is:
  anon                         →  ☐ show AdSense  ☐ show direct  ☐ show house  ☐ none
  verified free                →  ☐ show AdSense  ☐ show direct  ☐ show house  ☐ none
  verity (paid, reduced)       →  ☐ show AdSense  ☐ show direct  ☐ show house  ☐ none
  verity_pro / family / xl     →  NEVER (enforced in RPC; no action)

AND category is in:
  ☐ all categories
  ☐ only: _____________________________
  ☐ exclude: _____________________________

AND device is:
  ☐ all  ☐ web only  ☐ ios only

AND session has viewed:
  ☐ any pageviews  ☐ ≥ 2 pageviews (warm)  ☐ first pageview only (welcome slot)

AND time window:
  ☐ always  ☐ date range _______ to _______

CAP:
  Max impressions per user per day: ______
  Max impressions per session: ______
```

---

## 6. Admin UX — what to build so owner can self-serve

Three pages. Build in order.

**Page A — Placement matrix** (extends existing `/admin/ad-placements`)
- Grid: page × position. Cell shows active/inactive, # units competing, tier rules, last-24h fill %.
- Click cell → Page B.

**Page B — Slot editor** (new; most valuable of the three)
- Top: slot config (page, position, type, dimensions, tier rules, category filters, date range).
- Middle: "Add unit" with four tabs:
  - **AdSense tab** — paste the `<ins class="adsbygoogle">` snippet. System parses `data-ad-client` + `data-ad-slot`, auto-creates the unit.
  - **Direct image tab** — upload or paste URL, click URL, alt, CTA, weight, dates.
  - **Direct HTML tab** — paste HTML. Renders in sandboxed iframe.
  - **House tab** — pick from a library of Verity-Post promos (subscribe, newsletter, download-app).
- Bottom: list of all units bound to this slot, each with last-24h stats + weight slider + pause/delete.

**Page C — Targeting preview**
- Input: simulated user profile (anon / Verity free / Pro / category / device).
- Output: "Here's what would serve on each active placement for this user right now."
- Lets you verify targeting rules without creating test accounts.

---

## 7. Instrumentation worksheet (what you'll measure)

| Metric | Why | Source |
|---|---|---|
| Impressions by slot, by day | Demand health | `ad_impressions` → `ad_daily_stats` |
| CTR by slot, by campaign | Creative quality | existing columns |
| Fill rate by slot | Network health | `ad_impressions.ad_unit_id IS NULL` = unfilled |
| RPM (revenue per 1000 impressions) by slot | Revenue yield | manual paste of AdSense CSV (no free API) |
| Viewability % | Honest-impression rate | needs IntersectionObserver upgrade |
| Bounce lift vs. no-ad cohort | UX cost | A/B split + session depth |
| Subscriber-conversion lift from in-ad "remove ads" CTA | Funnel revenue | click from `/billing?src=ad_cta` |

---

## 8. Pre-launch checklist — do every one before flipping an ad live

- [ ] AdSense account approved, pub ID recorded.
- [ ] `ads.txt` live at `veritypost.com/ads.txt`, content-type `text/plain`.
- [ ] CMP banner shows in EU, CA, UK, BR, AU. Consent persistence works across refresh.
- [ ] AdSense script does NOT load until consent granted. Verified in DevTools Network tab on incognito EU session.
- [ ] Privacy policy updated and linked in footer. "Do Not Sell" link wired.
- [ ] At least one direct / house ad in every active slot as fallback if AdSense doesn't fill.
- [ ] Paid tiers (Pro / Family / XL) verified to see zero ads on every slot.
- [ ] Kids app verified to load zero ad scripts (network tab clean).
- [ ] Admin tier (owner / admin / moderator) verified to see zero ads (sanity — they're reading the product, not serving to themselves).
- [ ] `<Ad />` not mounted on any excluded surface (`/login`, `/signup`, `/admin`, kid pages, error pages). Grep to verify.
- [ ] Impression logging confirmed writing to `ad_impressions`. Click logging confirmed.
- [ ] Rate limits on `/api/ads/impression` + `/api/ads/click` confirmed (300/min, 120/min).
- [ ] Viewability-gated impression logging shipped (IntersectionObserver — currently logs on mount, overstates).
- [ ] AdSense policy review — no ad placed adjacent to Verity's own CTAs (Sign up, Subscribe). If in doubt, add visual separation.
- [ ] Legal review complete.

---

## 9. Ordered execution

Once the decisions in §1, §2, §5 are filled in, the build sequence is:

1. **Schema additions** — `ad_units.ad_network` enum extension, `network_config jsonb`, `target_categories text[]`, `target_article_ids text[]`. Migration file.
2. **`Ad.jsx` dispatch** — read `ad_network`, route to direct / AdSense / house subcomponent. Existing direct path untouched.
3. **`AdSenseSlot` subcomponent** — takes `{ clientId, slotId, format, size }`, renders `<ins>`, pushes to `adsbygoogle`.
4. **`ads.txt` + AdSense script tag** in `layout.js`, consent-gated.
5. **CMP install** (Google Funding Choices).
6. **Admin Page B (slot editor)** — the owner-facing paste-and-place UI.
7. **Admin Page C (targeting preview)**.
8. **Viewability-gated impression logging** via IntersectionObserver.
9. **Subscribe-to-remove-ads CTA** inside every served ad for anon/free.
10. **Revenue dashboard** (manual AdSense CSV import).

Each item is self-contained and shippable. Roughly: item 1–5 = one week of engineering. Item 6–7 = one more week. Item 8–10 = a third week. Three weeks total for a full ad platform you can operate yourself.

---

## 10. What's out of scope for this gameplan

- iOS app ads — parked per D8. Revisit 6–12 months post-launch.
- Header bidding, Prebid, Amazon TAM — parked until 100k sessions/month.
- Full-service ad networks (Mediavine / Raptive) — parked until traffic minimums.
- Native video ads — parked (no video content yet).
- Rewarded ads ("watch this ad to unlock a free article") — parked; contradicts the quiz-gated commentary thesis.
- Retargeting pixels (Facebook, X, LinkedIn) — separate gameplan; different admin surface.
- Affiliate / commerce links (Skimlinks) — separate gameplan; zero-UX product.

When any of these moves in-scope, they get their own gameplan, not bolted onto this one.

---

## Appendix A — the AdSense code snippet you'll be pasting

When you create an ad unit in the AdSense console, they give you three
lines to paste. You put line 1 in the site `<head>` once. You paste
lines 2–3 wherever the ad goes. Example:

```html
<!-- head tag, once per site -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-xxxxxxxxxxxxxxxx" crossorigin="anonymous"></script>

<!-- wherever the ad goes -->
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-xxxxxxxxxxxxxxxx"
     data-ad-slot="1234567890"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>
  (adsbygoogle = window.adsbygoogle || []).push({});
</script>
```

The Slot editor (Page B, AdSense tab) parses the `<ins>` block — extracts
`data-ad-client` → stored in `network_config.client_id`, `data-ad-slot`
→ `network_config.slot_id`, `data-ad-format` → `network_config.format`,
size → width/height. Owner doesn't need to understand the parse; they
just paste.

---

## Appendix B — the kid-safety failsafe

Independent of everything above, write this Postgres constraint and
commit it as an always-on invariant:

```sql
ALTER TABLE ad_placements
  ADD CONSTRAINT no_ads_on_kids_surfaces
  CHECK (
    page NOT ILIKE 'kids%'
    AND page NOT IN ('login','signup','verify-email','reset-password','forgot-password','welcome','admin')
  );
```

And a matching application-level test that fails CI if anyone adds
`<Ad />` to a file under `src/app/kids-app/`, `src/app/admin/`, or any
of the auth-flow pages.

Makes the "no ads ever on kids surfaces" promise structurally impossible
to break by accident.
