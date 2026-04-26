# 18 — The Roadmap

**Owner:** The owner (final word on sequencing), Lessin (advisor — business sequencing), Thompson (advisor — editorial sequencing).
**Depends on:** every other doc in this folder.
**Affects:** engineering plan, editorial hiring, launch timing.

---

## The shape of the plan

12 weeks from today to public launch of web. Kids iOS and adult iOS launch in the same window if the Apple Dev account lands; otherwise they ship in the following window with all the dev work already done.

Split into three phases:

- **Phase 1 — Foundation (Weeks 1–4):** Charter signed. Pricing reset. Token collapse. Editor system scaffolding.
- **Phase 2 — Surface (Weeks 5–8):** home rebuild, paywall rewrite, quiz gate brand, signature moment, kids polish.
- **Phase 3 — Launch prep (Weeks 9–12):** performance, accessibility, measurement, first editorial cycles, soft launch, hard launch.

Each phase has a gate. You don't advance unless the gate criteria are met.

---

## Phase 1 — Foundation (Weeks 1–4)

### Week 1

- **Charter signed.** `00_CHARTER.md` is non-negotiable by week 1 end.
- **`SubscriptionView.swift` infinite-loading fix.** The 30-minute fix from `11_PAYWALL_REWRITE.md`. Raise the floor on subscription trust immediately.

### Week 2

- **Pricing reset.** `02_PRICING_RESET.md` — plans table updated, new Stripe prices, new Apple product IDs configured (Apple side pends Dev account; iOS code reads from App Store correctly once products exist).
- **Trial strategy in place.** `03_TRIAL_STRATEGY.md` — `trial_days` set on every paid plan, checkout passes `trial_period_days`, Day 5 reminder email template and cron set up.

### Week 3

- **Token collapse.** `08_DESIGN_TOKENS.md` — `web/src/lib/tokens.ts` exists, `globals.css` rewired, `Theme.swift` restructured, `KidsTheme.swift` + `KidPrimitives.swift` unchanged but prepared for `KidPressStyle`.
- **Editor system scaffolding.** `05_EDITOR_SYSTEM.md` — `editorial_charter`, `editor_shifts`, `front_page_state` tables exist. Three named editors identified internally (not published). `/admin/editorial/*` routes built.
- **Kids press style.** `14_KIDS_CHOREOGRAPHY.md` — `KidPressStyle` shipped and applied to every button in kids app.

### Week 4

- **Kids decision committed.** `07_KIDS_DECISION.md` — sidecar model; family tier stays hidden until kids app ships together with it.
- **Summary format shipped.** `10_SUMMARY_FORMAT.md` — `articles` schema updated, story-manager UI enforces single prose `summary` + banned-words check + kicker date picker, rendering component in place.
- **Defection path shipped.** `06_DEFECTION_PATH.md` — table, admin UI, article render.

### Phase 1 gate

You don't advance to Phase 2 until:

- Charter signed.
- Pricing reset on DB, Stripe, Apple.
- Token collapse complete; no regressions.
- Editor system scaffolding in place.
- Summary format (single prose column, no label split) live; story-manager enforces it.

If any of these miss, extend Phase 1. Don't start Phase 2 on a broken foundation.

---

## Phase 2 — Surface (Weeks 5–8)

### Week 5

- **Editor shift rotation begins.** `05_EDITOR_SYSTEM.md` — three editors on rotation. Front page curated by humans from this point forward. `front_page_state` populated every day.
- **Home feed rebuild — ship candidate.** `09_HOME_FEED_REBUILD.md` — new `/` renders from `front_page_state`, masthead + hero + supporting slots, bottom-of-page archive link. Staged on preview branch.

### Week 6

- **Home feed rebuild — production.** Deployed.
- **Paywall rewrite — web surfaces.** `11_PAYWALL_REWRITE.md` — `paywalls/` modules on web, `LockModal.tsx` refactored, every web surface rewritten.
- **Kids choreography batch 1.** `14_KIDS_CHOREOGRAPHY.md` — pair code micro-feedback, quiz option press style, reader progress bar.

### Week 7

- **Paywall rewrite — iOS.** `Paywalls.swift`, regwall and lock surfaces rewritten.
- **Quiz gate brand.** `12_QUIZ_GATE_BRAND.md` — launch-hide on `/story/[slug]` removed, comment thread header, `<PassedMark />` inline, home masthead + About page + App Store copy updated.
- **Kids choreography batch 2.** Streak scene name injection, quiz pass scene haptic, badge unlock origin fix.

### Week 8

