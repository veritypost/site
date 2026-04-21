# Test Accounts — ready-to-use credentials

All accounts are seeded in live Supabase (`fyiwulqphgmoqullmrfn`). Re-run `node scripts/seed-test-accounts.js` to reset passwords or re-apply special states.

Anonymous testing: open in incognito, no login needed.

---

## Main test accounts (roles + special states)

| # | Username | Email | Password | Role | Plan | Verified | Special | What to test |
|---|---|---|---|---|---|---|---|---|
| 1 | `test_owner` | `owner@test.veritypost.com` | `TestOwner1!` | Owner | Family | Yes |  | Full system access. Everything. |
| 2 | `test_admin` | `admin@test.veritypost.com` | `TestAdmin1!` | Admin | Premium | Yes |  | Full admin panel. |
| 3 | `test_editor` | `editor@test.veritypost.com` | `TestEditor1!` | Editor | Premium | Yes |  | Content management, pipeline. |
| 4 | `test_moderator` | `moderator@test.veritypost.com` | `TestMod1!` | Moderator | Premium | Yes |  | Moderation queue, reports. |
| 5 | `test_anon` | `` | `` | Anonymous |  |  |  | Use incognito. No DB row. |
| 6 | `test_noemail` | `noemail@test.veritypost.com` | `TestNoEmail1!` | User | Free | No | Email unverified | Verify email banner, blocked features. |
| 7 | `test_free` | `free@test.veritypost.com` | `TestFree1!` | User | Free | Yes |  | Free tier limits, ads, 5 comments/day. |
| 8 | `test_premium` | `premium@test.veritypost.com` | `TestPremium1!` | User | Premium | Yes |  | Unlimited, ad-free, bookmarks, DMs. |
| 9 | `test_family` | `family@test.veritypost.com` | `TestFamily1!` | User | Family | Yes | 2 kid profiles | Kid profiles, PINs, parental dashboard. |
| 10 | `test_kid_1 (Emma)` | `` | `` |  |  |  | Kid profile | Kid-safe content, kid quizzes. |
| 11 | `test_kid_2 (Liam)` | `` | `` |  |  |  | Kid profile | Second kid, different age. |
| 12 | `test_expert` | `expert@test.veritypost.com` | `TestExpert1!` | Expert | Premium | Yes | Verified expert | Expert badge, discussions, weighted votes. |
| 13 | `test_educator` | `educator@test.veritypost.com` | `TestEdu1!` | Educator | Premium | Yes | Verified educator | Educator badge, discussions. |
| 14 | `test_journalist` | `journalist@test.veritypost.com` | `TestJourn1!` | Journalist | Premium | Yes | Verified journalist | Journalist badge, submit articles. |
| 15 | `test_banned` | `banned@test.veritypost.com` | `TestBanned1!` | User | Premium | Yes | Banned | Cannot post/comment. Ban UI. |
| 16 | `test_muted` | `muted@test.veritypost.com` | `TestMuted1!` | User | Free | Yes | Muted 24h | Read-only. Muted banner. |
| 17 | `test_shadow` | `shadow@test.veritypost.com` | `TestShadow1!` | User | Free | Yes | Shadow banned | Content invisible to others. |
| 18 | `test_newbie` | `newbie@test.veritypost.com` | `TestNewbie1!` | User | Free | Yes | Brand new | Empty states, first actions. |
| 19 | `test_veteran` | `veteran@test.veritypost.com` | `TestVet1!` | User | Premium | Yes | Luminary, 365 streak | Top leaderboard, all achievements. |

## Kid profiles (under `test_family`)

Log in as `family@test.veritypost.com` / `TestFamily1!` to switch into these.

| Name | Age range | PIN | Notes |
|---|---|---|---|
| Emma | 8-10 | `1234` | Younger kid — kid-safe content, kid quizzes |
| Liam | 11-13 | `5678` | Older kid — second profile, different age band |

## Community users (30 generic accounts for comments/leaderboard noise)

All are `user` role, `free` plan, email-verified. Passwords follow `Community1!N` pattern.

