# Analytics fields reference

When you query Verity Post for "iOS users" or "where did this happen," there are
two distinct platform fields. They mean different things. Picking the wrong one
gives you a number that looks plausible but answers a different question.

This page is the canonical reference. Read it before writing any new dashboard,
funnel, cohort, or growth query that filters or groups by platform.

## The two fields

### `audit_log.metadata.client` — per-login (transient)

Tagged on every audit row at the time of the action. Tells you which device the
user was on **for that specific session/event**. Values: `'web' | 'ios' | 'kids'`.

A user who signed up on web, came back the next day, installed iOS, and signed in
through the app produces:

| event              | client |
|--------------------|--------|
| signup_complete    | web    |
| magic_link_sent    | web    |
| signin_complete    | ios    |
| article_view (iOS) | ios    |
| article_view (web) | web    |

### `auth.users.raw_user_meta_data.signup_source` — durable (origin)

Set **once** at user creation by `send-magic-link` (`api/auth/send-magic-link/route.js:290`).
Never updated. Tells you the platform a user **originally signed up on**. Same
value enum: `'web' | 'ios' | 'kids'`.

The same user above has `signup_source = 'web'` for the rest of their account
lifetime, regardless of how many times they later sign in from iOS.

## Which field to use

| You want to know…                                     | Use                       |
|-------------------------------------------------------|---------------------------|
| "How many users acquired this week came from iOS?"    | `signup_source`           |
| "What's our 30-day retention for web-acquired users?" | `signup_source`           |
| "Tell iOS-acquired users about a new feature"         | `signup_source`           |
| "Which device did this audit row happen on?"          | `metadata.client`         |
| "Cross-device sign-in pattern by user"                | `metadata.client` (group) |
| "Was this approval action taken from the iOS app?"    | `metadata.client`         |

**Rule of thumb:** funnel / acquisition / cohort / growth queries almost always
want `signup_source`. Per-event / per-action queries want `metadata.client`.

## Read patterns

```sql
-- ✅ "iOS-acquired users this week"
SELECT count(*) FROM auth.users
WHERE raw_user_meta_data->>'signup_source' = 'ios'
  AND created_at > now() - interval '7 days';

-- ❌ Wrong — counts users who happened to sign in from iOS this week
-- (includes a web-acquired user who logged in from their iPhone once)
SELECT count(distinct user_id) FROM audit_log
WHERE metadata->>'client' = 'ios'
  AND created_at > now() - interval '7 days';
```

```sql
-- ✅ "Per-platform sign-in counts today"
SELECT metadata->>'client' AS client, count(*)
FROM audit_log
WHERE reason = 'signin_complete'
  AND created_at > now() - interval '1 day'
GROUP BY 1;

-- ❌ Wrong — joins to users for origin, mixes the two semantics
SELECT u.raw_user_meta_data->>'signup_source' AS client, count(*)
FROM audit_log a JOIN auth.users u ON u.id = a.user_id
WHERE a.reason = 'signin_complete' ...;
```

## Edge case: signup_complete

`signup_complete` audit rows write the user's **origin** as `metadata.client`
(`verify-magic-code/route.ts:312`). This looks like an inconsistency but isn't —
for the user's very first login, per-login client and durable origin are the
same value by definition. The fallback to `user_metadata.signup_source` at
lines 307–310 is defensive: if a future client drops the request-body `client`
field, the audit row still gets the correct origin tag.

This means: aggregating `metadata.client` across `signup_complete` rows IS
valid as an acquisition metric and matches `signup_source` aggregation. But
the cleaner query reads `auth.users.raw_user_meta_data.signup_source`
directly — fewer assumptions about audit-row writers, won't drift if the
audit writer is ever changed.

## Schema location

- `signup_source` lives **only** in `auth.users.raw_user_meta_data` as a JSONB
  key. There is no denormalized column on `public.users`.
- `metadata.client` lives in `public.audit_log.metadata` (JSONB).

To read `signup_source` from a user-joined query you need access to `auth.users`
(service-role context or a security-definer view). The
`access_requests.consumption_source` column was introduced in migration
`20260512180000` precisely to expose this signal in `public` schema for the
admin access-requests funnel — that's the only existing denormalization.

## When you add a new write site

If you write to `audit_log.metadata`, set `client` to the **per-login** device
the request came from. Don't substitute `signup_source` unless you're writing
the user's first-ever audit row (signup_complete pattern).

If you create a new acquisition / cohort / growth query, query `signup_source`,
not `metadata.client`. Add a comment linking back to this doc so future readers
understand the choice.
