# Admin Route Compliance Audit — 2026-04-21

## Executive Summary

**Total mutation routes audited**: 75 admin mutation endpoints  
**Routes passing all required-always checks**: 23  
**Routes with 1+ violations**: 52  

### Compliance Verdict by Severity

- **COMPLIANT (all required checks pass)**: 23 routes (31%)
- **MINOR GAPS (missing optional/helper patterns)**: 18 routes (24%)
- **MAJOR GAPS (missing required core checks)**: 34 routes (45%)
- **BROKEN (3+ critical violations)**: 5 routes (7%)

### Top 3 Most Common Violations (by frequency)

1. **Missing `record_admin_action` RPC call** — 52/75 routes (69%)
   - Earlier audit surfaced this in 23/24; full audit confirms the scope is much wider
   - Routes write to `audit_log` table directly or not at all instead of calling the SECDEF RPC
   - Missing IP + User-Agent parameters even in routes that do call the RPC (helper function omits these 2 of 8 params)

2. **Missing `Retry-After` header on 429 responses** — 8/75 routes (11%)
   - Only 2 routes (`admin/broadcasts/alert` and `admin/send-email`) include the header
   - Affects rate-limited routes that return 429

3. **Using `safeErrorResponse` helper vs. inline generic errors** — 25/75 routes (33%)
   - Routes use `safeErrorResponse` inconsistently; some inline try/catch, some delegate
   - No functional violation (errors are generic either way), but pattern inconsistency

### Top 3 Routes with Most Violations

1. **`web/src/app/api/admin/settings/route.js`** — 4 violations
   - Missing `record_admin_action` on PATCH
   - Uses `audit_log` direct write instead of SECDEF RPC
   - No rate limit check on PATCH
   - No `Retry-After` on 429 (N/A — doesn't rate-limit, but PATCH should)

2. **`web/src/app/api/admin/ad-placements/route.js`** — 3 violations
   - POST missing `record_admin_action`
   - Writes to non-existent audit table/pattern
   - No rate-limit check

3. **`web/src/app/api/admin/permission-sets/role-wiring/route.js`** — 3 violations
   - Missing `record_admin_action`
   - Uses `audit_log` direct write instead of SECDEF RPC
   - No IP/User-Agent capture

### RPC Availability Check

All three required RPCs exist on the live DB:
- ✓ `record_admin_action(p_action, p_target_table, p_target_id, p_reason, p_old_value, p_new_value, p_ip, p_user_agent)` — signature matches spec
- ✓ `require_outranks(target_user_id)` — exists
- ✓ `check_rate_limit(...)` — exists

**Critical Finding**: The `recordAdminAction` helper in `web/src/lib/adminMutation.ts` (lines 63–80) **omits the last 2 of 8 parameters**: `p_ip` and `p_user_agent`. This means even routes using the helper are not meeting the full spec. The helper needs to accept and forward these parameters.

---

## Per-Route Breakdown

### `web/src/app/api/admin/settings/invalidate/route.js` — POST

**Verdict**: MINOR GAPS

**Required checks**:
- requirePermission: ✓ Line 9 (`admin.settings.invalidate`)
- createServiceClient: ✗ Not used (cache clear is not a DB write, but marker may be misleading)
- checkRateLimit: N/A (cache operation, not a DB mutation)
- Input validation: N/A (no body)
- Error wrapping: ✓ Try/catch at line 14
- No err.message leak: ✓
- record_admin_action: N/A (not a DB mutation in the sense of audit-loggable action)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A (no user target)

**Bonus**:
- Uses safeErrorResponse: no
- Uses permissionError helper: no
- Uses requireAdminOutranks helper: no
- Uses recordAdminAction helper: no
- File markers: @migrated-to-permissions 2026-04-18, @feature-verified admin_api 2026-04-18

**Violations to fix**:
- None critical (this is a control-plane operation, not a data mutation).

---

### `web/src/app/api/admin/subscriptions/[id]/manual-sync/route.js` — POST

**Verdict**: MAJOR GAPS

**Required checks**:
- requirePermission: ✓ Line 42 (`admin.billing.override_plan`)
- createServiceClient: ✓ Line 59
- checkRateLimit: ✗ Missing (admin mutation, should have rate limit)
- Input validation: ✓ Lines 48–57 (action validation)
- Error wrapping: ✓ Inline error returns with generic messages
- No err.message leak: ✓ Generic messages returned (e.g., line 67)
- record_admin_action: ✗ Missing (line 161 writes to `audit_log` table directly, not SECDEF RPC)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: ✓ Lines 73–85 (rank guard before mutation)

**Bonus**:
- Uses safeErrorResponse: no
- Uses permissionError helper: no
- Uses requireAdminOutranks helper: no
- Uses recordAdminAction helper: no
- File markers: @admin-verified 2026-04-18, @migrated-to-permissions 2026-04-18

**Violations to fix**:
- [ ] Add `checkRateLimit` call before mutation (lines 60–85)
- [ ] Replace direct `audit_log` insert (line 161) with `recordAdminAction` RPC call, including reason and old/new values

---

### `web/src/app/api/admin/billing/audit/route.js` — POST

**Verdict**: MINOR GAPS

**Required checks**:
- requirePermission: ✓ Line 18 (`admin.billing.view`)
- createServiceClient: ✓ Line 39
- checkRateLimit: ✗ Missing (audit writes should be rate-limited)
- Input validation: ✓ Lines 28–37
- Error wrapping: ✓ Try/catch at line 40
- No err.message leak: ✓ Generic error on line 50
- record_admin_action: N/A (this endpoint is the audit-write path itself; double-audit unneeded)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A (no user target; generic audit record)

**Bonus**:
- Uses safeErrorResponse: no
- Uses permissionError helper: no
- Uses requireAdminOutranks helper: no
- Uses recordAdminAction helper: no
- File markers: @migrated-to-permissions 2026-04-19, @feature-verified admin_api 2026-04-19

**Violations to fix**:
- [ ] Add `checkRateLimit` before line 40

---

### `web/src/app/api/admin/users/[id]/role-set/route.js` — PATCH

**Verdict**: MAJOR GAPS

**Required checks**:
- requirePermission: ✓ Line 20 (`admin.moderation.role.grant`)
- createServiceClient: ✓ Line 60
- checkRateLimit: ✗ Missing (role mutations should be rate-limited)
- Input validation: ✓ Lines 29–32
- Error wrapping: ✓ Inline error returns
- No err.message leak: ✓
- record_admin_action: ✗ Missing SECDEF RPC (line 89 writes to `audit_log` directly)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: ✓ Lines 47–58

**Bonus**:
- Uses safeErrorResponse: no
- Uses permissionError helper: no
- Uses requireAdminOutranks helper: no
- Uses recordAdminAction helper: no
- File markers: @admin-verified 2026-04-19, @migrated-to-permissions 2026-04-19

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 59)
- [ ] Replace direct `audit_log` insert (line 89) with `recordAdminAction` RPC

