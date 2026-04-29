ALTER TABLE public.expert_applications
  ADD COLUMN IF NOT EXISTS vacation_until timestamptz DEFAULT NULL;
