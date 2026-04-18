# Verity Post — Design Decisions & Blueprint Changes

Running log of architectural decisions made during strategic review. Each entry updates or overrides the original blueprint.

---

## Decision 1: Quiz Gates Discussion

The quiz is not optional gamification — it is the **gate to the comment section**. Users must pass the article's quiz before they can participate in the discussion on that article.

- **Minimum passing score:** 3/5
- **Anonymous / Unverified:** Cannot take quizzes or access comments
- **Verified Free:** 2 attempts per quiz, 3/5 required to unlock discussion
- **Plus and above:** Unlimited attempts, 3/5 still required

**Retake mechanic:** Each attempt draws a fresh set of 5 questions from a larger pool. No repeated questions between attempts for the same user. This prevents memorizing answers from attempt one and brute-forcing the retake.

**Question pool requirement:** Minimum 10 questions per article (recommended 12–15) to support two clean non-overlapping sets for free users and multiple distinct sets for paid users.

**Impact:** This is the platform's most powerful anti-troll mechanism. Trolls don't read articles. Requiring demonstrated comprehension before commenting structurally eliminates low-effort toxicity.

---

## Decision 2: Verity Score Is a Knowledge Map, Not a Status System

Verity Score is a **pure number** with no public titles, labels, or tier names attached.

- Each **subcategory** has its own Verity Score
- Subcategory scores roll up into **category** scores
- Category scores sum to a **total Verity Score**
- The score tracks the **shape** of a user's knowledge, not a rank
- No "Scholar," "Analyst," "Luminary" labels — experts/educators/journalists are the only visible authority signals, earned through real-world credential verification

**Score visibility:**
- **Your own scores:** Always visible to you (all categories, subcategories, total)
- **Other users' scores:** Visible to **all paid tiers** (Plus, Premium, Family) — including subcategory breakdowns and total Verity Score
- **Free users:** Cannot see other users' score breakdowns

**Trust-gating:** The system uses raw score thresholds internally (e.g., "Verity Score 500+ in any category") for trust gates like community notes eligibility. These thresholds are invisible to users — no labeled tiers, just quiet backend checks.

---

## Decision 3: Expert Badges Are the Only Public Authority Signal

Since Verity Score carries no visible rank or title, the **Expert / Educator / Journalist badges** are the sole public credibility markers on the platform.

This makes expert vetting existentially important:
- Real-world credential documentation required
- Editorial review of 3 sample responses
- Additional background check for Journalist role
- 30-day probationary period (responses reviewed before publishing)
- Annual re-verification

---

## Decision 4: Category Scores Drive Engagement Breadth

A user's profile shows their per-category score breakdown (radar chart or similar visualization). This creates an intrinsic motivation to explore new topics — users see the shape of their knowledge and naturally want to fill gaps.

- **Leaderboards** are category/subcategory-specific, not just global total
- **"One more" triggers** reference category proximity: "You're 15 points from #3 in Renewable Energy this week"
- **Achievements** are category-based: "Score 80%+ on 10 consecutive Foreign Policy quizzes"

---

## Decision 5: Paid Tier Score Visibility as Conversion Driver

All paid tiers (Plus, Premium, Family) can view other users' Verity Scores including subcategory breakdowns. This is a conversion driver across all paid tiers, not just Premium.

A free user sees another user's comment and cannot see their category score next to it. A paid user sees that the commenter has a 2,400 Climate Policy score, adding context to the discussion. This makes score visibility a social feature worth paying for.

---

## Decision 6: Comment Section Is Fully Locked Until Quiz Passed

Users **cannot see the comment section at all** until they score 3/5 or higher on the article's quiz. The discussion is not blurred, not teased, not "read-only" — it is completely invisible.

**Why this matters:**
- Prevents users from absorbing others' takes before forming their own
- Makes the discussion feel like a reward for comprehension, not just a feature
- Every participant arrived at their perspective independently
- Creates stronger motivation to pass the quiz — curiosity about what others are saying

---

## Decision 7: Comment Score Display Shows Verity Score, Not Quiz Score

Individual article quiz scores are **not** displayed next to comments. Instead, paid users see the commenter's **subcategory or category Verity Score** next to their username (via hover or stamped display — TBD).

- **Paid users (Plus, Premium, Family):** See the commenter's relevant subcategory/category Verity Score and/or total score
- **Free users:** See username only, no score context