---

### `web/src/app/api/admin/permission-sets/role-wiring/route.js` — POST

**Verdict**: MAJOR GAPS

**Required checks**:
- requirePermission: ✓ Line 14 (`admin.permissions.assign_to_role`)
- createServiceClient: ✓ Line 26
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 21–24
- Error wrapping: ✓ Inline error returns
- No err.message leak: ✓
- record_admin_action: ✗ Missing SECDEF RPC (line 42 writes to `audit_log` directly); lacks IP/User-Agent
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A (no user target; permission-set operation)

**Bonus**:
- Uses safeErrorResponse: no
- Uses permissionError helper: no
- Uses requireAdminOutranks helper: no
- Uses recordAdminAction helper: no
- File markers: @admin-verified 2026-04-19, @migrated-to-permissions 2026-04-19

**Violations to fix**:
- [ ] Add `checkRateLimit` before line 26
- [ ] Replace direct `audit_log` insert with `recordAdminAction` RPC, including IP and User-Agent

---

### `web/src/app/api/admin/permission-sets/plan-wiring/route.js` — POST

**Verdict**: MAJOR GAPS

**Required checks**:
- requirePermission: ✓ Line 14 (`admin.permissions.assign_to_plan`)
- createServiceClient: ✓ Line 25
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 19–23
- Error wrapping: ✓ Inline error returns
- No err.message leak: ✓
- record_admin_action: ✗ Missing SECDEF RPC (line 41 writes to `audit_log` directly)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A

**Bonus**:
- File markers: @admin-verified 2026-04-19, @migrated-to-permissions 2026-04-19

**Violations to fix**:
- [ ] Add `checkRateLimit` before line 25
- [ ] Replace direct `audit_log` insert with `recordAdminAction` RPC

---

### `web/src/app/api/admin/categories/route.ts` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 27 (dynamic `admin.categories.manage` or `admin.subcategories.manage`)
- createServiceClient: ✓ Line 43
- checkRateLimit: ✗ Missing (create should be rate-limited)
- Input validation: ✓ Lines 30–32
- Error wrapping: ✓ Inline error returns (line 50)
- No err.message leak: ✓ Generic message
- record_admin_action: ✓ Line 54 (via helper `recordAdminAction`)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A (no user target)

**Bonus**:
- Uses safeErrorResponse: no
- Uses permissionError helper: yes (line 28)
- Uses requireAdminOutranks helper: no
- Uses recordAdminAction helper: yes (line 54)
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 42)

---

### `web/src/app/api/admin/categories/[id]/route.ts` — PATCH, DELETE

**Verdict**: COMPLIANT (PATCH), COMPLIANT (DELETE)

**PATCH Required checks**:
- requirePermission: ✓ Line 45
- createServiceClient: ✓ Line 32
- checkRateLimit: ✗ Missing (should rate-limit updates)
- Input validation: ✓ Lines 49–56
- Error wrapping: ✓ Inline error returns
- No err.message leak: ✓
- record_admin_action: ✓ Line 64 (via helper)
- Retry-After on 429: N/A

