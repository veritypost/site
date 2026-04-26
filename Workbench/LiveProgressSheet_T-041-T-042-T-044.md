# LiveProgressSheet — T-041 / T-042 / T-044 — EmptyState, Skeleton, LockedFeatureCTA
Started: 2026-04-26

## User Intent

Build three shared web components for the adult surfaces. Scope is web-only for this pass. Each task has a specific wire-in requirement.

**T-041 — EmptyState**
- New file: `web/src/components/EmptyState.tsx`
- Props: `icon` (ReactNode, optional), `headline` (string), `body` (string), `cta?: { label: string; href: string }`
- Pattern reference: `web/src/components/admin/EmptyState.jsx` (icon + title + description + cta, role="status")
- Wire in: `web/src/app/category/[id]/page.js` — replace the inline ad-hoc empty block at lines 365–388 (stories.length === 0 case inside the Article Cards section)
- Do NOT wire into bookmarks (T-044 scope) or story/[slug] (another agent)

**T-042 — Skeleton**
- New file: `web/src/components/Skeleton.tsx`
- Props: `width` (string | number), `height` (string | number), `className?` (string)
- CSS shimmer animation; must respect prefers-reduced-motion (globals.css already has the `prefers-reduced-motion: reduce` global rule at line 9 — shimmer defined in globals.css references it automatically via that rule; or can define keyframe in-component with media query guard)
- Wire in: `web/src/components/CommentThread.tsx` loading state — replace the two `<div style={{ color: 'var(--dim, #666)', fontSize: 13, padding: 12 }}>Loading discussion…</div>` blocks (lines 487–492 and 496–502) with 3–4 skeleton rows
- Do NOT touch CommentRow.tsx (handled by another agent)
- Do NOT wire into bookmarks/page.tsx or story/[slug]/page.tsx

