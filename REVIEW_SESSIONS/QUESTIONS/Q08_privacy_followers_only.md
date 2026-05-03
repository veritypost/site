# Q08 — Privacy "Followers-only" — feature or copy lie?

**Source finding:** PM-2 [P1] in `REVIEW_REPORT.md` lines 1384–1390, restated cross-platform at lines 2058–2076.
**Recommendation: Option B — fix the copy. Drop "Followers-only" from the UI. Build follower-gated visibility post-launch only if it shows up as a real user request.**

---

## TL;DR

- The "Followers-only" option in `PrivacyCard.tsx` writes the same DB value as "Private" (`profile_visibility = 'private'`).
- `/u/[username]` already blocks `'private'` for all non-self viewers — that's correct.
- **More importantly:** the page reads from `public_profiles_v`, a SECURITY DEFINER view that filters `WHERE profile_visibility = 'public'` at the source. The view returns **no row** for a `'private'` user, so the page hits the `notFoundFlag` branch on line 198, not the line-207 gate PM-2 flagged. Either way the result is the same — followers can't see the profile — but the actual gate is one layer deeper than PM-2's evidence shows. To re-enable a true followers-only path, the view needs reworking too, not just a `follows` lookup on the page.
- **Adoption today: 6 users private, 1 public, 0 hidden, 0 "followers-only".** All 6 private rows likely come from the `column_default = 'private'` on the `users` row, not from any user clicking "Followers-only" with intent.
- iOS has zero privacy-visibility UI (web-only setting today). Whatever ships needs a parallel iOS path or none.
- **Net:** the cheapest correct fix is to delete the lie. Building the feature requires a view rewrite, an RPC, an iOS settings card, RLS on `follows` review, and copy across two web cards — for a feature with no demonstrated demand at this scale.

---

## What the UI says vs what it does

`web/src/app/profile/settings/_cards/PrivacyCard.tsx`:

```tsx
// line 158
const dbValue = next === 'public' ? 'public' : 'private';
const ok = await persistField('profile_visibility', dbValue);
// ...
// line 165
toast.success(next === 'public' ? 'Profile is public.' : 'Profile is followers-only.');
```

The audience picker on lines 304–326 offers three options:

```tsx
<AudienceOption label="Public"        body="Anyone with the link can view your profile." />
<AudienceOption label="Followers only" body="Only people who already follow you can view. New visitors see a private notice." />
<AudienceOption label="Hidden"        body="Cut everyone off immediately. Profile becomes invisible and all current followers are removed." />
```

Picking "Followers only" persists `'private'` and toasts "Profile is followers-only."

The body copy further claims **"Only people who already follow you can view."** This is false. No call site enforces a follow-relationship check.

`web/src/app/profile/_sections/PublicProfileSection.tsx:285` repeats the same lie from the other settings card:

```tsx
{v === 'public'
  ? 'Anyone with the link can view.'
  : 'Only your followers can view.'}
```

(That card already only offers Public/Private — no "Followers" option — but its sub-label still claims followers can view.)

---

## What actually gates the profile page

PM-2's evidence quotes line 207-218 of `web/src/app/u/[username]/page.tsx`:

```tsx
if (
  (targetRow.profile_visibility === 'private' || targetRow.profile_visibility === 'hidden') &&
  user.id !== targetRow.id
) {
  // ... setPrivateProfile(true) ...
  return;
}
```

That gate exists. But the row never reaches it for a private user, because line 190–196 selects from `public_profiles_v`, which I confirmed via `pg_views`:

```sql
CREATE VIEW public_profiles_v AS
  SELECT id, username, display_name, ... profile_visibility, ...
  FROM users u
  WHERE profile_visibility = 'public'
    AND COALESCE(is_banned, false) = false
    AND deletion_scheduled_for IS NULL;
```

So for any private user, `targetRow` is `null` and the page falls through to line 197–201:

```tsx
if (!targetRow) {
  setNotFoundFlag(true);
  setLoading(false);
  return;
}
```