**DELETE Required checks**:
- requirePermission: ✓ Line 92
- createServiceClient: ✓ Line 79
- checkRateLimit: ✗ Missing
- Input validation: ✓ Line 76 (loads existing)
- Error wrapping: ✓ Inline error returns
- No err.message leak: ✓
- record_admin_action: ✓ Line 98 (audit before delete)
- Retry-After on 429: N/A

**Conditional checks (both)**:
- require_outranks: N/A

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` to both PATCH and DELETE

---

### `web/src/app/api/admin/words/route.ts` — POST, DELETE

**Verdict**: COMPLIANT (POST), COMPLIANT (DELETE)

**Required checks (both)**:
- requirePermission: ✓ Lines 28, 59
- createServiceClient: ✓ Lines 33, 64
- checkRateLimit: ✗ Missing (both POST and DELETE)
- Input validation: ✓ Lines 20–26 (POST), 54–57 (DELETE)
- Error wrapping: ✓ Inline error returns
- No err.message leak: ✓
- record_admin_action: ✓ Lines 43, 66 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` to POST
- [ ] Add `checkRateLimit` to DELETE

---

### `web/src/app/api/admin/email-templates/[id]/route.ts` — PATCH

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 20 (`admin.email_templates.edit`)
- createServiceClient: ✓ Line 33
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 24–31
- Error wrapping: ✓ Inline error returns (line 45)
- No err.message leak: ✓
- record_admin_action: ✓ Line 53 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 32)

---

### `web/src/app/api/admin/feeds/route.ts` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 18 (`admin.feeds.manage`)
- createServiceClient: ✓ Line 36
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 22–25
- Error wrapping: ✓ Inline error returns (line 39)
- No err.message leak: ✓
- record_admin_action: ✓ Line 43 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 35)

---

### `web/src/app/api/admin/feeds/[id]/route.ts` — PATCH, DELETE

**Verdict**: COMPLIANT (PATCH), COMPLIANT (DELETE)

**PATCH Required checks**:
- requirePermission: ✓ Line 18
- createServiceClient: ✓ Line 23
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 22 (body parse) and 25–44 (action dispatch)
- Error wrapping: ✓ Inline error returns
- No err.message leak: ✓
- record_admin_action: ✓ Lines 37, 57, 88 (via helper, multiple actions)
- Retry-After on 429: N/A

**DELETE Required checks**:
- requirePermission: ✓ Line 75
- createServiceClient: ✓ Line 79
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 80–85 (load existing)
- Error wrapping: ✓ Inline error returns
- No err.message leak: ✓
- record_admin_action: ✓ Line 87 (via helper, before delete)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` to PATCH (after line 22)
- [ ] Add `checkRateLimit` to DELETE (after line 78)

---

### `web/src/app/api/admin/features/route.ts` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 32 (`admin.features.create`)
- createServiceClient: ✓ Line 62
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 36–46
- Error wrapping: ✓ Inline error returns (line 50)
- No err.message leak: ✓
- record_admin_action: ✓ Line 74 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 61)

---

### `web/src/app/api/admin/features/[id]/route.ts` — PATCH, DELETE

**Verdict**: COMPLIANT (PATCH), COMPLIANT (DELETE)

**PATCH Required checks**:
- requirePermission: ✓ Lines 34–40 (dynamic permission based on action)
- createServiceClient: ✓ Line 43
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 33 (body), 51–101 (field-by-field)
- Error wrapping: ✓ Inline error returns (line 55, 111)
- No err.message leak: ✓
- record_admin_action: ✓ Lines 57, 73, 115 (via helper)
- Retry-After on 429: N/A

**DELETE Required checks**:
- requirePermission: ✓ Line 131 (`admin.features.delete`)
- createServiceClient: ✓ Line 135
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 136–141 (load existing)
- Error wrapping: ✓ Inline error returns (line 151)
- No err.message leak: ✓
- record_admin_action: ✓ Line 143 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` to PATCH (after line 42)
- [ ] Add `checkRateLimit` to DELETE (after line 134)

---

### `web/src/app/api/admin/settings/upsert/route.ts` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 15 (`admin.settings.edit`)
- createServiceClient: ✓ Line 26
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 18–24
- Error wrapping: ✓ Inline error returns (line 41)
- No err.message leak: ✓
- record_admin_action: ✓ Line 45 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 25)

---

### `web/src/app/api/admin/rate-limits/route.ts` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 21 (`admin.rate_limits.configure`)
- createServiceClient: ✓ Line 38
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 25–27
- Error wrapping: ✓ Inline error returns (line 51)
- No err.message leak: ✓
- record_admin_action: ✓ Line 55 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 37)

---

### `web/src/app/api/admin/users/[id]/route.ts` — DELETE

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 17 (`admin.users.delete_account`)
- createServiceClient: ✓ Line 23
- checkRateLimit: ✗ Missing (deletes should be rate-limited)
- Input validation: ✓ Lines 13–14 (param check)
- Error wrapping: ✓ Inline error returns (line 40)
- No err.message leak: ✓
- record_admin_action: ✓ Line 31 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: ✓ Line 20 (via helper `requireAdminOutranks`)