**Why this matters:**
- A subcategory score reflects accumulated knowledge across many articles, not one quiz performance
- Prevents snap judgments based on a single quiz result
- Creates a meaningful paid-tier perk — understanding who in the discussion has deep topic knowledge
- Free users are motivated to upgrade to see the credibility layer behind every comment

---

## Decision 8: No Quiz Bypass for Any Role

**Nobody bypasses the quiz gate.** Experts, educators, journalists, moderators, editors, admins — everyone must score 3/5 on the article's quiz to access and participate in that article's discussion.

- Expert badge = "I'm credentialed in this field"
- Quiz pass = "I read this specific article"
- These are separate claims, both required for discussion participation

**Why this matters:**
- Prevents experts from commenting based on general authority without engaging the actual content
- Maintains the integrity of the comprehension gate universally
- Every single person in every discussion has demonstrated they read the article — no exceptions

---

## Decision 9: Kids Have No Discussion Section — Expert Sessions Instead

Kids do **not** have access to article comment sections. The kids experience is: read articles, take quizzes, bookmarks, streaks, achievements, reading log.

**Instead of peer discussion, kids get scheduled expert sessions:**
- Weekly or daily live sessions where a verified expert is available
- Kids can ask the expert questions directly
- Structured, moderated environment — no peer-to-peer interaction

**Why this matters:**
- Eliminates all peer-to-peer safety risks for minors
- Kids still get the educational value of expert interaction
- Gives the Family tier a unique engagement feature adults don't get
- Parents can point to expert sessions as a reason to use the platform over social media
- Can revisit adding kid-to-kid discussion later once moderation infrastructure matures

---

## Decision 10: Tier Names Are Brand-Native

Tier names avoid generic industry terms (Plus, Premium, Pro Max, etc.) and use the platform brand:

| Tier | Price | Previous Name |
|------|-------|---------------|
| **Free** | $0 | Free (Verified) |
| **Verity** | $3.99/mo | Plus |
| **Verity Pro** | $9.99/mo | Premium |
| **Verity Family** | $14.99/mo | Family |

Anonymous and Unverified remain as auth states, not marketed tiers.

**Why this matters:**
- "Verity" as the mid-tier name reinforces the brand every time someone mentions their plan
- No confusion with every other app's Plus/Premium naming
- Clean escalation: Verity → Verity Pro → Verity Family

---

## Decision 11: DMs Are Paid-Only, Permanently

Direct messages are locked behind paid tiers. No free DM access, no limited taste, no message requests at free.

- **Free:** No DMs
- **Verity / Verity Pro / Verity Family:** Full DM access

**This will never change.** DMs are a natural conversion trigger — by the time a user wants to privately message someone, they've built enough social investment to justify $3.99/month.

---

## Decision 12: Kid Profiles Are Completely Undiscoverable

Hard child safety rule — **no discoverability of kid profiles by anyone:**

- Kids cannot search for or find other kids
- Parents/adults cannot search for or find other users' kids
- Kid profiles do not appear in search results, suggestions, or any adult-facing user discovery feature
- The only visibility into a kid's activity is through the **parental dashboard on that kid's own Family plan**
- **Kids global leaderboard (clarification 2026-04-16):** Kids have their own global leaderboard, completely separate from the adult leaderboard. It shows kid profiles ranked against other kids only. It is accessible only from kid-mode surfaces — adults never see it. The adult leaderboard never shows kid scores. The kids global leaderboard shows display names and scores only — no parent info, no family identifiers, no ability to message/follow/discover the kid's parent account. This is in addition to the D24 family leaderboard where kids + parents compete within the same household.

This is non-negotiable and applies regardless of future feature additions.

---

## Decision 13: Bookmarks — Free With Cap, Full at Verity

Bookmarks are available to free users because every bookmark is a future return visit (and ad impression).

- **Free:** 10 bookmarks, flat list only (no collections, no notes)
- **Verity and above:** Unlimited bookmarks, named collections (folders), personal notes on bookmarks, export

**Why free users get bookmarks:** A user who bookmarks is planning to come back. Locking bookmarks entirely kills return visits and ad revenue. The 10 cap builds the habit, and when they hit 11, they've proven they value it enough to convert.

**Why collections and notes are paid:** These are power-user organization tools. At 10 bookmarks you don't need folders. At 50+ they become essential — which is exactly when someone is deep enough to be on a paid plan.

