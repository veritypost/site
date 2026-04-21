# Verity Post — Full Feature Inventory

Part 1: every feature the app can do.
Part 2: the role/tier ladder and who should get what.

---

# Part 1 — Every feature

## Reading & content
- Browse personalized home feed
- Search (keyword, date range, source, category, subcategory)
- Browse categories and subcategories
- Open articles (body, headline, byline, cover, published/verified timestamps)
- View article timeline of related events
- View source list with credibility ratings
- Read community notes on articles
- View related articles / article clusters
- View article author profiles
- Breaking news banner
- Text-to-speech ("listen" mode)
- Offline download
- Ad-free reading

## Quizzes
- Take an article's quiz (first attempt)
- Retake a quiz unlimited times
- View quiz history
- See correct-answer explanations
- Earn points per correct, perfect-score bonus, first-quiz-of-day bonus

## Comments
- View comments thread
- Sort Top / Newest
- Filter to expert-only replies
- View pinned comments + permalinks
- View vote counts and edit history
- Post comment
- Reply to a comment
- Edit own / delete own
- Upvote / downvote / remove vote
- Mention / tag other users
- Report comment or user
- Block / unblock users

## Expert
- Ask an expert a question from an article
- View expert responses
- Submit an expert application
- Post to the Expert Discussion board
- Reply + vote in expert discussions
- Claim / answer / decline questions in the Expert Queue

## Social
- Follow / unfollow users
- React to articles and comments
- View other users' public profiles
- View other users' Verity scores
- Submit community notes
- Vote helpful / not-helpful on community notes

## Messaging
- 1:1 direct messages
- Group conversations
- Reply to specific message
- Edit own / delete own messages
- Mark conversations read
- Mute / leave / archive conversations
- Block DMs
- Real-time updates across devices

## Bookmarks
- Bookmark any article
- Organize into named collections
- Add notes to bookmarks
- Reorder / export bookmarks

## Scoring & tiers
- Earn Verity Score points for tracked actions
- Progress through tiers (newcomer → reader → informed → analyst → scholar → luminary)
- Earn 27+ achievements (reading, quiz, streak, social, category, secret)
- Maintain daily reading streaks
- Streak milestone bonuses (7, 30, 90, 365 days)
- Use streak freezes

## Leaderboard
- View global leaderboard
- Filter by category / subcategory
- Weekly / monthly / all-time
- See own rank + surrounding users
- Toggle show / hide self from leaderboard

## Profile
- View own header (avatar, username, tier, 4 stats)
- Edit profile (name, username, bio, avatar, banner, country, locale, timezone, DOB, gender)
- Upload / change avatar (with generated color fallback)
- Public shareable Profile Card
- View own activity history (reads, quizzes, comments)
- View per-category progress with milestones
- View own achievements
- Control profile visibility (public / private)
- Toggle show-activity / show-on-leaderboard / allow-messages

## Family / kids
- Create up to 4 kid profiles under one family plan
- Set kid display name, avatar, DOB, reading level, daily minutes limit
- Set per-kid PIN
- Set parent PIN
- 5-attempt PIN lockout, 15-min cooldown
- Parent PIN overrides kid lockout
- Clear kid lockout with parent PIN
- Bind a device as parent-only, kid-only, or shared
- Kid profile selector on shared devices
- Per-category permissions per kid
- Parental dashboard (kid reading activity)
- COPPA consent tracking

## Kids parallel experience (during an active kid session)
- Kids Home with kid-safe categories
- Kid daily-time-remaining display
- Kids Article view + timeline + TTS
- Kids Quiz take / retake / history
- Kids Bookmarks
- Kids Reading Log
- Kids Streaks + Achievements
- Kids Leaderboard
- Kid can ask parent / share story to parent
- Separate kid scoring pool
- Kid-eligible achievements only

## Authentication
- Sign up (email + password, OAuth)
- Log in / log out
- Reset password via email
- Update email with re-verification
- Change password (requires current)
- Enable MFA
- View active sessions across devices
- Revoke individual session
- Revoke all other sessions
- Push-token registration per session (APNs / FCM / web-push / Expo)
- Device-bound push tokens
- Cross-platform session sync

## Notifications
- In-app inbox
- Push notifications
- Breaking-news push alerts
- Email digests (daily / weekly)
- Category-specific alerts
- Subscription / billing emails
- Per-alert-type channel config (push / email / in-app / SMS)
- Quiet hours
- Mark read / unread (individual or bulk)
- Filter by type

## Billing
- Purchase Premium / Family via Stripe (web)
- Purchase via Apple IAP or Google Play Billing
- Redeem promo codes
- Trial period
- Upgrade / downgrade
- Pause / resume
- Cancel (immediate or end-of-period)
- Invoice history with PDF download
- Update payment method
- Grace period on failed payment
- Win-back offer after churn
- Family plan up to 5 total members

## Data rights (GDPR / CCPA)
- Request data export
- Download export bundle
- Request account deletion (scheduled)
- Cancel pending deletion
- View consent records
- Update consent preferences

## Support
- Create support ticket
- Attach screenshots + device info
- Reply to ticket messages
- Rate resolved tickets
- View own ticket history

## Moderation
- View report queue
- Dismiss reports
- Hide / unhide comments
- Mute users
- Bulk-action comments
- Review community notes
- Approve / reject / revoke expert applications
- View hidden content

## Editorial
- Create / edit article drafts
- Schedule article publishing
- Unpublish / retract articles
- Verify articles
- Manage article quizzes, timelines, sources
- Tag articles with categories
- Manage RSS feeds (add, enable, configure polling)
- Run the content pipeline
- Manage categories