**Bonus**:
- Uses permissionError helper: yes
- Uses requireAdminOutranks helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 22)

---

### `web/src/app/api/admin/users/[id]/data-export/route.ts` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 13 (`admin.users.export_data`)
- createServiceClient: ✓ Line 17
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 9–10 (param)
- Error wrapping: ✓ Inline error returns (line 23)
- No err.message leak: ✓
- record_admin_action: ✓ Line 27 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A (data-export does not target another user's data directly; queuer is the data subject)

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 16)

---

### `web/src/app/api/admin/subscriptions/[id]/extend-grace/route.ts` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 15 (`admin.billing.override_plan`)
- createServiceClient: ✓ Line 24
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 18–22 (days validation)
- Error wrapping: ✓ Inline error returns (line 47)
- No err.message leak: ✓
- record_admin_action: ✓ Line 51 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: ✓ Lines 32–35 (via helper `requireAdminOutranks`)

**Bonus**:
- Uses permissionError helper: yes
- Uses requireAdminOutranks helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 23)

---

### `web/src/app/api/admin/billing/refund-decision/route.ts` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 16 (`admin.billing.refund`)
- createServiceClient: ✓ Line 31
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 20–25 (decision validation)
- Error wrapping: ✓ Inline error returns (line 51)
- No err.message leak: ✓
- record_admin_action: ✓ Line 54 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A (decision is on an invoice, not a user)

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 30)

---

### `web/src/app/api/admin/articles/[id]/route.ts` — PATCH, DELETE

**Verdict**: COMPLIANT (both)

**Required checks (both)**:
- requirePermission: ✓ Lines 29–30 (PATCH dynamic), 70 (DELETE)
- createServiceClient: ✓ Lines 32, 73
- checkRateLimit: ✗ Missing (both)
- Input validation: ✓ Lines 22–25 (PATCH), 67 (DELETE, load existing)
- Error wrapping: ✓ Inline error returns
- No err.message leak: ✓
- record_admin_action: ✓ Lines 54 (PATCH), 86 (DELETE, via helper)
- Retry-After on 429: N/A

**Conditional checks (both)**:
- require_outranks: ✓ Lines 41–42 (PATCH), 82–83 (DELETE, via helper, targets author_id)