---

## Decision 14: Breaking-News Alerts — One Per Day for Free

Free Verified users get one breaking-news push alert per day. Paid tiers get unlimited.

- **Free Verified:** 1 breaking-news push per day
- **Verity and above:** Unlimited breaking-news alerts

**Why:** A breaking-news push is the single strongest re-engagement trigger available. Each push drives an app open, which drives an ad impression. Withholding it from free users leaves daily active usage on the table. The one-per-day cap ensures free users get the biggest story without notification fatigue, and unlimited at Verity gives paid users full coverage.

---

## Decision 15: No "Community Notes" — Organic Context Pinning Instead

There is no separate community notes submission system. Instead, the best comments **organically rise to become pinned article context** through community behavior:

1. A user writes a comment that adds context, clarification, or important information to the article
2. Other users **upvote** and **tag** the comment with a label (working name: "Article Context" or similar — name TBD)
3. Once a comment hits a threshold of upvotes + context tags, it gets **autopinned** to the article

**Why this is better than a dedicated community notes system:**
- No separate submission workflow to build or moderate
- Built on top of the quiz gate — every comment in the pool is from someone who proved comprehension
- Community self-selects the most valuable contributions
- Emergent quality, not curated quality
- No risk of a separate "notes" system being gamed independently from the discussion

**Open questions:**
- Exact threshold for autopinning (number of upvotes + context tags)
- Final name for the tag (Article Context, Adds Context, etc.)
- Whether autopinned comments can be un-pinned by continued community voting

---

## Decision 16: Anyone in the Discussion Can Tag Comments as Article Context

**Any user who passed the quiz (3/5+) on that article can tag comments as Article Context.** No additional threshold beyond quiz passage required.

**Rationale:** The quiz gate already guarantees every tagger read and understood the article. That's a higher quality bar than any other platform's voting system. Additional restrictions would slow the system for no meaningful quality gain.

**Autopinning threshold:** To be tuned post-launch based on real data. Starting framework:
- Percentage-based: ~10–15% of discussion participants tagging a comment
- Minimum floor of 5 context tags (prevents tiny discussions from autopinning off 2 people)
- Threshold scales with discussion size

---

## Decision 17: Text-to-Speech at Verity and Above

TTS ("listen to this article") is available at **Verity ($3.99) and all higher tiers.**

- Not an accessibility requirement — OS-level screen readers (VoiceOver, TalkBack) handle that independently
- TTS is a convenience/lifestyle feature: listen while commuting, cooking, exercising
- Placed at Verity because it extends session time and gives the mid-tier a tangible daily-use feature

---

## Decision 18: Offline Reading Cut from Launch

Offline article downloads are **removed from the feature set entirely.** Articles are short-form — there's no real use case for downloading a 3-minute read. Engineering effort is better spent elsewhere. Can revisit if users request it post-launch.

---

## Decision 19: Streak Freezes — Verity Pro and Kids Only

Streaks should mean something. Liberal freeze allowances undermine the whole mechanic.

- **Free:** No streak freezes
- **Verity ($3.99):** No streak freezes
- **Verity Pro ($9.99):** 2 per week
- **Verity Family (kids):** 2 per week

**Why Verity gets none:** The streak is the primary daily habit driver. If you're paying $3.99/month, you're already engaged enough to maintain it. Freezes at Verity Pro are a safety net for the power user who's deeply invested in a long streak — losing a 90-day streak to a sick day would feel punishing at the $9.99 tier.

**Why kids get 2:** Kids have less control over their schedules. A freeze prevents a kid from losing motivation because they had a busy school day.

---

## Decision 20: Ask an Expert — Paid Feature, Blurred for Free, Copy Detection

**How it works:**
- Experts are organized by category. Users can **@category** (routes to general expert queue) or **@expert-name** (routes to specific expert)
- Questions appear in a dedicated box within the article discussion, filterable by users
- The quiz gate still applies — you must pass 3/5 before you can ask or see the discussion at all

**Tier access:**
- **Paid users (Verity, Verity Pro, Verity Family):** Can @ experts and read full expert responses
- **Free Verified users:** Can see the discussion and see that experts answered (e.g., "2 experts answered this"), but **expert responses are blurred** — cannot read the content

**Copy/plagiarism protection:**
- AI-based scanning monitors comments for content that matches or closely mirrors expert responses
- If a paid user copies expert content and pastes it as their own comment (laundering expert answers to free users), the system detects it and warns the user
- This is in-platform detection, not external internet scanning

