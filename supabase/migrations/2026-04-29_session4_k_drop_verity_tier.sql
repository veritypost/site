-- Session 4 Migration K — Drop the verity middle tier.
-- Owner confirmed zero users on this tier (verified 2026-04-29 via plans query).
-- The model simplifies to free / verity_pro / verity_family.
DELETE FROM public.plans WHERE tier = 'verity';
