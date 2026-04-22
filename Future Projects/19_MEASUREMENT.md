# 19 — Measurement

**Owner:** Lessin (primary — subscription-business metrics), Dunford (positioning health metrics), Thompson (editorial metrics).
**Depends on:** `00_CHARTER.md`, `02_PRICING_RESET.md`, `07_KIDS_DECISION.md`, `18_ROADMAP.md`.
**Affects:** the `events` pipeline, new dashboards, weekly review cadence.

---

## Principle

You measure what you optimize. Verity optimizes for comprehension, trust, and honest conversion. The metrics should reflect those — not DAU, not session length, not the usual engagement proxies that news products default to.

Lessin in the panel: "The metrics a news startup picks reveal its values. Pick engagement metrics and you'll become engagement-optimized whether you mean to or not."

## What we measure

### Acquisition (top of funnel)

- **Unique visitors** — first-time landings, by source. Used to understand where attention comes from. Not for celebration.
- **Signup conversion rate** — unique visitors who sign up within 24 hours. Target: 3–5% baseline, 8%+ after product-market fit.
- **Paid-ad CAC** — customer acquisition cost per channel (Facebook, Google, newsletter partnerships). Target: < $15 CAC on primary channels. Above $40 and the channel should be cut.

### Activation (the reader actually tries the product)

