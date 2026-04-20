-- 099_rls_hardening_kid_jwt_2026_04_19.sql
--
-- Defense-in-depth hardening against the custom-minted kid JWT (is_kid_delegated
-- claim). Existing permissive policies on adult-only tables happen to filter on
-- auth.uid() = user_id, and a kid's auth.uid() is a kid_profile_id that won't
-- match any adult user_id — so structural reads are already blocked. This
-- migration makes that explicit with RESTRICTIVE NOT is_kid_delegated() policies
-- so a future permissive policy can't silently widen access.
--
-- Also fills one gap: kid_expert_sessions only had a SELECT policy covering
-- status='scheduled', so kids couldn't see live/completed sessions the kids
-- app is meant to display.

begin;

-- 1. Kid-JWT SELECT policy for kid_expert_sessions
-- Existing kid_expert_sessions_select_public is auth.uid() IS NOT NULL + is_active + status='scheduled'.
-- Kids need to see live + completed sessions too. This adds a kid-JWT-only
-- permissive policy covering scheduled|live|completed for active sessions.
drop policy if exists kid_expert_sessions_select_kid_jwt on public.kid_expert_sessions;
create policy kid_expert_sessions_select_kid_jwt
  on public.kid_expert_sessions
  for select
  to authenticated
  using (
    public.is_kid_delegated()
    and coalesce(is_active, false) = true
    and (status)::text in ('scheduled', 'live', 'completed')
  );

-- 2. RESTRICTIVE NOT is_kid_delegated() on adult-only tables.
-- These tables should never be touched by a kid JWT. RESTRICTIVE ANDs with
-- existing permissive policies — it can only tighten, never loosen.

-- messages (PII, adult conversations)
drop policy if exists messages_block_kid_jwt on public.messages;
create policy messages_block_kid_jwt
  on public.messages
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

drop policy if exists message_receipts_block_kid_jwt on public.message_receipts;
create policy message_receipts_block_kid_jwt
  on public.message_receipts
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

drop policy if exists conversations_block_kid_jwt on public.conversations;
create policy conversations_block_kid_jwt
  on public.conversations
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

drop policy if exists conversation_participants_block_kid_jwt on public.conversation_participants;
create policy conversation_participants_block_kid_jwt
  on public.conversation_participants
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

-- notifications + push tokens (adult-scope delivery)
drop policy if exists notifications_block_kid_jwt on public.notifications;
create policy notifications_block_kid_jwt
  on public.notifications
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

drop policy if exists user_push_tokens_block_kid_jwt on public.user_push_tokens;
create policy user_push_tokens_block_kid_jwt
  on public.user_push_tokens
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

-- billing / subscriptions / support (payment + PII)
drop policy if exists subscriptions_block_kid_jwt on public.subscriptions;
create policy subscriptions_block_kid_jwt
  on public.subscriptions
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

drop policy if exists data_requests_block_kid_jwt on public.data_requests;
create policy data_requests_block_kid_jwt
  on public.data_requests
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

drop policy if exists support_tickets_block_kid_jwt on public.support_tickets;
create policy support_tickets_block_kid_jwt
  on public.support_tickets
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

-- admin + audit + ops
drop policy if exists error_logs_block_kid_jwt on public.error_logs;
create policy error_logs_block_kid_jwt
  on public.error_logs
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

drop policy if exists admin_audit_log_block_kid_jwt on public.admin_audit_log;
create policy admin_audit_log_block_kid_jwt
  on public.admin_audit_log
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

drop policy if exists user_roles_block_kid_jwt on public.user_roles;
create policy user_roles_block_kid_jwt
  on public.user_roles
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

drop policy if exists expert_applications_block_kid_jwt on public.expert_applications;
create policy expert_applications_block_kid_jwt
  on public.expert_applications
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

-- ads + sponsors (business)
drop policy if exists sponsors_block_kid_jwt on public.sponsors;
create policy sponsors_block_kid_jwt
  on public.sponsors
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

drop policy if exists ad_campaigns_block_kid_jwt on public.ad_campaigns;
create policy ad_campaigns_block_kid_jwt
  on public.ad_campaigns
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

drop policy if exists ad_placements_block_kid_jwt on public.ad_placements;
create policy ad_placements_block_kid_jwt
  on public.ad_placements
  as restrictive
  for all
  to authenticated
  using (not public.is_kid_delegated())
  with check (not public.is_kid_delegated());

commit;
