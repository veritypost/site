# Round 6 iOS-DATA — Column-name drift fixes

Prepared by PREPPER iOS-DATA. Implementer should apply the surgical changes below, verifying each against the schema confirmations in Section 1.

---

## 1. Schema validation

All queries run against `public` schema in project `fyiwulqphgmoqullmrfn` on 2026-04-18.

### 1.1 `public.users` (notifications / feed / expert prefs target)

Result: **no `preferences` column exists**. Writes and reads against `preferences` silently drop. The jsonb holder is **`metadata`** (NOT NULL DEFAULT `'{}'`).

Round 5 Item 2 already migrated writes through `update_own_profile` RPC, storing sub-keys at `metadata.notifications`, `metadata.feed`, `metadata.expert`. Reads are still on the phantom column. Other columns used by iOS (first-class): `id`, `username`, `avatar_url`, `avatar_color`, `verity_score`, `is_verified_public_figure`, `is_expert`, `metadata`. There is no `plan`, `role`, or `avatar` column (plan comes via the joined `plans` table; avatar is an `avatar_url` string OR the iOS `VPUser.AvatarRef` jsonb under `metadata`).

### 1.2 `public.notifications`

Real columns (subset relevant to iOS):
- `id uuid NOT NULL`
- `user_id uuid NOT NULL`
- `type varchar NOT NULL`
- `title varchar NOT NULL`
- `body text`
- `action_url text`  ← iOS reads `link`
- `action_type varchar`
- `action_id uuid`
- `is_read bool NOT NULL DEFAULT false`  ← iOS reads `read`
- `read_at timestamptz`
- `is_seen bool NOT NULL DEFAULT false`
- `seen_at timestamptz`
- `created_at timestamptz NOT NULL DEFAULT now()`

No `read` column, no `link` column.

### 1.3 `public.alert_preferences`

Real columns:
- `id uuid`, `user_id uuid NOT NULL`
- `alert_type varchar NOT NULL`
- `channel_push bool NOT NULL DEFAULT true`
- `channel_email bool NOT NULL DEFAULT true`
- `channel_in_app bool NOT NULL DEFAULT true`
- `channel_sms bool NOT NULL DEFAULT false`
- `is_enabled bool NOT NULL DEFAULT true`
- `quiet_hours_start time`, `quiet_hours_end time`
- `frequency varchar`
- `created_at`, `updated_at timestamptz`

No `type`, `value`, or `reference_id` columns. The iOS concept (subscribing to a category / subcategory / keyword) does NOT fit the real table shape — this is not a column rename; the iOS model is fundamentally different. See Fix 3 for recommendation.

### 1.4 `public.expert_applications`

