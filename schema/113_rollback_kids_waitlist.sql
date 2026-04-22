-- schema/113_rollback_kids_waitlist.sql
-- Rollback for schema/112_kids_waitlist.sql
-- 2026-04-22 — apply only if M6 ship needs to be reverted.

drop table if exists public.kids_waitlist;

delete from public.rate_limits
  where key in ('kids_waitlist_ip', 'kids_waitlist_addr');
