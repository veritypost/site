# Rollout plan

Ship order, testing, rollback, comms. Designed for staged delivery so each phase can ship independently if needed.

---

## Critical pre-launch tasks

Before Phase 0 ships, do these. They block nothing in code but are blockers for go-live:

| Task | Owner | Lead time |
|---|---|---|
| Apply for Apple Small Business Program | Owner | 5-7 business days |
| Apply for Google AdSense | Owner | 1-4 weeks (lag is real) |
| Set up Stripe Tax | Owner | 1 hour |
| Configure Apple App Store Connect subscription group | Owner | 2-3 hours |
| Add the 10 Apple SKUs to App Store Connect | Owner | 4-6 hours |
| Configure Stripe products + prices | Owner | 2 hours |
| Audit existing `auth.users` table for any "Pro" subscribers (count + emails) | Dev | 30 min |
| Audit existing `kid_articles` rows (verify zero before drop) | Dev | 5 min |
| Confirm staging environment has working Supabase + Stripe test mode + Apple sandbox | Dev | 1 hour |

---

## Phase order

### Phase 0: Pass A — prompt fixes (DAY 1)
**Ships standalone.** Unblocks generation. No DB or UI changes. No soak.

| Step | What | Verification |
|---|---|---|
| 0.1 | Edit `editorial-guide.ts` — strip dead blocks, fix output schemas | `grep -E "vp_slug\|RELATED VP\|insufficient_data" web/src/lib/pipeline/editorial-guide.ts` returns 0 lines |
| 0.2 | Fix Zod schemas in route.ts (TimelineEventSchema, summary user-turn) | Local TypeScript compilation passes |
| 0.3 | Add quiz user-turn schema reminder | Manual diff review |
| 0.4 | Trigger 1 adult + 1 kid generation in prod | Both reach `persist`, `pipeline_runs.status='completed'` |
| 0.5 | Move on to Phase 1 immediately | n/a |

**Rollback:** revert the commit. Pipeline returns to old broken state, but no DB damage.

---

### Phase 1: kid_articles consolidation (DAY 1-2)
**Ships immediately after Pass A.** Touches DB + RPC + persist code. No soak — single deploy, single test, single drop.

| Step | What | Verification |
|---|---|---|
| 1.1 | Verify pre-drop state: zero rows in all five tables | SQL check returns all zeros |
| 1.2 | Update `persist-article.ts` payload type — add `audience` + `age_band` fields | TS compiles |
| 1.3 | Rewrite `persist_generated_article` RPC: write all audiences to `articles` table with `is_kids_safe = (audience='kid')` | RPC test query |
| 1.4 | Update generate route to pass new payload fields to RPC | Trigger 1 kid generation; verify row lands in `articles` not `kid_articles` |
| 1.5 | Update admin/articles routes + cron pipeline-cleanup to drop kid_articles branches | Admin manual smoke test |
| 1.6 | M2 migration — drop `kid_articles`, `kid_sources`, `kid_timelines`, `kid_quizzes`, `kid_discovery_items` | Tables gone; no errors on next generation run |

**Rollback:** zero-row pre-check is the safety net. If anything looks off, abort before M2. Code reverts cleanly. Once M2 runs, restoration requires DB backup.

**Why no soak:** the verify-zero-rows pre-check + immediate generation test catches all realistic failure modes in one pass. The tables have never been written to in 90+ days; there's nothing to lose.

---

### Phase 2: Plan structure rewrite (WEEK 1)
**Ships standalone after Phase 1.** Touches plans table + Stripe/Apple SKUs + payment code.

#### Sequenced rollout:

| Step | What | Order | Verification |
|---|---|---|---|
| 2.1 | Apple SBP enrollment | First | App Store Connect status |
| 2.2 | Add 10 new Apple SKUs in App Store Connect (Verity 2 + Family 8) | First | Visible in App Store Connect (no app submission yet) |
| 2.3 | Add new Stripe products + prices (test mode) | First | Stripe dashboard |
| 2.4 | M3 — DB plan table updates | Pre-deploy | SQL check |
| 2.5 | M4 — `kid_seats_paid` column on subs table | With M3 | Schema check |
| 2.6 | Deploy webhook handler updates (Stripe + Apple) | After M3/M4 | Test webhook delivery in staging |
| 2.7 | Deploy `StoreManager.swift` updates with new SKUs | After M3/M4 | iOS sandbox test |
| 2.8 | Deploy paywall/billing UI updates (web + iOS) | After SKUs visible | Manual paywall test in staging |
| 2.9 | Deploy `/api/family/seats` + family seat UI | After 2.6 | Test seat add/remove in staging |
| 2.10 | Switch Stripe + Apple to live mode | After all above pass | First real production purchase |