Real columns (NOT-NULL required, no default): `user_id`, `application_type`, `full_name`.
Other columns: `organization`, `title`, `bio`, `expertise_areas text[]`, `website_url text`, `social_links jsonb DEFAULT '{}'`, `credentials jsonb DEFAULT '[]'`, `portfolio_urls text[]`, `government_id_provided`, `verification_documents`, `status` (default `'pending'`), plus review / probation / credential-verification audit columns. Timestamps: `created_at`, `updated_at` — **no `submitted_at`** (iOS orders by that at SettingsView.swift:1076; that is an 8th phantom not in the Auditor's list).

No `type`, `field`, `role`, `org`, `links` columns.

### 1.5 `public.support_tickets`

Real columns: `ticket_number NOT NULL`, `user_id`, `email`, `category NOT NULL`, `subject NOT NULL`, `status`, `priority`, `assigned_to`, `tags`, `source`, `app_version`, `os_version`, `device_model`, `platform`, `page_url`, `screenshot_urls`, `related_article_id`, `related_comment_id`, `satisfaction_*`, `first_response_at`, `resolved_at`, `closed_at`, `reopened_count`, `is_public`, `metadata`, `created_at`, `updated_at`.

No `body` and **no `description`** column. Message body lives in a separate `ticket_messages` table (cols: `id`, `ticket_id`, `sender_id`, `is_staff`, `is_internal_note`, `body`, `body_html`, `attachment_urls`, `is_automated`, `created_at`).

### 1.6 `public.kid_profiles`

Real columns include: `parent_user_id NOT NULL`, `display_name NOT NULL`, `avatar_url`, `avatar_preset`, `date_of_birth`, `age_range`, `pin_hash`, `pin_salt`, `pin_hash_algo`, `max_daily_minutes`, `reading_level`, `verity_score`, `articles_read_count`, `quizzes_completed_count`, `is_active`, `coppa_consent_given NOT NULL DEFAULT false`, `coppa_consent_at`, `metadata`, `avatar_color`, streak cols, `global_leaderboard_opt_in`.

No `name`, `username`, or `age_tier` columns. Also note: creating a kid requires `coppa_consent_given=true` + COPPA consent metadata — this is enforced by the `/api/kids` POST route (validates `b.consent`, `b.date_of_birth` under 13).

---

## 2. Route availability

### 2.1 `/api/support` (site/src/app/api/support/route.js)

- Exists. POST and GET handlers present.
- Gate: `requireAuth()` (session-authenticated only; no specific permission).
- Expected body: `{ category, subject, description }` — all required.
- Response: `{ ticket: <row> }` on success, `{ error }` with appropriate status on failure.
- **Caveat (cross-track flag):** the route's INSERT currently passes `description` as a column on `support_tickets`, which doesn't exist. The INSERT would error at Postgres. Not this track's job to fix, but flagged for coordination. For iOS purposes the contract the web route advertises is `{ category, subject, description }`; Implementer should POST that shape. If the web route is unfixed by rollout, the ticket create will 500 — that is a web-side bug independent of this track.

### 2.2 `/api/kids` (site/src/app/api/kids/route.js)

- Exists. GET + POST.
- Gate: `requirePermission('kids.parent.view')` for GET, `requirePermission('kids.profile.create')` for POST.
- Expected POST body: `{ display_name (required), date_of_birth (required, under 13), consent: {parent_name, ...} (COPPA, required), avatar_color?, pin?, max_daily_minutes?, reading_level? }`.
- Response: `{ id: <uuid> }`.

### 2.3 `/api/expert/apply` (site/src/app/api/expert/apply/route.js)

- Exists under `/api/expert/apply` (NOT `/api/expert-applications`).
- Gate: `requirePermission('expert.application.apply')`.
- Expected POST body: `{ application_type, full_name, organization?, title?, bio?, expertise_areas?: string[], website_url?, social_links?: object, credentials?: any[], portfolio_urls?: string[], sample_responses?: any[], category_ids?: string[] }`. Dispatches to the `submit_expert_application` RPC.
- Response: `{ application_id: <uuid> }`.

No `/api/alerts/preferences` route exists; iOS must write directly.

---

## 3. Fix plan per bug

All iOS file paths are absolute under `/Users/veritypost/Desktop/verity-post/VerityPost/VerityPost/`.

### Fix 1 — SettingsView `preferences` → `metadata` (6 read sites)

File: `SettingsView.swift`. Every read goes through the same pattern: decode struct has `preferences: JSONValue?`, `.select("preferences")`, then drills into `row.preferences?["<sub-key>"]`.

The write side already stores this data at `metadata.notifications`, `metadata.feed`, `metadata.expert`. Reads need to mirror.

**Sub-key names verified from the write-side dicts at lines 901-907 (notifications), 985-991 (feed), 1167 (expert). Names are identical — only the top-level jsonb column changes from `preferences` to `metadata`.**

Do a single surgical pass on each of the 6 blocks. Pattern (applies identically to all 6):

OLD:
```swift
struct Row: Decodable { let preferences: JSONValue? }
if let row: Row = try? await client.from("users")
    .select("preferences")
    .eq("id", value: userId)
    .single().execute().value,
   let prefs = row.preferences?["notifications"]?.objectValue {
```

NEW:
```swift
struct Row: Decodable { let metadata: JSONValue? }
if let row: Row = try? await client.from("users")
    .select("metadata")
    .eq("id", value: userId)
    .single().execute().value,
   let prefs = row.metadata?["notifications"]?.objectValue {
```

Per-site map:
1. **Line 874-879 (notifications load)** — inner sub-key `"notifications"`.
2. **Line 894-898 (notifications save pre-read)** — sub-key access `existing?.preferences?.dictionary` → `existing?.metadata?.dictionary`. Note: save path doesn't use the sub-key directly; it merges the full dict.
3. **Line 964-967 (feed load)** — sub-key `"feed"`.
4. **Line 981-984 (feed save pre-read)** — `existing?.preferences?.dictionary` → `existing?.metadata?.dictionary`.
5. **Line 1149-1152 (expert load)** — sub-key `"expert"`.
6. **Line 1163-1166 (expert save pre-read)** — `existing?.preferences?.dictionary` → `existing?.metadata?.dictionary`.

For each site: rename the `Row` struct's field from `preferences` to `metadata`, change the `.select("preferences")` literal to `.select("metadata")`, and rename `row.preferences` / `existing?.preferences` to `row.metadata` / `existing?.metadata`. No other logic changes.

### Fix 2 — `VPNotification` CodingKeys

File: `AlertsView.swift`, lines 700-714 and 716.

OLD:
```swift
struct VPNotification: Codable, Identifiable {
    let id: String
    var userId: String?
    var title: String?
    var body: String?
    var type: String?
    var read: Bool?
    var link: String?
    var createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, title, body, type, read, link
        case userId = "user_id"
        case createdAt = "created_at"
    }

    var isRead: Bool { read ?? false }

    var storySlug: String? {
        guard let link = link, link.hasPrefix("/story/") else { return nil }
        ...
    }
}
```

NEW:
```swift
struct VPNotification: Codable, Identifiable {
    let id: String
    var userId: String?
    var title: String?
    var body: String?
    var type: String?
    var isRead: Bool?
    var actionUrl: String?
    var createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, title, body, type
        case userId = "user_id"
        case isRead = "is_read"
        case actionUrl = "action_url"
        case createdAt = "created_at"
    }

    // Keep the previous computed accessor name so call sites don't all churn.
    // (The stored property is now isRead; the `var isRead: Bool { read ?? false }`
    // computed is replaced by a coalescing computed for call-site compatibility.)
    var isReadBool: Bool { isRead ?? false }

    var storySlug: String? {
        guard let link = actionUrl, link.hasPrefix("/story/") else { return nil }
        let slug = String(link.dropFirst("/story/".count))
        return slug.isEmpty ? nil : slug
    }
}
```

Implementer must then update the one known consumer at line 516 (`VPNotification(id: ...)` re-construction in `markAsRead`) to pass `isRead:` and `actionUrl:` instead of `read:` / `link:`, and audit call sites that reference `.read` / `.link` / `.isRead` on a `VPNotification` instance (use Xcode's find-in-project for `.read` and `.link` on `VPNotification`). The `var isRead: Bool { read ?? false }` computed getter is being replaced — existing callers using `notif.isRead` now get the optional directly; if any call site assumed non-optional, use `isReadBool`.

### Fix 3 — `alert_preferences` insert / select shape

File: `AlertsView.swift`. Five affected call sites: 583 (select), 620 (insert), 642 (insert), 664 (insert), 684 (delete).

Problem: iOS models alert subscriptions as per-topic rows (`type` category/subcategory/keyword, `value`, `reference_id`). The real `alert_preferences` table models per-alert-type channel preferences (alert_type + channel_push/email/in_app/sms + is_enabled + frequency). The schemas are incompatible — this is **not** a column rename, it is a model mismatch.

**Recommendation: scope this fix OUT of Round 6.** The web app's actual subscription model (category / keyword subscription storage) lives elsewhere — a quick web-side grep shows no `/api/alerts/preferences` route, and the table's columns make no room for `value` or `reference_id`. Silently dropping the iOS subscription feature for Round 6 is the minimum surgical change; the fully correct fix requires a product decision (either add a `subscription_topics` table, or repurpose `alert_preferences.alert_type` + `alert_preferences.metadata`-style, which needs a migration).

**Interim surgical change (recommended):**

Gate the four AlertsView subscription call sites behind a `#if false` or feature-flag constant `AlertsView.subscriptionsEnabled = false`, so the UI still renders but insertions do not hit a broken table. Add a TODO comment pointing to a new OWNER_TO_DO item: "Round 7 — design Alert subscriptions table + route, then wire iOS."

Example wrapping at line 618-626 (same pattern for 640-648, 662-670, 682-694):
```swift
do {
    // TODO(round-7): alert_preferences table doesn't model per-topic
    // subscriptions. See 05-Working/OWNER_TO_DO.md entry "Alert
    // subscriptions model". For now this insert is a no-op to stop
    // silent DB errors.
    #if false
    let sub = NewSub(user_id: userId, type: "category", value: catName, reference_id: selectedCategoryToAdd)
    try await client.from("alert_preferences").insert(sub).execute()
    #endif
    selectedCategoryToAdd = ""
    await loadManageData()
    await maybeOfferPush()
} catch { ... }
```

**Alternative (NOT recommended, flagged only):** if the owner insists on keeping the feature live for Round 6, change each insert shape to `{ user_id, alert_type: <value> }` (dropping category/keyword/subcategory distinction — all rows get `alert_type='category:NAME'` style), and make the load filter on a prefix. This stores data but doesn't match the web model. Flag to Implementer: DO NOT silently do this; require owner call.

### Fix 4 — `expert_applications` insert via `/api/expert/apply`

File: `SettingsView.swift`, lines 1083-1105 and line 1070-1081 (loadExisting).

Problem at insert: iOS writes `{user_id, type, field, role, org, bio, links, status}`. Real columns are `user_id`, `application_type`, `full_name`, `organization`, `title`, `bio`, `portfolio_urls`, `social_links`, `status`.

Problem at load: `.order("submitted_at", ascending: false)` — no such column; use `created_at`.

**Fix:** Route the insert through `/api/expert/apply`. Keep the local status re-read on `expert_applications` but fix the order-by.

OLD insert (lines 1087-1101):
```swift
struct Link: Encodable { let label: String; let url: String }
struct Entry: Encodable {
    let user_id: String; let type: String; let field: String
    let role: String; let org: String?; let bio: String
    let links: [Link]; let status: String
}
var links: [Link] = []
if !portfolioURL.isEmpty { links.append(Link(label: "portfolio", url: portfolioURL)) }
if !linkedin.isEmpty { links.append(Link(label: "linkedin", url: linkedin)) }
do {
    try await client.from("expert_applications").insert(Entry(
        user_id: userId, type: type, field: field,
        role: role, org: org.isEmpty ? nil : org, bio: bio,
        links: links, status: "pending"
    )).execute()
    submittedMessage = "Application received. We'll review within 5 business days."
    existingStatus = "pending"
} catch { Log.d("Verification submit error:", error) }
```

NEW insert (POST to `/api/expert/apply` — use the AuthenticatedAPI helper already present in `SettingsView.swift` or wherever URLRequest-to-API is done; the Implementer should use whatever `PermissionService` or `APIClient` pattern is already in the file). Minimum-viable URLRequest form:

```swift
struct ExpertApplyBody: Encodable {
    let application_type: String
    let full_name: String
    let organization: String?
    let title: String?
    let bio: String
    let social_links: [String: String]
    let portfolio_urls: [String]
    // expertise_areas / credentials / sample_responses / category_ids omitted
    // unless the existing iOS form collects them — it currently does not.
}

var portfolios: [String] = []
var socials: [String: String] = [:]
if !portfolioURL.isEmpty { portfolios.append(portfolioURL) }
if !linkedin.isEmpty { socials["linkedin"] = linkedin }

let body = ExpertApplyBody(
    application_type: type,
    full_name: /* iOS form field — needs a `full_name` input */,
    organization: org.isEmpty ? nil : org,
    title: role.isEmpty ? nil : role,
    bio: bio,
    social_links: socials,
    portfolio_urls: portfolios
)

// Use the existing API helper. Illustrative:
guard let url = URL(string: "\(SupabaseManager.shared.apiBaseURL)/api/expert/apply") else { return }
var req = URLRequest(url: url)
req.httpMethod = "POST"
req.setValue("application/json", forHTTPHeaderField: "Content-Type")
if let token = try? await client.auth.session.accessToken {
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
}
req.httpBody = try JSONEncoder().encode(body)
let (_, resp) = try await URLSession.shared.data(for: req)
if let http = resp as? HTTPURLResponse, http.statusCode == 200 {
    submittedMessage = "Application received. We'll review within 5 business days."
    existingStatus = "pending"
}
```

**Flag to Implementer:** the current iOS verification form (SettingsView.swift ExpertVerificationView) does not capture `full_name` — it captures `type`, `field`, `role`, `org`, `bio`, `portfolio URL`, `linkedin`. The `/api/expert/apply` route requires `full_name` (NOT NULL). Implementer must add a Full Name `TextField` to the form OR fall back to `auth.currentUser?.username` or a concatenation of `first_name + last_name` from `users`. The Owner should pick. Recommendation: add a Full Name field to the form (surgical — one TextField binding, one state var, one reference in the Body).

OLD loadExisting (lines 1070-1081):
```swift
.order("submitted_at", ascending: false)
```

NEW:
```swift
.order("created_at", ascending: false)
```

### Fix 5 — `support_tickets` insert via `/api/support`

Two files:
1. `SettingsView.swift` line 1350-1361 (feedback form)
2. `ProfileView.swift` line 1115-1126 (inline feedback sheet)

Both currently insert `{user_id, category, body}`. Replace with POST to `/api/support`.

NEW URLRequest template (apply the same pattern in both files):

```swift
struct SupportBody: Encodable {
    let category: String
    let subject: String
    let description: String
}

// SettingsView.swift: `category` = picker value, `message` = existing @State,
// `subject` = derive from first 80 chars of message OR add a dedicated field.
let subject = String(message.prefix(80))
let body = SupportBody(category: category, subject: subject, description: message)

guard let url = URL(string: "\(SupabaseManager.shared.apiBaseURL)/api/support") else { return }
var req = URLRequest(url: url)
req.httpMethod = "POST"
req.setValue("application/json", forHTTPHeaderField: "Content-Type")
if let token = try? await client.auth.session.accessToken {
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
}
req.httpBody = try JSONEncoder().encode(body)

do {
    let (_, resp) = try await URLSession.shared.data(for: req)
    if let http = resp as? HTTPURLResponse, http.statusCode == 200 {
        dismiss()
    }
} catch { Log.d("Feedback submit error:", error) }
```

For `ProfileView.swift:1115-1126`, `category` = `feedbackCategory`, `description` = `body` (the trimmed `feedbackBody`). Derive `subject` the same way.

**Cross-track flag:** `/api/support` POST currently tries to insert `description` as a column on `support_tickets`, which does not exist. The route is broken on the web side. iOS Implementer should still POST the correct contract body `{ category, subject, description }` — the web team must separately fix the route to (a) insert `{ticket_number, user_id, email, category, subject, ...}` into `support_tickets`, (b) then insert `{ticket_id, sender_id: user.id, is_staff: false, body: description}` into `ticket_messages`. Do NOT attempt to fix the web route in this track; just flag it in the verification step.

### Fix 6 — `kid_profiles` insert via `/api/kids`

File: `ProfileView.swift`, lines 1128-1146 (`addChild`).

Problem: iOS writes `{parent_user_id, name, username, avatar_color, age_tier}`. Real columns: `display_name` (required), no `name`, no `username`, no `age_tier` (has `age_range` instead). Also POST route requires COPPA `consent: {parent_name}`, `date_of_birth` (under 13).

**Fix:** Route through `/api/kids` POST. The iOS form at `ProfileView.swift:1128` currently collects only `newChildName` and `newChildColor` — it does NOT collect COPPA consent or date of birth. **The iOS "Add child" flow is fundamentally incomplete vs. the API contract.**

Options:
1. **Recommended:** disable the inline quick-add in `ProfileView` and redirect users to the full kid-create flow that lives in `KidViews.swift` / `FamilyViews.swift` (which presumably has the COPPA form). If that flow exists and is wired elsewhere, remove the `addChild()` code and replace the button with a `NavigationLink` to the full flow. Flag for Implementer: verify the full create flow exists in `FamilyViews.swift` or `KidViews.swift` first.
2. **If (1) is too invasive:** add DOB and COPPA consent fields to the existing inline sheet; then POST the correct body to `/api/kids`.

Minimum-viable URLRequest (assumes the iOS form is extended to collect `displayName`, `dob`, `parentName`):

```swift
struct KidsCreateBody: Encodable {
    let display_name: String
    let date_of_birth: String  // yyyy-MM-dd
    let avatar_color: String?
    let consent: Consent
    struct Consent: Encodable { let parent_name: String }
}

let body = KidsCreateBody(
    display_name: trimmed,
    date_of_birth: dobString,   // need new @State
    avatar_color: newChildColor,
    consent: .init(parent_name: parentFullName)  // need new @State
)

guard let url = URL(string: "\(SupabaseManager.shared.apiBaseURL)/api/kids") else { return }
var req = URLRequest(url: url)
req.httpMethod = "POST"
req.setValue("application/json", forHTTPHeaderField: "Content-Type")
if let token = try? await client.auth.session.accessToken {
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
}
req.httpBody = try JSONEncoder().encode(body)

let (_, resp) = try await URLSession.shared.data(for: req)
if let http = resp as? HTTPURLResponse, http.statusCode == 200 {
    // Refresh children list from server so the local state stays in sync.
    await loadKids(userId: userId)
    newChildName = ""; newChildColor = "#10b981"
    showAddChild = false
}
```

**Flag to Implementer:** pick Option 1 if the full flow already exists; otherwise Option 2 with a UI follow-up. Do NOT attempt to fake COPPA consent — the API rejects any request without the `consent.parent_name`.

### Fix 7 — Mention autocomplete phantom columns

File: `StoryDetailView.swift`, line 960.

OLD:
```swift
.select("id, username, plan, role, is_verified_public_figure, verity_score, avatar, avatar_color")
```

NEW:
```swift
.select("id, username, is_verified_public_figure, verity_score, avatar_color, plans(tier)")
```

Changes:
- Drop `plan` (no column; `VPUser.plan` is computed from the joined `plans.tier`).
- Drop `role` (no column on `users`).
- Drop `avatar` (not a real column either — the `VPUser.AvatarRef` field is not a first-class column on `users`; the user's avatar image URL is `avatar_url`, and initials are derived client-side).
- Keep `avatar_color` (real column).
- **Add `plans(tier)`** if the iOS autocomplete UI reads `user.plan` to badge e.g. expert tier on the mention suggestion. If it only displays `username` + `avatar_color` + verified badge, omit the join for speed. Implementer should spot-read the `ForEach(mentionSuggestions)` renderer to decide. Minimum surgical: the shortest viable select is `"id, username, is_verified_public_figure, verity_score, avatar_color"`.

---

## 4. Verification

Implementer must confirm after patching:

1. **Web side shouldn't regress (sanity, since iOS-only track):**
   ```bash
   cd /Users/veritypost/Desktop/verity-post/site && npx tsc --noEmit
   ```
   Expect EXIT=0. Any new errors are not this track's fault but should be noted.

2. **Spot-read every patched Swift file to confirm shape matches schema:**
   - `SettingsView.swift` 6 sites: grep for `preferences` — expect only comment hits, no `.select("preferences")` or `row.preferences` remain.
   - `AlertsView.swift` VPNotification: grep for `case read, link` — expect no matches; grep for `"is_read"` and `"action_url"` — expect hits in CodingKeys.
   - `AlertsView.swift` alert_preferences: grep for `"alert_preferences"` — expect matches only in commented-out / `#if false` blocks.
   - `SettingsView.swift:1076` / `ProfileView.swift`: grep for `submitted_at` — expect no matches.
   - `SettingsView.swift` / `ProfileView.swift`: grep for `from("support_tickets").insert` — expect no matches.
   - `ProfileView.swift` addChild: grep for `"age_tier"`, `"username": child`, `"name": trimmed` — expect no matches.
   - `StoryDetailView.swift:960`: grep for `"plan, role"` and `"avatar, avatar_color"` — expect no matches.

3. **Optional live verification via `execute_sql`:**
   - For each patched read: simulate with `SELECT metadata->'notifications' FROM users WHERE id=<any>;` to confirm shape.
   - For each patched write: the Implementer cannot run iOS in a sandbox, but should inspect the web dev logs of a locally-submitted POST to `/api/support`, `/api/kids`, `/api/expert/apply` to confirm a 200.

---

## 5. What NOT to change

- **Gates / authz / permission-version bumps** — iOS-GATES track. Do NOT re-route `messages.insert`, `follows.insert`, or otherwise adjust permission checks. Only touch the seven bugs above plus the one bonus (`submitted_at` → `created_at`) that is part of Fix 4's same file-block.
- **DB schema** — no migrations. Do not add columns to fix iOS.
- **Web code** — iOS-only this track. Explicitly:
  - Do NOT fix `/api/support` inserting the phantom `description` column (that's a web-side follow-up; flagged in Fix 5).
  - Do NOT add a new `/api/alerts/preferences` route; Fix 3 disables the feature until Round 7.
- **The ExpertVerificationView form redesign** — adding a `Full Name` field is the smallest possible change for Fix 4. Do not redesign the whole form.
- **COPPA consent flow** — if Fix 6 Option 1 (redirect to full kid-create flow) is viable, use it; don't inline a COPPA form into the quick-add.

---

## 6. Summary of files touched

1. `VerityPost/VerityPost/SettingsView.swift` — Fix 1 (6 sites), Fix 4 (insert + loadExisting order-by), Fix 5 (support_tickets insert in feedback form)
2. `VerityPost/VerityPost/AlertsView.swift` — Fix 2 (VPNotification), Fix 3 (4 sites gated off)
3. `VerityPost/VerityPost/ProfileView.swift` — Fix 5 (support_tickets insert), Fix 6 (kid_profiles insert)
4. `VerityPost/VerityPost/StoryDetailView.swift` — Fix 7 (one-line select change)

Total: **4 files**, approximately **15 call sites** modified.
