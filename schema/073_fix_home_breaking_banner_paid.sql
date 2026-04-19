-- 073_fix_home_breaking_banner_paid.sql
-- Migration: 20260418230549 fix_home_breaking_banner_paid
--
-- Move home.breaking_banner.view.paid from anon (leaks to all signed-in) to
-- pro+ only.

DO $$
DECLARE
  v_perm_id uuid;
  v_set_id uuid;
  v_set_key text;
BEGIN
  SELECT id INTO v_perm_id FROM permissions WHERE key = 'home.breaking_banner.view.paid';
  IF v_perm_id IS NULL THEN
    RAISE EXCEPTION 'permission home.breaking_banner.view.paid not found';
  END IF;

  SELECT id INTO v_set_id FROM permission_sets WHERE key = 'anon';
  DELETE FROM permission_set_perms
  WHERE permission_id = v_perm_id AND permission_set_id = v_set_id;

  FOR v_set_key IN SELECT unnest(ARRAY['pro','family','expert','admin','owner'])
  LOOP
    SELECT id INTO v_set_id FROM permission_sets WHERE key = v_set_key;
    IF v_set_id IS NOT NULL THEN
      INSERT INTO permission_set_perms (permission_set_id, permission_id)
      VALUES (v_set_id, v_perm_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  UPDATE perms_global_version SET version = version + 1, bumped_at = now();
END $$;
