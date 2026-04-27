# Admin tools

The admin surface needs three big additions and several updates.

---

## Three admin managers per cluster

Per owner clarification: a kid-safe cluster generates up to 3 articles. Each has its own admin editor.

| Article | Manager | URL | Filter |
|---|---|---|---|
| Adult article (`age_band='adult'`) | Story Manager (existing newsroom view) | `/admin/newsroom/clusters/[id]` | `age_band='adult' OR age_band IS NULL` |
| Kids article (`age_band='kids'`) | Kids Story Manager (existing) | `/admin/kids-story-manager` | `is_kids_safe=true AND age_band='kids'` |
| Tweens article (`age_band='tweens'`) | Tweens Story Manager (NEW) | `/admin/tweens-story-manager` | `is_kids_safe=true AND age_band='tweens'` |

---

## Story Manager (cluster-level newsroom view)

### `web/src/app/admin/newsroom/page.tsx`
Cluster list. Each cluster row currently shows: title, cluster summary, generation status. After banding:
- Show 3 status pills per cluster: Adult / Kids / Tweens
- Each pill state: `none` (greyed) / `draft` / `published`
- Click a pill → drill into the corresponding manager scoped to that article

### `web/src/app/admin/newsroom/clusters/[id]/page.tsx`
Cluster detail view. Currently shows the adult article editor. After banding:

Tabbed view:
```
[ Adult Article ] [ Kids Article ] [ Tweens Article ]
```

Each tab shows the article in that band. Tabs are disabled if the article doesn't exist.

Top-level cluster info: title, source articles (sources table), generation history, "Regenerate adult" / "Regenerate kid+tween" buttons.

The adult-article tab has its current behavior. Kids/Tweens tabs each render a smaller editor surface (or link out to the dedicated manager).

---

## Kids Story Manager (existing)

### `web/src/app/admin/kids-story-manager/page.tsx`
Currently fetches `articles WHERE is_kids_safe = true`. Update:
- Filter: `is_kids_safe = true AND age_band = 'kids'`
- Title: "Kids Story Manager — ages 7-9"
- Article editor: same controls as today (title, body, summary, etc.)
- Verify that the kid quiz/timeline editing flows for kids-band don't bleed into tweens-band

---

## Tweens Story Manager (NEW)

### `web/src/app/admin/tweens-story-manager/page.tsx`
NEW file. Largely a clone of `kids-story-manager/page.tsx` with:
- Filter: `is_kids_safe = true AND age_band = 'tweens'`
- Title: "Tweens Story Manager — ages 10-12"
- Same editor flow as Kids Story Manager
- Same delete/publish/edit actions
- Different empty state copy: "Tweens articles will be generated automatically alongside kids articles. You can edit them here."

### Shared logic between Kids + Tweens Story Manager
Refactor the article editor into a shared component:
`web/src/app/admin/_shared/BandedStoryEditor.tsx` (NEW) — props: `band: 'kids' | 'tweens'`

Both managers consume this. Reduces duplication. Tweens manager becomes ~100 lines + the shared editor.

---

## DOB correction queue

### `web/src/app/admin/kids-dob-corrections/page.tsx` (NEW)
Admin queue listing pending requests:

**Top filters:**
- Status: All / Pending / Approved / Rejected / Documentation Requested
- Direction: All / Younger band move / Older band move
- Days since submission: filter chip

**Queue table columns:**
- Kid display name + avatar
- Parent email + plan tier + signup date
- Current DOB → Requested DOB (with delta in years)
- Current band → Resulting band (color-coded: red if older-band, green if younger-band)
- Reason (truncated)
- Submitted (relative time, e.g. "2 days ago")
- Cooldown remaining (for younger-band auto-approves)
- Fraud signals (chip list — see below)
- Actions: Approve / Reject / Request docs / Detail

**Fraud signal chips:**
- "Profile created < 30 days ago"
- "Family upgraded < 14 days ago"
- "Parent has N prior corrections" (red if N >= 1, since lifetime limit)
- "Multiple kids in household with same DOB" (red)
- "Requested DOB shifts kid by > 2 years" (yellow)
- Bot/payment fraud history flag from existing fraud system

### `web/src/app/admin/kids-dob-corrections/[id]/page.tsx` (NEW)
Request detail view:

**Three columns:**

Left: kid context
- Profile creation date + initial DOB
- All band changes in `band_history`
- Reading activity (articles read, quizzes completed, last active)
- Current age (computed)

Center: the request
- Requested DOB
- Reason (full text)
- Documentation upload (if any) — preview pane
- Submit timestamp + IP

Right: parent context
- Parent display name + email
- Plan tier + sub start date + payment platform
- Other kids in household (table: name, DOB, band, age)
- Lifetime DOB-correction count for this parent
- Recent admin actions on this parent (audit log slice)

**Decision panel (bottom):**
- Approve / Reject / Request Documentation
- Free-text decision reason (required)
- "Notify parent via email: [yes/no]" toggle (default yes)

On submit:
- POST to `/api/admin/kids-dob-corrections/[id]/decision` with `{decision, reason, notify}`
- Server invokes `admin_apply_dob_correction(...)` RPC
- Success: redirect to queue with toast

### Permission gating
All DOB-correction routes require `admin.kids.dob_corrections.review` (M12 in `02_DATABASE.md`).

---

## Plan management

### `web/src/app/admin/plans/page.tsx` (existing? verify)
Plan-table editor. Update:
- Surface the new `metadata` fields: `included_kids`, `max_kids`, `extra_kid_price_cents`, `max_total_seats`
- Add toggle: "Active" + "Visible" — for the Pro grandfather scenario
- Verify migration of existing plan rows lands cleanly

