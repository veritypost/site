# Apple Developer Program enrollment — entity disclosure on the website

**Date:** 2026-04-21
**Commit:** `cbdea50` (on `origin/main`, pushed)
**Context:** Owner confirmed Verity Post is a U.S. LLC (legal name: `Verity Post LLC`) and is preparing to enroll in the Apple Developer Program as an organization. Apple requires the domain to be "associated with your organization" and the legal entity to be identifiable from the public site. Pre-change, the site named only the brand `Verity Post` — which Apple treats as a trade name / DBA, not an entity — so the enrollment could stall.

## Why this was needed

Apple's org-enrollment checklist (from the enrollment page):

> **Legal entity name and status.** Your organization must be a legal entity that can enter into contracts with Apple. We do not accept DBAs, fictitious business names, trade names, or branches.

> **Website.** Your organization's website must be publicly available and functional, and its domain name must be associated with your organization.

Pre-change state of `veritypost.com`:

- Site itself: live, functional, not a parking page. Returns 200 on `/`. Title, OG tags, meta description all present. Footer links to Privacy / Terms / Cookies / Accessibility / DMCA / Contact. — **passes the "publicly available and functional" test.**
- Legal entity identification: **missing everywhere.**
  - `/terms`: used only "Verity Post" (brand), no LLC/Inc reference, no "operated by" clause, no entity contact block.
  - `/privacy`: same — no data controller entity, no entity in Contact section.
  - Footer (`web/src/app/NavWrapper.tsx`): copyright line was just lowercase `verity post` with no year, no entity, no legal suffix.
  - `/about`: **404** — no About page existed at all.
  - Entire `web/` codebase: zero occurrences of `LLC`, `Inc`, or `Incorporated` referring to the operating business.

This is the exact pattern that makes Apple reviewers flag an enrollment for "entity not identifiable from the site," especially when combined with WHOIS privacy (see Pending Items below).

## What changed (commit `cbdea50`)

Four files, 93 insertions, 2 deletions. No personal information, no mailing address, no owner name added — entity disclosure only.

### 1. `web/src/app/terms/page.tsx`

- **Added opening paragraph** (before section 1):
  > These Terms of Service govern your use of Verity Post, operated by Verity Post LLC ("Verity Post", "we", "us"). By accessing or using the platform, you agree to these terms.
- **Added new section 9 "Contact"** (after "Changes to Terms"):
  - "Verity Post is operated by Verity Post LLC."
  - Legal notices: `legal@veritypost.com`
  - General support: `support@veritypost.com`

### 2. `web/src/app/privacy/page.tsx`

- **Added opening paragraph** (before section 1):
  > Verity Post is operated by Verity Post LLC, which acts as the data controller for personal information processed through the platform. This policy explains what we collect, how we use it, and your rights.
- **Updated section 8 "Contact"**:
  - Added "Verity Post is operated by Verity Post LLC." as the first bullet.
  - Changed stale `info@veritypost.com` to `support@veritypost.com` (aligns with the 2026-04-21 email-remapping commit `86228df`).

### 3. `web/src/app/NavWrapper.tsx` (footer, lines ~299-322)

- Added `{ label: 'About', href: '/about' }` to the footer link row (placed first, before Contact).
- Replaced the lowercase `verity post` tagline with:
  > © {current year} Verity Post LLC. All rights reserved.
- Uses `new Date().getFullYear()` so the year auto-rolls — no annual manual update needed.

### 4. `web/src/app/about/page.tsx` **(new file)**

Fresh About page matching the shared-page visual style of `/terms` and `/privacy`. Sections:

- **What we are** — product pitch: quiz-gated discussion, the "Read. Prove it. Discuss." spine.
- **What we publish** — news categories (politics, business, science, health, world, technology) + free/paid tier structure. No pricing specifics beyond what was already public.
- **Company** — names Verity Post LLC as a U.S. limited liability company that owns the website, the adult iOS app, and the kids iOS app.
- **Contact** — `support@veritypost.com`, `legal@veritypost.com` (press inquiries routed to support).
- **Policies** — links to Terms, Privacy, Cookies, Accessibility, DMCA.

Exports Next.js `metadata` so the page has its own title + description for crawlers.

## What was deliberately NOT added

Owner explicitly excluded these; confirming here so nothing leaks back in later:

- No mailing address (home / business / PO box). The LLC is currently registered at the owner's personal address, which is why none is shown.
- No state of formation. The About page says "United States limited liability company" without naming the state. If later desired, can add "a <State> limited liability company" — one-word edit in `about/page.tsx`.
- No owner / founder / member name.
- No phone number.
- No EIN, D-U-N-S, or any other registration identifier.
- No financial info beyond the already-public "free and paid tiers" line.

## Pending items (not in this commit — owner action)

### WHOIS on `veritypost.com`

- Verify registrar record shows **Organization: Verity Post LLC**, regardless of whether public WHOIS is masked by a privacy proxy.
- Private WHOIS is acceptable to Apple *if* the underlying registrant is the LLC. Many registrars (including Cloudflare Registrar) will publish `Registrant Organization` while masking name/address, which is the ideal end state: Apple sees the LLC name, personal details stay hidden.
- **Check:** run `whois veritypost.com | grep -i "organization"` after the change lands at the registrar. Want to see `Registrant Organization: Verity Post LLC`. If that field is empty, the registrar isn't publishing it and the owner should open a support ticket to request it (Cloudflare supports this).

### D-U-N-S number

- Required by Apple (excludes only government entities). Free via Dun & Bradstreet.
- The D&B record must list the exact legal name `Verity Post LLC` (character-for-character, including any comma) and a valid address. Apple pulls the name from D-U-N-S and displays it as the App Store seller name.
- If no D-U-N-S exists yet, request one at: https://developer.apple.com/support/D-U-N-S/ (Apple's own look-up form — faster than going to D&B directly because Apple pre-validates the entry against their enrollment system).

### Enrollment email address

- Apple's guidance: "Your work email address needs to be associated with your organization's domain name."
- The owner's Apple Account is currently on `cliff.hawes@outlook.com` (Outlook, not `@veritypost.com`). This may cause an enrollment delay.
- **Recommend** creating `admin@veritypost.com` or `cliff@veritypost.com` and enrolling with that. Can be a forwarding alias to the Outlook inbox — doesn't need a separate mailbox to set up.

## Verification

Once Vercel deploys `cbdea50`:

- `curl -A "Mozilla/5.0" https://veritypost.com/about | grep -o "Verity Post LLC"` → should return a match.
- Browse to `https://veritypost.com/terms` — opening paragraph names Verity Post LLC; new section 9 at bottom names the LLC in Contact.
- Browse to `https://veritypost.com/privacy` — opening paragraph names Verity Post LLC as data controller; section 8 names the LLC in Contact.
- Scroll to any page footer — should read `© 2026 Verity Post LLC. All rights reserved.` and show the new About link in the row.

## Files changed

```
web/src/app/NavWrapper.tsx       (footer: +About link, +(c) Verity Post LLC year)
web/src/app/about/page.tsx       (new)
web/src/app/privacy/page.tsx     (opening paragraph + Contact update)
web/src/app/terms/page.tsx       (opening paragraph + new Contact section)
```

## Commit

```
cbdea50 legal pages: name Verity Post LLC as operator + add /about
8239c44..cbdea50  main -> main
```
