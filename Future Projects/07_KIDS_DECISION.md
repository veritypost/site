# 07 — Kids Decision: Sidecar vs Flagship

**Owner:** Ali (primary — he attacked this as a "side project that will consume 40% of eng time and generate 5% of revenue"), Lessin (business), Ive (product sensibility).
**Depends on:** `00_CHARTER.md`, `01_POSITIONING.md`, `02_PRICING_RESET.md`.
**Affects:** resource allocation, roadmap sequencing, kids iOS app (`VerityPostKids/`), adult family surface, family plan tier, marketing split.

---

## The conflict

The 34-person panel unanimously loved the kids app. The 5-hardass panel nearly killed it. Both sides had merit.

**Pro-flagship case (34-panel):** This is the only news product with a credible kids companion. Nobody else has this. It's a 10-year moat — families that start with a 7-year-old on Verity Post for Kids have a reader-years relationship we'll still be monetizing when that kid is 17. It's the differentiator.

**Anti-flagship case (Ali in hardass session):** Every news-for-kids company has tried and struggled. Newsela raised $100M and got acqui-sold. News-O-Matic has been grinding for 12 years and remains niche. TIME for Kids has a massive brand and the economics still don't work. School sales cycles are the slowest, cheapest, most impossible distribution in B2C. Kid apps don't print money; they consume resources.

**The tie-breaker (Bell):** "The kids thing is the only morally interesting thing about this company. Don't kill it."

## The resolution: sidecar now, flagship later

The panel voted 4–1 for this model. Bell's dissent preserved — the kids app ships as a core product, not a side project, but not as the primary revenue lever in year one.

Specifically:

- **Year 1:** Kids app ships. Lean team. No school sales. The path to adoption is the family plan — parents who already subscribe to Verity add their kids. Revenue model is subscription attribution to the family tier, not a separate kids tier.
- **Year 2:** Once adult product has 10K+ paying subscribers and shows retention, invest in school channel. One person (education partnerships lead) full-time. Target: 50 schools by end of year 2.
- **Year 3+:** If schools are working, scale the kids product. If not, kids stays sidecar indefinitely — still a product, still loved, not a primary revenue lever.

This is a reversible decision. The data tells us whether to escalate.

## What the sidecar looks like

### Scope for Year 1

The kids app exists, is polished, is loved, is limited. Specifically:

- **Pair-code auth flow** is production-ready (it's already built — `PairingClient.swift`).
- **Kid reader** (currently `KidReaderView.swift`) — solid, text-first, working.
- **Kid quiz engine** (`KidQuizEngineView.swift`) — solid, adapted from adult quiz.
- **Streak + badges + home greeting** — strongest existing work, per kids-iOS recon. See `14_KIDS_CHOREOGRAPHY.md` for the polish pass.
- **Expert Q&A** — minimal MVP. Parent submits a question, editor routes to an expert, expert answers, kid sees response. No real-time, no chat, no community features.
- **Leaderboard** — family-scoped only in year 1. Kids see their rank within their family, not globally. Reduces comparison anxiety and privacy surface.
- **Parental gate** — `ParentalGateModal.swift` exists with zero callers. Wire it. Required for any sensitive action (upgrade prompts, external links, email changes).

### What we explicitly don't ship in Year 1

- No standalone kids tier. Family plan is the only way to get the kids app. This simplifies pricing and aligns incentives with adult product adoption.
- No school-specific UI. No classroom mode, no teacher dashboard, no bulk license portal. All of that is Year 2+.
- No global leaderboard or messaging between kids. Too much moderation overhead, too much privacy risk for COPPA compliance.
- No web version of the kids product. Kids iOS only. Android waits until iOS is proven.
- No news-outside-the-kids-app-feed. No cross-posting kids content to social media. No kid-oriented newsletter. The app is the whole product.

## What the adult product does for the kids product

1. **Onboarding:** Family plan subscribers see a clear "Add your kids" card in `/profile/kids`. Generate pair code. Kid installs app. Kid pairs. Done.
2. **Payment:** Single family subscription covers both apps. No separate kid billing.
3. **Trust:** Adult Verity's editorial standards (see `04_TRUST_INFRASTRUCTURE.md`) apply to kids content. Same corrections feed, same named editors, same standards doc. Kids content is edited and fact-checked to the same bar as adult content.
4. **Content:** Kids articles are often simplified versions of adult articles, prepared by the kids editorial team. The editorial charter covers both.

## What Ali conceded

In the hardass session, Ali's skepticism about kid-product economics was hard but he conceded one point: **"If the kids app becomes the reason families pay for the adult app, it's valuable even if the kids app itself doesn't print money."**

The sidecar model leans into that. Kids is a family-plan conversion lever, not an independent P&L. If family-plan attach rate rises because of the kids app, we've won — even if zero kids actually pay.

## Metrics to watch

Family plan is the signal. Kids product health shows up as:

- **Family-tier adoption rate** — what % of paid subscribers choose the family tier over the individual tiers. Target: 35%+ after 6 months. Below 20% means the kids app isn't moving adult conversion.
- **Kid pair-through rate** — what % of family-tier subscribers successfully pair at least one kid profile within 14 days. Target: 70%+. Below 50% means the onboarding flow is broken or the kids app isn't usable.
- **Kid retention** — what % of paired kids read at least one article per week after 30 days. Target: 60%+. Below 40% means the kids product isn't sticky and the family plan is churning because of it.
- **Adult churn on family-tier** — family subscribers cancelling. If higher than solo tiers, kids product is actively hurting. If lower, kids product is the retention engine we thought it was.

All measurable via the `subscriptions` and `reading_log` tables already in Supabase.

## The Year 2 decision point

12 months after launch, check the metrics. Three possible outcomes:

1. **Family tier is >40% of paid base AND kid retention >60%:** Escalate. Hire education lead, open school channel, build teacher dashboard, pitch school districts.
2. **Family tier is 20–40% AND kid retention 40–60%:** Hold. Sidecar continues. Revisit in 6 months.
3. **Family tier <20% OR kid retention <40%:** Reduce. Kids app stays for existing families but dev investment minimizes. Don't kill it (Bell's dissent holds) — just let it coast.

