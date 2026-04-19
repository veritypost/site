-- 076_fix_settings_leak_bindings.sql
-- Migration: 20260418233012 fix_settings_leak_bindings
--
-- Track: profile_settings — same leak pattern as notifications/home_breaking_banner/etc.
-- Core user-facing settings keys were bound to admin/owner only (or admin+free+owner),
-- silently denying paid/expert/moderator users their own account settings.
--
-- Fix: for every key a signed-in user should be able to use, ensure it's bound to
-- free|pro|family|expert|moderator|editor in addition to admin|owner.
-- For pro-only surfaces (DM read receipts, allow DMs, per-article TTS) keep pro|family|expert
-- only.

DO $$
DECLARE
  perm_id uuid;
  set_id uuid;
  kset record;
  k text;
  all_signed_in text[] := ARRAY['free','pro','family','expert','moderator','editor'];
  pro_plus        text[] := ARRAY['pro','family','expert','moderator','editor'];
  core_keys       text[] := ARRAY[
    'settings.view',
    'settings.account.change_password',
    'settings.account.edit_email',
    'settings.account.login_activity.view',
    'settings.account.sessions.revoke',
    'settings.account.sessions.revoke_all_other',
    'settings.emails.view',
    'settings.emails.add_secondary',
    'settings.emails.set_primary',
    'settings.emails.delete_secondary',
    'settings.feed.view',
    'settings.feed.category_toggle',
    'settings.feed.hide_low_cred',
    'settings.alerts.view',
    'settings.a11y.high_contrast',
    'settings.a11y.text_size',
    'settings.a11y.reduce_motion',
    'settings.blocked.list',
    'settings.blocked.unblock',
    'settings.data.request_export',
    'settings.data.request_deletion',
    'settings.data.deletion.cancel',
    'settings.login_activity.view',
    'settings.login_activity.signout_device',
    'billing.view.plan',
    'billing.change_plan',
    'billing.cancel.own',
    'billing.resubscribe',
    'billing.portal.open',
    'billing.promo.redeem',
    'billing.subscription.view_own',
    'billing.invoices.view_own',
    'billing.invoices.download',
    'settings.privacy.profile_visibility',
    'settings.privacy.show_activity',
    'settings.privacy.hide_from_search',
    'settings.privacy.show_on_leaderboard',
    'settings.privacy.show_verity_score',
    'settings.privacy.blocked_users.manage'
  ];
  pro_only_keys   text[] := ARRAY[
    'settings.privacy.allow_messages',
    'settings.privacy.dm_read_receipts',
    'settings.privacy.dm_read_receipts_ios',
    'settings.a11y.tts_per_article'
  ];
BEGIN
  -- Ensure core user-facing keys reach every signed-in user
  FOREACH k IN ARRAY core_keys LOOP
    SELECT id INTO perm_id FROM permissions WHERE key = k;
    IF perm_id IS NULL THEN CONTINUE; END IF;
    FOR kset IN SELECT id, key FROM permission_sets WHERE key = ANY(all_signed_in) LOOP
      INSERT INTO permission_set_perms (permission_set_id, permission_id)
      VALUES (kset.id, perm_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- Pro-plus surfaces (DMs, read receipts, per-article TTS) stay pro+
  FOREACH k IN ARRAY pro_only_keys LOOP
    SELECT id INTO perm_id FROM permissions WHERE key = k;
    IF perm_id IS NULL THEN CONTINUE; END IF;
    FOR kset IN SELECT id, key FROM permission_sets WHERE key = ANY(pro_plus) LOOP
      INSERT INTO permission_set_perms (permission_set_id, permission_id)
      VALUES (kset.id, perm_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Bump perms_version for all users so clients re-fetch
UPDATE users SET perms_version = perms_version + 1;