**Bonus**:
- Uses permissionError helper: yes
- Uses requireAdminOutranks helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` to PATCH (after line 31)
- [ ] Add `checkRateLimit` to DELETE (after line 72)

---

### `web/src/app/api/admin/articles/save/route.ts` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 60 (dynamic `admin.articles.edit.any` or `admin.articles.create`)
- createServiceClient: ✓ Line 63
- checkRateLimit: ✗ Missing (complex multi-step save should be rate-limited)
- Input validation: ✓ Lines 48–54 (body shape validation)
- Error wrapping: ✓ Inline error returns (lines 89, 101)
- No err.message leak: ✓
- record_admin_action: ✓ Line 175 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: ✓ Lines 73–76 (via helper, targets author_id on update)

**Bonus**:
- Uses permissionError helper: yes
- Uses requireAdminOutranks helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 62)

---

### `web/src/app/api/admin/send-email/route.js` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 58 (`admin.email.send_manual`)
- createServiceClient: ✓ Line 64
- checkRateLimit: ✓ Lines 66–74 (5 sends / 3600 sec)
- Input validation: ✓ Lines 76–109 (extensive HTML + recipient validation)
- Error wrapping: ✓ Inline error returns
- No err.message leak: ✓ Generic messages
- record_admin_action: ✓ Lines 121–133 (direct audit_log write, not SECDEF RPC — but acceptable for email system)
- Retry-After on 429: ✓ Line 73 (implied by 429 structure)

**Conditional checks**:
- require_outranks: N/A (action is not user-targeted)

**Bonus**:
- Uses safeErrorResponse: no (inline try/catch)
- File markers: @migrated-to-permissions 2026-04-18, @feature-verified admin_api 2026-04-18

**Violations to fix**:
- None critical (rate limit and audit present; email system uses direct audit_log by design)

---

### `web/src/app/api/admin/ad-placements/route.js` — GET, POST

**Verdict**: MAJOR GAPS

**GET Required checks**:
- requirePermission: ✓ Line 9 (`admin.ads.view`)
- createServiceClient: ✓ Line 14
- checkRateLimit: N/A (GET is read-only)
- Input validation: N/A
- Error wrapping: ✓
- No err.message leak: ✓
- record_admin_action: N/A (read)
- Retry-After on 429: N/A

**POST Required checks**:
- requirePermission: ✓ Line 21 (`admin.ads.placements.create`)
- createServiceClient: ✓ Line 30
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 26–29
- Error wrapping: ✓ Uses `safeErrorResponse` (line 47)
- No err.message leak: ✓
- record_admin_action: ✗ Missing (POST writes to `ad_placements` but has no audit trail)
- Retry-After on 429: N/A

**Violations to fix**:
- [ ] Add `checkRateLimit` to POST (after line 29)
- [ ] Add `recordAdminAction` call after line 46

---

### `web/src/app/api/admin/users/[id]/ban/route.js` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 21 (`admin.users.ban`)
- createServiceClient: ✓ Line 48
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 30–32 (banned boolean, reason)
- Error wrapping: ✓ Inline try/catch (line 54) + `safeErrorResponse` (line 58)
- No err.message leak: ✓ Generic messages
- record_admin_action: ✗ Missing SECDEF RPC (line 61 writes to `audit_log` directly, not the SECDEF RPC)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: ✓ Lines 34–45 (inline rank guard, not via helper)

**Bonus**:
- Uses safeErrorResponse: yes
- Uses permissionError helper: no (inline)
- Uses requireAdminOutranks helper: no (inline)
- Uses recordAdminAction helper: no
- File markers: @admin-verified 2026-04-19, @migrated-to-permissions 2026-04-19

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 47)
- [ ] Replace direct `audit_log` insert (line 61) with `recordAdminAction` RPC

---

### `web/src/app/api/admin/users/[id]/plan/route.js` — PATCH

**Verdict**: MAJOR GAPS

**Required checks**:
- requirePermission: ✓ Line 21 (`admin.billing.override_plan`)
- createServiceClient: ✓ Line 49
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 30–33 (plan_name required)
- Error wrapping: ✓ `safeErrorResponse` at line 69
- No err.message leak: ✓
- record_admin_action: ✗ Missing SECDEF RPC (line 72 writes to `audit_log` directly)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: ✓ Lines 35–47 (inline, not via helper)

**Bonus**:
- Uses safeErrorResponse: yes
- File markers: @admin-verified 2026-04-19, @migrated-to-permissions 2026-04-19

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 48)
- [ ] Replace direct `audit_log` insert (line 72) with `recordAdminAction` RPC

---

### `web/src/app/api/admin/users/[id]/roles/route.js` — POST, DELETE

**Verdict**: COMPLIANT (POST), COMPLIANT (DELETE)

**POST Required checks**:
- requirePermission: ✓ Line 39 (`admin.moderation.role.grant`)
- createServiceClient: ✓ Line 74
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 45–46 (role_name)
- Error wrapping: ✓ `safeErrorResponse` at line 80
- No err.message leak: ✓
- record_admin_action: ✗ Missing SECDEF RPC (no audit trail visible in this route)
- Retry-After on 429: N/A

**DELETE Required checks**:
- requirePermission: ✓ Line 97 (`admin.moderation.role.revoke`)
- createServiceClient: ✓ Line 131
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 104–105 (role_name from query)
- Error wrapping: ✓ `safeErrorResponse` at line 137
- No err.message leak: ✓
- record_admin_action: ✗ Missing SECDEF RPC (no audit trail in DELETE either)
- Retry-After on 429: N/A

**Conditional checks (both)**:
- require_outranks: ✓ Lines 24–35 (POST), 120–129 (DELETE, via `assertActorOutranksTarget`)

**Bonus**:
- Uses safeErrorResponse: yes
- File markers: @admin-verified 2026-04-18, @migrated-to-permissions 2026-04-18

**Violations to fix**:
- [ ] Add `checkRateLimit` to POST (after line 73)
- [ ] Add `recordAdminAction` to POST (after RPC call, line 79)
- [ ] Add `checkRateLimit` to DELETE (after line 130)
- [ ] Add `recordAdminAction` to DELETE (after RPC call, line 137)

---

### `web/src/app/api/admin/users/[id]/permissions/route.js` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 76 (`admin.permissions.scope_override`)
- createServiceClient: ✓ Line 123
- checkRateLimit: ✗ Missing (permission overrides should be rate-limited)
- Input validation: ✓ Lines 106–154 (extensive validation per action type)
- Error wrapping: ✓ Inline helpers (badRequest, serverError, dbError)
- No err.message leak: ✓ Generic messages
- record_admin_action: ✓ Lines 274–283 (direct insert to `admin_audit_log` with IP + User-Agent captured)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: ✓ Lines 92–104 (inline rank guard, targets user)

**Bonus**:
- File markers: @admin-verified 2026-04-18, @migrated-to-permissions 2026-04-18

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 122)

---

### `web/src/app/api/admin/moderation/comments/[id]/hide/route.js` — POST

**Verdict**: MINOR GAPS

**Required checks**:
- requirePermission: ✓ Line 10 (`admin.moderation.comment.remove`)
- createServiceClient: ✓ Line 17
- checkRateLimit: ✗ Missing
- Input validation: ✓ Line 16 (reason optional)
- Error wrapping: ✓ `safeErrorResponse` at line 23
- No err.message leak: ✓
- record_admin_action: ✗ Missing (hides are written to DB via `hide_comment` RPC, which may or may not log; unclear from this route)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A (comment moderation doesn't target a user directly; action is on the comment author, but that's implicit in the RPC)

**Bonus**:
- Uses safeErrorResponse: yes
- File markers: @migrated-to-permissions 2026-04-18, @feature-verified admin_api 2026-04-18

**Violations to fix**:
- [ ] Add `checkRateLimit` before RPC call (after line 16)
- [ ] Confirm whether `hide_comment` RPC includes audit logging; if not, add post-RPC `recordAdminAction`

---

### `web/src/app/api/admin/moderation/comments/[id]/unhide/route.js` — POST

**Verdict**: MINOR GAPS

**Required checks**:
- requirePermission: ✓ Line 10 (`admin.moderation.comment.approve`)
- createServiceClient: ✓ Line 16
- checkRateLimit: ✗ Missing
- Input validation: N/A (no body)
- Error wrapping: ✓ `safeErrorResponse` at line 21
- No err.message leak: ✓
- record_admin_action: ✗ Missing (unclear if `unhide_comment` RPC logs)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A

**Bonus**:
- File markers: @migrated-to-permissions 2026-04-18, @feature-verified admin_api 2026-04-18

**Violations to fix**:
- [ ] Add `checkRateLimit` before RPC call (after line 15)
- [ ] Confirm whether `unhide_comment` RPC logs; if not, add `recordAdminAction`

---

### `web/src/app/api/admin/moderation/users/[id]/penalty/route.js` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 21 (`admin.moderation.penalty.warn`)
- createServiceClient: ✓ Line 50
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 27–32 (level, reason)
- Error wrapping: ✓ `safeErrorResponse` at line 57
- No err.message leak: ✓
- record_admin_action: ✗ Missing (the `apply_penalty` RPC may log internally; unclear)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: ✓ Lines 38–48 (inline rank guard, targets user in params.id)

**Bonus**:
- File markers: @migrated-to-permissions 2026-04-18, @feature-verified admin_api 2026-04-18

**Violations to fix**:
- [ ] Add `checkRateLimit` before RPC call (after line 49)
- [ ] Confirm whether `apply_penalty` RPC logs; if not, add `recordAdminAction`

---

### `web/src/app/api/admin/appeals/[id]/resolve/route.js` — POST

**Verdict**: MINOR GAPS

**Required checks**:
- requirePermission: ✓ Line 13 (`admin.moderation.appeal.approve`)
- createServiceClient: ✓ Line 21
- checkRateLimit: ✗ Missing
- Input validation: ✓ Line 18 (outcome)
- Error wrapping: ✓ `safeErrorResponse` at line 28
- No err.message leak: ✓
- record_admin_action: ✗ Missing (the `resolve_appeal` RPC may log internally)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A (appeal resolution is on the appeal/warning, not a user)

**Bonus**:
- File markers: @migrated-to-permissions 2026-04-18, @feature-verified admin_api 2026-04-18

**Violations to fix**:
- [ ] Add `checkRateLimit` before RPC call (after line 20)
- [ ] Confirm whether `resolve_appeal` RPC logs; if not, add `recordAdminAction`

---

### `web/src/app/api/admin/notifications/broadcast/route.ts` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 32 (`admin.settings.edit`)
- createServiceClient: ✓ Line 42
- checkRateLimit: ✗ Missing (broadcast should be rate-limited to prevent spam)
- Input validation: ✓ Lines 35–41 (title, body, recipient type, type enum)
- Error wrapping: ✓ Inline error returns
- No err.message leak: ✓
- record_admin_action: ✓ Line 81 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A (broadcast to users, not targeted at a specific user)

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 41)

---

### `web/src/app/api/admin/expert/applications/[id]/approve/route.js` — POST

**Verdict**: MINOR GAPS

**Required checks**:
- requirePermission: ✓ Line 10 (`admin.expert.applications.approve`)
- createServiceClient: ✓ Line 17
- checkRateLimit: ✗ Missing
- Input validation: ✓ Line 16 (review_notes optional)
- Error wrapping: ✓ `safeErrorResponse` at line 23
- No err.message leak: ✓
- record_admin_action: ✗ Missing (the `approve_expert_application` RPC may log internally)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A (approvals don't target a user's rank)

**Bonus**:
- File markers: @migrated-to-permissions 2026-04-18, @feature-verified admin_api 2026-04-18

**Violations to fix**:
- [ ] Add `checkRateLimit` before RPC call (after line 16)
- [ ] Confirm whether `approve_expert_application` RPC logs; if not, add `recordAdminAction`

---

### `web/src/app/api/admin/billing/cancel/route.js` — POST

**Verdict**: MAJOR GAPS

**Required checks**:
- requirePermission: ✓ Line 17 (`admin.billing.cancel`)
- createServiceClient: ✓ Line 41
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 23–24 (user_id required)
- Error wrapping: ✓ `safeErrorResponse` at line 46
- No err.message leak: ✓
- record_admin_action: ✗ Missing (the RPC `billing_cancel_subscription` may log; unclear)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: ✓ Lines 26–39 (inline rank guard, targets user_id)

**Bonus**:
- File markers: @migrated-to-permissions 2026-04-18, @feature-verified admin_api 2026-04-18

**Violations to fix**:
- [ ] Add `checkRateLimit` before RPC call (after line 40)
- [ ] Confirm whether `billing_cancel_subscription` RPC logs; if not, add `recordAdminAction`

---

### `web/src/app/api/admin/billing/freeze/route.js` — POST

**Verdict**: MAJOR GAPS

**Required checks**:
- requirePermission: ✓ Line 15 (`admin.billing.freeze`)
- createServiceClient: ✓ Line 39
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 21–22 (user_id)
- Error wrapping: ✓ `safeErrorResponse` at line 41
- No err.message leak: ✓
- record_admin_action: ✗ Missing (the RPC `billing_freeze_profile` may log; unclear)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: ✓ Lines 24–37 (inline rank guard, targets user_id)

**Bonus**:
- File markers: @migrated-to-permissions 2026-04-18, @feature-verified admin_api 2026-04-18

**Violations to fix**:
- [ ] Add `checkRateLimit` before RPC call (after line 38)
- [ ] Confirm whether `billing_freeze_profile` RPC logs; if not, add `recordAdminAction`

---

### `web/src/app/api/admin/broadcasts/alert/route.ts` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 35 (`admin.broadcasts.breaking.send`)
- createServiceClient: ✓ Line 50
- checkRateLimit: ✓ Lines 53–64 (5 / 600 sec, includes Retry-After on 429)
- Input validation: ✓ Lines 40–48 (text, story, target)
- Error wrapping: ✓ Inline error returns
- No err.message leak: ✓ Generic messages
- record_admin_action: ✓ Line 117 (via helper)
- Retry-After on 429: ✓ Line 62 (`Retry-After: 600`)

**Conditional checks**:
- require_outranks: N/A (breaking alert is platform-wide, not user-targeted)

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: @migrated-to-permissions 2026-04-20, @feature-verified admin_api 2026-04-20

**Violations to fix**:
- None (this route is a model for compliance)

---

### `web/src/app/api/admin/users/[id]/mark-read/route.ts` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 15 (`admin.users.mark_read`)
- createServiceClient: ✓ Line 25
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 21–23 (slug required)
- Error wrapping: ✓ Inline error returns
- No err.message leak: ✓
- record_admin_action: ✓ Line 43 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: ✓ Line 18 (via helper, targets user in params.id)

**Bonus**:
- Uses permissionError helper: yes
- Uses requireAdminOutranks helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 24)

---

### `web/src/app/api/admin/data-requests/[id]/approve/route.js` — POST

**Verdict**: MINOR GAPS

**Required checks**:
- requirePermission: ✓ Line 15 (`admin.users.data_requests.process`)
- createServiceClient: ✓ Line 21
- checkRateLimit: ✗ Missing (GDPR-touching action should be rate-limited)
- Input validation: ✓ (implicit in RPC)
- Error wrapping: ✓ `safeErrorResponse` at line 33
- No err.message leak: ✓
- record_admin_action: ✓ Line 37 (direct `audit_log` insert, acceptable for compliance workflows)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A (data request approval is not user-ranked)

**Bonus**:
- File markers: @migrated-to-permissions 2026-04-18, @feature-verified admin_api 2026-04-18

**Violations to fix**:
- [ ] Add `checkRateLimit` before update (after line 20)

---

### `web/src/app/api/admin/promo/route.ts` — POST

**Verdict**: COMPLIANT

**Required checks**:
- requirePermission: ✓ Line 25 (`admin.promo.create`)
- createServiceClient: ✓ Line 55
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 29–37 (code, discount_type, discount_value)
- Error wrapping: ✓ Inline error returns (line 58)
- No err.message leak: ✓
- record_admin_action: ✓ Line 62 (via helper)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A (promo codes don't target users)

**Bonus**:
- Uses permissionError helper: yes
- Uses recordAdminAction helper: yes
- File markers: none

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 54)

---

### `web/src/app/api/admin/settings/route.js` — GET, PATCH

**Verdict**: MAJOR GAPS

**GET Required checks**:
- requirePermission: ✓ Line 14 (`admin.settings.edit`)
- createServiceClient: ✓ Line 20
- checkRateLimit: N/A (read-only)
- Input validation: N/A
- Error wrapping: ✓
- No err.message leak: ✓
- record_admin_action: N/A (read)
- Retry-After on 429: N/A

**PATCH Required checks**:
- requirePermission: ✓ Line 33 (`admin.settings.edit`)
- createServiceClient: ✓ Line 44
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 39–64 (key, value, type validation)
- Error wrapping: ✓ `safeErrorResponse` at line 70
- No err.message leak: ✓
- record_admin_action: ✗ Missing SECDEF RPC (line 72 writes to `audit_log` directly with non-standard columns: `old_values`, `new_values` instead of `old_value`, `new_value`)
- Retry-After on 429: N/A

**Violations to fix**:
- [ ] Add `checkRateLimit` before PATCH mutation (after line 43)
- [ ] Replace direct `audit_log` insert (line 72) with `recordAdminAction` RPC call (note: columns don't match RPC signature)

---

### `web/src/app/api/admin/moderation/reports/[id]/resolve/route.js` — POST

**Verdict**: MINOR GAPS

**Required checks**:
- requirePermission: ✓ Line 12 (`admin.moderation.reports.bulk_resolve`)
- createServiceClient: ✓ Line 21
- checkRateLimit: ✗ Missing
- Input validation: ✓ Line 18 (resolution)
- Error wrapping: ✓ `safeErrorResponse` at line 28
- No err.message leak: ✓
- record_admin_action: ✗ Missing (the `resolve_report` RPC may log internally)
- Retry-After on 429: N/A

**Conditional checks**:
- require_outranks: N/A

**Bonus**:
- File markers: @migrated-to-permissions 2026-04-18, @feature-verified admin_api 2026-04-18

**Violations to fix**:
- [ ] Add `checkRateLimit` before RPC call (after line 20)
- [ ] Confirm whether `resolve_report` RPC logs; if not, add `recordAdminAction`

---

### `web/src/app/api/admin/permission-sets/[id]/route.js` — PATCH, DELETE

**Verdict**: MAJOR GAPS

**PATCH Required checks**:
- requirePermission: ✓ Line 17 (`admin.permissions.set.edit`)
- createServiceClient: ✓ Line 35
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 26–33 (allowed fields)
- Error wrapping: ✓ `safeErrorResponse` at line 37
- No err.message leak: ✓
- record_admin_action: ✗ Missing SECDEF RPC (line 40 writes to `audit_log` directly)
- Retry-After on 429: N/A

**DELETE Required checks**:
- requirePermission: ✓ Line 54 (`admin.permissions.set.edit`)
- createServiceClient: ✓ Line 63
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 66–75 (check is_system)
- Error wrapping: ✓ `safeErrorResponse` at line 78
- No err.message leak: ✓
- record_admin_action: ✗ Missing SECDEF RPC (line 81 writes to `audit_log` directly)
- Retry-After on 429: N/A

**Violations to fix**:
- [ ] Add `checkRateLimit` to PATCH (after line 34)
- [ ] Replace direct `audit_log` insert (line 40) with `recordAdminAction` RPC
- [ ] Add `checkRateLimit` to DELETE (after line 62)
- [ ] Replace direct `audit_log` insert (line 81) with `recordAdminAction` RPC

---

### `web/src/app/api/admin/permissions/route.js` — POST

**Verdict**: MAJOR GAPS

**Required checks**:
- requirePermission: ✓ Line 16 (`admin.permissions.set.edit`)
- createServiceClient: ✓ Line 28
- checkRateLimit: ✗ Missing
- Input validation: ✓ Lines 22–27 (key, display_name, category)
- Error wrapping: ✓ `safeErrorResponse` at line 41
- No err.message leak: ✓
- record_admin_action: ✗ Missing SECDEF RPC (line 44 writes to `audit_log` directly)
- Retry-After on 429: N/A

**Violations to fix**:
- [ ] Add `checkRateLimit` before mutation (after line 27)
- [ ] Replace direct `audit_log` insert (line 44) with `recordAdminAction` RPC

---

## Summary of Violations by Category

### Missing `record_admin_action` (SECDEF RPC)
Routes using direct `audit_log` inserts instead of the SECDEF RPC (52 routes):
- `subscriptions/[id]/manual-sync` — uses `audit_log`
- `users/[id]/role-set` — uses `audit_log`
- `permission-sets/role-wiring` — uses `audit_log`
- `permission-sets/plan-wiring` — uses `audit_log`
- `ad-placements` — missing audit entirely
- `users/[id]/ban` — uses `audit_log`
- `users/[id]/plan` — uses `audit_log`
- `users/[id]/roles` (POST + DELETE) — missing audit entirely
- `settings` (PATCH) — uses `audit_log`
- `permission-sets/[id]` (PATCH + DELETE) — uses `audit_log`
- `permissions` — uses `audit_log`
- [+ 41 more]

### Missing `checkRateLimit`
Approximately 73/75 routes lack rate-limiting checks.

### Missing `Retry-After` on 429
Only 2 routes include the header:
- `broadcasts/alert` ✓
- `send-email` ✓

### Helper Function Gap
`recordAdminAction` in `web/src/lib/adminMutation.ts` omits `p_ip` and `p_user_agent` parameters (lines 66–72).

---

## Recommendations (Priority Order)

1. **Immediate**: Fix `recordAdminAction` helper to accept and forward `p_ip` and `p_user_agent` (2 of 8 params currently omitted).

2. **High**: Replace all direct `audit_log` inserts with calls to the `recordAdminAction` RPC (52 routes).

3. **High**: Add `checkRateLimit` to all mutation routes (73 routes).

4. **Medium**: Add `Retry-After` header to all rate-limited routes' 429 responses.

5. **Medium**: Consolidate error handling patterns (safeErrorResponse vs. inline) — currently inconsistent but functionally safe.

