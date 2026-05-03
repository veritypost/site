# Owner Audit Finds

Owner-spotted issues from real product use. Distinct from `UI_UX_REVIEW/*` (systematic agent sweeps) — these are things the owner noticed and wants triaged.

**Rule:** every find lands here with background context filled in (where it lives, what's associated, what's already known) and a `Confirmed:` line. Another agent doesn't open the find for deeper investigation until `Confirmed: yes` — the cite has been verified against current code.

---

## How to add a find

Paste the raw observation under "Active". I (or the next session) fill in the rest before any agent picks it up.

```
### N. <short title>

- **What owner saw:** <one or two sentences, raw>
- **Surface:** <route or screen> — <file path(s)>
- **Associated:** <related components / cross-platform siblings / related routes>
- **Cross-platform parity:** web / iOS adult / iOS kids — note whether each is affected or N/A
- **Known context:** <relevant prior decisions, kill-switches, recent commits, memories>
- **Confirmed:** no | partial | yes — <date + who/what verified the file:line cite>
- **Owner decision needed:** <yes/no — what owner needs to call before fix>
- **Status:** new | confirmed | queued-for-fix | shipped
- **Notes for next agent:** <scope guardrails, what NOT to expand into>
```

Keep it ≤8 lines per find. If investigation grows, spin a finding doc under `UI_UX_REVIEW/owner-N-<slug>.md` and link it from here.

---

## Reference — common surfaces

Use these to fill in `Surface:` quickly. Expand as new ones come up.

