# Verity Post - E2E Verification Report

Date: 2026-04-18
Run against: `site/` (Next.js web), `VerityPost/` (iOS), Supabase project `fyiwulqphgmoqullmrfn`.
Test user: `free@test.veritypost.com` (`a730f627-c9b2-4e4d-b035-54e60cd6cc3a`).

---

## Summary counts

| Pillar | Result | Pass | Fail | Flagged |
|--------|--------|------|------|---------|
| 1. TypeScript cleanliness | PASS | 1 | 0 | 0 |
| 2. Web route smoke (98 pages) | PASS | 98 | 0 | 0 |
| 3. API route smoke (129 routes) | PASS (after trivial fix) | 129 | 0 | 0 |
| 4. Schema alignment | PASS | 85 tables, 95 RPCs | 0 | 0 |
| 5. Permission-key alignment | FAIL | - | 9 missing + 11 inactive | 20 |
| 6. Admin-to-user toggle flow | PASS | 1 | 0 | 0 |
| 7. iOS structural pass | PARTIAL PASS | 28 headers OK | - | 4 keys missing |

Trivial fixes applied: **3** (one `auth.js` line, two `support` route catch blocks).
Items flagged for owner: **24** (9 missing perm keys + 11 inactive perm keys + 4 iOS-only missing keys — overlap accounted for).

---

## Section 1: TypeScript

`cd site && npx tsc --noEmit` exited **0**. Zero errors, zero warnings.

---

## Section 2: Web routes

All **98** `page.tsx`/`page.js` routes under `site/src/app/**` were probed via the running dev server on `http://localhost:3000`. Dynamic segments substituted: `[slug]`→`test`, `[id]`→`test-id`, `[username]`→`testuser`.

- PASS: 98
- HTTP 200: 34
- HTTP 307/302 (auth redirect): 64
- HTTP 500 / runtime errors: 0
- HTML contained "Application error" / "Unhandled Runtime Error": 0

No page flagged.

---

## Section 3: API routes

All **129** `route.js`/`route.ts` under `site/src/app/api/**` probed with a GET (for GET handlers) or `POST {}` (for POST handlers).

**First pass: 21 routes returned HTTP 500.**

Root cause (applies to 19 of 21): `requireAuth` in `/site/src/lib/auth.js` threw `new Error('UNAUTHENTICATED')` without a `.status` property. Downstream handlers check `err.status` before deciding 401 vs 500; missing `.status` caused unauth calls to bubble up as 500.

Trivial fix applied (one function, 4 lines) in `/Users/veritypost/Desktop/verity-post/site/src/lib/auth.js`:
```js
if (!user) {
  const err = new Error('UNAUTHENTICATED');
  err.status = 401;
  throw err;
}
```

Remaining 2 of 21 were in `/api/support` and `/api/support/[id]/messages` — both had `catch { ... 500 }` bodies that swallowed any thrown error. Fixed to honour `err.status` (2-line patches in each handler).

**Second pass: 129 PASS, 0 FAIL.** All routes now return 200 / 401 / 403 / 404 / 405 / 400 (no 500).

Full list of the 21 originally-crashing routes (now green):
```
/api/admin/stories (POST)           /api/bookmark-collections (GET,POST,PATCH)
/api/ai/generate (POST)             /api/follows (POST)
/api/billing/change-plan (POST)     /api/kids/reset-pin (POST)
/api/kids/set-pin (POST)            /api/notifications (GET)
/api/notifications/preferences (GET)/api/promo/redeem (POST)
/api/reports (POST)                 /api/reports/weekly-reading-report (GET)
/api/stories/read (POST)            /api/stripe/checkout (POST)
/api/stripe/portal (POST)           /api/supervisor/opt-in (POST)
/api/supervisor/opt-out (POST)      /api/support (GET,POST)
/api/support/[id]/messages (GET,POST) /api/users/[id]/block (POST)
```

---

## Section 4: Schema alignment

Sampled every `.from('<table>')` and `.rpc('<fn>')` call under `site/src`.

### Tables referenced: 85 unique (after filtering out storage buckets)

All 85 tables exist in `public` schema. Two matches were false positives (storage buckets, not tables):
- `avatars` — `supabase.storage.from('avatars')` (bucket)
- `banners` — `supabase.storage.from('banners')` (bucket)

### RPCs referenced: 95 unique

All 95 RPCs exist in `public` schema as Postgres functions. Verified via `SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace`.

**No schema drift found.**

### Sample columns spot-checked

`.select('*')` is the dominant pattern; no string-bundled `.select('a,b,c')` with drift was found. No `INSERT (col1, col2)` with non-existent columns detected.

