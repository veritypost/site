# Round I — UX + copy polish plan

Planner output. Read-only. Items grouped by surface area into 3 commits. File paths are absolute. Each entry gives file:line, current snippet, proposed snippet, and a one-sentence rationale. Canonical copy: "Sign in / Sign up / Sign out / Create free account". No emojis.

Deferred per attack plan (not addressed here): L-03, L-05, L-06, L-07, L-09, L-10, L-11, M-02, M-04, M-05, M-13.

---

## Commit 1 — story + quiz (H-13, H-16, M-08, M-09, L-04)

Touches 4 files: `Interstitial.tsx`, `story/[slug]/page.tsx`, `ArticleQuiz.tsx`, `kids/story/[slug]/page.tsx`.

### H-13 — Interstitial "unlock quizzes" is inaccurate

- File: `/Users/veritypost/Desktop/verity-post/site/src/components/Interstitial.tsx:79-81`
- Current:
  ```tsx
  <p style={{ fontSize: 14, color: '#444', lineHeight: 1.5, marginBottom: 18 }}>
    Sign up to save your streak, unlock quizzes, and comment on articles. Free, no card required.
  </p>
  ```
- Proposed:
  ```tsx
  <p style={{ fontSize: 14, color: '#444', lineHeight: 1.5, marginBottom: 18 }}>
    Sign up to save your streak, take quizzes, and join the discussion. Free, no card required.
  </p>
  ```
- Why: quizzes are open to any signed-in reader; passing a quiz is what unlocks comments. Current copy implies quizzes themselves are gated.

### H-16 — Mobile Discussion tab renders empty for anon and unverified-no-quiz users

- File: `/Users/veritypost/Desktop/verity-post/site/src/app/story/[slug]/page.tsx:571-594`
- Current: `discussionSection` is `null` when (anon) or (verified user who has not passed the quiz and has no email_confirmed_at). On mobile the Discussion tab button still shows but tapping renders nothing between the tab bar and the exit panel.
- Current snippet (end of branch):
  ```tsx
  ) : currentUser && currentUser.email_confirmed_at ? (
    // …locked panel for verified users who haven't passed the quiz
    <div …>Discussion is locked until you pass the quiz above.</div>
  ) : null;
  ```
- Proposed: replace the trailing `null` with an anon/unverified fallback panel that mirrors the quiz-lock copy, so every tab state has visible content. Also move/mirror the panel under `showMobileDiscussion` so it appears even when `quizNode` lives in the same mount.
  ```tsx
  ) : currentUser && currentUser.email_confirmed_at ? (
    <div style={lockPanelStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>
        Discussion is locked until you pass the quiz above.
      </div>
      <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5 }}>
        You need 3 out of 5 correct to join the comment thread for this article.
      </div>
    </div>
  ) : (
    <div style={lockPanelStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>
        Discussion is for signed-in readers.
      </div>
      <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 12 }}>
        Create a free account, then pass a short quiz to join the comments on any article.
      </div>
      <a href={`/signup?next=${encodeURIComponent('/story/' + story.slug)}`} style={ctaStyle}>
        Create free account
      </a>
    </div>
  );
  ```
- Why: a tab button that renders nothing on tap is a dead-end mobile interaction. Non-trivial: requires pulling the shared panel style out into a const (`lockPanelStyle`, `ctaStyle`) and confirming the mobile `showMobileDiscussion` branch always renders `discussionSection` (line 820-823 already does — no change there once `discussionSection` is non-null).

### M-08 — Duplicate "Quiz passed!" celebration on kid story

- File A: `/Users/veritypost/Desktop/verity-post/site/src/app/kids/story/[slug]/page.tsx:243`
- File B: `/Users/veritypost/Desktop/verity-post/site/src/components/ArticleQuiz.tsx:161-177`
- Current: `kids/story/[slug]` renders `<QuizPassCelebration kidName={kid.display_name} />` AND mounts `<ArticleQuiz .../>` which, once `stage === 'passed'`, renders its own green "Quiz passed!" card.
- Proposed: drop the `QuizPassCelebration` render on kids/story since `ArticleQuiz`'s passed-state branch already shows a kid-themed message (`isKid ? 'Quiz passed!' : 'Discussion unlocked'` with `'Great reading! You got it.'`). Remove line 243 and the `QuizPassCelebration` helper (lines 257-299) in `kids/story/[slug]/page.tsx`.
  ```tsx
  // delete:
  {quizPassed && <QuizPassCelebration kidName={kid.display_name} />}
  // and delete the QuizPassCelebration function below
  ```
- Why: two stacked celebration cards is visual noise; ArticleQuiz already owns the passed state for both kid and adult.

### M-09 — Reading-complete beacon fires on tab-away

- File: `/Users/veritypost/Desktop/verity-post/site/src/app/story/[slug]/page.tsx:410-424`
- Current:
  ```tsx
  const dwellTimer = setTimeout(() => markComplete(null), 30_000);
  ```