| # | Username | Email | Password |
|---|---|---|---|
| 1 | `alex_reads` | `alex_reads@community.veritypost.com` | `Community1!0` |
| 2 | `jordan_writes` | `jordan_writes@community.veritypost.com` | `Community1!1` |
| 3 | `sam_thinks` | `sam_thinks@community.veritypost.com` | `Community1!2` |
| 4 | `taylor_explores` | `taylor_explores@community.veritypost.com` | `Community1!3` |
| 5 | `morgan_learns` | `morgan_learns@community.veritypost.com` | `Community1!4` |
| 6 | `casey_discovers` | `casey_discovers@community.veritypost.com` | `Community1!5` |
| 7 | `riley_reports` | `riley_reports@community.veritypost.com` | `Community1!6` |
| 8 | `quinn_shares` | `quinn_shares@community.veritypost.com` | `Community1!7` |
| 9 | `avery_watches` | `avery_watches@community.veritypost.com` | `Community1!8` |
| 10 | `blake_studies` | `blake_studies@community.veritypost.com` | `Community1!9` |
| 11 | `drew_reads` | `drew_reads@community.veritypost.com` | `Community1!10` |
| 12 | `charlie_writes` | `charlie_writes@community.veritypost.com` | `Community1!11` |
| 13 | `kai_thinks` | `kai_thinks@community.veritypost.com` | `Community1!12` |
| 14 | `rowan_explores` | `rowan_explores@community.veritypost.com` | `Community1!13` |
| 15 | `sage_learns` | `sage_learns@community.veritypost.com` | `Community1!14` |
| 16 | `river_discovers` | `river_discovers@community.veritypost.com` | `Community1!15` |
| 17 | `phoenix_reports` | `phoenix_reports@community.veritypost.com` | `Community1!16` |
| 18 | `harper_shares` | `harper_shares@community.veritypost.com` | `Community1!17` |
| 19 | `emery_watches` | `emery_watches@community.veritypost.com` | `Community1!18` |
| 20 | `dakota_studies` | `dakota_studies@community.veritypost.com` | `Community1!19` |
| 21 | `skyler_reads` | `skyler_reads@community.veritypost.com` | `Community1!20` |
| 22 | `jamie_writes` | `jamie_writes@community.veritypost.com` | `Community1!21` |
| 23 | `reese_thinks` | `reese_thinks@community.veritypost.com` | `Community1!22` |
| 24 | `finley_explores` | `finley_explores@community.veritypost.com` | `Community1!23` |
| 25 | `hayden_learns` | `hayden_learns@community.veritypost.com` | `Community1!24` |
| 26 | `lennon_discovers` | `lennon_discovers@community.veritypost.com` | `Community1!25` |
| 27 | `marley_reports` | `marley_reports@community.veritypost.com` | `Community1!26` |
| 28 | `eden_shares` | `eden_shares@community.veritypost.com` | `Community1!27` |
| 29 | `remy_watches` | `remy_watches@community.veritypost.com` | `Community1!28` |
| 30 | `aspen_studies` | `aspen_studies@community.veritypost.com` | `Community1!29` |

---

## Testing order suggestion

1. **`test_anon`** — hit the site in incognito. Verify: public pages load, gated features show lock prompts.
2. **`test_newbie`** — freshly-verified account, no activity. Verify: empty states render, first-action prompts.
3. **`test_free`** — active free-tier user. Verify: ad slots show, daily comment cap (5) enforces, bookmark cap enforces.
4. **`test_premium`** — Verity+. Verify: ads removed, DMs unlocked, unlimited bookmarks, follow works.
5. **`test_family`** — Family plan with 2 kids. Verify: kid profile switcher, PIN entry, kids-safe content, parental dashboard.
6. **`test_expert`** — verified expert. Verify: expert badge, expert queue access, weighted votes.
7. **`test_educator` / `test_journalist`** — verified but different role. Verify: role badges render correctly.
8. **`test_moderator`** — moderation queue visible, comment hide/unhide works.
9. **`test_editor`** — admin panel partially visible (stories + pipeline, not everything).
10. **`test_admin`** — full admin panel.
11. **`test_owner`** — full system access.
12. **`test_noemail`** — pre-verification state. Verify: verify-email banner, feature locks on unverified.
13. **`test_banned`** — banned UI, cannot post/comment.
14. **`test_muted`** — 24h mute banner, read-only.
15. **`test_shadow`** — shadow-banned — content visible to self only.
16. **`test_veteran`** — Luminary tier, 365-day streak, top leaderboard.