If this admin page doesn't exist, building it now is optional — DB direct edits work for launch. Add later.

---

## Subscriptions admin view

For supporting customers and investigating disputes:

### `web/src/app/admin/subscriptions/page.tsx` (existing? verify)
- Lookup by user email
- Show: current plan, kid count paid, billing platform, next renewal, payment status, sub history
- Action buttons: cancel sub (refund or no-refund), force seat count adjustment, override grandfather status

If doesn't exist: build a minimal version. Critical for support workflow.

---

## Family seat audit

For investigating "I added a kid but my bill didn't increase" type issues:

### `web/src/app/admin/family-seats/[user_id]/page.tsx` (NEW)
- Show kid count from `kid_profiles WHERE parent_user_id = X AND is_active=true`
- Show paid kid seats from `user_subscriptions.kid_seats_paid`
- Show external sub state (Stripe quantity OR Apple SKU tier)
- Reconciliation buttons: "Sync to Stripe" / "Sync to Apple" — force the platform sub to match DB state

Optional. Built only if support reports volume justifies it.

---

## Audit log views

### `web/src/app/admin/audit/page.tsx` (existing — `admin_actions` consumer)
Verify it surfaces:
- `kid_dob_correction.approve` / `.reject`
- `family.seat.add` / `.remove`
- `kid_profile.advance_band`
- `kid_profile.graduate`
- `pipeline.generate` (existing)

Filter chips for these new action types.

---

## AI prompt-presets editor

### `web/src/app/admin/prompt-presets/page.tsx` (existing)
Already supports per-step + per-category overrides. After banding:
- Add `age_band` filter so admin can apply overrides to specific bands
- Step list expands: each step appears once per band where applicable
  - e.g., `body` step now: `body:adult`, `body:kids`, `body:tweens`
- Preset rows display target band + step

DB: `ai_prompt_overrides` table needs `age_band TEXT` column added (M5 companion).

---

## Pipeline run inspector

### `web/src/app/admin/pipeline/runs/page.tsx` (existing)
List of pipeline runs. Update:
- Show audience + age_band per run
- For kid runs: show 2 article rows (kids + tweens) instead of 1

### `web/src/app/admin/pipeline/runs/[id]/page.tsx` (existing)
Run detail. Update:
- Per-band cost breakdown
- Per-band step timings
- Article ID(s) — link to corresponding admin manager

---

## Settings / kill switches

### `web/src/app/admin/settings/page.tsx` (existing? verify)
Surface new kill switches:
- `ai.kid_band_generation_enabled` (default true)
- `pipeline.kid_band_split_threshold_age` (default 10)

Existing kill switches preserved.

---

## File change manifest (admin)

| File | Status | Change |
|---|---|---|
| `/admin/newsroom/page.tsx` | Update | 3-band status pills per cluster |
| `/admin/newsroom/clusters/[id]/page.tsx` | Update | Tabbed 3-article view |
| `/admin/kids-story-manager/page.tsx` | Update | Filter `age_band='kids'` |
| `/admin/tweens-story-manager/page.tsx` | NEW | Tweens-band editor |
| `/admin/_shared/BandedStoryEditor.tsx` | NEW | Shared editor component |
| `/admin/kids-dob-corrections/page.tsx` | NEW | DOB-correction queue |
| `/admin/kids-dob-corrections/[id]/page.tsx` | NEW | DOB-correction detail + decision |
| `/admin/plans/page.tsx` | Update (or new) | Plan metadata editor |
| `/admin/subscriptions/page.tsx` | Update (or new) | Subscription support view |
| `/admin/family-seats/[user_id]/page.tsx` | NEW (optional) | Seat reconciliation |
| `/admin/audit/page.tsx` | Update | New action types |
| `/admin/prompt-presets/page.tsx` | Update | Band-scoped overrides |
| `/admin/pipeline/runs/page.tsx` | Update | Per-band display |
| `/admin/pipeline/runs/[id]/page.tsx` | Update | Per-band cost/timing |
| `/admin/settings/page.tsx` | Update | New kill switches |

| API endpoint | Status | Purpose |
|---|---|---|
| `/api/admin/kids-dob-corrections/route.ts` | NEW | List queue + filters |
| `/api/admin/kids-dob-corrections/[id]/route.ts` | NEW | Detail GET |
| `/api/admin/kids-dob-corrections/[id]/decision/route.ts` | NEW | POST approve/reject |
| `/api/admin/kids-dob-corrections/[id]/documentation/route.ts` | NEW | GET attached doc (admin-permission) |
| `/api/admin/family-seats/[user_id]/sync/route.ts` | NEW (optional) | Force seat reconciliation |

---

## Permissions to seed

Already covered in M12 (`02_DATABASE.md`). Recap:
- `admin.kids.dob_corrections.review` — required for DOB queue
- `family.seats.manage` — required for parent-side seat changes (parent permission, not admin)

Existing admin permissions that gate other tools (`admin.system.view`, etc.) already exist. Verify they don't need updating.

---

## Lift estimate (admin)

| Area | Hours |
|---|---|
| Tweens Story Manager (new + shared editor refactor) | 6 |
| Newsroom cluster 3-tab view | 4 |
| DOB correction queue + detail + decision UI | 10 |
| Subscription / family-seat support views | 6 |
| Pipeline run display updates | 3 |
| Prompt-presets band-scoping | 3 |
| Settings + audit log updates | 2 |
| **Admin total** | **~34 hours** |

About 1 week of admin-tool work. Mostly parallelizable with web + iOS.