**Why blur instead of hide:** Showing "2 experts answered" with blurred content is one of the strongest conversion triggers on the platform. The user passed the quiz, they're in the discussion, they can see experts weighed in — but can't read it. That curiosity converts.

---

## Decision 21: Tagging/Mentioning Users Is Paid Only

Only paid users (Verity, Verity Pro, Verity Family) can @ mention other users in comments.

- **Free Verified:** Can post comments, reply, upvote/downvote — but cannot @ mention
- **Paid tiers:** Full @ mention access

**Rationale:** Mentions generate notifications that pull people back into the app. That's a valuable social mechanic worth gating behind paid. Free users can still participate in discussions — they just can't directly ping someone into a conversation.

---

## Decision 22: Category Supervisor Role (Name TBD)

A lightweight community role that replaces traditional moderators for category-level oversight. **Name is placeholder — "Category Supervisor" for now.**

**How you get it:**
- Hit a Verity Score threshold in a specific subcategory/category (threshold TBD)
- System automatically offers opt-in — no application, no nomination, no editorial approval
- Self-policing: the people who know a category best are the ones who watch over it

**What they can do:**
- **Flag** a comment — immediately goes to reporting queue for staff action (fast lane)
- **Report** a comment — goes under review with written explanation (standard path with more weight than a regular user's report)

**What they cannot do:**
- Hide/unhide comments
- Mute users
- Take any direct moderation action
- No power beyond flagging and reporting

**Key details:**
- Role is category/subcategory-specific — you're a supervisor for Climate Policy, not the whole platform
- A user can be a supervisor in multiple categories if they hit the threshold in each
- Regular users can still report through the normal system; supervisors get the escalated flag path

---

## Decision 23: Ad Strategy by Tier

No autoplay or pop-ups for signed-in users. Ads are respectful but structured to maximize revenue per tier.

### Anonymous (not signed in)
Heaviest ad load — they haven't committed to the platform.
- Interstitial on 2nd article open (doubles as sign-up CTA: "Sign up to remove this")
- Autoplay video ads allowed
- Pop-ups allowed if they're sign-up CTAs (not third-party ads)
- Goal: convert to signup or extract maximum value from a one-time visitor

### Free Verified
Present but respectful — user should feel ads exist but aren't aggressive.
- 1 native in-feed ad every 6–8 articles scrolled
- 1 banner at bottom of every article page (below content, never overlaying)
- 1 interstitial after every 3rd quiz completion
- No autoplay, no pop-ups, no mid-article interruptions
- ~4–5 impressions per 15-minute session

### Verity ($3.99)
Minimal — reward for paying while still generating some revenue.
- 1 small contextual banner at bottom of article pages only
- No in-feed ads, no interstitials, no quiz ads
- ~1–2 impressions per session

### Verity Pro ($9.99) and Verity Family ($14.99)
**Completely ad-free.** Zero ads anywhere.

### All tiers
- All ads clearly labeled "Sponsored"
- Targeting is **contextual** (based on article category), not behavioral
- Frequency capping enforced per user per session
- Fraud/bot filtering active, layered with Verity Score signals

---

## Decision 24: Verity Family Gets Unique Engagement Features

Verity Family is not just "Verity Pro + kid profiles." It has its own engagement mechanics that make the household experience unique.

**Family-specific features:**
- **Family Leaderboard:** Private leaderboard showing all family members' scores — kids and adults competing together
- **Shared Achievements:** Family-wide badges earned collectively (e.g., "Family read 50 articles this month," "3 family members maintained streaks this week")
- **Weekly Family Reading Report:** Personalized email/notification showing each family member's articles read, quiz performance, score changes, streak status, and how the family compares collectively
- **Cross-generational Reading Challenges:** Challenges the whole family can participate in together (e.g., "Everyone read 2 Science articles this week")

**Why this matters:**
- Makes Family a product families actively want, not just a parental control tool
- Creates dinner-table conversations about what everyone read
- Parents can point to shared engagement as a reason to use Verity Post instead of social media
- No other news platform offers shared family engagement — this is a genuine differentiator

---

## Decision 25: No Email Digest, No Category Email Alerts

Email digests and category email alerts are cut. They have bad open rates and compete with push notifications that do the same job better.

**Emails the platform sends:**
- Account essentials: verification, password reset, billing/receipts
- **Weekly Reading Report** (paid users): personalized progress update — articles read, quiz performance, score changes, streak status
- **Weekly Family Report** (Verity Family): same as above but includes all family members

**Everything else is push or in-app:**
- Breaking-news alerts → push
- Category updates → push (if added later)
- Social notifications (mentions, DM, expert replies) → push + in-app inbox

**Why:** "Here's how you did this week" gets opened. "Here are articles you might like" gets ignored. The weekly report is a re-engagement tool disguised as a progress update. Generic digests are newsletter spam.

---

## Decision 26: Search — Basic Free, Advanced Paid

- **Free Verified:** Basic keyword search only (type words, get results)
- **Verity and above:** Full advanced filters (date range, source, category, subcategory)

**Rationale:** A free user who can't search at all bounces when they come looking for a specific story — that's a lost session and lost ad revenue. Basic search keeps them on the platform. Advanced filters are power-user tools worth paying for.

---

## Decision 27: No Credibility Ratings on Sources or Articles

The original feature inventory listed "View source list with credibility ratings." This is **cut.**

- **Verity Score is the only scoring system on the platform**
- It applies to **users only** — not articles, not sources
- No source credibility ratings, no article quality scores
- The platform's credibility layer comes from quiz-gated discussions, expert badges, and organic context pinning — not from rating content itself

---

## Decision 28: Following Users Is Paid Only

Only paid users (Verity, Verity Pro, Verity Family) can follow other users.

- **Free Verified:** Cannot follow anyone
- **Paid tiers:** Full follow access

**Rationale:** Following builds a social graph that creates switching costs — a user with 30 follows has a curated information network they won't replicate elsewhere. That's valuable enough to gate behind paid. Free users can still see public profiles but can't build a network.

---

## Decision 29: No Reactions — Upvote/Downvote on Comments Only

- **Articles:** No reactions of any kind (no likes, no emoji)
- **Comments:** Upvote and downvote only
- **Display:** Both counts shown separately (e.g., "47 upvotes | 12 downvotes"), not a net score
- **Who can vote:** Any user who passed the quiz (3/5+) and is in the discussion — both Free Verified and paid
- No emoji reactions anywhere on the platform

---

## Decision 30: Role Hierarchy — Supervisors Flag, Mods Act, Editors Publish, Admins Manage

**Action chain:**
1. **Category Supervisors** monitor discussions and flag/report problems
2. **Moderators** review flags and take action (hide comments, mute users)
3. **Editors** handle content (create/edit/publish articles, manage quizzes)
4. **Admins** manage the platform (users, settings, billing, analytics)

**Moderators:**
- Can be community members (not staff-only)
- Can hide/unhide comments, mute users, act on flagged content
- Do NOT have editorial powers
- Requirements for becoming a moderator: **TBD** (likely involves Category Supervisor experience, high Verity Score, clean record — to be determined later)

**What's cut:**
- The old Moderator role that also reviewed expert applications and community notes — those responsibilities are redistributed to Editors and the organic context pinning system

---

## Decision 31: Leaderboard Access by Tier

- **Anonymous:** Top 3 global leaderboard only, with sign-up CTA
- **Free Verified:** Full global leaderboard (total Verity Score) — see own rank, surrounding users, chase the next person
- **Paid (Verity, Verity Pro, Verity Family):** Global leaderboard + category and subcategory leaderboards

**Rationale:** Category leaderboards expose per-category scores, which aligns with Decision 5 (category scores visible to paid only). Category boards are also where the real competition lives — being #3 in Marine Biology is achievable and motivating in a way #8,000 globally is not. Free users get hooked on the global board, then discover category competition is behind the upgrade.

---

## Decision 32: Profile Privacy Is Free, Customization Is Paid

**Free for all verified users (privacy controls):**
- Public/private profile toggle
- Show/hide self on leaderboard toggle

**Free profile basics:**
- Avatar (with generated color fallback), username, bio

**Paid tiers (Verity and above) get profile extras:**
- Custom banner image
- Shareable Profile Card
- Detailed activity history visible to others
- Per-category progress visible on public profile

**Rationale:** Privacy is a right, not a perk. Gating privacy controls behind payment is a bad look and a potential legal issue. Cosmetic customization and social features are the paid differentiator.

---

## Decision 33: Expert Queue with Private Back-Channel

**How it works:**
- When a paid user @'s a category or specific expert in an article discussion, the question goes into an **Expert Queue**
- Experts see incoming questions and can claim, answer, or decline them
- Alongside the queue, experts have a **private chat area** where they can discuss among themselves — coordinate answers, debate topics, share context before responding publicly

**Who can see the expert back-channel:**
- Experts
- Editors
- Admins
- Superadmins
- Owners

**Not visible to:** Regular users of any tier, moderators, or Category Supervisors

**Why a private back-channel matters:** Experts need a space to say "I'm not sure about this, does anyone have the latest data?" before posting a public answer. This improves answer quality without exposing the uncertainty to users.

---

## Decision 34: Family Plan — Two Flat Tiers, No Math

No per-kid pricing, no add-ons, no sliders. Two simple options:

| Plan | Price | Includes |
|------|-------|----------|
| **Verity Family** | $14.99/mo | Up to 2 adults + up to 2 kids |
| **Verity Family XL** | $19.99/mo | Up to 2 adults + up to 4 kids |

Both adults get full Verity Pro equivalent. Both plans include all family engagement features (family leaderboard, shared achievements, weekly family report, parental dashboard, device binding, kid session management).

**Why two flat prices:**
- Nobody has to do math at checkout
- No nickel-and-diming with per-kid add-ons
- A couple with 1 kid picks Family. Bigger household picks XL. Clear and instant.
- Even the smaller plan is $5 more than solo Verity Pro — healthy margin
- A maxed-out household at $19.99 is still less than two individual Verity Pro subscriptions ($19.98) so it feels like a deal

**Cheat prevention (adult pretending to be kid):**
- Kid profiles are functionally useless for adults: no discussions, no DMs, no following, no social features, kid-safe content only, daily time limits, parental dashboard tracks everything
- DOB locked at kid profile creation
- Restrictions themselves are the cheat prevention

**Device binding:**
- Adult accounts log in on any device normally
- Kid profiles accessible only from devices where a parent has logged in and approved with parent PIN

---

## Decision 35: Sponsored Quizzes — Yes, Reputable Sponsors Only

Sponsored quizzes are in as a monetization option. Brands/organizations pay to sponsor a quiz on a topic related to their domain. Users earn bonus points (double or similar).

**Sponsor requirements:**
- Must be a reputable, credible organization that aligns with the platform's standards
- Examples that work: Reuters sponsors geopolitics, Mayo Clinic sponsors health, NASA sponsors space science
- Examples that don't work: random consumer brands sponsoring unrelated quizzes
- Sponsors are clearly labeled but the quiz content is editorially controlled by Verity Post — sponsors don't write the questions

**Available to all tiers** — sponsored quizzes are content, not a paid feature. Free users see them (with ads), paid users see them (without ads). Everyone earns the bonus points.

---

## Decision 36: Weekly Recap Quizzes — Paid Only, No Artificial Challenges

No manufactured reading challenges. Instead: **weekly recap quizzes** that test what happened that week.

**How it works:**
- End of each week, the platform generates a quiz based on the week's coverage
- Category-specific versions available (e.g., "Your Climate Policy week in review")
- Questions test whether the user kept up with the news that week
- Results show what they got right and **which articles they missed** — driving them back to read those pieces

**Available to:** Verity, Verity Pro, Verity Family (paid only)

**Why this is better than reading challenges:**
- Rewards consistent readers naturally instead of creating artificial goals
- Shows users their gaps, which drives catch-up reading
- Reinforces retention — testing days later makes the material stick
- Category milestones and subcategory progress already track reading activity, no need to duplicate with challenges

---

## Decision 37: Article Timelines — Universal, With Revenue-Aware Link Access

Article timelines (showing related events chronologically) are visible to **everyone**, including anonymous users.

**Clicking through to linked articles from the timeline:**
- **Anonymous / Unverified:** Can only click links to articles that have ads on them (generates ad revenue). Links to ad-free articles are gated behind a sign-up prompt.
- **Free Verified:** Can access all linked articles (they see ads)
- **Paid tiers:** Can access all linked articles (no ads per their tier)

**Rationale:** Timelines are a discovery feature that drives deeper engagement. Letting anonymous users click through to ad-bearing articles maximizes impressions. Blocking access to ad-free articles for non-signed-in users ensures every anonymous page view generates revenue or a sign-up prompt.

---

## Decision 38: No Profile Cosmetics or Score-Based Unlockables

No profile frames, avatar borders, card backgrounds, or visual rewards tied to Verity Score milestones. Profiles stay clean.

---

## Decision 39: Reporting and Blocking — All Verified Users

Any verified user (Free and paid) can report content and block other users. These are safety features, not engagement features — never gated behind payment.

---

## Decision 40: Cancellation — DMs Immediate, 7-Day Grace, Then Frozen Profile

**When a paid user cancels:**

**Immediate:**
- DM access revoked instantly (can't send or read messages)

**7-day grace period:**
- Everything else continues working normally for 7 days
- User has time to export bookmarks, finish conversations, etc.

**After 7 days — frozen state:**
- Profile is visible but **locked and frozen** — scores, bookmarks, achievements all shown but no progression
- Backend continues tracking reading activity internally
- User sees their frozen profile every time they open the app — constant visual reminder of what they built
- Free-tier features still work (reading, quizzes with 2 attempts, comments on passed quizzes, 10 bookmarks, basic search)
- But Verity Score **does not progress visually**, even though they're still reading

**On resubscription:**
- Everything unlocks
- Score picks up from **where it was when they cancelled** — activity during the lapsed period does not count toward their score
- Bookmarks, achievements, collections all restored exactly as they were

**Why this works as win-back:**
- Frozen profile is a constant loss-aversion trigger
- "You've been reading for 2 months and none of it counted" drives resubscription
- Resubscribing feels like coming home, not starting over — everything is still there

---

## Decision 41: Quiz Explanations Shown After Every Attempt, All Tiers

Correct-answer explanations are displayed after every quiz attempt for all users regardless of tier.

- Failed attempt: see what you got wrong and why the correct answer is correct
- Passed attempt: same — reinforces learning
- Randomized question pools (10–15 per article) and no-repeat rules prevent sharing answers from being useful
- Education is the mission — showing someone they're wrong without explaining why contradicts the platform's purpose

---

## Decision 42: Annual Pricing — ~17% Discount Across All Tiers

All paid tiers offer monthly and annual billing. Annual saves roughly 17% with clean round numbers.

| Tier | Monthly | Annual | Savings |
|------|---------|--------|---------|
| **Verity** | $3.99/mo | $39.99/yr | ~17% |
| **Verity Pro** | $9.99/mo | $99.99/yr | ~17% |
| **Verity Family** | $14.99/mo | $149.99/yr | ~17% |
| **Verity Family XL** | $19.99/mo | $199.99/yr | ~17% |

**Why offer annual:**
- Upfront cash — even if they stop using the app in month 4, you have 12 months of revenue
- Annual subscribers churn at 5–10% vs 5–8% monthly — dramatically better retention
- Psychological commitment to the platform

**Why 17% and not deeper:** Going beyond 20% makes the monthly price look like a rip-off and trains users to wait for deals.

---

## Decision 43: No Free Trial

No trial periods for any paid tier. The free tier IS the trial.

- Free delivers the core experience: reading, quizzes, comments, streaks, achievements, 10 bookmarks
- Upgrades happen at natural friction points (bookmark cap, quiz retake, blurred expert answers) — not when a timer expires
- Trials invite binge-and-cancel behavior and generate angry reviews from forgotten charges
- Promo codes can handle one-off promotional access if needed

---

## Decision 44: 1-Week Kid Trial to Drive Family Plan Conversion

Any verified account (Free or paid) can create **one kid profile free for 1 week** without subscribing to a Family plan.

**How it works:**
- Parent creates a kid profile from their account
- Kid gets full kids experience for 7 days: reading, quizzes, streaks, achievements, expert sessions
- Near the end, parent gets a notification: "Your kid read X articles and has a 7-day streak. Their access ends tomorrow. Keep it going with Verity Family."
- If parent doesn't convert, kid profile is frozen (same mechanic as adult cancellation — visible but locked)

**Why 1 week:**
- Long enough for the kid to build a meaningful streak and reading habit
- Long enough for the parent to see consistent engagement, not just a one-day novelty
- The 7-day streak milestone is a natural loss aversion trigger — the kid just hit their first milestone and it's about to disappear

**Limits:**
- One kid profile trial per account, ever — no repeat trials
- Trial kid profile converts seamlessly into the Family plan kid profile (no data loss)

---

*More decisions to be added as discussion continues.*
