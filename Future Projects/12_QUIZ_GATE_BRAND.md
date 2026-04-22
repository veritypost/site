# 12 — The Quiz Gate as Brand Element

**Owner:** Huffman (primary — he named it the best content-moderation primitive in a decade), Portnoy (voice sanity check — "what would make it feel alive"), Thompson (editorial implication).
**Depends on:** `00_CHARTER.md` (commitment 3), `08_DESIGN_TOKENS.md`.
**Affects:** comment threads (web + iOS), story detail views, marketing surfaces, admin comment moderation UI.

---

## The mechanic today

Every article has a 5-question comprehension quiz. Score 3/5, comments unlock. The logic is built and working — `quiz_attempts` table, server-side grading, `quizzes_completed` table, permission gates on comment features.

Today's problem: the quiz is invisible until a reader tries to comment. It's a silent gate. Readers who never try to comment don't even know the mechanic exists. That means the moat is hidden from the 80% of readers who don't comment — and those are the readers who most benefit from knowing *why* Verity's comments are worth reading.

Per recon: quiz and discussion are currently launch-hidden on `/story/[slug]` via `{false && ...}` branches. The launch-phase memory says hides are temporary — unhide is a one-line flip. That flip is part of this work.

## What changes

The quiz gate becomes the most visible branded mechanic in the product. On every surface where comments appear, the reader sees that commenters passed the quiz. On every article page, the quiz is visible as part of the reading structure. On marketing surfaces, the quiz is the headline.

Three concrete moves.

### Move 1: The quiz is visible on every article page

Currently the quiz is tucked into a tab (on iOS `StoryDetailView`) or hidden behind the launch flag (on web). Fix: the quiz is a labeled block at the end of every article, *always visible*:

> **Pass to comment.** 5 questions about what you just read. Get 3 right and the conversation opens.
>
> [ Start quiz ]

Whether the reader takes the quiz is their choice. The existence of the quiz is not hidden. Every reader learns about the gate by scrolling to the bottom of any article.

### Move 2: The earned-comment badge

Every comment thread — web and iOS — renders a small permanent header:

> Every reader here passed the quiz.

That's the whole thing. One line, quiet, always present. It's the trust signal.

Individual comments can carry a subtler variant — a small "passed" mark next to the commenter's name. Non-obtrusive. Not a badge that pretends to be achievement — a plain affirmation that this commenter is verified as having read the article.

### Move 3: The quiz gate on marketing surfaces

The home page masthead, the About page, the App Store listing, the first-time-visitor welcome screen — each surfaces the quiz gate in plain language.

Home masthead line (under the date):

> Verity is the news site where the comments are worth reading — because commenters proved they read the article.

About page opens with the mechanic:

> Every article on Verity ends with a 5-question quiz about what you just read. Pass 3 of 5 and the comment section unlocks. Which means: the people in the conversation actually read the piece.

App Store subtitle:

> News you can trust. Comments worth reading.

The quiz is not a feature tucked in a feature list. It's the *thesis* of the product, visible from first contact.

## The quiz experience itself

### Pass flow (currently functional — no change needed to grading logic)

- Reader submits answers.
- Server grades via `/api/quiz/submit`.
- If pass: comment section unlocks, signature moment fires (see `13_QUIZ_UNLOCK_MOMENT.md`).
- Pass state persists: reader can always comment on this article, and doesn't re-take the quiz on return visits.

### Fail flow — the nuance (upgraded per editorial manifest)

The fail state shows which **question types** the reader missed — never the correct answers. This is diagnostic without breaking the gate:

> 2 of 5.
>
> You missed **Central Claim** and **Scope Boundary** questions.
>
> Want to take another look at the article?
>
> [ Reread and try again ]
> [ Not right now ]

No punishment. No guilt. No reveal. Respect the reader and preserve the gate.

**Retry policy (manifest-driven, supersedes the earlier 6-hour cool-down):**

- 3 attempts → scroll-depth beacon (server verifies the reader actually re-read the article, not just refreshed) → 10-minute cool-down → unlimited retries thereafter.
- Verity Pro skips the cool-down.
- No timer. Timed comprehension measures reading speed, not comprehension — and violates the brand. Psychometrician rule.

This is pedagogy preserved and gate preserved, with the punitive edge removed.

### Quiz question types (new — per manifest)

Every quiz contains at minimum one **Type A (Central Claim)** and one **Type D (Scope Boundary)** question. Type A tests whether the reader understood the article's main factual claim. Type D tests whether the reader knows what the article explicitly did *not* claim — the boundary that separates careful reporting from inference.

Other types: Type B (Load-Bearing Number), Type C (Causal Chain), Type E (Source Attribution), Type F (Timeline Order).

**Difficulty curve per quiz:** confidence-builder → anchor → hardest (Type C Causal Chain) → anchor → Scope Boundary to close.

**Quality rules:**
- No correct answer is a verbatim span of the article.
- Every wrong option is real article content re-assigned — so skimmers learn nothing from distractors.
- At least two answers require body paragraphs beyond the summary.
- Every reader can flag any question (answer not in article / two options could be correct / tests trivia / unclear wording). Three flags → editor review.