This is the honest framework. Most founders don't write the "reduce" path. Write it so there's no ambiguity when the decision arrives.

## What this doesn't resolve

- **Apple Developer account blocker.** Both iOS apps are blocked on publishing until the owner's Apple Dev account is active. Development is not blocked. See CLAUDE.md project note. Sidecar decision is independent of Apple timeline.
- **COPPA specifics.** See existing compliance docs. This doc is strategic, not legal.
- **Specific features inside the kids app.** See `views/ios_kids_*.md` for per-view specs.

## What changes in product ops

### Eng allocation

- **Year 1 sidecar:** 20% of engineering time on kids product. Primary work is the polish pass from `14_KIDS_CHOREOGRAPHY.md` plus bug fixes plus the parental gate wire-up.
- **Year 1 editorial:** 2 part-time editors covering kids content. Kids content is a mix of adapted adult stories + some kid-originated pieces.
- **Year 2 if escalating:** double eng allocation, add education partnerships lead, add kid-content editor full-time.

### Marketing allocation

- **Year 1:** Kids is mentioned on the adult marketing surfaces (as a family-plan benefit). Not separately marketed. Ad campaigns for parents frame the family tier, not standalone kids app.
- **Year 2 if escalating:** Standalone kids-app campaigns start. Educator seeding program. Parenting-publication PR push.

### Content allocation

- **Year 1:** ~3 kids articles per day. Not a separate pipeline — adapted from adult.
- **Year 2 if escalating:** Grows to 5–7 kids articles per day with dedicated kids editor.

## Acceptance criteria for the sidecar model

- [ ] Kids iOS app ships in App Store Kids Category alongside adult iOS launch.
- [ ] Family plan (currently `is_active=false, is_visible=false`) flips to active + visible *only when* kids app ships and pair-flow tested end-to-end.
- [ ] `/profile/kids` surface on adult web guides family-plan subscribers through kid onboarding.
- [ ] Kids app reads from same Supabase backend as adult; no parallel DB.
- [ ] Kids content editorial is covered by the same editorial charter and corrections workflow as adult.
- [ ] Metrics dashboard exists for family-tier adoption, kid pair-through, kid retention, family churn. Updated weekly.
- [ ] At 12-month mark, decision doc is written: escalate / hold / reduce.

## Explicit non-commitments

- **We are not promising schools in Year 1.** Don't let anyone in the building say "we're working with schools" until we actually are.
- **We are not promising a kids-Android app.** iOS first. Android if we escalate to flagship.
- **We are not promising kid messaging or social features ever.** These require moderation infrastructure we don't have and COPPA risk we won't take.
- **We are not promising the kids product will be the primary revenue driver.** It's a sidecar. Could escalate. Won't default to flagship.

## Risk register

- **Kids app is the best part of the product and we underinvest.** Mitigation: set a quarterly check, not just an annual one. If kids metrics surprise-positive, escalate mid-cycle.
- **Family-plan conversion never materializes.** Mitigation: if family-tier adoption is <10% after 3 months, something is broken. Debug: is it the onboarding flow? The price? The kids app itself? One month of focused investigation.
- **Apple Kids Category review gets weird.** Mitigation: standard compliance risks; spec is clean per existing kids iOS recon. Owner has the Apple review issue on the radar (CLAUDE.md).
- **Content editorial team is overwhelmed by two feeds.** Mitigation: Year 1 kids pipeline is explicitly "adapted from adult, 3 per day." If that's too much, cut to 2 per day. Don't try to scale without a dedicated editor.

## Sequencing

Ship with: adult product at launch. Kids is part of launch, not post-launch.
Depends on: Apple Developer account (for shipping). Pair flow and subscription sync are dev-complete.
Pairs with: `14_KIDS_CHOREOGRAPHY.md` (polish pass on the existing scenes).
Revisit: 12 months post-launch.
