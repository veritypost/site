# 05 — Editor System

**Owner:** Bezos (primary — this was his attack: "who is the editor, what happens when they sleep?"), Thompson (editorial operations), Veerasingham (wire-service staffing model reference).
**Depends on:** `00_CHARTER.md` (commitment 2 — front page chosen by a human), `04_TRUST_INFRASTRUCTURE.md`.
**Affects:** new DB table, new admin UI, new public byline on front page, editorial scheduling, escalation workflow.

---

## The problem

Charter commitment 2: "The front page is chosen by a human and dated."

Bezos's attack in the hardass session: "Your front page has a human editor. Who's the editor? How many hours a day do they work? What happens when they're sick? What happens when you have 500,000 users and the editor is a bottleneck? You just described a business that doesn't scale past one person's sleep schedule. That's not a moat, that's a ceiling."

He is right. Drudge worked 18 hours a day for 30 years. Most founders don't. Most don't *should.* The editor role has to be a system, not a person.

## The fix

### Three editors on rotation

Minimum viable team: three editors across three time zones (or three shifts). Named. Photographed. Bios on `/standards`.

At any given hour, one editor is on shift. Shift length: 8 hours. Shift rotation: weekly. On-shift editor is the sole sign-off on the front page during their shift.

### The editorial charter (concrete ruleset, not vibes)

A working document (stored in `editorial_charter` table — see `db/04_editorial_charter_table.md`) that defines:

- **What "front-page-worthy" means.** Specific criteria: national/international importance, novelty, time-sensitivity, sourced sufficiency, Verity's beat relevance.
- **The slot count.** 8 stories on the front page at any time. No more. No infinite scroll. One hero slot, seven supporting slots.
- **The rhythm.** Front page refreshes as stories warrant — not on a schedule. If nothing material happened in the last 4 hours, nothing changes. A stale front page is better than a performative one.
- **The bar for hero slot.** Significantly higher than supporting. Hero requires the on-shift editor's sign-off *plus* one other editor's concurrence if the shift hand-off is imminent.
- **The bar for breaking.** Live-changing stories. Rare. Requires Senior Editor sign-off (a fourth role — either owner-held or rotating among the three).

This ruleset changes. When it changes, the change is logged publicly in the editorial log (see `04_TRUST_INFRASTRUCTURE.md`).

### The shift hand-off

Not an informal "over to you." A structured artifact that exists in the admin UI:

- **Handoff notes** — what's in motion, what's pending, what the reader should expect next.
- **Recent decisions** — what the outgoing editor published, what they rejected, and why.
- **Known risks** — a story that's developing but not yet ready; a correction workflow in progress; a reader report pending.

Every shift hand-off is logged. The log is internal (not public) but auditable — if a decision is later questioned, the trail is intact.

### The public editor byline on the front page

The front page carries a visible "Editor on shift: [Name]" line at the top. Next to the date.

Not big. Not look-at-me. Just present.

The reader can click the name. It goes to that editor's bio page. Bio has: photo, background, beats, contact.

This is the Drudge thing — the hand on the curation, visible. Modernized. Teamed.

### Per-article editor attribution

Every article already has a byline for the reporter. It should also carry the name of the editor who pushed it to the front page (or to wherever on the site).

This is the chain of responsibility. If a correction is needed, we know which editor signed off.

## The ops model

### Team size at launch

Three editors covering three shifts globally. Part-time is fine — the total is maybe 60 hours/week of human attention, which is manageable.

Option: two full-time editors + contracts with a third for weekend coverage. Cost: roughly $150–250K fully loaded for the team in year one.

### Scaling triggers

- **At 10K monthly active:** 3 editors is fine. No change.
- **At 50K monthly active:** 4 editors. Reduced shift length, more redundancy.
- **At 250K monthly active:** 6 editors + Senior Editor role clearly separate + editorial coordinator.
- **At 1M monthly active:** full newsroom structure. Different org chart, different doc.

### What editors do that algorithms don't

- Recognize that three pieces on the same topic should probably collapse to one analysis.
- Reject a piece that's factually fine but doesn't meet the Verity standard for "why it matters."
- Slow down when something is breaking and the fog of war is thick.
- Notice when a reporter is spread too thin.

Algorithms do the opposite of all four things. This is why the Charter is a refusal. Not a tradeoff.

## What this is not

- **Not community moderation.** Moderators handle comment sections (separate role, `admin.moderation.*` permissions). Editors handle article selection.
- **Not PR.** Editors are editorial. Marketing is separate.
- **Not opinion columnists.** Verity doesn't run opinion. Editors curate factual coverage. If we add opinion columns later, they need a separate doc and a very intentional wall.
- **Not guest editors.** Nice idea, won't ship. Too much variability in a product where consistency is the Charter.

## What this looks like in code

### New DB tables (full specs in `db/`)

- `editorial_charter` — the ruleset. Versioned rows. Each version has effective_start, effective_end. See `db/04_editorial_charter_table.md`.
- `editor_shifts` — who's on when. Columns: `editor_user_id`, `shift_start_at`, `shift_end_at`, `handoff_notes` (jsonb), `created_at`.
- `front_page_state` — current 8 slots. Columns: `slot_index` (0–7), `article_id`, `editor_user_id`, `placed_at`, `notes`.

