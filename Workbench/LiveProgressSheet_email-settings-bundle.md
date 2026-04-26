# LiveProgressSheet — T-083, T-128 through T-135: Email templates + settings bundle
Started: 2026-04-26

## User Intent
9 items executed atomically because settings/page.tsx and send-emails/route.js are touched by multiple items and must not be touched concurrently.

**Weekly digest removal (T-128–T-133):**
- T-128 + T-129: Migration to set `is_active = false` on `email_templates` where key IN ('weekly_reading_report', 'weekly_family_report')
- T-130: Remove `weekly_reading_report` and `weekly_family_report` from `TYPE_TO_TEMPLATE` in send-emails/route.js
- T-131: Remove `email_weekly_reading_report` and `email_weekly_family_report` from EMAIL_CONFIG array and DEFAULT_TOGGLE_STATE in admin/notifications/page.tsx
- T-132: Remove `weekly_reading_report` from AlertType union (line 244) and ALERT_ROWS array (line 259) in profile/settings/page.tsx
- T-133: Verify only — no code touching /api/reports/weekly-reading-report/ or the weekly_reading_report DB RPC (data endpoints, not delivery)

**New templates (T-134–T-135):**
- T-134: Add `comment_reply` to TYPE_TO_TEMPLATE + migration INSERT into email_templates (subject: "Someone replied to your comment")
- T-135: Add `expert_answer_posted` to TYPE_TO_TEMPLATE + migration INSERT into email_templates (subject: "Your question has been answered by an expert")
- Note: TYPE_TO_TEMPLATE net result: remove 2 weekly entries, add 2 new entries

**Billing (T-083):**
- Collapse always-visible promo code field in BillingCard (settings/page.tsx ~lines 4607–4644) behind a "Have a promo code?" link using a useState(false) toggle

## Live Code State

### send-emails/route.js (lines 21–29)
TYPE_TO_TEMPLATE currently has 7 entries:
- breaking_news → 'breaking_news_alert'
- weekly_reading_report → 'weekly_reading_report' **[REMOVE T-130]**
- weekly_family_report → 'weekly_family_report' **[REMOVE T-130]**
- kid_trial_day6 → 'kid_trial_day6'
- kid_trial_expired → 'kid_trial_expired'
- data_export_ready → 'data_export_ready'
- expert_reverification_due → 'expert_reverification_due'
After: add comment_reply + expert_answer_posted. Net 7 entries.

### admin/notifications/page.tsx
- EMAIL_CONFIG (lines 41–48): contains email_weekly_reading_report (line 44) and email_weekly_family_report (line 45) **[REMOVE T-131]**
- DEFAULT_TOGGLE_STATE (lines 64–72): contains `email_weekly_reading_report: true` and `email_weekly_family_report: true` (line 70) **[REMOVE T-131]**

### profile/settings/page.tsx
- AlertType union (lines 239–246): contains `'weekly_reading_report'` at line 244 **[REMOVE T-132]**
- ALERT_ROWS (lines 250–262): contains `{ key: 'weekly_reading_report', label: 'Weekly reading report', desc: 'Your week in review.' }` at line 259 **[REMOVE T-132]**
- BillingCard component (starts ~line 3788): `promoCode` state at line 3842, `handlePromo` at line 4084, promo Card block at lines 4607–4644
- The promo Card is currently always-visible when `showPromo` is true; field (TextInput + Apply button) are always rendered

### T-133 verify result
- /api/reports/weekly-reading-report/route.js: calls `weekly_reading_report` RPC — data endpoint, NOT email delivery — leave alone
- No other server-side code produces `type: 'weekly_reading_report'` or `type: 'weekly_family_report'` notification rows (confirmed by grep)

### Schema
- Last migration: 184_seed_quiz_comment_edit_rate_limit_policies.sql
- Next available: 185 (for T-128/T-129 deactivation) and 186 (for T-134/T-135 insertions)

## Contradictions
| Agent | File:line | Expected | Actual | Impact |
|-------|-----------|----------|--------|--------|
| Intake | admin/notifications/page.tsx:70 | weekly entries on separate lines | Both on same line 70 | No impact — same edit, just two keys on one line |
| Intake | profile/settings/page.tsx:259 | 'weekly_reading_report' only | Only weekly_reading_report in ALERT_ROWS (no weekly_family_report row) | Low — weekly_family_report is not an AlertType and has no ALERT_ROW; T-132 only removes the one that exists |

## Helper Brief
Success looks like:
1. `email_templates` table: `is_active=false` for both weekly keys
2. `send-emails/route.js` TYPE_TO_TEMPLATE: no weekly entries, has comment_reply + expert_answer_posted
3. `admin/notifications/page.tsx` EMAIL_CONFIG: no weekly entries; DEFAULT_TOGGLE_STATE: no weekly keys
4. `profile/settings/page.tsx` AlertType: no weekly_reading_report; ALERT_ROWS: no weekly_reading_report row
5. `profile/settings/page.tsx` BillingCard: promo field collapsed behind "Have a promo code?" toggle link
6. New email_templates rows for comment_reply and expert_answer_posted (is_active=true)
7. tsc clean after all changes

Risks:
- The promo code useState must be scoped to BillingCard (it already is at line 3842 — no lift needed)
- T-133 non-touch: /api/reports/weekly-reading-report/route.js and the DB RPC must NOT be modified
- Migration numbering: 185 = deactivation, 186 = new template inserts. Check no 185 exists before writing.
- Type safety: AlertType union removal at line 244 will cause tsc error if any code references 'weekly_reading_report' as an AlertType elsewhere — grep confirms no other call sites

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE (noted body_html/body_text column naming fix needed — incorporated)
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
[not needed]

## Implementation Progress
Status: SHIPPED
tsc: PASS (clean, no errors)
xcodebuild: N/A (web-only changes)

Changes made:
- schema/185_deactivate_weekly_email_templates.sql: created — UPDATE email_templates SET is_active=false for 2 weekly keys
- schema/186_add_comment_reply_expert_answer_templates.sql: created — INSERT comment_reply + expert_answer_posted rows
- web/src/app/api/cron/send-emails/route.js: TYPE_TO_TEMPLATE updated (removed weekly_reading_report + weekly_family_report, added comment_reply + expert_answer_posted)
- web/src/app/admin/notifications/page.tsx: EMAIL_CONFIG trimmed (2 weekly entries removed); DEFAULT_TOGGLE_STATE trimmed (2 weekly keys removed)
- web/src/app/profile/settings/page.tsx: AlertType union drops weekly_reading_report; ALERT_ROWS drops weekly row; showPromoInput state added; promo Card collapses behind link

Note: MCP is in read-only mode — schema/185 and schema/186 are written to disk and must be applied by the owner via Supabase dashboard.

## Completed
SHIPPED 2026-04-26
Commit: 49fa900
Files: schema/185, schema/186, send-emails/route.js, admin/notifications/page.tsx, profile/settings/page.tsx, Current Tasks.md
Review fixes: none — all changes matched plan exactly; tsc clean pre-commit; lint-staged ran prettier on the 3 web files
