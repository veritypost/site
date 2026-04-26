# Web — Welcome / Marketing / Public Info Pages

**Files:** `web/src/app/welcome/page.tsx`, `web/src/app/about/page.tsx`, `web/src/app/how-it-works/page.tsx`, `web/src/app/contact/page.tsx`, `web/src/app/help/page.tsx`, `web/src/app/privacy/page.tsx`, `web/src/app/terms/page.tsx`, `web/src/app/dmca/page.tsx`, `web/src/app/accessibility/page.tsx`, `web/src/app/appeal/page.tsx`.

**Plus new:**
- `web/src/app/standards/page.tsx`
- `web/src/app/corrections/page.tsx`
- `web/src/app/editorial-charter/page.tsx`
- `web/src/app/editorial-log/page.tsx`
- `web/src/app/refusals/page.tsx`
- `web/src/app/masthead/page.tsx`
- `web/src/app/archive/[date]/page.tsx`
- `web/src/app/recent/page.tsx`

**Owner:** Dunford (marketing voice), Bell (trust surfaces), Thompson (editorial pages).
**Depends on:** `01_POSITIONING.md`, `04_TRUST_INFRASTRUCTURE.md`, `17_REFUSAL_LIST.md`, `05_EDITOR_SYSTEM.md`.

---

## Current state

Existing public/marketing pages: `/welcome`, `/about`, `/contact`, `/how-it-works`, `/privacy`, `/terms`, `/cookies`, `/dmca`, `/accessibility`, `/appeal`, `/help`.

Per recon: these are static or near-static pages. Varying quality of copy.

## What changes

### `/about` — rewrite opening

Per `01_POSITIONING.md`:

> Verity is a news site where every article ends with a 5-question quiz about what you just read. Pass 3 of 5 and the comment section unlocks. Which means: the people in the conversation actually read the piece.

Then briefly: who we are, what we refuse, how to reach us. Links to `/masthead`, `/refusals`, `/standards`.

### `/how-it-works` — explain the quiz gate

Plain language walkthrough of the mechanic. Maybe a short animated GIF demonstrating submit → pass → comments unlock (optional).

### `/standards` — new, from `04_TRUST_INFRASTRUCTURE.md`

Who we are. How we report. How we write (three-beat format). How we correct. What we refuse. How to reach us. Last updated date.

### `/corrections` — new, from `04_TRUST_INFRASTRUCTURE.md`

Reverse-chronological list of every correction. Each entry: date, article corrected (link), what was wrong, what's now right, who flagged, who corrected.

### `/editorial-charter` — new, from `00_CHARTER.md`

The five commitments published. Linked from every article byline.

### `/editorial-log` — new

Dated entries for editorial-practice changes. "Why we updated our anonymous-source policy. 2026-05-14. — Elena Martinez, Senior Editor."

### `/refusals` — new, from `17_REFUSAL_LIST.md`

The 15 refusals, each dated, each defended.

### `/masthead` — new, from `05_EDITOR_SYSTEM.md`

Named team with photos, roles, bios, beats.

### `/archive/[date]` — new, from `09_HOME_FEED_REBUILD.md`

Read-only rendering of a past day's front page. Nav between days.

### `/recent` — new, from `09_HOME_FEED_REBUILD.md`

Chronological full-article feed (not editorial).

### Footer

Update global footer to link:
- About
- Masthead
- Standards
- Corrections
- Editorial Log
- Refusals
- Contact
- Privacy
- Terms

Organized in a "Who we are" column and a "How we work" column.

### Cookies page

Existing per recon. Align with first-party-only analytics commitment per `17_REFUSAL_LIST.md` item 12.

## Files

Existing pages touched:
- `web/src/app/welcome/page.tsx` — 3-screen onboarding (covered in `web_login_signup.md`).
- `web/src/app/about/page.tsx` — rewrite.
- `web/src/app/how-it-works/page.tsx` — quiz-gate walkthrough.

New pages:
- `web/src/app/standards/page.tsx`
- `web/src/app/corrections/page.tsx`
- `web/src/app/editorial-charter/page.tsx`
- `web/src/app/editorial-log/page.tsx`
- `web/src/app/refusals/page.tsx`
- `web/src/app/masthead/page.tsx`
- `web/src/app/archive/[date]/page.tsx`
- `web/src/app/recent/page.tsx`

Footer:
- `web/src/components/Footer.tsx` (or equivalent location).

## Acceptance criteria

- [ ] `/about` opens with the positioning language.
- [ ] `/standards`, `/corrections`, `/editorial-charter`, `/editorial-log`, `/refusals`, `/masthead` all exist and render.
- [ ] `/archive/[date]` renders a past day's front page correctly.
- [ ] `/recent` shows chronological full feed.
- [ ] Footer links to all of the above.
- [ ] No emoji.
- [ ] Accessibility: landmark structure, heading hierarchy.
- [ ] Token pass on every page.

## Dependencies

Ship after `01_POSITIONING.md`, `04_TRUST_INFRASTRUCTURE.md`, `05_EDITOR_SYSTEM.md`, `17_REFUSAL_LIST.md`. These are the canonical docs that the page copy is derived from.
