-- Session 6: drop dead access_requests columns left over from the removed
-- two-step email-confirmation intake flow (/api/access-request/confirm).
-- Verified no callers read these columns. email_confirmed_at was written
-- opportunistically but is unused by any query or filter.
--
-- Pre-drop count check (run before applying):
--   SELECT count(*) FROM public.access_requests WHERE email_confirm_token IS NOT NULL;
--   → 1 (old dev row, safe to discard)
--   SELECT count(*) FROM public.access_requests WHERE email_confirmed_at IS NOT NULL;
--   → 2 (legacy rows, safe to discard)

ALTER TABLE public.access_requests DROP COLUMN IF EXISTS email_confirm_token;
ALTER TABLE public.access_requests DROP COLUMN IF EXISTS email_confirm_expires_at;
ALTER TABLE public.access_requests DROP COLUMN IF EXISTS email_confirmed_at;
