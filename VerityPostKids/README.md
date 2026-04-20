# VerityPostKids

Kids iOS app. **Live, DB-integrated, with real pairing.**

## Flow

```
App launch
  ↓
KidsAuth.restore()
  ├── Keychain has stored kid JWT    → home (paired)
  ├── Adult Supabase session present → KidPickerView (DEBUG dev-fallback)
  └── neither                         → PairCodeView  ← primary entry
```

### Pair path (production)

1. Parent on adult web/iOS taps "Pair a device" on a kid profile
2. Adult web calls `POST /api/kids/generate-pair-code` → returns `{ code, expires_at }` (15-minute TTL)
3. Parent reads the 8-char code aloud / shows QR to the child
4. Child enters code in **`PairCodeView`** on kids iOS
5. Kids iOS POSTs `/api/kids/pair` → server validates + mints a custom JWT signed with `SUPABASE_JWT_SECRET`
6. JWT carries `sub: kid_profile_id`, `role: authenticated`, `is_kid_delegated: true`
7. Kids iOS stores token in Keychain, sets it on the Supabase client via `auth.setSession()`
8. All subsequent queries use the kid JWT; RLS branches on `auth.jwt() ->> 'kid_profile_id'`

### Dev fallback (DEBUG builds only)

- Adult signs in with email/password on the kid device, picks a kid profile from their list
- Queries use the adult's session, RLS resolves via `parent_user_id = auth.uid()` path
- Not COPPA-compliant — blocked in release builds

## Server-side pieces (adult web)

| Where | What |
|---|---|
| `schema/095_kid_pair_codes_2026_04_19.sql` | `kid_pair_codes` table + RLS + `generate_kid_pair_code(uuid)` RPC + `redeem_kid_pair_code(text, text)` RPC (service-role only) |
| `web/src/app/api/kids/generate-pair-code/route.js` | Parent-auth-gated POST. Wraps `generate_kid_pair_code` RPC. Returns `{ code, expires_at }`. |
| `web/src/app/api/kids/pair/route.js` | Public POST (rate-limited 10/min per IP). Calls `redeem_kid_pair_code` via service role, then mints a JWT with `SUPABASE_JWT_SECRET`. Returns `{ access_token, kid_profile_id, kid_name, expires_at }`. |

**Env var needed to deploy:** `SUPABASE_JWT_SECRET` in Vercel. Same value the Supabase project uses to sign auth JWTs (Settings → API → JWT Secret).

## Kids iOS pieces (`VerityPostKids/VerityPostKids/`)

**App entry:**
- `VerityPostKidsApp.swift` — `@main`
- `KidsAppRoot.swift` — gated flow (pair / picker / home)

**Auth + pairing:**
- `PairingClient.swift` — singleton, handles `POST /api/kids/pair`, Keychain persistence, Supabase session setup
- `PairCodeView.swift` — 8-char code entry with per-box boxes + OTP keyboard autofill
- `KidsAuth.swift` — observable state. `kid` (paired), `adultSession` + `availableKids` (dev fallback)
- `SignInView.swift` — DEBUG-only dev fallback sign-in
- `KidPickerView.swift` — DEBUG-only kid picker for dev fallback

**State + data:**
- `KidsAppState.swift` — `.load(forKidId:kidName:)` fetches from Supabase
- `Models.swift` — `KidProfile`, `VPCategory`, `KidArticle`, `QuizAttemptInsert`, `ReadingLogInsert`, `KidAchievement`
- `SupabaseKidsClient.swift` — singleton client

**Home + scenes:**
- `GreetingScene.swift` — V3 Morning Ritual, live
- `StreakScene.swift`, `QuizPassScene.swift`, `BadgeUnlockScene.swift`

**Primitives:**
- `KidsTheme.swift`, `ParticleSystem.swift`, `CountUpText.swift`, `FlameShape.swift`

## RLS model — how "their own DB area" works

See `docs/planning/product-roadmap.md` §7.5 for the full write-up. Short version:

- **Kid-facing tables** (`kid_profiles` self-row, `articles WHERE is_kids_safe`, `reading_log`/`quiz_attempts`/`kid_leaderboard_*`/`kid_achievements` scoped to the paired `kid_profile_id`) → allow when the JWT carries `is_kid_delegated: true` and `kid_profile_id` matches
- **Parent-only tables** (full `users`, `subscriptions`, `comments`, `messages`/DMs, `admin_*`) → deny when `auth.jwt() ->> 'is_kid_delegated'` is truthy
- **No granular permissions inside kid scope** — kids see everything kid-safe, nothing else. The "true/false" check is binary per table.

Today's migration 095 ships the pairing infrastructure. A follow-up migration (096+) extends the kid-scope RLS clauses across the read/write tables. The scaffold works today because kid sessions are functionally equivalent to authenticated sessions for PostgREST — the tighter clauses land when ready.

## Build + run

```bash
cd VerityPostKids
xcodegen generate
open VerityPostKids.xcodeproj
# In Xcode: pick iPhone 15 Pro simulator (iOS 17+), Cmd+R
```

### First-run paths

- **If SUPABASE_JWT_SECRET is set in Vercel + migration 095 applied:** generate a pair code (for now, `curl -X POST 'https://veritypost.com/api/kids/generate-pair-code' ...` as a parent, until parent UI ships). Enter in PairCodeView.
- **Dev / local:** set `SUPABASE_URL` + `SUPABASE_KEY` env vars in the Xcode scheme, run in DEBUG. If no pair flow is ready, SignInView's email/password path works.

## Bundle ID

`com.veritypost.kids` — separate App Store record, new TestFlight group.

## Still TODO before App Store submission

- **Parent UI** for "Pair a device" button in adult web's `/profile/kids/[id]` page
- **RLS follow-up migration (096)** extending `is_kid_delegated` clauses to parent-only tables
- **Article reader + real quiz engine** (P3c)
- **Parental gates** on any external link / settings / IAP — mandatory for Made for Kids
- **Privacy policy URL + COPPA contact** — mandatory for submission
- **Sentry / analytics** — explicitly excluded (COPPA forbids third-party analytics)
- **App Store Connect record** — bundle ID `com.veritypost.kids`, Made for Kids toggle

## Reference docs

- `docs/planning/FUTURE_DEDICATED_KIDS_APP.md` — architecture + COPPA + auth rework
- `docs/planning/product-roadmap.md` §7 — sub-phases, prereqs, acceptance criteria
- `schema/095_kid_pair_codes_2026_04_19.sql` — pairing table + RPCs
- `VerityPost/VerityPost/possibleChanges/KidModeV3.html` — original V3 design + animation spec