### New admin routes

- `/admin/editorial/shift/page.tsx` — current shift dashboard. Shows on-shift editor, current front page, pending stories, reader reports in queue.
- `/admin/editorial/curate/page.tsx` — the front-page composer. Drag-drop or explicit slot assignment. Logs every change.
- `/admin/editorial/handoff/page.tsx` — shift hand-off form. Triggered when shift is ending; requires submission before next editor can take control.
- `/admin/editorial/charter/page.tsx` — editor-facing view of the current charter. Senior Editor role can amend; amendments log to editorial log.

### Public routes

- `/masthead/page.tsx` — named team with photos, roles, bios.
- Front page (`/page.tsx` — currently `HomePage`) gets a new top-of-page strip: date + editor name + link to masthead. See `views/web_home_feed.md`.
- Each article page gets the editor attribution (e.g., "Placed by [Editor Name]") under the reporter byline. See `views/web_story_detail.md`.

### New permissions

Added to the `permissions` table and wired into permission sets:

- `editorial.frontpage.curate` — can change front page slots
- `editorial.frontpage.hero_assign` — can assign hero slot
- `editorial.shift.claim` — can claim an editor shift
- `editorial.handoff.submit` — can submit shift handoff notes
- `editorial.charter.amend` — Senior Editor only

These roll up into a new `editor` role in the `roles` table. The `editor` role replaces the current generic content-editing role for front-page-curation purposes.

### The front-page visibility on public site

Every request to `/` or the API serving the home feed pulls from `front_page_state` instead of computing the feed algorithmically. This is an architectural change — currently the home feed uses a ranking logic across articles. Swap it for a hard slot assignment from `front_page_state`, with the 40 non-front-page articles below the fold ordered by simple recency.

## Ops: the daily flow

A concrete day:

- **07:00 ET** — Editor A takes shift from Editor C (night shift). Handoff notes delivered.
- **07:00–14:00 ET** — A monitors beats, reviews pending reporter pieces, places articles to front page as they warrant. Each placement logs to `front_page_state` and a small notification goes to the `editorial` Slack (internal).
- **11:00 ET** — A reviews trust reports in the queue. One is a real flag; A pushes it to the reporter for review, adjusts the article, issues a correction on the corrections feed.
- **14:00 ET** — Editor B takes shift. Handoff: 1 pending investigation with Priya A.; 2 reader reports open; 1 correction just issued.
- **14:00–22:00 ET** — B handles West Coast morning. Breaking story lands — B consults Senior Editor for sign-off (this is rare, the protocol is used). Front-page hero updated. All readers see the new hero next time they load `/`.
- **22:00 ET** — Editor C (international/night shift) takes over.

This is not a heroic amount of work. It's a reasonable three-shift ops model. Many publications smaller than Verity aspires to be run this. We're just naming it.

## Acceptance criteria

- [ ] `editorial_charter`, `editor_shifts`, `front_page_state` tables exist with RLS policies.
- [ ] Three named editors with bios exist at `/masthead`.
- [ ] The home page (`/`) displays the on-shift editor name + date in the header.
- [ ] `/admin/editorial/*` routes exist and function: curate, shift, handoff, charter.
- [ ] A front-page slot change logs to `front_page_state` and is reflected on the public home page within seconds.
- [ ] Shift handoff requires the outgoing editor to submit notes before the incoming editor can access curate.
- [ ] Article pages show "Placed by [Editor Name]" under the reporter byline when the article is on the front page.
- [ ] The current editorial charter is viewable in the admin UI and a Senior Editor amendment bumps the version and writes an editorial log entry.

## What this does NOT change

- Article authorship. Reporters still write. Editors curate.
- Comment moderation. Moderators handle comments; this doc is about front-page curation only.
- Content management for the article body. Story manager remains. This adds the front-page assignment layer on top.
- AI-assisted article generation (per project's `/admin/pipeline`). Editors review the output; they don't write via pipeline.

## Risk register

- **Single editor shift gets overwhelmed during breaking news.** Mitigation: senior editor role is on-call as escalation. Three-editor minimum means two are off-shift but reachable.
- **Editor personality drift makes front page inconsistent.** Mitigation: the editorial charter is the anchor. If two editors are making materially different calls, the fix is to tighten the charter, not to overrule editors.
- **Hiring three editors is expensive for a pre-launch company.** Mitigation: can start with two plus one weekend contractor. Owner can cover a shift in extremis but should not be the default.
- **Readers don't notice or care about named editors.** True in the first six months. Compounds over year 2–3. The named editor becomes part of why readers stay.

## Sequencing

Ship before: home page rebuild (`09_HOME_FEED_REBUILD.md`) — the front-page-state data source is a prerequisite.
Ship after: `00_CHARTER.md` signed, `04_TRUST_INFRASTRUCTURE.md` has standards doc in place (editors need a charter to operate against).
Pairs with: `17_REFUSAL_LIST.md` (editors are the humans who enforce the refusals).