### Question quality

Per launch-model memory: quiz content (00-L) is dropped from launch-blocking. Questions will be AI-assisted in the early phase and editor-reviewed as volume grows.

The quality bar:

- Questions test whether the reader understood the piece, not whether they memorized details.
- Questions have a clear correct answer — no ambiguity that breaks the gate signal.
- Questions don't embed political or opinion framing that contradicts the Charter.
- Questions that fail the bar are flagged by readers (via a small "question seems broken" link next to each) and reviewed by editors.

## What this doesn't change

- **The 3/5 threshold.** Not negotiable. Lowering it devalues the gate; raising it frustrates earnest readers.
- **Per-article quizzes, not per-user tests.** Each article has its own quiz. Each quiz tests that specific article.
- **Server-side grading.** Grading must never happen client-side or the gate is trivially bypassable.
- **Permission-matrix integration.** The quiz gate maps to the existing `comments.post` permission. The gate is *one of* the permission conditions, not a replacement for the permission system.
- **Kids quiz mechanic.** Kids app has its own quiz with adapted difficulty. See `views/ios_kids_quiz.md`. Same gate concept, same 3/5 threshold.

## What to build

### Web

- `/story/[slug]/page.tsx`: remove the `{false && ...}` launch hides around the quiz + discussion sections. Render the quiz block at the end of every article, always visible.
- `web/src/components/ArticleQuiz.tsx`: rewrite the fail-state copy. Keep the pass-state (celebration moment goes in `13_QUIZ_UNLOCK_MOMENT.md`).
- `web/src/components/CommentThread.tsx`: add the "Every reader here passed the quiz" header.
- New small component: `<PassedMark />` — one SVG + accessibility label. Used inline on `CommentRow.tsx` next to the commenter name.

### iOS

- `StoryDetailView.swift`: the Discussion tab exists; the quiz is tab-gated. Keep tabs but surface the quiz CTA at the bottom of the Article tab too. Readers who want to comment see the mechanism before switching tabs.
- Quiz view: update fail-state copy.
- Comment list: add the header line and the passed-mark inline.

### Marketing

- `/welcome` (web first-time visitor flow): lead with the quiz mechanic explanation.
- `/about` (public): rewrite opening to center the quiz gate.
- Home masthead copy (see `09_HOME_FEED_REBUILD.md`) references the gate as positioning.
- App Store metadata (see `Current Projects/APP_STORE_METADATA.md`) — update subtitle and description.

### Admin

- `/admin/comments` — admin comment moderation tool. Already exists. Add a view for "questions flagged by readers as broken" (routed from the new in-quiz "question seems broken" reporting flow).

## Acceptance criteria

- [ ] Quiz block renders at the end of every article on web and iOS, always visible.
- [ ] Comment thread header reads "Every reader here passed the quiz" — both web and iOS.
- [ ] `<PassedMark />` renders inline next to commenter names.
- [ ] Fail-state copy rewritten — no punitive voice, reread-and-try-again option, 3-attempt cool-down (6 hours).
- [ ] Verity Pro tier bypasses cool-down.
- [ ] Home masthead, About page, App Store listing all lead with the quiz gate.
- [ ] Reader can report a broken question; report lands in admin queue.
- [ ] Launch-hide `{false && ...}` branches on `/story/[slug]` removed.

## Risk register

- **Readers game the quiz.** Mitigation: cool-down after 3 fails + question pool size (more questions than appear) + occasional question rotation. Not foolproof; doesn't need to be. The gate is a signal, not a fortress.
- **Quiz question quality regresses at scale.** Mitigation: reader "broken question" flag + weekly editor review of flagged questions.
- **Reader frustration at the cool-down.** Mitigation: 6 hours is short enough to be respectful. After the cool-down, unlimited retakes resume. The cool-down isn't a punishment — it's a mild friction against memorization without obstruction for earnest readers.
- **Visibility makes the gate feel gimmicky.** Mitigation: voice discipline. The mechanic is explained plainly, not showboated. "Pass to comment" is factual. "Earn your voice" would be gimmicky — don't use that language.

## What the panel was explicit about

Huffman: "The mechanic solves the biggest problem in community — the ratio of informed-to-uninformed voices. That's worth more than any up-vote algorithm. Make it visible."

Portnoy: "Comments on my sites are a garbage fire because anyone can talk. If I had a 'they read the piece' signal on Barstool, I'd turn it on tomorrow. Make that signal obvious."

Thompson: "You've built the right thing. The question is whether you have the marketing discipline to make it the thesis instead of a feature. I'd bet you do. Commit."

## Sequencing

Ship after: `09_HOME_FEED_REBUILD.md` (the masthead references the gate; make sure the masthead exists first).
Ship before: any PR push. The gate-as-thesis is what journalists will write about.
Pairs with: `13_QUIZ_UNLOCK_MOMENT.md` (the visible gate + the signature moment of passing are one product experience).
