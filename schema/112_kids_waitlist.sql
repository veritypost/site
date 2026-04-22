-- schema/112_kids_waitlist.sql
-- 2026-04-22 — M6: parent email capture from /kids-app landing
--
-- Drafted + reviewed via multi-agent flow on 2026-04-22. Service-role-only
-- writes via POST /api/kids-waitlist. RLS is enabled with zero policies so
-- anon / authenticated roles are denied; only the service_role (used by
-- createServiceClient) can INSERT.
--
-- Rollback: see schema/113_rollback_kids_waitlist.sql (drop table + rate-limit rows).
--
-- CAN-SPAM posture: every outbound email generated from this list must
-- include an unsubscribe link that sets unsubscribed_at.

create table if not exists public.kids_waitlist (
  id              uuid primary key default gen_random_uuid(),
  email           text not null
                    check (email = lower(email))
                    check (length(email) between 5 and 254)
                    check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  source          text check (source is null or length(source) <= 80),
  ip_prefix       text check (ip_prefix is null or length(ip_prefix) <= 64),
  user_agent      text check (user_agent is null or length(user_agent) <= 1000),
  created_at      timestamptz not null default now(),
  unsubscribed_at timestamptz,
  constraint kids_waitlist_email_unique unique (email)
);

create index if not exists kids_waitlist_created_at_idx
  on public.kids_waitlist (created_at desc);

alter table public.kids_waitlist enable row level security;
-- No policies = service-role-only access. Postgres owners / service_role bypass
-- RLS; anon + authenticated roles have no matching policy and are denied.

comment on table public.kids_waitlist is
  'Parent email capture from /kids-app landing (M6 2026-04-22). Service-role-only writes via POST /api/kids-waitlist. CAN-SPAM: outbound emails must include unsubscribe link that sets unsubscribed_at.';

-- Rate-limit policies. Admin-tunable via the rate_limits table without a deploy.
-- These mirror the dual-key pattern from check_email (per-IP + per-address).
-- DO UPDATE on conflict so re-running the migration picks up any tuning changes
-- (mirrors the pattern in schema/101_seed_rate_limits.sql).
insert into public.rate_limits
  (key, display_name, description, max_requests, window_seconds, scope, is_active)
values
  ('kids_waitlist_ip',   'Kids waitlist (IP)',      'POST /api/kids-waitlist by IP',      10,  3600, 'ip',   true),
  ('kids_waitlist_addr', 'Kids waitlist (address)', 'POST /api/kids-waitlist by email',    3, 86400, 'user', true)
on conflict (key) do update set
  display_name   = excluded.display_name,
  description    = excluded.description,
  max_requests   = excluded.max_requests,
  window_seconds = excluded.window_seconds,
  scope          = excluded.scope,
  is_active      = excluded.is_active,
  updated_at     = now();
