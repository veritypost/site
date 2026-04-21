# 03 — Earned chrome on the story page

## The idea

The comment section is **completely invisible** on anon / non-verified /
quiz-not-passed views. Not locked, not collapsed, not dimmed — **gone.**
Then it materializes after a pass, with a subtle entrance.

### Anon view (no hint that comments exist)

```
┌────────────────────────────────────────────┐
│ [article body]                             │
│                                            │
│ (ends — receipt footer — next article)     │
└────────────────────────────────────────────┘
```

### After quiz pass (comments appear)

```
┌────────────────────────────────────────────┐
│ [article body]                             │
│                                            │
│ [receipt footer]                           │
│                                            │
│ ── discussion ──────── 47 readers passed ─ │
│ @liz_22 · verity 148 · 2h ago              │
│ The framing here misses that Justice K...  │
└────────────────────────────────────────────┘
```

## Why it's different — and why no one else can copy this

Every other news platform **begs** for comments. Bright CTAs, green
"JOIN THE CONVERSATION" banners, empty comment threads with "Be the first
to comment" prompts. They do this because their business model is ad
density and engagement metrics; the comment field is the highest-value
unused screen pixel on the article page.

Verity's model is subscription + earned comments. The absence of the
comment UI is therefore the product thesis made visible.

**Competitors can't copy this without breaking their business model.**
The receipt and the quiet home feed are aesthetic moves; earned chrome
is architectural.

## Where it lives

- **File:** `web/src/app/story/[slug]/page.tsx`
- **Area:** the `discussionSection` block around lines 656-691. Currently
  renders three branches:
  1. Quiz passed → `<CommentThread />`
  2. Verified + quiz not passed → locked panel ("Discussion is locked")
  3. Anon → signup CTA panel

## What ships

1. **Delete branches 2 and 3 entirely.** Replace with `null`.
2. Branch 1 keeps rendering `<CommentThread />` unchanged.
3. Also hide the `quizNode` (lines 605-643) for anon readers completely.
   Only show the quiz to signed-in users with verified email. Anon readers
   finish reading, see the receipt footer, scroll to the next-article
   suggestion — no "sign up to unlock" panel in the article flow.
4. On quiz pass, wrap the comment section entrance in a subtle
   `opacity + translateY` animation: 400ms ease-out, no bounce, no
   delay. The discussion "rises" into view once rather than popping.
5. Add a small section header above the comment thread:
   `── discussion ──────── {N} readers passed ─`
   where N is `passed_readers_count` (new lightweight RPC or computed
   from `quiz_attempts` table aggregate).

## The user journey this creates

- **Anon** reads the article, gets a receipt, moves on. Never knows
  comments exist unless they log in. No begging, no friction.
- **Signed-in verified + pre-quiz** reads the article, sees the quiz at
  the end, optional to take. Still no comment UI visible.
- **Signed-in + passed quiz** reads, takes the quiz, and the discussion
  quietly materializes. Feels like unlocking a door, not opening a popup.

## Risks / trade-offs

- **SEO impact.** Comment content is currently indexable by Google; if
  comments are hidden in the anon DOM, search engines won't see them.
  Two options:
  a. Accept it — your SEO moat is the article body + sources, not user
     comments.
  b. Render comment text (but not the input form / reply affordances)
     as static HTML for SEO, hide the interactive UI for anon.
  My pick: (a). The comments aren't your SEO play.
- **Conversion risk.** Right now the "Sign up to unlock discussion"
  panel is presumably a conversion driver. Removing it means you lose
  that CTA. Mitigation: the `/signup` link moves into the receipt
  footer ("SINCE — sign up to track your score and join discussions").
  Quieter, still present.
- **Discovery.** New readers genuinely won't know comments exist until
  they've signed in + passed a quiz. That's the point — but marketing
  copy on the home page and landing should make the quiz-gated
  discussion central to the product narrative.

## Effort

~2 hours. Delete two JSX branches, add one animation wrapper, add one
small RPC for `passed_readers_count`.

## Why ship this one first

It's the only idea of the four where competitors literally cannot
match. The other three are aesthetic polish. This one IS the product.