- Proposed: gate the dwell-timer branch behind `document.visibilityState === 'visible'`. Scroll branch already implies engagement; leave it alone.
  ```tsx
  const dwellTimer = setTimeout(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    markComplete(null);
  }, 30_000);
  ```
- Why: prevents "tab open but user elsewhere for 30s" from inflating verity_score and view_count.

### L-04 — Curly apostrophe in bookmark-cap error string

- File: `/Users/veritypost/Desktop/verity-post/site/src/app/story/[slug]/page.tsx:479`
- Current:
  ```tsx
  ? 'You\u2019ve hit the 10-bookmark limit. Unlimited bookmarks are available on paid plans.'
  ```
- Proposed:
  ```tsx
  ? "You've hit the 10-bookmark limit. Unlimited bookmarks are available on paid plans."
  ```
- Why: every other bookmark-cap copy in this file uses `&apos;` / straight apostrophe; the `\u2019` escape is unique and (per R2) renders inconsistently in the mobile webview. Note: also relevant to the M-11 cleanup below — this string may be deleted entirely if M-11 consolidates to the inline banner.

---

## Commit 2 — home + regwall (M-10, M-12)

Touches 2 files: `NavWrapper.tsx`, `story/[slug]/page.tsx`.

### M-10 — Anon home has no visible "Sign up" CTA

- File: `/Users/veritypost/Desktop/verity-post/site/src/app/NavWrapper.tsx:332-348`
- Current: top bar shows only a subtle grey "Sign in" link for anon.
  ```tsx
  {authLoaded && !loggedIn && (
    <a href="/login" aria-label="Sign in" style={{…color: C.dim…}}>Sign in</a>
  )}
  ```
- Proposed: add a primary "Sign up" pill next to the existing "Sign in" text link. Keep Sign in as the subtle fallback, give Sign up the accent pill so it's the above-the-fold call-to-action.
  ```tsx
  {authLoaded && !loggedIn && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: -4 }}>
      <a href="/login" aria-label="Sign in"
        style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 4px',
                 fontSize: 13, fontWeight: 500, color: C.dim, textDecoration: 'none' }}>
        Sign in
      </a>
      <a href="/signup" aria-label="Sign up"
        style={{ display: 'inline-flex', alignItems: 'center', minHeight: 32, padding: '0 12px',
                 fontSize: 13, fontWeight: 700, color: '#fff', background: C.text,
                 borderRadius: 8, textDecoration: 'none' }}>
        Sign up
      </a>
    </div>
  )}
  ```
- Why: conversion surface for anon visitors. Canonical strings Sign in + Sign up only. No emojis. Non-trivial: requires a wrapping flex container since the branch currently renders a single `<a>`.

### M-12 — Regwall sessionStorage not cleared after signup in another tab

- File: `/Users/veritypost/Desktop/verity-post/site/src/app/story/[slug]/page.tsx:294-314`
- Current: `vp:regwall-dismissed` lives in sessionStorage forever for the tab's lifetime; once a user signs up in tab B and comes back to tab A, the wall stays dismissed but so does any paywall/gating signal — more importantly, the state is stuck at whatever was captured pre-signup.
- Proposed: (a) clear the key when the page notices the user is now signed in, and (b) add a storage-event listener so tab A drops the flag immediately when tab B writes `vp:signed-in` (or we can key off `supabase.auth.onAuthStateChange`).
  ```tsx
  useEffect(() => {
    if (!currentUser) return;
    try { window.sessionStorage.removeItem('vp:regwall-dismissed'); } catch {}
  }, [currentUser]);

  useEffect(() => {
    const onAuth = (e: StorageEvent) => {
      if (e.key === 'sb-auth-token' || e.key?.startsWith('sb-')) {
        try { window.sessionStorage.removeItem('vp:regwall-dismissed'); } catch {}
      }
    };
    window.addEventListener('storage', onAuth);
    return () => window.removeEventListener('storage', onAuth);
  }, []);
  ```
- Why: stale dismissal state leaks across auth transitions. Non-trivial: picking the right auth-state signal (supabase localStorage key, not sessionStorage) requires a quick grep before wiring.

---

## Commit 3 — kids + bookmarks + mentions (M-06, M-07, M-11, L-08)

Touches 3 files: `page.tsx` (home), `kids/story/[slug]/page.tsx`, `story/[slug]/page.tsx`, `CommentComposer.tsx`.

### M-06 — Kid category slug-prefix leak risk

- File: `/Users/veritypost/Desktop/verity-post/site/src/app/page.tsx:272-276`
- Current:
  ```tsx
  supabase
    .from('categories')
    .select('id, name, slug, is_active, is_kids_safe, parent_id, sort_order')
    .not('slug', 'like', 'kids-%')
    .order('sort_order', { ascending: true, nullsFirst: false }),
  ```