The line-207 gate is dead defense-in-depth — kept in case the view ever gets relaxed. The `setPrivateProfile(true)` "This profile is private" branch is currently unreachable because the view filters first. (`web/src/app/u/[username]/layout.js:33` and `web/src/app/card/[username]/page.js:63` repeat the same defense-in-depth check.)

iOS does the same thing in `VerityPost/VerityPost/PublicProfileView.swift:368-385` — also reads `public_profiles_v`, also has a redundant client-side gate.

**Implication for Option A:** restoring the followers-only path is *not* a one-line `follows` lookup on the page. Either the `public_profiles_v` view has to be relaxed (and a per-row check added on the page) or a parallel SECURITY DEFINER RPC has to be added that takes the viewer's `auth.uid()` and returns the profile if `(visibility='public') OR (visibility='followers_only' AND follower_exists) OR (id = auth.uid())`. Then iOS PublicProfileView and the OG `card/[username]` and the `u/[username]/layout.js` metadata route all have to switch to the new path. Bigger blast radius than PM-2's "add a follows lookup."

---

## DB schema state

```sql
-- column shape
column_name        | data_type         | column_default
profile_visibility | character varying | 'private'::character varying
```

- **No CHECK constraint** on the column. Today only `'public' | 'private' | 'hidden'` are written, but the DB would accept any string.
- **No `'followers_only'` value** anywhere in migrations or code (`grep -rn "followers_only" supabase/migrations web/src VerityPost` returns zero hits).
- **Default is `'private'`** — every new user is born private. This explains the 6:1 split.

`follows` table is the standard `(follower_id, following_id, created_at, ...)`. RLS on `follows.SELECT` is `(follower_id = auth.uid()) OR (following_id = auth.uid()) OR true` — i.e. effectively public — so a follow-relationship check from the page is permission-feasible even from the browser, no RPC required for that step.

No `is_follower(follower_id, following_id)` RPC exists. Closest helpers:
- `toggle_follow(p_follower_id uuid, p_target_id uuid) → jsonb`
- `update_follow_counts(follower uuid, following uuid, amount integer) → void`

---

## User-count quantification

```sql
SELECT profile_visibility, COUNT(*) FROM public.users GROUP BY profile_visibility;
```

| visibility | count |
|---|---|
| private | 6 |
| public  | 1 |