- **First-article read-through rate** — new users who read ≥1 full article in their first session. Target: 65%+.
- **First-quiz attempt rate** — new users who take the quiz on their first article. Target: 40%+.
- **First-quiz pass rate** — of those who attempt, % who pass 3/5. Target: 55–70% (if too high, quizzes are too easy; if too low, they're poorly written).
- **Comment on first article** — of those who pass, % who comment. Target: 15–25%.

### Retention

- **D7 retention** — % of signups active on day 7. Target: 40%+.
- **D30 retention** — % of signups active on day 30. Target: 25%+.
- **W4 retention of paid subscribers** — % of paid subscribers still active week 4. Target: 90%+.
- **Monthly churn on paid** — % of paid base who cancel each month. Target: < 4%.
- **Reading frequency of active users** — articles read per week, cohort over cohort. Target: growing trend line, even if absolute number is modest.

### Conversion

- **Trial start rate** — % of free-tier users who start a trial within 30 days. Target: 8–12%.
- **Trial-to-paid conversion** — % of trials that convert to paid. Target: 40%+ at current pricing.
- **Free-to-paid over 6 months** — % of all signups who end up paying within 6 months. Target: 3–5%.

### Revenue

- **MRR** — monthly recurring revenue, by tier.
- **ARR** — annualized recurring revenue.
- **Family tier adoption rate** — % of paid subscribers on family tier. Target: 30%+ after 6 months.
- **Blended ARPU** — average revenue per user across the paid base.
- **LTV** — estimated lifetime value. At 4% monthly churn and $12 blended ARPU, LTV ≈ $300.

### Editorial health

- **Format adherence** — % of articles that correctly follow the three-beat summary format. Target: 95%+ at 60 days post-launch.
- **Corrections-issued-per-published-article** — honest count. Target: 0.5–2% is realistic and healthy; above 5% means editorial workflow is broken.
- **Correction time-to-issue** — from report received to correction published. Target: < 48 hours P90.
- **Reader reports received per week** — both valid and invalid. Rising trend is good (means readers trust the button); ratio of valid:invalid is also tracked.

### Trust signals (reader-facing)

- **Defection click rate** — % of article readers who click a defection link. Target: 3–8%. Low is fine; we don't optimize for this. High is also fine. What we watch is whether readers come back after defecting.
- **Return rate after defection click** — % of defecting readers who return to Verity within 7 days. Target: 60%+. This is the trust-confirmed number.
- **Standards page visits** — low-volume but important. We care when there's a spike (usually after a correction or a press mention).

### Kids product (per `07_KIDS_DECISION.md`)

- **Family tier attach rate** — % of paid base on family tier.
- **Kid pair-through rate** — % of family subscribers who pair at least one kid within 14 days.
- **Kid retention D30** — % of paired kids active at day 30.
- **Parent-to-kid reading overlap** — do families read together? Proxy for product stickiness.

## What we explicitly do NOT measure (or don't display)

- **Time on page.** Irrelevant. A reader who reads a summary fast and doesn't click through is a well-served reader, not a failure.
- **Scroll depth.** Same logic.
- **Session length.** Same.
- **"Engagement rate."** Vague, gameable, poisonous. Refuse.
- **Public vanity metrics.** No "X users" counter on the home page. No "most read" list visible to readers.
- **Virality coefficient.** We don't optimize for viral; if it happens, great. Chasing it distorts the product.
- **Ad impression / click-through** on the home page. Home page has no ads (per `09_HOME_FEED_REBUILD.md`).

## The data pipeline

Current state (verified 2026-04-21): `events` table partitioned by date, `events_20260421` has 57 rows today, pipeline is writing. `analytics_events`, `pipeline_runs`, `pipeline_costs` exist. The infrastructure is in place.

What to add:

- Explicit event types for the measurements above: `quiz.attempt`, `quiz.pass`, `quiz.fail`, `comment.post`, `paywall.view`, `paywall.dismiss`, `paywall.start_trial`, `trial.convert`, `trial.cancel`, `defection.click`, `correction.issued`, `report.filed`.
- Standard event payload: `user_id` (hashed if anon), `article_id` or equivalent target, `source_surface`, `plan_tier`, timestamp.

## Dashboards

### Weekly editorial review

- Last-week articles published.
- Format adherence sample audit.
- Reports received + valid/invalid ratio.
- Corrections issued + time-to-issue.
- Any refusal-list near-misses flagged by editor review.

### Weekly subscription health

- MRR trend (last 12 weeks).
- Trial start count.
- Trial-to-paid conversion rate.
- Monthly churn.
- Family tier attach rate.

### Weekly reader health

- Active reader counts (DAU, WAU, MAU).
- New signups.
- D7 / D30 cohort retention curves.
- Paywall presentation count per surface.
- Top-performing stories (for editorial debrief, not for feed ranking).

### Monthly financial

- Revenue by tier.
- CAC by channel.
- LTV:CAC ratio.
- Estimated runway given current burn.

### Quarterly strategic

- Positioning health — are readers describing Verity correctly? (Qualitative, via user interviews.)
- Charter audits — have we violated any commitment?
- Refusal-list audits — have we violated any refusal?
- Team capacity — is editorial ops sustainable?

## Transparency internally

Dashboards are shared with the whole team, not just owner. Everyone can see the numbers. Honesty about performance is part of the product's internal culture.

No vanity dashboard in pitch decks. The same numbers we see internally are the numbers we share externally when asked.

## What we don't share with third parties

- Individual reader behavior.
- Reading histories.
- Comment patterns.
- Anything that identifies a reader to an advertiser or data broker.

Per refusal list item 12: first-party analytics only. The data we collect stays with us.

## Acceptance criteria

- [ ] Event types above are defined in `web/src/lib/events/types.ts`.
- [ ] Event fires verified for: quiz attempt/pass/fail, comment post, paywall view/start_trial/dismiss, trial convert/cancel, defection click, correction issued, report filed.
- [ ] Dashboards exist for weekly editorial, weekly subscription, weekly reader, monthly financial, quarterly strategic.
- [ ] Dashboards read from first-party pipeline only — no Google Analytics, no Meta Pixel on authenticated surfaces.
- [ ] Metric targets documented and reviewed at each phase gate in `18_ROADMAP.md`.
- [ ] Explicit "what we don't measure" list posted internally — not just for discipline, but to onboard future hires.

## Risk register

- **Metrics tempt us to game.** Mitigation: the refusal list and Charter protect against this. If a metric moves because we gamed it, that's a refusal violation.
- **Editorial metrics put pressure on editors.** Mitigation: format-adherence is a team metric, not individual. Corrections issued per editor is not displayed; we care about the collective workflow.
- **Dashboards become decoration, not decision tools.** Mitigation: each phase gate references specific metrics. No dashboard exists without a recurring review.
- **Third-party analytics get pulled in by someone.** Mitigation: the data pipeline is first-party by design. Adding a third-party script to authenticated surfaces is a refusal-list violation.

## Sequencing

Ship after: `18_ROADMAP.md` phase 1 work (you can't measure what doesn't exist yet).
Ship before: launch (Week 12). Measurement is launch-critical.
Pairs with: `04_TRUST_INFRASTRUCTURE.md` (correction-cycle metrics, reader-report metrics).