#### Pro grandfather migration (DAY ~10 of Week 1):
| Step | What | Verification |
|---|---|---|
| 2.11 | Send Pro-migration heads-up email to all existing Pro subscribers | Email delivery report |
| 2.12 | Wait 30 days from notification (or until renewal — whichever later per Stripe policy) | Calendar |
| 2.13 | Trigger Stripe subscription update Pro→Verity at renewal | Webhook confirms new sub state |
| 2.14 | Apple Pro subscribers: in-app banner asks them to switch | Manual conversion tracking |

**Rollback:** for in-flight users, revert app deploys. For migrated subs, manual Stripe revert. Painful — test thoroughly in staging.

---

### Phase 3: Banded generation (WEEK 1-2)
**Depends on Phase 1.** Touches pipeline + admin + DB.

| Step | What | Order | Verification |
|---|---|---|---|
| 3.1 | M5 — `kid_profiles.reading_band` + `articles.age_band` columns + backfill | First | Schema check + spot-check backfilled rows |
| 3.2 | Edit `editorial-guide.ts` — add band-specific prompts (KIDS_*, TWEENS_*) | Code | Code review |
| 3.3 | Refactor generate route for band-loop | Code | TS compiles |
| 3.4 | Update persist payload to require `age_band` | Code | TS compiles |
| 3.5 | Update kid app `ArticleListView.swift` etc. with band filter | iOS code | Build passes |
| 3.6 | M10 — RLS update for band-aware reads | After 3.5 deployed | SQL test queries |
| 3.7 | Deploy backend (3.2-3.4) to staging | | Trigger 1 adult + 1 kid generation; verify 1 + 2 articles |
| 3.8 | Deploy iOS to TestFlight | After 3.7 | Sandbox test: kid sees correct band content |
| 3.9 | M11 — collapse `(Kids)` category variants | Mid-week | SQL check + admin spot-check |
| 3.10 | Deploy backend + iOS to prod | After all checks | Monitor `pipeline_runs` for 7 days |
| 3.11 | Build new Tweens Story Manager (admin tool) | Parallel with 3.7-3.10 | Admin manual test |
| 3.12 | Deploy admin tool changes | After 3.10 | Editor flow test |

**Rollback:** revert RLS first (M10), then code. M5 columns can stay; RLS reverts to existing. Orphan `age_band='kids'` articles harmless.

---

### Phase 4: DOB correction system (WEEK 2)
**Independent of Phase 3.** Can ship in parallel.

| Step | What |
|---|---|
| 4.1 | M6 — DOB immutability trigger (defense-in-depth, stop accidental edits) |
| 4.2 | M7 — Band ratchet trigger |
| 4.3 | M8 — `kid_dob_correction_requests` table |
| 4.4 | M9 — `kid_dob_history` audit table |
| 4.5 | M12 — Permission seeds (`admin.kids.dob_corrections.review`) |
| 4.6 | `admin_apply_dob_correction` RPC |
| 4.7 | Web request form (`/profile/kids/[id]/...` + `DobCorrectionRequest.tsx`) |
| 4.8 | iOS request sheet (`FamilyViews.swift` updates) |
| 4.9 | Admin queue page (`/admin/kids-dob-corrections/`) |
| 4.10 | Cron `dob-correction-cooldown` |
| 4.11 | Email templates (request received, approved, rejected, docs requested) |

**Test:** end-to-end submit → cooldown → auto-approve in staging.

**Rollback:** drop M6/M7 triggers if they cause unexpected issues. Drop new tables (data loss acceptable for empty queue).

---

### Phase 5: Graduation + parent flows (WEEK 2-3)
**Depends on Phases 2 + 3.**

