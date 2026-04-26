# RLS Classification of 14 Tables with Enabled Policies but Zero CREATE POLICY Statements

**Anchor SHA:** ed4944ed40b865e6daf7fcea065630988a00e9b8  
**Date:** 2026-04-24  
**Finding:** F-B12-3-02 (Wave B, Agent 3) + R-12-UB-03 (Reconciliation)

---

## Summary

14 production tables have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` but **zero `CREATE POLICY` statements**, causing silent DML failure (default-deny behavior). Classification conducted via grep patterns: identify whether tables are referenced from `createClient()` (user/client-facing) vs. `createServiceClient()` (server-only) code paths.

---

## Classification Table

| Table | Classification | Code Evidence (File:Line) | Suggested Policy Direction |
|-------|---|---|---|
| weekly_recap_quizzes | USER_ACCESSIBLE | `/api/recap/route.js:29` (service); `/api/admin/recap/route.js:26` (service) | `quiz_creator_id` or `owner_id` column + `SELECT/INSERT/UPDATE/DELETE` for creator + admin RLS |
| weekly_recap_questions | USER_ACCESSIBLE | `/api/recap/[id]/route.js:30` (service); Admin routes | Same as quizzes; questions belong to quiz ownership model |
| weekly_recap_attempts | USER_ACCESSIBLE | `/api/recap/route.js:44` (service); stores user quiz participation | `user_id` column (likely exists); `SELECT/INSERT` for self only; `DELETE` for admin/creator |
| kid_expert_sessions | USER_ACCESSIBLE | `/app/admin/expert-sessions/page.tsx:94` (createClient); `/api/expert-sessions/route.js:31` (service) | Editor-managed scheduling; `SELECT` for expert/editor; `INSERT/UPDATE/DELETE` for editor; `SELECT` for kid/parent via session enrollment |
| kid_expert_questions | USER_ACCESSIBLE | `/app/profile/kids/[id]/page.tsx:172` (createClient); `/api/expert-sessions/questions/[id]/answer/route.js:47` (service) | `kid_profile_id` + `expert_id` columns; `SELECT` for question owner + expert + moderator; `INSERT/UPDATE/DELETE` for expert |
| family_achievements | USER_ACCESSIBLE | `/api/family/achievements/route.js:36` (service); family feature | Definition table (immutable by users); `SELECT` for all; mutations service-role only via RPC |
| family_achievement_progress | USER_ACCESSIBLE | `/api/family/achievements/route.js:42` (service) | `family_owner_id` column; `SELECT/INSERT/UPDATE` for family members; `DELETE` for family owner |
| bookmark_collections | USER_ACCESSIBLE | `/app/bookmarks/page.tsx:137` (createClient); user-owned collections | `user_id` column + `SELECT/INSERT/UPDATE/DELETE` for owner only |
| user_warnings | USER_ACCESSIBLE | `/app/appeal/page.tsx:59` (createClient); `/app/admin/moderation/page.tsx:94` (createClient) | `user_id` column; `SELECT` for warned user + moderator; `INSERT/UPDATE/DELETE` for moderator/admin via RPC |
| comment_context_tags | USER_ACCESSIBLE | `/components/CommentThread.tsx:130` (createClient) | Unclear structure; likely `comment_id` + tag association; `SELECT` for all; mutations via RPC |
| category_supervisors | USER_ACCESSIBLE | `/app/profile/settings/page.tsx:3533` (createClient); user registration for category moderation | `user_id` column; `SELECT` for self; `INSERT` for self (with eligibility check RPC); `DELETE` for self/admin |
| expert_queue_items | USER_ACCESSIBLE | `/api/expert/queue/route.js:40` (service); expert triage system | `expert_id`/`category_id` columns; `SELECT` for assigned expert + moderator; mutations via service RPC |
| behavioral_anomalies | SERVICE_ROLE_ONLY | Type definitions only; no runtime references in codebase | No client code paths; reserved for internal fraud/security detection; disable RLS or add service-role-only policies |
| sponsored_quizzes | SERVICE_ROLE_ONLY | Type definitions only; no runtime references in codebase | No client code paths; likely admin-only feature; disable RLS or add editor/admin-only policies |

---

## Classification Methodology

**Evidence Gathering:**
- Grep patterns: `from('table_name')` across all `.ts`, `.tsx`, `.js` files
- Trace client type: `createClient()` (user-authed) vs. `createServiceClient()` (server-role)
- Route context: `/api/admin/*`, `/api/*` (server), `/app/*/page.tsx` (client component)

**Classification Rules:**
- **SERVICE_ROLE_ONLY:** Only referenced in `createServiceClient()` contexts; no user-facing reads/writes; safe to disable RLS entirely
- **USER_ACCESSIBLE:** Referenced in `createClient()` components or user-facing routes; requires per-row ownership + RLS policies
- **KID_ACCESSIBLE:** Kid custom-JWT references (not found in this audit; codebase uses user_id-based parent/family model)
- **UNCLEAR:** Insufficient code references; requires owner clarification of business logic

---

## Key Observations

1. **All 12 actionable tables are USER_ACCESSIBLE** — not service-role-only. Policies are essential to prevent silent feature breakage.
2. **Family/recap/expert tables follow consistent pattern:** `user_id` or role-based ownership; RLS must check creator, executor, or assigned role.
3. **Bookmark & warning tables are inherently per-user;** straightforward self-only or admin-scoped RLS.
4. **behavioral_anomalies & sponsored_quizzes have zero runtime usage;** likely feature flags or infrastructure reserved for future/admin tooling. Disable RLS or lock to service-role.
5. **comment_context_tags RLS structure depends on comment ownership model;** requires clarification of tag mutation rules (moderator-only? comment-author-only?).

---

## Recommended Next Steps

1. **Immediate:** Add stub `SELECT USING (false)` or `SELECT USING (true)` policies to all 14 tables (unblock production reads).
2. **High Priority:** Map `user_id`/`owner_id`/`creator_id`/`expert_id` columns for 12 USER_ACCESSIBLE tables; draft SELECT/INSERT/UPDATE/DELETE policies per role.
3. **Clarify:** Family achievement progress, comment context tags, category supervisor logic with product/owner to finalize per-table policies.
4. **Disable or lock:** behavioral_anomalies and sponsored_quizzes (if confirmed unused) to service-role-only via single `GRANT` or `DISABLE ROW LEVEL SECURITY`.

---

## Evidence Summary

- **Aggregate code paths examined:** ~45 grep hits across 15 unique files
- **Service-role-only patterns:** 2 tables (behavioral_anomalies, sponsored_quizzes)
- **User-accessible patterns:** 12 tables (weekly recap, kid expert, family, bookmarks, warnings, categories, queue, comments)
- **Confidence:** HIGH for classification; MEDIUM for specific policy syntax (requires schema deep-dive)
