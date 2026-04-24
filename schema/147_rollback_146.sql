-- 147_rollback_146.sql
DELETE FROM public.rate_limits WHERE key = 'verify_password';