**Web public:** `/` → `web/src/app/page.tsx` · `/[slug]` (article reader) · `/browse` · `/search` · `/category/[id]` · `/leaderboard` · `/login` · `/welcome` · `/pricing` · `/how-it-works` · `/about`
**Web authed:** `/profile` (+ `/settings`, `/settings/billing`, `/settings/expert`, `/family`) · `/profile/kids[/[id]]` · `/bookmarks` · `/notifications` · `/messages` · `/following` · `/recap[/[id]]` · `/billing` · `/appeal` · `/expert-queue`
**Web admin:** `/admin` (hub) · `/admin/newsroom` (+ `/clusters/[id]`) · plus per-section subroutes — see `web/src/app/admin/`
**iOS adult:** `VerityPost/VerityPost/` — `ContentView.swift` (tab shell), `HomeView.swift`, `BrowseLanding.swift`, `FollowingView.swift`, `ProfileView.swift`, `StoryDetailView.swift`, `FindView.swift`, `AlertsView.swift`, `MessagesView.swift`, `LeaderboardView.swift`, `BookmarksView.swift`, `SettingsView.swift`, `SubscriptionView.swift`
**iOS kids:** `VerityPostKids/VerityPostKids/` — `PairCodeView.swift`, `ParentalGateModal.swift`, `ArticleListView.swift`, `KidReaderView.swift`, `KidQuizEngineView.swift`, scenes (`QuizPassScene`, `StreakScene`, `BadgeUnlockScene`, `GreetingScene`), `LeaderboardView.swift`, `ExpertSessionsView.swift`, `ProfileView.swift`
**Chrome (every web surface):** `web/src/app/NavWrapper.tsx` (top bar + bottom nav + global footer) · `web/src/middleware.js` (gates, redirects)
**Kill-switched (don't flag missing functionality):** see `CLAUDE.md` § Kill-Switch Inventory

---

## Active

### 1. Desktop article: timeline below + left of body (should be right rail)

- **What owner saw:** On desktop article view, timeline is stacked below the article body and aligned left. Should be a right-side rail next to the body.
- **Surface:** `/[slug]` (article reader) — `web/src/components/article/ArticleReaderTabs.tsx:35-123` (consumer); fed from `web/src/app/[slug]/page.tsx:301-306` via `timelineSlot`.
- **Associated:** `TimelineSection`, `SourcesSection` (currently both share `timelineSlot` — see Find #3); body column max-width 680px in shell.
- **Cross-platform parity:** web only. iOS adult uses tabbed StoryDetailView (Story / Timeline / Discussion), no rail concept — N/A. iOS kids — N/A (no timeline surface).
- **Known context:** `ArticleReaderTabs` has NO desktop layout — its inline `<style>` block (lines 88-121) only fires at `max-width: 859px` (mobile tab strip + panel toggle). Above 860px every panel renders in DOM order, so timeline lands directly under the article body in the same centered column. There is no two-column / rail / sticky-aside CSS for desktop anywhere in this component.
- **Confirmed:** yes — 2026-05-02, read of `ArticleReaderTabs.tsx:35-123` shows mobile-only CSS, no desktop grid/flex.
- **Owner decision needed:** yes — redesign call. Right-rail layout (sticky? collapsing breakpoint? width split?), or only show timeline as a side rail when `timeline.length > 0`, or keep tabs at all widths. Engagement zone (quiz/discussion) placement under new layout also needs a call.
- **Status:** confirmed
- **Notes for next agent:** scope = layout of `ArticleReaderTabs` only. Don't refactor the slot API or pull data fetching up into the component. Don't touch iOS.

### 2. Article page: sources showing "Unknown" for everything

- **What owner saw:** Every source row on an article reads "Unknown" instead of a real publisher / outlet name.
- **Surface:** `/[slug]` — render: `web/src/components/article/SourcesSection.tsx:50-83`; data: `web/src/app/[slug]/page.tsx:159-163` (selects `title, url, publisher, sort_order` from `sources` table).
- **Associated:** pipeline writers `web/src/app/api/admin/pipeline/generate/route.ts:1173-1174` and `web/src/app/api/newsroom/ingest/run/route.ts:238` both default outlet/publisher to literal string `'Unknown'`. Render falls through `s.title || s.publisher || s.url` — if title is null and publisher is the string "Unknown", the link text is "Unknown".
- **Cross-platform parity:** web confirmed. iOS adult `StoryDetailView.swift` `sourcePillsSection` reads same `sources` table via `client.from("sources")` (line 2424) — almost certainly affected too; not yet visually verified. iOS kids — N/A (no sources surface).
- **Known context:** the render component is innocent — bug is upstream. Two write paths default to "Unknown" sentinel instead of leaving null.
- **Confirmed:** partial — render path verified; need a Supabase query against `sources` rows for a real article to confirm the stored value is the literal string "Unknown" vs null+missing-title. MCP `execute_sql`: `SELECT title, publisher, url FROM sources LIMIT 20;`.
- **Owner decision needed:** no — fix is straightforward: stop writing the sentinel string (leave publisher null when unknown), and have the render fall through to the URL hostname when title and publisher are both empty. Backfill: `UPDATE sources SET publisher = NULL WHERE publisher = 'Unknown';`
- **Status:** confirmed (pending DB-state check)
- **Notes for next agent:** verify with the SQL above before editing pipeline writers. iOS render needs the same null-fallthrough treatment if data is shared.

### 3. Article page: sources rendered under Timeline tab (should sit with article body)

- **What owner saw:** On mobile the sources block appears inside the Timeline tab, under timeline events. Sources belong with the article, not under the timeline.
- **Surface:** `web/src/app/[slug]/page.tsx:301-306` — both `<TimelineSection />` AND `<SourcesSection />` are passed inside the same `timelineSlot={...}` fragment.
- **Associated:** `ArticleReaderTabs.tsx` (consumer renders that slot as the Timeline tab on mobile, and stacks it after article on desktop — connects to Find #1).
- **Cross-platform parity:** web — confirmed. iOS adult — NOT affected: `StoryDetailView.swift:710` renders `sourcePillsSection` inside the Story tab with the article body, separate from the Timeline tab. iOS kids — N/A. So owner's "assuming same for iOS" turns out wrong; iOS already does the right thing here.
- **Known context:** fix is structural and tiny — move `<SourcesSection />` from `timelineSlot` into `articleSlot` (which already wraps `ReaderShell` body + `ArticleActions`).
- **Confirmed:** yes — 2026-05-02, file:line cite verified for both web (offending) and iOS (correct).
- **Owner decision needed:** no — relocate SourcesSection to articleSlot, after the body, before ArticleActions or as a sibling of it.
- **Status:** confirmed
- **Notes for next agent:** one-file edit in `[slug]/page.tsx`. Don't merge timeline+sources into one component, don't touch the SourcesSection internals (that's Find #2's territory).

### 4. "Back to edition" button — bad button, bad view, bad position

- **What owner saw:** The "Back to edition" button itself is wrong; the surface it lives in is wrong; the position is wrong.
- **Surface:** `web/src/components/NextStoryFooter.tsx:52-72` (button); the entire `NextStoryFooter` component is rendered at `web/src/app/[slug]/page.tsx:321` as the last block of the article reader.
- **Associated:** top-bar wordmark already routes to `/`; `NavWrapper.tsx` chrome.
- **Cross-platform parity:** web only. iOS adult/kids use system back chevron on `StoryDetailView`/`KidReaderView` — N/A.
- **Known context:** *(a)* copy: "edition" framing was retired by **DECISION #021** (curated front page, any-age — see `UI_UX_REVIEW/A-1-home.md` finding #0). Calling the home "the edition" is dead framing. *(b)* size: chip is `fontSize:13`, `padding:8px 14px` — undersized hit target (<44px) per UI_UX_REVIEW_PRINCIPLES §2.1. *(c)* position: rendered after a "More in [category]" list, so by the time reader reaches it they've already passed every continuation CTA, and the home/back affordance is buried at the very bottom of the reader.
- **Confirmed:** yes — 2026-05-02, NextStoryFooter.tsx:52-72 + page.tsx:321 verified.
- **Owner decision needed:** yes — redesign call. Options: (a) delete the button outright (top-bar wordmark already does the job), (b) move the affordance into the top bar / breadcrumb on article view, (c) keep but redesign at proper hit-target with non-edition copy. The "More in [category]" list is a separate question — keep or rework alongside.
- **Status:** confirmed
- **Notes for next agent:** don't ship a copy-only fix that keeps the button where it is. The position complaint and the surface-shape complaint are the bigger problems; copy is just the smallest visible symptom.

---

## Confirmed — queued for fix

*(empty)*

---

## Shipped

*(empty)*