- **Signature moment.** `13_QUIZ_UNLOCK_MOMENT.md` — web + iOS. This is the heart of the product's brand; ship it carefully.
- **Kids choreography batch 3.** Category tile progress trails, parental gate wire-up, leaderboard rank animation.

### Phase 2 gate

You don't advance to Phase 3 until:

- Home page renders from `front_page_state` and looks right on mobile, tablet, and desktop.
- Every paywall surface carries invitation-voice copy and the trial timeline.
- Quiz gate visible on every article; comment thread carries "Every reader here passed the quiz"; signature unlock moment shipped.
- Kids press style + pair polish + reader progress + parental gate all shipped.
- Performance budgets from `15_PERFORMANCE_BUDGET.md` met on home and story.

---

## Phase 3 — Launch prep (Weeks 9–12)

### Week 9

- **Accessibility sweep.** `16_ACCESSIBILITY.md` — color contrast fixes, Dynamic Type ported to adult iOS, ARIA labels on interactive elements, tap target sweep, Reduce Motion paths.
- **Performance pass.** `15_PERFORMANCE_BUDGET.md` — Lighthouse CI wired, Sentry RUM live, budgets enforced.
- **Measurement wired.** `19_MEASUREMENT.md` — conversion funnels instrumented, retention dashboard, editor-quality metrics.

### Week 10

- **Soft launch** — invite-only. 500 hand-picked users. 50/50 split between the two primary segments (tired adult readers and informed parents). Daily check-in for feedback.
- **Editorial rhythm** — two full days' front pages curated end-to-end before the soft-launch cohort sees them. Make sure the editors are comfortable before readers arrive.
- **Paid ads prepped.** `views/web_welcome_marketing.md` references the ad strategy. Creatives ready to go live week 12.

### Week 11

- **Soft-launch iteration.** Based on user feedback, fix the top 5 issues.
- **Kids app submitted to App Store Kids Category.** (Apple Dev account-dependent. If blocked, this slips but web launch continues.)
- **Adult iOS app submitted.** Same dependency.
- **Press outreach begins.** Target: 5–10 journalists and educators writing in the media-literacy space, seeded with the product.

### Week 12

- **Public launch — web.** Home page live. Paywalls live. Trial active. Paid ad campaign begins (small budget, ~$1K/week).
- **First press mentions expected.** Watch for coverage, track which angle resonates.

### Phase 3 gate

Launch when:

- Web is publicly reachable, fast, accessible.
- Adult iOS and Kids iOS are ready for review submission (blocked on Apple Dev account but not blocked technically).
- Editorial team has shipped a full week of curated front pages without operational breakdown.
- Paywall conversion is instrumented and not in a known-broken state.
- Legal review complete on Terms of Service and Privacy Policy.

---

## What's in Year 1 but after launch

Weeks 13–52 — the first year post-launch. Non-roadmap'd here because it's reactive work. But the flagged priorities:

- **First factual error.** When it happens, handle it cleanly — editor updates the article prose in place; respond directly to any reader email about it.
- **First viral moment (if it comes).** The site must be fast, the signup flow must be clean, the paywall must convert.
- **Pricing A/B** after 30 days of data. Consider Option B pricing if Option A data supports it.
- **Kids metrics check at 90 days.** Family-plan attach rate, kid pair-through rate, kid retention. Decision: escalate kids investment or hold sidecar.
- **Schools outreach** (if kids metrics escalate). Education partnerships lead hired in Q2.
- **Year 1 editorial expansion.** Team grows from 3 to 5 editors by month 9.

## What's explicitly NOT in Year 1

- Android apps (kids or adult).
- Web version of the kids product.
- Internationalization.
- Podcast / audio original content.
- A separate opinion section.
- Acquiring or partnering with other outlets.
- Fund-raising (hold bootstrap until product metrics support a priced round).

Each of these is a legitimate future move. Each is a Year 2+ decision. Keep the plan focused.

## What this roadmap doesn't cover

- Specific engineering task ordering within a week (that's in `Current Projects/FIX_SESSION_1.md` with T-IDs).
- Individual bug fixes (rolling basis).
- Apple Dev account arrival (gates iOS publish; doesn't gate dev).
- Hiring — editors, marketing, customer support. Covered in ops docs not in this folder.

## How this roadmap stays honest

Every Friday, the owner reviews the week's progress against this plan. Slippages get logged. If a week slips by 20% or more, the corresponding Phase gate slides and downstream weeks rebalance.

Phases don't overlap. A Phase 2 task doesn't start on a Phase 1 miss. The discipline protects the critical path.

## The one rule

If it's not in a phase, it doesn't ship in Year 1. Scope discipline is the roadmap's point. Everything in this folder maps to a phase. Anything not in this folder is cut from Year 1 by default.
