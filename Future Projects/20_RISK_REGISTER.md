# 20 — Risk Register

**Owner:** The owner (final word), Bell (trust risks), Lessin (business risks), Ali (operational risks).
**Depends on:** every doc in this folder.
**Affects:** roadmap decisions, hiring, staging timing.

---

## Why this exists

Most plans handle risk by not naming it. This folder names it.

Each risk below has: what could happen, how likely, how expensive if it does, and the mitigation already planned (or the reason we're accepting the risk).

Risks are sorted roughly by severity-weighted probability. Highest risks first.

---

## Risk 1 — First major factual error handled badly

**What could happen:** Verity publishes a piece with a material factual error. A reader — or worse, another outlet — flags it publicly. The correction workflow is slow, the correction is buried, or the response is defensive.

**Likelihood:** Very high. Will happen within 12 months. Every outlet makes factual errors.

**Cost if mishandled:** Catastrophic to the trust moat. One visibly-mishandled correction can erase years of reputation-building.

**Mitigation:**
- Trust infrastructure (`04_TRUST_INFRASTRUCTURE.md`) ships pre-launch. Corrections feed exists before the first correction is needed.
- 48-hour SLA on corrections.
- First correction is practiced on a pre-launch staging piece so the team has muscle memory.
- Correction prominence matches original-error prominence. If the error was on the front page, the correction is on the front page.

**What "handled well" looks like:** Within 24 hours of the flag, the article is corrected, the corrections feed entry is live, the original flagger is emailed, the editor who placed the piece is named in the log. Owner may or may not post a tweet about it — depends on visibility.

---

## Risk 2 — Family tier never gets the kids-app lift

**What could happen:** The family tier's pricing ($19.99/mo) is justified by the kids app being a key value driver. If family-tier attach rate is below 15% after 6 months, the kids app isn't doing its job — either the onboarding is broken, the pair flow is broken, or the kids app isn't actually compelling.

**Likelihood:** Medium (20–30%). Kids news products have a track record of lower-than-hoped adoption.

**Cost if realized:** Family tier becomes a zombie tier — priced for a value it doesn't deliver. Revenue mix tilts to lower ARPU.

**Mitigation:**
- Per `07_KIDS_DECISION.md` and `19_MEASUREMENT.md`: family-tier attach rate and kid pair-through rate are tracked weekly.
- At 90-day mark, mid-cycle check; if attach rate is < 10%, initiate investigation.
- Sidecar model means kids is not over-invested; pulling back is cheaper than it would be in flagship mode.

**What "pulled back" looks like:** Kids app stays shipped, no new features, marketing tilts toward adult product. Family tier stays available for the families who do want it. Not a failure — a calibration.

---

## Risk 3 — Editorial team burns out

**What could happen:** Three editors covering three shifts is sustainable on paper. In practice: one quits, one gets sick, holidays happen. The on-shift discipline breaks and the front page gets handed to an algorithm "just for a day."

**Likelihood:** Medium. Small teams in small companies are fragile.

**Cost if realized:** Charter commitment 2 breaks. The front page's editorial voice becomes inconsistent. Reader trust erodes quietly.

**Mitigation:**
- Three-editor minimum + Senior Editor on-call = four people with some overlap.
- Part-time and contractor options OK for Year 1; full-time only when revenue supports.
- Owner covers a shift in extremis but is NOT a default fallback — that's how Drudge-scale burnout happens.
- Per `05_EDITOR_SYSTEM.md`: public editorial log makes the occasional skeleton-crew day visible; readers understand a holiday without losing trust.

---

## Risk 4 — Apple Dev account doesn't arrive in time

**What could happen:** iOS apps are ready to ship but we can't submit them because the Apple Dev account isn't active. Web launches solo. Adult iOS and Kids iOS slip 2–8 weeks.

**Likelihood:** Meaningful. Owner already flagged this blocker (CLAUDE.md).

**Cost if realized:** Kids product can't ship. Family tier stays hidden until kids ship. Adult mobile experience limited to web responsive.

**Mitigation:**
- Dev work on both iOS apps continues regardless — code stays green, xcodebuild passes, IAP wiring stays production-ready.
- Web launch is not blocked.
- Apple-dependent tasks documented (per CLAUDE.md memory: T-033–T-038).
- The hour the Dev account lands, submission is a 1-day path, not a 3-week path.

---

## Risk 5 — Paywall rewrite converts worse than current

**What could happen:** The invitation-voice paywall reads as less urgent, readers defer and never come back.

**Likelihood:** Low (10–15%). Empirical evidence on transparent-trial paywalls is strongly positive in SaaS and consumer subs.

**Cost if realized:** Short-term revenue miss of 10–20% until we iterate.

**Mitigation:**
- Conversion is measured per-surface per `19_MEASUREMENT.md`.
- If trial-start drops >20% post-rewrite, revisit with targeted edits, not full rollback.
- We're not A/B testing the Charter, but we can A/B test specific headlines within the invitation framing.

---

## Risk 6 — Quiz gate seems gimmicky

**What could happen:** Readers perceive the quiz as a hoop, not a feature. They bounce at the quiz rather than engaging.

**Likelihood:** Low–medium (15–25%).

**Cost if realized:** The mechanic designed as the moat becomes the reason people leave.

**Mitigation:**
- Commitment to the mechanic is constitutional (Charter 3). We don't drop it.
- Fail state handled warmly per `12_QUIZ_GATE_BRAND.md`.
- 80% of readers don't need to pass the quiz — they just read. Only commenters hit the gate. Bounce rate measured at the article→quiz→comment funnel, not at the comment gate itself.
- If quiz pass rate is oddly low (<50%), investigate: are the questions bad? Are the articles bad? Which is the root cause?

---

## Risk 7 — Pricing reset shrinks top-of-funnel

**What could happen:** Raising from $3.99 to $6.99 reduces trial-starts. Free-to-paid conversion drops in absolute numbers even if retention holds.

**Likelihood:** Medium (30–40%). Price-demand elasticity is real.

**Cost if realized:** 6–12 months of slower revenue growth than the old pricing would have produced.

**Mitigation:**
- Per `02_PRICING_RESET.md`: Option A pricing intentionally below Option B to soften the increase.
- Annual tier discount (30% off) preserves a lower-entry-point option for price-sensitive buyers.
- Measured per `19_MEASUREMENT.md`. If trial-start conversion drops >30%, revisit.
- Long-term LTV should be higher even if acquisition is slower. Measure LTV:CAC, not just conversion.

---

## Risk 8 — Nobody notices

**What could happen:** Verity launches, the product is good, no one hears about it. Web launch gets <1000 visitors/day. No viral moment, no press pickup, no organic momentum.

**Likelihood:** High. Most product launches are quiet.

**Cost if realized:** Slower growth than modeled. Acceptable if the product is right — a small committed reader base compounds. Unacceptable if it persists past 12 months without improvement.

**Mitigation:**
- The refusal list (`17_REFUSAL_LIST.md`) is optimized for share. Expect some PR via contrarian-posture coverage.
- Pre-launch press outreach in Week 11 (per `18_ROADMAP.md`). 5–10 target writers.
- Paid ad budget ($1K/week) tests primary channels.
- Word-of-mouth through the Verity Post for Kids wedge (if kids product hits).
- Accept: the "no viral moment" path is slower but survivable. A stable 5–10K paying subscribers after 18 months is a real business even without fireworks.

---

## Risk 9 — A reader reports a correction and we fumble it publicly

**What could happen:** Reader uses the "See a problem?" button, fills valid concern. Editor queue is slow, report sits for 5 days, reader escalates publicly with a tweet screenshot of the unresponded report. Verity looks worse than if the button didn't exist.

**Likelihood:** Medium. Editor ops can lag.

**Cost if realized:** Mid-scale. Worse than not having the button.

**Mitigation:**
- Per `04_TRUST_INFRASTRUCTURE.md`: 48-hour SLA is explicit.
- Admin queue (`/admin/trust-reports`) sends Slack ping on new report.
- Weekly editorial review includes "reports over 48h old" as a standing agenda item.

---

## Risk 10 — Trust signals get gamed by bad actors

**What could happen:** The "passed the quiz" badge becomes a target. Bad actors brute-force the quiz (cool-down protects but doesn't stop), flood comment sections with quiz-passed trolls, and the comment quality drops anyway.

**Likelihood:** Low initially, rises with traffic.

**Cost if realized:** The moat leaks. Comment quality regresses.

**Mitigation:**
- Cool-down after 3 fails (per `12_QUIZ_GATE_BRAND.md`).
- Rate limits (31 defined in the `rate_limits` table) cover comment posting.
- Moderation tools exist (`/admin/moderation`, `user_warnings` table, `report` workflow).
- Possible Year 2 addition: quiz questions rotate, making the pool harder to brute-force.

---

## Risk 11 — COPPA compliance slip in the kids app

**What could happen:** Something in the kids data flow — pair code, kid analytics, kid profile attributes — crosses a COPPA line. Apple Kids Category review flags it. App gets rejected or, worse, removed post-launch.

**Likelihood:** Low. Existing infrastructure (custom JWT, no auth.users entry, RLS via `is_kid_delegated`) is COPPA-aware by design.

**Cost if realized:** Kids app delayed. Reputational damage.

**Mitigation:**
- `PrivacyInfo.xcprivacy` correctly declares tracking=false, no ad networks.
- Kid data lives outside `auth.users`.
- Family-plan-only access gate.
- Pre-submission: a legal compliance review by a COPPA-familiar attorney. Small cost, large protection.

---

## Risk 12 — The owner over-scopes

**What could happen:** Mid-build, a new idea arrives (dark mode, podcast, opinion column, etc.) and the roadmap absorbs it. Phase 2 stretches, Phase 3 slips, launch drifts into Q2 of 2027.

**Likelihood:** High. Every founder does this.

**Cost if realized:** Launch delayed by 2–6 months. Some features shipped half-done.

**Mitigation:**
- `18_ROADMAP.md` has phase gates. Nothing new enters a phase mid-stride.
- Refusal list includes "no features not in the Year 1 folder."
- Ideas get captured for Year 2 review but don't interrupt Year 1.
- Owner is the only person who can break scope. If they do, the consequence (launch slip) is their call. But publish the slip; don't hide it.

---

## Risk 13 — Press coverage is negative

**What could happen:** A journalist covers Verity critically. The angle: "pretentious, over-designed, pretentious-founder, the quiz gate is patronizing to readers."

**Likelihood:** Medium (20–30%). Contrarian press is as plausible as supportive press.

**Cost if realized:** One bad piece is survivable. A pile-on of bad pieces is a brand crisis.

**Mitigation:**
- Respond to criticism via the standards doc, not via Twitter wars.
- Accept critiques and publish any adjustments via the editorial log.
- The refusal list pre-emptively addresses the "pretentious" critique — readers can see the product's self-awareness.
- Don't engage with bad-faith critiques; let the product speak.

---

## Risk 14 — The editorial format feels constraining at scale

**What could happen:** As volume grows to 20+ stories/day, the three-beat format becomes hard to maintain. Editors start shipping summaries that technically fit but feel mechanical.

**Likelihood:** Medium. Format fatigue is real.

**Cost if realized:** The signature format becomes a meme for mockery. Competitors copy it and do it better because we did it first but worst.

**Mitigation:**
- Per `10_SUMMARY_FORMAT.md`: weekly editorial review includes format-quality audit.
- Summaries are peer-reviewed before publish.
- The three exceptions (breaking, explainer, expert Q&A) provide pressure valves.
- Editorial hiring prioritizes writers who thrive in tight structures — not everyone does.

---

## Risk 15 — A conflict between the Charter and revenue pressure

**What could happen:** 18 months in, revenue is underperforming. A Board member or an advisor pressures for "just one" engagement-optimization. The owner wavers.

**Likelihood:** Guaranteed. Every founder hears this pressure.

**Cost if realized:** The moat drains. Competitors catch up. The Charter becomes aspirational, not real.

**Mitigation:**
- The Charter is signed. Public. Named commitments.
- The refusal list is public. Breaking a refusal requires publishing why.
- The business model is built around the refusals, not despite them.
- If the pressure is real and revenue is genuinely underperforming, the correct response is pricing or distribution, not Charter drift.

---

## Summary — the top 5 to watch

Of all of these, the five risks that most warrant ongoing attention:

1. **First major factual error (Risk 1)** — inevitable, pre-launch preparation critical.
2. **Editorial team burnout (Risk 3)** — operational, slow-burn, high-impact.
3. **Owner over-scoping (Risk 12)** — launch-critical, disciplining-self is harder than disciplining-others.
4. **Apple Dev account delay (Risk 4)** — out of our hands, but plan is sound either way.
5. **Charter-vs-revenue conflict (Risk 15)** — the long-game risk that kills good products.

This register is reviewed quarterly. Not as theater — as operating discipline.
