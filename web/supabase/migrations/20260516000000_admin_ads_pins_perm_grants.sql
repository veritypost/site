-- Wave 3: link admin.ads.pins.* perms to admin + owner permission_sets.
-- Idempotent — re-running is a no-op via ON CONFLICT.

INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT '84205bc1-8919-48ff-876e-e01c7897ff64', p.id
FROM public.permissions p
WHERE p.key IN (
  'admin.ads.pins.create',
  'admin.ads.pins.edit',
  'admin.ads.pins.delete',
  'admin.ads.pins.view'
)
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

INSERT INTO public.permission_set_perms (permission_set_id, permission_id)
SELECT '9888f5ae-849e-48b8-b5a9-2439154b3b57', p.id
FROM public.permissions p
WHERE p.key IN (
  'admin.ads.pins.create',
  'admin.ads.pins.edit',
  'admin.ads.pins.delete',
  'admin.ads.pins.view'
)
ON CONFLICT (permission_set_id, permission_id) DO NOTHING;

DO $$
DECLARE
  admin_count int;
  owner_count int;
BEGIN
  SELECT COUNT(*) INTO admin_count
  FROM public.permission_set_perms psp
  JOIN public.permissions p ON p.id = psp.permission_id
  WHERE psp.permission_set_id = '84205bc1-8919-48ff-876e-e01c7897ff64'
    AND p.key LIKE 'admin.ads.pins.%';
  IF admin_count <> 4 THEN
    RAISE EXCEPTION 'Expected 4 admin.ads.pins.* grants on admin set; got %', admin_count;
  END IF;

  SELECT COUNT(*) INTO owner_count
  FROM public.permission_set_perms psp
  JOIN public.permissions p ON p.id = psp.permission_id
  WHERE psp.permission_set_id = '9888f5ae-849e-48b8-b5a9-2439154b3b57'
    AND p.key LIKE 'admin.ads.pins.%';
  IF owner_count <> 4 THEN
    RAISE EXCEPTION 'Expected 4 admin.ads.pins.* grants on owner set; got %', owner_count;
  END IF;
END $$;