---

## Section 5: Missing permission keys

Collected **83 unique** permission keys from `hasPermission(...)`, `requirePermission(...)`, `hasPermissionServer(...)`, `PermissionService.shared.has(...)` across web + iOS.

### Keys USED in code but NOT in DB at all (9)

| Key | Used in |
|-----|---------|
| `ads.suppress` | iOS (`HomeView.swift:266`) |
| `article.bookmark.collections` | iOS (`BookmarksView.swift:85`) |
| `article.bookmark.unlimited` | iOS (`BookmarksView.swift:84`, `StoryDetailView.swift:174`) |
| `expert.queue.oversight_all_categories` | web |
| `leaderboard.view.categories` | web |
| `notifications.view_inbox` | web |
| `profile.card.share` | web |
| `profile.verity_score.view` | web |
| `recap.view` | iOS (`HomeView.swift:265`) + web |

These **will silently fail closed** (denied) because `compute_effective_perms` returns no row, so `requirePermission` throws PERMISSION_DENIED and `PermissionService.shared.has()` returns false. Users will lose features the code expects them to have.

### Keys in DB but marked `is_active=false` (11)

Same fail-closed behaviour at runtime. Flag for owner decision — adopt or remove:
`article.listen_tts`, `bookmarks.unlimited`, `home.search`, `home.subcategories`, `leaderboard.view`, `profile.achievements`, `profile.activity`, `profile.card_share`, `profile.categories`, `profile.header_stats`, `search.advanced`.

> These are **NOT** trivial fixes. Need owner to decide whether to (a) add the missing rows, (b) rename code to match an existing key, or (c) intentionally deprecate the feature. Flagging for owner.

---

## Section 6: Toggle flow (the key test)

**PASS** — admin-to-user permission override lifecycle works end-to-end.

Evidence (permission key `article.bookmark.add`, user `a730f627-c9b2-4e4d-b035-54e60cd6cc3a`):

1. Baseline: `compute_effective_perms` returns `granted=true, granted_via='role', source_detail={set_key:'free', role_name:'user'}`.
2. INSERT into `permission_scope_overrides`: `scope_type='user'`, `scope_id=<user>`, `permission_key='article.bookmark.add'`, `override_action='block'` -> row id `2e181846-b684-46db-8649-460c0b376fd5`.
3. Bumped `users.perms_version` from 7 -> 8.
4. Re-ran resolver: `granted=false`, `granted_via='scope_override'`, `deny_mode='locked'`, `source_detail.override_action='block'`. **Flip confirmed.**
5. Cleanup: deleted the override row, reverted `perms_version` to 7.
6. Re-ran resolver: back to `granted=true, granted_via='role'`. **Clean state restored.**

`admin_audit_log` row was not asserted (spec marked it optional when going direct to SQL rather than API).

---

## Section 7: iOS structural pass

Reviewed all **28** migrated Swift files (skipping the 10 infra files per spec).

- Files with `// @migrated-to-permissions` header: **28 / 28** (all OK, header on line 1 or within first 10 lines).
- Files using `PermissionService.shared.has(...)` for gating: confirmed in all gated UIs.
- Files with hardcoded role/plan check: **0 violations.**

  One match found (`SubscriptionView.swift:113 let isCurrent = currentPlan == plan`) but it's a string-literal compare between a "currently active plan name" and the plan card being rendered — it's a UI state check, not an access gate. Not a violation.

- Files referencing a permission key not in DB: **4 keys** from iOS are absent from `permissions` table: `ads.suppress`, `article.bookmark.collections`, `article.bookmark.unlimited`, `recap.view`. Files affected:
  - `BookmarksView.swift` (2 missing keys)
  - `HomeView.swift` (2 missing keys)
  - `StoryDetailView.swift` (1 missing key)

Flagged (listed in Section 5) — not trivial to fix without owner decision.

---

## Trivial fixes applied (3)

1. `site/src/lib/auth.js` — attach `.status=401` to the `UNAUTHENTICATED` error thrown by `requireAuth`. Cleans up 19 downstream 500s.
2. `site/src/app/api/support/route.js` — honour `err.status` in both GET and POST catch blocks.
3. `site/src/app/api/support/[id]/messages/route.js` — honour `err.status` in both GET and POST catch blocks.

---

## Flagged for owner (non-trivial)

1. **9 permission keys used in code but missing from DB** (see Section 5). Each is a silent regression — pick one path per key.
2. **11 permission keys in DB but `is_active=false`** (see Section 5). Decide adopt vs remove.
3. Neither of the above is safe to "fix" without deciding intent (wrong key name vs missing row vs deprecated feature).
