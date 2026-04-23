-- 138_fk_cascade_cleanup.sql
--
-- Flip dangerous ON DELETE CASCADE foreign keys to ON DELETE SET NULL.
--
-- Rationale: each column listed below is an "attribution" pointer (who created /
-- approved / banned / resolved / etc.) or a soft reference (current plan,
-- referrer). Cascading deletes on these would wipe production rows on a single
-- accidental DELETE of a parent — most alarming being users.plan_id where
-- removing a plan row would erase every user on that plan.
--
-- All target columns verified NULL-able via information_schema before this
-- migration was authored. NOT-NULL columns (e.g. conversations.created_by) are
-- intentionally NOT included; flipping them to SET NULL would fail or require
-- relaxing the constraint, which is out of scope for this fix.
--
-- Source-of-truth FK names verified live via pg_constraint at authoring time.
-- Rollback: schema/139_rollback_138.sql

BEGIN;

-- === Original cleanup list (12 FKs from the audit) ===

ALTER TABLE public.users
  DROP CONSTRAINT fk_users_plan_id,
  ADD CONSTRAINT fk_users_plan_id
    FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;

ALTER TABLE public.users
  DROP CONSTRAINT fk_users_banned_by,
  ADD CONSTRAINT fk_users_banned_by
    FOREIGN KEY (banned_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.users
  DROP CONSTRAINT fk_users_referred_by,
  ADD CONSTRAINT fk_users_referred_by
    FOREIGN KEY (referred_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT fk_subscriptions_downgraded_from_plan_id,
  ADD CONSTRAINT fk_subscriptions_downgraded_from_plan_id
    FOREIGN KEY (downgraded_from_plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;

ALTER TABLE public.reports
  DROP CONSTRAINT fk_reports_resolved_by,
  ADD CONSTRAINT fk_reports_resolved_by
    FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.reports
  DROP CONSTRAINT fk_reports_escalated_to,
  ADD CONSTRAINT fk_reports_escalated_to
    FOREIGN KEY (escalated_to) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.access_codes
  DROP CONSTRAINT fk_access_codes_created_by,
  ADD CONSTRAINT fk_access_codes_created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.feature_flags
  DROP CONSTRAINT fk_feature_flags_created_by,
  ADD CONSTRAINT fk_feature_flags_created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.feature_flags
  DROP CONSTRAINT fk_feature_flags_updated_by,
  ADD CONSTRAINT fk_feature_flags_updated_by
    FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.settings
  DROP CONSTRAINT fk_settings_updated_by,
  ADD CONSTRAINT fk_settings_updated_by
    FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.email_templates
  DROP CONSTRAINT fk_email_templates_created_by,
  ADD CONSTRAINT fk_email_templates_created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.email_templates
  DROP CONSTRAINT fk_email_templates_updated_by,
  ADD CONSTRAINT fk_email_templates_updated_by
    FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- === Discovered attribution-style FKs (same wrong pattern) ===
-- All NULL-able + clear-cut "who did this" semantics → SET NULL is correct.
-- conversations.created_by intentionally excluded: column is NOT NULL.

ALTER TABLE public.access_requests
  DROP CONSTRAINT fk_access_requests_approved_by,
  ADD CONSTRAINT fk_access_requests_approved_by
    FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.ad_campaigns
  DROP CONSTRAINT fk_ad_campaigns_created_by,
  ADD CONSTRAINT fk_ad_campaigns_created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.ad_units
  DROP CONSTRAINT fk_ad_units_approved_by,
  ADD CONSTRAINT fk_ad_units_approved_by
    FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.app_config
  DROP CONSTRAINT fk_app_config_updated_by,
  ADD CONSTRAINT fk_app_config_updated_by
    FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.articles
  DROP CONSTRAINT fk_articles_verified_by,
  ADD CONSTRAINT fk_articles_verified_by
    FOREIGN KEY (verified_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.blocked_words
  DROP CONSTRAINT fk_blocked_words_added_by,
  ADD CONSTRAINT fk_blocked_words_added_by
    FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.campaigns
  DROP CONSTRAINT fk_campaigns_created_by,
  ADD CONSTRAINT fk_campaigns_created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.cohorts
  DROP CONSTRAINT fk_cohorts_created_by,
  ADD CONSTRAINT fk_cohorts_created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.comments
  DROP CONSTRAINT fk_comments_moderated_by,
  ADD CONSTRAINT fk_comments_moderated_by
    FOREIGN KEY (moderated_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.data_requests
  DROP CONSTRAINT fk_data_requests_processed_by,
  ADD CONSTRAINT fk_data_requests_processed_by
    FOREIGN KEY (processed_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.deep_links
  DROP CONSTRAINT fk_deep_links_created_by,
  ADD CONSTRAINT fk_deep_links_created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.expert_applications
  DROP CONSTRAINT fk_expert_applications_reviewed_by,
  ADD CONSTRAINT fk_expert_applications_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.feeds
  DROP CONSTRAINT fk_feeds_created_by,
  ADD CONSTRAINT fk_feeds_created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.media_assets
  DROP CONSTRAINT fk_media_assets_uploaded_by,
  ADD CONSTRAINT fk_media_assets_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.promo_codes
  DROP CONSTRAINT fk_promo_codes_created_by,
  ADD CONSTRAINT fk_promo_codes_created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.support_tickets
  DROP CONSTRAINT fk_support_tickets_assigned_to,
  ADD CONSTRAINT fk_support_tickets_assigned_to
    FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.translations
  DROP CONSTRAINT fk_translations_reviewed_by,
  ADD CONSTRAINT fk_translations_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_roles
  DROP CONSTRAINT fk_user_roles_assigned_by,
  ADD CONSTRAINT fk_user_roles_assigned_by
    FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;

COMMIT;