**T-044 — LockedFeatureCTA**
- New file: `web/src/components/LockedFeatureCTA.tsx`
- Inline strip variant: horizontal, icon + copy + CTA button, no overlay, no backdrop
- gateType prop: `'plan' | 'role' | 'verification'`
- Copy logic maps from LockModal's `resolvePrompt` function (same lock_reason → headline/body/ctaLabel/ctaHref mapping), adapted for inline display
- Also accepts `capability?: Capability | null` OR standalone `lockReason?` + `lockMessage?` props (mirrors LockModal's approach)
- Wire in: `web/src/app/bookmarks/page.tsx` — replace the inline empty-state block at lines 595–620 with `<EmptyState>` (T-041) AND replace the at-cap inline banner with `<LockedFeatureCTA gateType="plan">`. Check git log first: last modified in commit 83e38c0 (UI audit pass — no other agent is working on it)

## Live Code State

### category/[id]/page.js (lines 364–388)
Current empty state is a fully inline block:
```jsx
{stories.length === 0 && (
  <div style={{ padding: '40px 20px', textAlign: 'center', background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: 12, color: '#666666', fontSize: 13 }}>
    <div style={{ fontWeight: 700, fontSize: 15, color: '#111', marginBottom: 4 }}>
      No articles in this category yet.
    </div>
    <div>Check back soon, or <a href="/" style={{ color: '#111', fontWeight: 700 }}>browse the home feed</a>.</div>
  </div>
)}
```
This is a `.js` file (not TypeScript). The task only asks to wire EmptyState in — we import it and replace the inline block. We do NOT migrate the whole file to TS in this task (that's T-028, deferred).

### CommentThread.tsx (lines 486–502)
Two loading states currently render identical inline divs:
- Line 487–492: `!permsLoaded` state — "Loading discussion…"
- Line 496–502: `loading` state — "Loading discussion…"
Both are candidates for Skeleton replacement.
The component also has an empty state at line 837–848 ("No comments yet — be the first.") but the task only specifies wiring into the loading states.

### LockModal.tsx — resolvePrompt function
The copy logic at lines 26–68 maps `lockReason` to headline/body/ctaLabel/ctaHref:
- `LOCK_REASON.BANNED` → "Account suspended" / "Contact support" / '/appeal'
- `LOCK_REASON.EMAIL_UNVERIFIED` → "Verify your email" / "Verify email" / '/verify-email'
- `LOCK_REASON.ROLE_REQUIRED` → "Restricted" / "Got it" (no href)
- `!authed` → "Sign in to continue" / "Sign up" / '/login'
- default (plan) → "Upgrade to unlock" / "See plans" / '/profile/settings#billing'

`LOCK_REASON` constants in `web/src/lib/permissionKeys.js`:
- BANNED, EMAIL_UNVERIFIED, NOT_GRANTED, PLAN_REQUIRED, ROLE_REQUIRED

`gateType` prop maps to these:
- 'plan' → default upsell copy ("Upgrade to unlock")
- 'role' → ROLE_REQUIRED copy ("Restricted")
- 'verification' → EMAIL_UNVERIFIED copy ("Verify your email")

### bookmarks/page.tsx (lines 595–620 + cap banner)
Empty state at lines 595–620: inline div with "No bookmarks yet" copy + "Browse articles" CTA.
Cap banner: the at-cap state uses inline styling. No LockModal is currently present.
Last modified: commit 83e38c0 (UI audit pass, NOT another agent working on it — safe to touch).

### globals.css
prefers-reduced-motion: reduce block at line 9–18 collapses all animations to 0.01ms.
This means any CSS shimmer keyframe defined in globals.css (or inline via a style tag) is automatically handled. We add `@keyframes vpShimmer` to globals.css and use a `.vp-skeleton` class.

### admin/EmptyState.jsx — reference pattern
Props: icon, title, description, cta, size, style
Uses `role="status"`, centered layout with flex column.
Our web EmptyState uses `headline` (not `title`) per the task spec. Different prop name from admin version is intentional — admin is admin-palette-colored, web version uses CSS vars from globals.css.

## Contradictions

| Agent | File:line | Expected | Actual | Impact |
|-------|-----------|----------|--------|--------|
| Intake | category/[id]/page.js — task says "bare text 'No articles in this category yet.'" | Simple bare text | Actually a styled inline block with multiple elements | Low — wire-in is still straightforward; replace the block |
| Intake | T-044 task says "bookmarks page only if not touched by another agent" | May be in use | git log shows last touch was commit 83e38c0 (UI audit, same session); no other agent is working on it | None — safe to wire in |
| Intake | CommentThread.tsx has TWO loading states, not one | Task says "3–4 skeleton rows" in loading state | Both `!permsLoaded` and `loading` states show "Loading discussion…" | Minor — replace both loading divs with Skeleton rows |

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
Not needed — unanimous.

## Implementation Progress
[filled during execution]

## Completed

SHIPPED 2026-04-26

Components created:
- `web/src/components/EmptyState.tsx` — new (props: icon?, headline, body, cta?)
- `web/src/components/Skeleton.tsx` — new (props: width, height, className?)
- `web/src/components/LockedFeatureCTA.tsx` — new (props: gateType, lockMessage?, onClose?, style)
- `web/src/app/globals.css` — added @keyframes vpShimmer + .vp-skeleton class

Wire-ins:
- `web/src/app/category/[id]/page.js` — stories.length === 0 block replaced with EmptyState
- `web/src/components/CommentThread.tsx` — both !permsLoaded/loading divs replaced with 3 Skeleton rows
- `web/src/app/bookmarks/page.tsx` — at-cap Banner replaced with LockedFeatureCTA; filtered.length === 0 block replaced with EmptyState

Commits:
- b776352 — EmptyState, Skeleton, LockedFeatureCTA + bookmarks + category wire-ins (bundled with T-006/Q39 parallel work)
- e147426 — CommentThread Skeleton wire-in (bundled with T-050)

Notes:
- Parallel agents committed the new components and most wire-ins in b776352 (T-006 commit) and e147426 (T-050 commit) while this pipeline was running. All changes verified present at HEAD.
- tsc clean for all three components and wire-in files. One unrelated CommentRow.tsx conflict (timeAgo import from T-046 agent, not our work) is open.
- T-044 LockedFeatureCTA kept LockModal intact — both coexist. LockModal for hard gates, LockedFeatureCTA for inline soft nudges.