Total users: 7. **Zero rows are `'hidden'`. Zero rows are `'followers_only'` (string doesn't exist in the column).**

The 6 private rows are almost certainly from the `column_default = 'private'`, not from anyone deliberately picking "Followers-only". Migration cost of removing the option is essentially zero — owner can decide whether to leave existing private rows alone or one-time UPDATE them to `'public'` if onboarding intent was misread.

---

## iOS state

```bash
$ grep -rn "profile_visibility" VerityPost/VerityPost/
VerityPost/Models.swift:32:    /// Mirrors `users.profile_visibility`. Three states: 'public' (default),
VerityPost/Models.swift:37:    var profileVisibility: String?
VerityPost/Models.swift:83:        case profileVisibility = "profile_visibility"
VerityPost/PublicProfileView.swift:359-385:  // reads view, gates 'private'/'hidden' as defense-in-depth
```

iOS reads visibility but **has no settings UI to change it** — `SettingsView.swift` has no privacy-visibility picker (PM-10 verified at lines 2062, 2074-2076 of REVIEW_REPORT). The setting is web-only today.

So whatever decision ships here:
- Option A (build the feature) → must add an iOS settings card with the same three options, plus update `PublicProfileView`'s read path to whatever the new SECURITY DEFINER RPC is.
- Option B (delete the option) → no iOS UI to update; only web has the lie. iOS already correctly treats `'private'` as not-readable.

Kids iOS (`VerityPostKids/`) has no profile-visibility surface at all — kids profiles are different scope and don't apply here. Not applicable.

---

## Recommendation: Option B (fix the copy) — decisive

**Scope of Option B:**

1. `web/src/app/profile/settings/_cards/PrivacyCard.tsx`
   - Drop the middle `AudienceOption` ("Followers only", lines 311–317).
   - The `audience` enum and the `'private'`-decoder logic in lines 61–67 / 81–87 reduce to two states: `public` ↔ `private` (with `hidden` still distinct as the lockdown tier).
   - Re-label "Public" body and "Hidden" body as needed; the "Public" body is already correct ("Anyone with the link can view your profile.").
   - Replace toast text on line 165: `'Profile is followers-only.'` → `'Profile is private.'`
   - Update the "Hidden" sublabel if needed; today it's correct (lockdown removes followers).

2. `web/src/app/profile/_sections/PublicProfileSection.tsx`
   - Line 285 sublabel: `'Only your followers can view.'` → `'Only you can view it.'` (or similar — currently this card already only shows Public/Private, the lie is just in the body copy).

3. **No DB migration required.** The column already accepts `'public'|'private'|'hidden'`. Existing 6 private rows are valid and stay valid.

4. **No iOS change required.** iOS has no UI exposing the lie. `PublicProfileView` already correctly treats `'private'` as not-readable.

5. **Optional hardening (separate ticket):** add a `CHECK (profile_visibility IN ('public','private','hidden'))` constraint to lock the enum, since today the column accepts any string. Not required for this fix.

**Why not Option A:**

- Zero users have asked for it (zero rows where the value was deliberately picked from a real choice — we can't even tell, since it stores as `'private'`).
- The implementation is not "add a `follows` lookup on the page" as PM-2 suggested. The actual call path goes through `public_profiles_v` which filters at SQL. A correct followers-only path requires either:
  - relaxing `public_profiles_v` to expose followers-only rows + adding a per-row follow check on every consumer (`/u/[username]/page.tsx`, `/u/[username]/layout.js`, `/card/[username]/*`, iOS `PublicProfileView`), **or**
  - a new SECURITY DEFINER RPC like `read_visible_profile(p_username text) → jsonb` that takes `auth.uid()` and returns the row only if visibility is public, or visibility is followers-only and follower exists, or viewer is self.
  - Either path: a migration, a code change in 4 files (web page + web layout + web OG + iOS view), plus a new iOS settings card to match.
- Followers-only is a Twitter/Instagram-class feature. Verity Post is a quiz-gated news comment surface; the social graph here is `follows` for notification routing more than for content gating. The feature's value-per-engineering-hour is low at this stage.
- Owner-locked memory: **"Engagement + growth bar — 90%+ retention, ~100%/day growth on agent-touched features"** — that quality bar is much easier to clear by deleting the broken thing than by shipping a partial implementation that drifts again.

**If, post-launch, real users ask for followers-only profile visibility:** the schema already supports a third value (the column is untyped varchar), the `follows` table has correct RLS, and a SECURITY DEFINER RPC pattern is well-established in the codebase (e.g. `update_own_profile`, `lockdown_self`). Adding it later is straightforward. **The reverse — shipping it now broken and then having to support it — is not.**

---

## Cross-platform consistency note

Per the locked memory **"Every change must cover web + iOS + kids iOS"**:

- **Web:** Option B updates `PrivacyCard.tsx` + `PublicProfileSection.tsx`.
- **iOS-adult:** not applicable. iOS has no privacy-visibility settings UI today. The DB enum is `'public'|'private'|'hidden'`; iOS already correctly gates on those values in `PublicProfileView.swift:379-385`. No change needed unless owner wants to add an iOS settings card in this pass (recommend: separate ticket if at all).
- **iOS-kids:** not applicable. Kids profiles are not user-configurable in this way.

---

## Files touched if Option B accepted

- `web/src/app/profile/settings/_cards/PrivacyCard.tsx` — drop "Followers only" option, update toast copy, simplify audience enum
- `web/src/app/profile/_sections/PublicProfileSection.tsx` — update line 285 sublabel
- (Optional) `supabase/migrations/<date>_check_profile_visibility_enum.sql` — add CHECK constraint

No iOS changes. No DB schema changes (other than the optional CHECK).

---

## Open question for owner

Is there a product reason to keep "Followers only" listed even though it doesn't work — e.g. signaling on the roadmap? If yes, that's still wrong (CLAUDE.md memory: **"No 'Generate All' / coming-soon copy / user-facing timelines"**), but worth confirming the answer is "no, just delete it."