- Proposed: add a defensive second filter that rejects categories whose name contains `(Kids)` or whose `metadata.audience` is `'kids'`. No schema change — the metadata JSONB column already exists (`reset_and_rebuild_v2.sql:76`).
  ```tsx
  supabase
    .from('categories')
    .select('id, name, slug, is_active, is_kids_safe, parent_id, sort_order, metadata')
    .not('slug', 'like', 'kids-%')
    .not('name', 'ilike', '%(kids)%')
    // metadata->>audience check: defer to post-filter since PostgREST JSON filter
    // syntax differs; we already fetch metadata so filter client-side:
    .order('sort_order', { ascending: true, nullsFirst: false }),
  ```
  Then in the merge step (~line 287-306), drop any row where `metadata?.audience === 'kids'`:
  ```tsx
  const allCats = ((allCatsRes.data as CategoryRow[] | null) || [])
    .filter(c => (c as { metadata?: { audience?: string } }).metadata?.audience !== 'kids');
  ```
- Why: prevents an editor authoring "Science (Kids)" or setting `metadata.audience='kids'` without the slug prefix from leaking into the adult feed. Non-trivial: `CategoryRow` type + FALLBACK_CATEGORIES may not include `metadata` — need a narrow type extension.

### M-07 — Kid story dead-end on paused profile

- File: `/Users/veritypost/Desktop/verity-post/site/src/app/kids/story/[slug]/page.tsx:64-75`
- Current:
  ```tsx
  const { data: kidRow } = await supabase
    .from('kid_profiles')
    .select('id, display_name, avatar_color')
    .eq('id', activeKidId)
    .eq('parent_user_id', user.id)
    .maybeSingle();
  if (!kidRow) {
    try { window.localStorage.removeItem(ACTIVE_KID_KEY); } catch {}
    try { window.dispatchEvent(new Event('vp:kid-mode-changed')); } catch {}
    router.replace('/kids');
    return;
  }
  ```
- Proposed: also filter `paused_at IS NULL` and bounce on paused kids, mirroring `/kids/page.tsx:63`.
  ```tsx
  const { data: kidRow } = await supabase
    .from('kid_profiles')
    .select('id, display_name, avatar_color, paused_at')
    .eq('id', activeKidId)
    .eq('parent_user_id', user.id)
    .is('paused_at', null)
    .maybeSingle();
  if (!kidRow) {
    try { window.localStorage.removeItem(ACTIVE_KID_KEY); } catch {}
    try { window.dispatchEvent(new Event('vp:kid-mode-changed')); } catch {}
    router.replace('/kids');
    return;
  }
  ```
- Why: stale `vp_active_kid_id` for a paused profile currently renders kid UI briefly (the fetch succeeds, paused flag is ignored) before anything bounces. Filtering server-side removes the flicker.

### M-11 — Bookmark cap double messaging

- File: `/Users/veritypost/Desktop/verity-post/site/src/app/story/[slug]/page.tsx:477-482` and `:735-739` and `:783-787`
- Current: three places surface the same cap state — (a) inline banner at :735 "You've used 10 of 10…", (b) `bookmarkError` block at :783 fed from :479 "You've hit the 10-bookmark limit…", (c) the button label itself flips to "At cap (10)".
- Proposed: pick the inline banner as the single source. In `toggleBookmark`, drop the cap-specific branch and fall through to the generic failure message — the button is disabled at cap anyway, so the cap-branch `POST /api/bookmarks` is unreachable under normal use, and the server still returns a generic "could not save" for edge cases.
  ```tsx
  // :477-482 becomes:
  else {
    setBookmarkError('Could not save bookmark. Please try again.');
  }
  ```
  Keep the inline banner at :735-739 and the disabled button label. Delete the now-unused `\u2019` copy (see L-04).
- Why: one channel. The inline banner has an upgrade link; the toast/error block was redundant.

### L-08 — CommentComposer drops mentions silently if permission missing

- File: `/Users/veritypost/Desktop/verity-post/site/src/components/CommentComposer.tsx:66-78` and `:114-128`
- Current: `resolveMentions` early-returns `[]` when `!canMention`, so any `@name` the user typed is simply stripped from the payload. The tip text does say "@mentions are available on paid plans" (:127), but a user who doesn't read the hint never learns their `@name` was dropped.
- Proposed: surface a per-submit warning if the body contains a mention pattern and the user lacks `comments.mention.insert`.
  ```tsx
  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || busy) return;
    const hasMentions = MENTION_RE.test(trimmed);
    if (hasMentions && !canMention) {
      setError('Mentions are available on paid plans — your @handle will post as plain text.');
      // continue; do not block submit. Let the user decide to edit or accept.
    }
    setBusy(true);
    if (!hasMentions || canMention) setError('');
    try {
      const mentions = await resolveMentions(trimmed);
      // … unchanged …
    } …
  }
  ```
  Also: reset the MENTION_RE state between uses (`/g` flag resets `lastIndex`) by calling `MENTION_RE.lastIndex = 0` before `.test`.
- Why: silent-drop is the worst UX for a paywalled feature. Non-trivial: `MENTION_RE` is shared; need to confirm it isn't `/g` flagged, and if it is, switch to `trimmed.match(MENTION_RE)` for the boolean check.
