-- public_profiles_v was running as SECURITY DEFINER (the PG-15 default
-- for views — reloptions IS NULL). That means the view executes with
-- the privileges of its owner (postgres), bypassing every RLS policy
-- on the underlying users table — including users_select_block_kid_jwt
-- (RESTRICTIVE, USING NOT is_kid_delegated()).
--
-- Practical effect: a kid JWT could read profile rows through
-- public_profiles_v that the equivalent direct SELECT on users would
-- correctly deny. The view bakes its own filters
-- (profile_visibility='public', NOT is_banned, deletion_scheduled_for
-- IS NULL) but it does NOT replicate the kid block.
--
-- Flip to SECURITY INVOKER so the view honors the caller's RLS — the
-- kid block fires correctly, and other policies on users (banned,
-- frozen, etc.) are also applied at read time. Adults are unaffected.

ALTER VIEW public.public_profiles_v SET (security_invoker = true);