## Admin
- Manage users (edit, ban, unban, assign roles)
- Manage roles and permission sets
- Edit app-wide settings
- Toggle feature flags (per platform / version / cohort / rollout %)
- Edit subscription plans and plan features
- Manage promo codes
- Edit email templates
- Edit blocked-words list
- Manage reserved usernames
- View analytics dashboard
- View audit log
- Billing dashboard
- Manage ad placements / units / campaigns
- Manage sponsors
- Cohort campaigns (email / push / in-app) with open / click / conversion tracking
- Deep-link management

## Superadmin-level
- Promote / demote admins
- Impersonate any user
- Toggle emergency kill-switches
- Generate access codes (with role / plan grants)

## Owner-level
- Promote / demote superadmins
- Nuclear reset / delete-everything
- Edit Stripe / Apple / Google billing configuration

## Platform-level plumbing (available to builders of the app)
- Real-time updates via Supabase channels
- Feature-flag rollouts with platform / version / rollout-% / cohort targeting
- A/B test variant serving
- Early-access via invite / access code
- Deep-links with UTM attribution
- Web3 auth scaffolding
- SAML SSO scaffolding

## Rate-limiting
- Per-user, per-endpoint request caps
- Burst + cool-down
- Rate-limit events logged

## Read-tracking
- Session-scoped reading log (time on page, percentage, completed)
- Per-kid reading log
- Analytics events (screen views, clicks, article opens, quiz actions)
- Deep-link attribution on app open

## Ads
- Ad-free experience for premium+
- Targeted ads via placements / units / campaigns for free users
- Frequency capping per user / per session
- Click + impression tracking
- Fraud / bot filtering

---

# Part 2 — Role & tier ladder (who gets what)

Two orthogonal dimensions stack on each user:

1. **Account tier** (auth / billing state) — controls plan-gated and verification-gated features
2. **Role** (staff hierarchy) — controls moderation, editorial, and admin features

A given user has one account tier **and** zero-to-many roles.

---

## Account tiers

### Anonymous (not signed in)
- Read public articles + timelines + sources
- View public profiles
- View public leaderboard (top 3 with sign-up CTA)
- Sign up / log in

### Unverified (signed in, email not verified)
- Everything anonymous gets, PLUS:
- Home search + category/subcategory browse
- Minimal profile view (Settings + Contact Us + verify-email banner)
- Log out
- Request password reset

### Verified Free
- Everything unverified gets, PLUS:
- View + post comments
- Take quizzes (1x each)
- Earn Verity Score, streaks, achievements
- Full profile (header stats, profile card, activity, categories, achievements)
- Follow, react, report, block
- Full leaderboard view
- Submit community notes
- Apply to become an expert
- Cancel / delete own account
- Export own data

### Verified Premium
- Everything verified-free gets, PLUS:
- Direct messages / conversations
- Bookmarks + collections
- Retake quizzes
- Ask an expert
- View expert responses
- View other users' Verity scores
- Tag / mention users in comments
- Ad-free
- Breaking-news alerts
- Email digest
- Category alerts
- Advanced search
- Text-to-speech
- Offline reading
- Streak freezes (3/wk)

### Verified Family
- Everything premium gets, PLUS:
- Create up to 4 kid profiles
- Kids parallel experience
- Parental dashboard
- Per-kid category permissions, PINs, daily time limits
- Device binding (parent / kid / shared)
- Kid session management

---

## Staff roles (layered on top of an account tier)

### User (default role for everyone)
- No extra permissions beyond account tier

### Expert / Educator / Journalist (verified subject-matter roles)
- Answer questions in the Expert Queue
- Expert reply shown with badge in comments
- Post + reply + vote in Expert Discussions
- Show expert / educator / journalist badge publicly

### Moderator
- Everything expert gets, PLUS:
- View + triage report queue
- Hide / unhide comments
- Mute users
- Approve / reject community notes
- View hidden content
- Review expert applications

### Editor
- Everything moderator gets, PLUS:
- Create / edit / publish / schedule / retract articles
- Verify articles
- Manage quizzes, timelines, sources
- Manage RSS feeds + run the pipeline
- Manage categories

### Admin
- Everything editor gets, PLUS:
- Manage users (edit, ban, assign roles)
- Edit app settings
- Toggle feature flags
- Edit plans, plan features, promo codes
- Edit email templates, blocked words, reserved usernames
- Analytics dashboard
- Audit log
- Billing dashboard
- Manage ads, sponsors, cohorts, campaigns, deep-links

### Superadmin
- Everything admin gets, PLUS:
- Promote / demote admins
- Impersonate any user
- Toggle kill-switches
- Generate access codes

### Owner
- Everything superadmin gets, PLUS:
- Promote / demote superadmins
- Nuclear reset / delete-everything
- Edit payment-provider configuration (Stripe / Apple / Google)

---

## Recommended assignments

| User type | Account tier | Role(s) |
|---|---|---|
| Casual visitor | Anonymous | — |
| New signup (before clicking verify link) | Unverified | `user` |
| Regular reader | Verified Free | `user` |
| Paying reader | Verified Premium | `user` |
| Household | Verified Family | `user` |
| Subject expert | Verified Free or Premium | `expert` (also `educator` or `journalist` as fit) |
| Community mod | Verified Free | `moderator` |
| Content editor / producer | Verified Free | `editor` |
| Customer support | Verified Free | `moderator` or `admin` |
| Platform admin | Verified Premium | `admin` |
| Founder / CTO | Verified Family | `owner` or `superadmin` |

A user can hold multiple roles (e.g. an editor who is also an expert). They get the union of all their permissions. Plan tier and roles stack independently.