| Step | What |
|---|---|
| 5.1 | `/api/kids/[id]/advance-band/route.ts` |
| 5.2 | `/api/auth/graduate-kid/claim/route.ts` |
| 5.3 | iOS graduation flow (FamilyViews.swift confirmation modal) |
| 5.4 | iOS adult-onboarding handoff (SignupView.swift, AuthViewModel.swift, WelcomeView.swift) |
| 5.5 | Kid app graduated-state handoff (KidsAppRoot.swift) |
| 5.6 | Cron `birthday-band-check` |
| 5.7 | Web parent dashboard advance + graduation CTAs |
| 5.8 | Email templates (band advance, graduation account ready) |
| 5.9 | Test cohort: real-life graduate from kids → tweens, then tweens → graduated |

**Test:** in staging, set kid DOB to be 9 years 364 days; trigger birthday cron; verify prompt fires on day 1; trigger advance; verify content changes; later trigger graduation; verify adult account creation + kid app handoff.

---

### Phase 6: Final polish + testing (WEEK 3-4)
| Step | What |
|---|---|
| 6.1 | Plan-comparison page + paywall final UX |
| 6.2 | Pricing page (public marketing) |
| 6.3 | Email template polish |
| 6.4 | Admin family-seat reconciliation tools (optional) |
| 6.5 | Subscription support admin views |
| 6.6 | Reconciliation crons (Stripe + Apple) |
| 6.7 | Full rollout testing matrix (web + iOS adult + iOS kids) |
| 6.8 | Marketing copy + comms preparation |

---

## Testing strategy

### Manual test plan (full coverage)

Every flow in `08_FLOWS.md` gets a manual test. Cover:
- New signup → Verity (web) ✓
- New signup → Verity (iOS) ✓
- Verity → Family upgrade (web Stripe) ✓
- Verity → Family upgrade (iOS Apple) ✓
- Add kid 2nd-4th (both platforms) ✓
- Remove kid ✓
- Manual band advance ✓
- Birthday-prompt cron triggers (with date manipulation in staging) ✓
- Graduation full flow ✓
- DOB correction (younger band, auto-approve) ✓
- DOB correction (older band, manual review) ✓
- Plan downgrade with kids (gating) ✓
- Cancel subscription ✓
- Pro grandfather migration (mock) ✓
- Cross-platform sub conflict (web sub seen on iOS) ✓
- Kid sees only kids articles ✓
- Tween sees kids + tweens articles ✓
- Free user hits paywall ✓
- Subscriber doesn't see ads ✓

### Automated tests
Where to invest:
- `web/tests/...` (existing test infra) — payment webhook handlers, cron job logic, RLS unit tests via SQL
- iOS UI tests — paywall flows, seat-add confirmation, graduation handoff

Don't try to test every single flow automatically. Manual + monitoring is fine for a 1-developer ship.

### Monitoring post-launch
| Metric | Alert if |
|---|---|
| `pipeline_runs.status='failed'` daily count | > previous-week baseline +50% |
| Stripe webhook failure rate | > 1% |
| Apple webhook delivery delay | > 30 minutes p95 |
| `kid_seats_paid` vs Stripe quantity drift | Reconciliation cron flags any |
| DOB-correction queue backlog | > 24 hours unaddressed |
| Kid pipeline cost per cluster | > 2.5× adult baseline |
| AdMob fill rate | < 30% (suggests integration broken) |

---

## Comms plan

### Internal
- Each phase has a 1-paragraph status note in CHANGELOG.md
- Post each migration's run + verification SQL output

### To users (existing subscribers)

| Audience | Comm | Timing |
|---|---|---|
| Pro grandfathered | Email: "Verity Pro becomes Verity at $7.99 — same features, lower price" | Phase 2 + 30 days before next renewal |
| Family with kids | Email: "Your child's reading is now age-banded — same content, better personalized" | Phase 3 release |
| Family with kids approaching 13 | Email: "Your child turns 13 soon. Here's how the adult app graduation works." | Phase 5 release; for kids born within 6 months of release |
| All users | In-app banner: "New family pricing! Add kids for $4.99/mo." | Phase 2 release |

### To support
- Pre-write canned responses for the predictable inbound:
  - "Why did my Family bill go up?" (added a kid seat)
  - "Why can't I downgrade?" (kid orphan gating)
  - "My kid's birthday is tomorrow — what happens?" (birthday-prompt explainer)
  - "How do I move my child to the adult app?" (graduation walkthrough)
  - "I entered the wrong birthday — can I change it?" (DOB correction policy)

---

## Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Apple App Store rejects new SKU structure | Medium | High (delays launch) | Pre-submit review notes, simulate App Store reviewer's path |
| Stripe webhook race conditions cause `kid_seats_paid` drift | Low | Medium | Reconciliation cron (S18) |
| Pro grandfather migration emails miss subscribers | Low | Medium | Daily list of pending migrations + manual outreach for stragglers |
| Kid pipeline cost runs hot | Medium | High | Per-band cost tracking, hard cap kill switch (`ai.kid_band_generation_enabled`) |
| RLS migration M10 has bug | Low | Critical | Staging soak + dual-policy window |
| Apple SBP not approved before launch | Medium | Medium | Apply early (5-7 days lead time); fall back to 30% take rate at launch if denied (revisit pricing) |
| AdSense not approved before launch | High | Medium | Apply 4 weeks before launch; ship with no ads if denied; revenue plan adjusted |
| iOS kid graduation handoff fails (deep link broken) | Medium | High | Multi-test deep links; fallback "open VerityPost manually" UI |
| Banded prompts produce inconsistent voice | Medium | Medium | Pre-launch sample generation + editorial review of 20+ articles per band |
| User confusion about per-kid pricing | Medium | Medium | Clear paywall copy; FAQ; in-app explainer |
| DOB correction abuse spikes | Low | Low | Lifetime limit + cooldown + admin review |
| Migrations rollback during prod soak | Low | High | Staged migrations; reverse SQL prepared for each; staging full-rehearsal |

---

## Go/No-Go checklist (pre-launch)

Before flipping prod live on Phase 2 (Plan rewrite — the user-visible change):

- [ ] Pass A in production, generation green
- [ ] Phase 1 (kid_articles drop) complete, kid generation writes to `articles`
- [ ] All Apple SKUs visible in App Store Connect, sandbox-tested
- [ ] All Stripe products configured in live mode, test charge succeeded
- [ ] Apple SBP approved (or risk-accepted)
- [ ] AdSense approved (or risk-accepted)
- [ ] Webhook handlers tested with both platforms
- [ ] Reconciliation crons running in staging without drift
- [ ] Pro-migration email queue ready for first cohort
- [ ] Plan-tier permission gating verified end-to-end
- [ ] Manual test plan green
- [ ] Rollback plan documented for each migration
- [ ] Monitoring dashboards live + alerts configured
- [ ] Support workflow ready (canned responses + escalation path)
- [ ] Marketing comms scheduled for cutover window

---

## Calendar (no soak; sequential ship)

| Day | Phases | Notes |
|---|---|---|
| Day 1 (AM) | Phase 0 (Pass A) | ~4 hours; immediate prod cutover after smoke test |
| Day 1 (PM) | Phase 1 start (kid_articles RPC rewrite) | Code + RPC update |
| Day 2 (AM) | Phase 1 M2 (drop dead tables) | Verify-zero-rows + drop |
| Day 2-4 | Phase 2 (plans rewrite) | DB migrations + payment code; gated on owner Apple/Stripe setup |
| Day 4-7 | Phase 3 (banded generation) | Prompt drafts + route refactor + RLS update |
| Day 5-7 | Phase 4 (DOB corrections) | Parallel track to Phase 3 |
| Day 7-10 | Phase 5 (graduation + parent flows) | Depends on Phases 2 + 3 |
| Day 10-12 | Phase 6 (polish + testing) | Public-facing UX, comms, monitoring setup |
| Day 12+ | Go-live, comms cutover | Pro grandfather migration emails fire |

**~12 working days** for full ship if owner-side setup (Apple SKUs, Stripe products, AdSense) doesn't block. Owner-side delays add zero dev time but extend calendar by their own duration.

If owner setup runs in parallel from Day 1: realistic 2-week ship.
If owner setup waits until dev is done: realistic 3-week ship (1 dev week + 1 week waiting + 1 week launch).

---

## Post-launch follow-ups (out of scope but should be tracked)

- CATEGORY_PROMPTS coverage backfill (~50 missing categories)
- Family achievement system band-awareness (do achievements unlock differently per band?)
- Kid streak band reset semantics on graduation (currently: doesn't reset)
- AdMob optimization (placement testing, frequency caps)
- Prompt-preset UI for editors (already partly exists; needs band-scope)
- Annual sub conversion campaign (push monthly users to annual after 3 months)
- Verity Family XL — re-evaluate after 3 months if many families request 5+ kids
- Tween-to-Kid back-correction lift (only via DOB correction flow today; consider if we ever need a parent-driven downward override beyond corrections)
