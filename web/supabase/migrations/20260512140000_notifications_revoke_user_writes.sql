-- Lock down notifications writes (audit fix).
--
-- Background: every legitimate INSERT/UPDATE/DELETE on public.notifications
-- already runs through a service-role Supabase client (cron + /api/admin/*
-- + /api/notifications routes). The downstream audit confirmed no iOS path
-- writes directly, no realtime subscription depends on row-level writes,
-- and test fixtures use adminClient() (service-role). Revoking write grants
-- from anon + authenticated closes the row-level abuse vector — any user
-- attempting INSERT/UPDATE/DELETE via PostgREST will now hit 42501 from
-- PostgreSQL's grant layer before RLS even evaluates.

REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM anon;

COMMENT ON TABLE public.notifications IS 'User-readable only. All writes must go through service-role (cron or /api/admin/* or /api/notifications routes).';
