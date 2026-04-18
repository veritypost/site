-- ============================================================
-- Verity Post — full reset + rebuild (clean schema, no test data)
-- WARNING: drops ALL tables in public schema. auth.* preserved.
-- ============================================================
--
-- Destructive-action guard (F-003): this script begins with
-- DROP SCHEMA public CASCADE. To prevent accidental paste into a
-- production SQL console, the drop is gated on a session-local GUC.
-- To run this script you must first execute, in the same session:
--
--     SET vp.allow_destroy = 'yes';
--
-- Without that setting the DO block below raises and aborts before
-- anything is dropped. Supabase SQL editor, psql, and migration
-- runners all honour SET for the duration of the session.
-- ============================================================

DO $vp_reset_guard$
BEGIN
  IF coalesce(current_setting('vp.allow_destroy', true), '') <> 'yes' THEN
    RAISE EXCEPTION
      'reset_and_rebuild_v2.sql refused: set vp.allow_destroy = ''yes'' in this session to permit DROP SCHEMA public CASCADE. Aborting.'
      USING HINT = 'Run: SET vp.allow_destroy = ''yes''; before executing this script.';
  END IF;
END
$vp_reset_guard$;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Restore grants that Supabase's internal roles rely on. Recreating the
-- public schema wipes these, which breaks login with "Database error
-- querying schema" because triggers on auth.users run as supabase_auth_admin
-- and the authenticator role can no longer reach public.* on token exchange.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin, authenticator, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO supabase_auth_admin, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO supabase_auth_admin, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO supabase_auth_admin, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO supabase_auth_admin, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO supabase_auth_admin, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO supabase_auth_admin, service_role;


-- ============================================================
-- 001_schema.sql
-- ============================================================

-- ============================================================
-- Verity Post Database Schema
-- Generated from database_tables.xlsx (90 tables)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- categories (Content)
-- ------------------------------------------------------------
CREATE TABLE "categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(100) NOT NULL UNIQUE,
  "slug" varchar(120) NOT NULL UNIQUE,
  "description" text,
  "icon_name" varchar(100),
  "icon_url" text,
  "color_hex" varchar(7),
  "parent_id" uuid,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_kids_safe" boolean NOT NULL DEFAULT true,
  "is_premium" boolean NOT NULL DEFAULT false,
  "article_count" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

-- ------------------------------------------------------------
-- score_rules (Scoring)
-- ------------------------------------------------------------
CREATE TABLE "score_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "action" varchar(50) NOT NULL UNIQUE,
  "display_name" varchar(100) NOT NULL,
  "description" text,
  "points" integer NOT NULL,
  "max_per_day" integer,
  "max_per_article" integer,
  "cooldown_seconds" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "applies_to_kids" boolean NOT NULL DEFAULT true,
  "category_multiplier" boolean NOT NULL DEFAULT false,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- score_tiers (Scoring)
-- ------------------------------------------------------------
CREATE TABLE "score_tiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(50) NOT NULL UNIQUE,
  "display_name" varchar(100) NOT NULL,
  "description" text,
  "icon_name" varchar(100),
  "color_hex" varchar(7),
  "min_score" integer NOT NULL UNIQUE,
  "max_score" integer,
  "perks" jsonb NOT NULL DEFAULT '[]',
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

-- ------------------------------------------------------------
-- achievements (Scoring)
-- ------------------------------------------------------------
CREATE TABLE "achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(100) NOT NULL UNIQUE,
  "name" varchar(200) NOT NULL,
  "description" text NOT NULL,
  "icon_name" varchar(100),
  "icon_url" text,
  "category" varchar(50) NOT NULL,
  "rarity" varchar(20) NOT NULL DEFAULT 'common',
  "points_reward" integer NOT NULL DEFAULT 0,
  "criteria" jsonb NOT NULL,
  "is_secret" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_kids_eligible" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "total_earned_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- plans (Billing)
-- ------------------------------------------------------------
CREATE TABLE "plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(50) NOT NULL UNIQUE,
  "display_name" varchar(100) NOT NULL,
  "description" text,
  "tier" varchar(20) NOT NULL,
  "billing_period" varchar(20),
  "price_cents" integer NOT NULL DEFAULT 0,
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "stripe_price_id" varchar(100) UNIQUE,
  "apple_product_id" varchar(200) UNIQUE,
  "google_product_id" varchar(200) UNIQUE,
  "max_family_members" integer,
  "trial_days" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_visible" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- roles (Permissions)
-- ------------------------------------------------------------
CREATE TABLE "roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(50) NOT NULL UNIQUE,
  "display_name" varchar(100) NOT NULL,
  "description" text,
  "is_system" boolean NOT NULL DEFAULT false,
  "hierarchy_level" integer NOT NULL DEFAULT 0,
  "color_hex" varchar(7),
  "icon_name" varchar(100),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- permissions (Permissions)
-- ------------------------------------------------------------
CREATE TABLE "permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(100) NOT NULL UNIQUE,
  "display_name" varchar(200) NOT NULL,
  "description" text,
  "category" varchar(50) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- rate_limits (System)
-- ------------------------------------------------------------
CREATE TABLE "rate_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(200) NOT NULL UNIQUE,
  "display_name" varchar(200) NOT NULL,
  "description" text,
  "max_requests" integer NOT NULL,
  "window_seconds" integer NOT NULL,
  "scope" varchar(20) NOT NULL DEFAULT 'user',
  "applies_to_plans" text[],
  "burst_max" integer,
  "penalty_seconds" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- webhook_log (System)
-- ------------------------------------------------------------
CREATE TABLE "webhook_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" varchar(50) NOT NULL,
  "event_type" varchar(100) NOT NULL,
  "event_id" varchar(200) UNIQUE,
  "endpoint" varchar(500),
  "method" varchar(10) NOT NULL DEFAULT 'POST',
  "headers" jsonb,
  "payload" jsonb NOT NULL,
  "response_status" integer,
  "response_body" text,
  "processing_status" varchar(20) NOT NULL DEFAULT 'received',
  "processing_error" text,
  "processing_duration_ms" integer,
  "retry_count" integer NOT NULL DEFAULT 0,
  "max_retries" integer NOT NULL DEFAULT 3,
  "next_retry_at" timestamptz,
  "ip_address" varchar(45),
  "signature_valid" boolean,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz
);

-- ------------------------------------------------------------
-- sponsors (Campaigns)
-- ------------------------------------------------------------
CREATE TABLE "sponsors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(200) NOT NULL,
  "slug" varchar(200) NOT NULL UNIQUE,
  "description" text,
  "logo_url" text,
  "website_url" text,
  "contact_name" varchar(200),
  "contact_email" varchar(320),
  "contact_phone" varchar(20),
  "billing_email" varchar(320),
  "is_active" boolean NOT NULL DEFAULT true,
  "total_spend_cents" integer NOT NULL DEFAULT 0,
  "contract_start" date,
  "contract_end" date,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- ad_placements (Ads)
-- ------------------------------------------------------------
CREATE TABLE "ad_placements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(100) NOT NULL UNIQUE,
  "display_name" varchar(200) NOT NULL,
  "description" text,
  "placement_type" varchar(30) NOT NULL,
  "platform" varchar(20) NOT NULL DEFAULT 'all',
  "page" varchar(100) NOT NULL,
  "position" varchar(50) NOT NULL,
  "width" integer,
  "height" integer,
  "max_ads_per_page" integer NOT NULL DEFAULT 1,
  "refresh_interval_seconds" integer,
  "min_content_before" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "hidden_for_tiers" text[] NOT NULL DEFAULT '{verity_pro,verity_family,verity_family_xl}',
  "reduced_for_tiers" text[] NOT NULL DEFAULT '{verity}',
  "is_kids_safe" boolean NOT NULL DEFAULT false,
  "priority" integer NOT NULL DEFAULT 0,
  "fallback_image_url" text,
  "fallback_url" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- users (Users)
-- ------------------------------------------------------------
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(320) UNIQUE,
  "email_verified" boolean NOT NULL DEFAULT false,
  "email_verified_at" timestamptz,
  "phone" varchar(20) UNIQUE,
  "phone_verified" boolean NOT NULL DEFAULT false,
  "phone_verified_at" timestamptz,
  "password_hash" text,
  "username" varchar(30) UNIQUE,
  "display_name" varchar(100),
  "first_name" varchar(100),
  "last_name" varchar(100),
  "bio" varchar(1000),
  "avatar_url" text,
  "banner_url" text,
  "date_of_birth" date,
  "gender" varchar(30),
  "country_code" varchar(2),
  "timezone" varchar(50),
  "locale" varchar(10) NOT NULL DEFAULT 'en',
  "primary_auth_provider" varchar(20),
  "plan_id" uuid,
  "plan_status" varchar(20) NOT NULL DEFAULT 'free',
  "stripe_customer_id" varchar(100) UNIQUE,
  "verity_score" integer NOT NULL DEFAULT 0,
  "articles_read_count" integer NOT NULL DEFAULT 0,
  "quizzes_completed_count" integer NOT NULL DEFAULT 0,
  "comment_count" integer NOT NULL DEFAULT 0,
  "followers_count" integer NOT NULL DEFAULT 0,
  "following_count" integer NOT NULL DEFAULT 0,
  "is_expert" boolean NOT NULL DEFAULT false,
  "expert_title" varchar(200),
  "expert_organization" varchar(200),
  "is_verified_public_figure" boolean NOT NULL DEFAULT false,
  "is_kids_mode_enabled" boolean NOT NULL DEFAULT false,
  "kids_pin_hash" varchar(200),
  "has_kids_profiles" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_banned" boolean NOT NULL DEFAULT false,
  "ban_reason" text,
  "banned_at" timestamptz,
  "banned_by" uuid,
  "is_shadow_banned" boolean NOT NULL DEFAULT false,
  "is_muted" boolean NOT NULL DEFAULT false,
  "muted_until" timestamptz,
  "last_login_at" timestamptz,
  "last_active_at" timestamptz,
  "last_login_ip" varchar(45),
  "last_login_device" varchar(200),
  "login_count" integer NOT NULL DEFAULT 0,
  "failed_login_count" integer NOT NULL DEFAULT 0,
  "locked_until" timestamptz,
  "att_status" varchar(30),
  "att_prompted_at" timestamptz,
  "deletion_requested_at" timestamptz,
  "deletion_scheduled_for" timestamptz,
  "deletion_completed_at" timestamptz,
  "deletion_reason" text,
  "notification_email" boolean NOT NULL DEFAULT true,
  "notification_push" boolean NOT NULL DEFAULT true,
  "referral_code" varchar(20) UNIQUE,
  "referred_by" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "avatar_color" varchar(7),
  "profile_visibility" varchar(20) NOT NULL DEFAULT 'public',
  "show_activity" boolean NOT NULL DEFAULT true,
  "show_on_leaderboard" boolean NOT NULL DEFAULT true,
  "allow_messages" boolean NOT NULL DEFAULT true,
  "streak_current" integer NOT NULL DEFAULT 0,
  "streak_best" integer NOT NULL DEFAULT 0,
  "streak_last_active_date" date,
  "streak_freeze_remaining" integer NOT NULL DEFAULT 0,
  "streak_frozen_today" boolean NOT NULL DEFAULT false,
  "kid_trial_used" boolean NOT NULL DEFAULT false,
  "kid_trial_started_at" timestamptz,
  "kid_trial_ends_at" timestamptz,
  "frozen_at" timestamptz,
  "frozen_verity_score" integer,
  "plan_grace_period_ends_at" timestamptz,
  "supervisor_opted_in" boolean NOT NULL DEFAULT false,
  "warning_count" integer NOT NULL DEFAULT 0,
  "last_warning_at" timestamptz,
  "mute_level" integer NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------
-- plan_features (Config)
-- ------------------------------------------------------------
CREATE TABLE "plan_features" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "plan_id" uuid NOT NULL,
  "feature_key" varchar(100) NOT NULL,
  "feature_name" varchar(200) NOT NULL,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "limit_value" integer,
  "limit_type" varchar(30),
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- role_permissions (Permissions)
-- ------------------------------------------------------------
CREATE TABLE "role_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "role_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- auth_providers (Users)
-- ------------------------------------------------------------
CREATE TABLE "auth_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "provider" varchar(20) NOT NULL,
  "provider_user_id" varchar(500) NOT NULL,
  "provider_email" varchar(320),
  "provider_display_name" varchar(200),
  "provider_avatar_url" text,
  "access_token" text,
  "refresh_token" text,
  "token_expires_at" timestamptz,
  "id_token" text,
  "scopes" text[],
  "raw_profile" jsonb,
  "is_primary" boolean NOT NULL DEFAULT false,
  "linked_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz,
  "unlinked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- sessions (Users)
-- ------------------------------------------------------------
CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "token_hash" varchar(128) NOT NULL UNIQUE,
  "refresh_token_hash" varchar(128) UNIQUE,
  "device_id" varchar(200),
  "device_name" varchar(200),
  "device_model" varchar(100),
  "os_name" varchar(30),
  "os_version" varchar(30),
  "app_version" varchar(30),
  "app_build" varchar(30),
  "browser_name" varchar(100),
  "browser_version" varchar(50),
  "push_token" text,
  "push_token_type" varchar(20),
  "push_token_updated_at" timestamptz,
  "ip_address" varchar(45),
  "user_agent" text,
  "location_country" varchar(3),
  "location_city" varchar(100),
  "is_active" boolean NOT NULL DEFAULT true,
  "is_current" boolean NOT NULL DEFAULT false,
  "auth_provider" varchar(20),
  "last_active_at" timestamptz,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "revoke_reason" varchar(50),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- kid_profiles (Users)
-- ------------------------------------------------------------
CREATE TABLE "kid_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "parent_user_id" uuid NOT NULL,
  "display_name" varchar(100) NOT NULL,
  "avatar_url" text,
  "avatar_preset" varchar(50),
  "date_of_birth" date,
  "age_range" varchar(20),
  "pin_hash" varchar(200),
  "max_daily_minutes" integer,
  "reading_level" varchar(20),
  "verity_score" integer NOT NULL DEFAULT 0,
  "articles_read_count" integer NOT NULL DEFAULT 0,
  "quizzes_completed_count" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_active_at" timestamptz,
  "coppa_consent_given" boolean NOT NULL DEFAULT false,
  "coppa_consent_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "avatar_color" varchar(7),
  "streak_current" integer NOT NULL DEFAULT 0,
  "streak_best" integer NOT NULL DEFAULT 0,
  "streak_last_active_date" date
);

-- ------------------------------------------------------------
-- follows (Social)
-- ------------------------------------------------------------
CREATE TABLE "follows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "follower_id" uuid NOT NULL,
  "following_id" uuid NOT NULL,
  "notify" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- reactions (Social)
-- ------------------------------------------------------------
CREATE TABLE "reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "target_type" varchar(20) NOT NULL,
  "target_id" uuid NOT NULL,
  "reaction_type" varchar(30) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- expert_applications (Experts)
-- ------------------------------------------------------------
CREATE TABLE "expert_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "application_type" varchar(30) NOT NULL,
  "full_name" varchar(200) NOT NULL,
  "organization" varchar(200),
  "title" varchar(200),
  "bio" text,
  "expertise_areas" text[],
  "website_url" text,
  "social_links" jsonb NOT NULL DEFAULT '{}',
  "credentials" jsonb NOT NULL DEFAULT '[]',
  "portfolio_urls" text[],
  "government_id_provided" boolean NOT NULL DEFAULT false,
  "verification_documents" jsonb NOT NULL DEFAULT '[]',
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "review_notes" text,
  "rejection_reason" text,
  "revoked_reason" text,
  "probation_starts_at" timestamptz,
  "probation_ends_at" timestamptz,
  "probation_completed" boolean NOT NULL DEFAULT false,
  "credential_verified_at" timestamptz,
  "credential_expires_at" timestamptz,
  "background_check_status" varchar(20),
  "sample_responses" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- expert_discussions (Experts)
-- ------------------------------------------------------------
CREATE TABLE "expert_discussions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "category_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "parent_id" uuid,
  "article_id" uuid,
  "source_comment_id" uuid,
  "discussion_type" varchar(20) NOT NULL DEFAULT 'general',
  "title" varchar(500),
  "body" text NOT NULL,
  "body_html" text,
  "is_pinned" boolean NOT NULL DEFAULT false,
  "is_context_pinned" boolean NOT NULL DEFAULT false,
  "context_tag_count" integer NOT NULL DEFAULT 0,
  "context_pinned_at" timestamptz,
  "is_expert_question" boolean NOT NULL DEFAULT false,
  "expert_question_target_type" varchar(20),
  "expert_question_target_id" uuid,
  "expert_question_status" varchar(20) DEFAULT 'pending',
  "upvote_count" integer NOT NULL DEFAULT 0,
  "reply_count" integer NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'visible',
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- alert_preferences (Messaging)
-- ------------------------------------------------------------
CREATE TABLE "alert_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "alert_type" varchar(50) NOT NULL,
  "channel_push" boolean NOT NULL DEFAULT true,
  "channel_email" boolean NOT NULL DEFAULT true,
  "channel_in_app" boolean NOT NULL DEFAULT true,
  "channel_sms" boolean NOT NULL DEFAULT false,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "quiet_hours_start" time,
  "quiet_hours_end" time,
  "frequency" varchar(20),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- reports (Moderation)
-- ------------------------------------------------------------
CREATE TABLE "reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reporter_id" uuid NOT NULL,
  "target_type" varchar(30) NOT NULL,
  "target_id" uuid NOT NULL,
  "reason" varchar(50) NOT NULL,
  "description" text,
  "screenshot_urls" text[],
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "resolution" varchar(30),
  "resolution_notes" text,
  "resolved_by" uuid,
  "resolved_at" timestamptz,
  "is_supervisor_flag" boolean NOT NULL DEFAULT false,
  "supervisor_category_id" uuid,
  "is_escalated" boolean NOT NULL DEFAULT false,
  "escalated_to" uuid,
  "duplicate_of" uuid,
  "ip_address" varchar(45),
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- blocked_words (Moderation)
-- ------------------------------------------------------------
CREATE TABLE "blocked_words" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "word" varchar(200) NOT NULL UNIQUE,
  "severity" varchar(20) NOT NULL DEFAULT 'medium',
  "action" varchar(20) NOT NULL DEFAULT 'flag',
  "applies_to" text[] NOT NULL DEFAULT '{comments,messages,usernames,bios}',
  "is_regex" boolean NOT NULL DEFAULT false,
  "language" varchar(10) NOT NULL DEFAULT 'en',
  "is_active" boolean NOT NULL DEFAULT true,
  "added_by" uuid,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- reserved_usernames (Moderation)
-- ------------------------------------------------------------
CREATE TABLE "reserved_usernames" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" varchar(30) NOT NULL UNIQUE,
  "reason" varchar(100),
  "reserved_for" uuid,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- blocked_users (Moderation)
-- ------------------------------------------------------------
CREATE TABLE "blocked_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "blocker_id" uuid NOT NULL,
  "blocked_id" uuid NOT NULL,
  "reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- settings (Config)
-- ------------------------------------------------------------
CREATE TABLE "settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(200) NOT NULL UNIQUE,
  "value" text NOT NULL,
  "value_type" varchar(20) NOT NULL DEFAULT 'string',
  "category" varchar(50) NOT NULL DEFAULT 'general',
  "display_name" varchar(200),
  "description" text,
  "is_public" boolean NOT NULL DEFAULT false,
  "is_sensitive" boolean NOT NULL DEFAULT false,
  "updated_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- feature_flags (Config)
-- ------------------------------------------------------------
CREATE TABLE "feature_flags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(100) NOT NULL UNIQUE,
  "display_name" varchar(200) NOT NULL,
  "description" text,
  "is_enabled" boolean NOT NULL DEFAULT false,
  "rollout_percentage" integer NOT NULL DEFAULT 0,
  "target_platforms" text[],
  "target_min_app_version" varchar(30),
  "target_max_app_version" varchar(30),
  "target_min_os_version" varchar(30),
  "target_user_ids" uuid[],
  "target_plan_tiers" text[],
  "target_countries" text[],
  "target_cohort_ids" uuid[],
  "conditions" jsonb NOT NULL DEFAULT '{}',
  "variant" jsonb,
  "is_killswitch" boolean NOT NULL DEFAULT false,
  "expires_at" timestamptz,
  "created_by" uuid,
  "updated_by" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- email_templates (Config)
-- ------------------------------------------------------------
CREATE TABLE "email_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(100) NOT NULL,
  "name" varchar(200) NOT NULL,
  "subject" varchar(500) NOT NULL,
  "body_html" text NOT NULL,
  "body_text" text,
  "from_name" varchar(100),
  "from_email" varchar(320),
  "reply_to" varchar(320),
  "variables" jsonb NOT NULL DEFAULT '[]',
  "is_active" boolean NOT NULL DEFAULT true,
  "language" varchar(10) NOT NULL DEFAULT 'en',
  "version" integer NOT NULL DEFAULT 1,
  "created_by" uuid,
  "updated_by" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- user_roles (Permissions)
-- ------------------------------------------------------------
CREATE TABLE "user_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "assigned_by" uuid,
  "scope" varchar(100),
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- access_codes (Access)
-- ------------------------------------------------------------
CREATE TABLE "access_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(50) NOT NULL UNIQUE,
  "description" text,
  "type" varchar(30) NOT NULL,
  "grants_plan_id" uuid,
  "grants_role_id" uuid,
  "max_uses" integer,
  "current_uses" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "expires_at" timestamptz,
  "created_by" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- feeds (Pipeline)
-- ------------------------------------------------------------
CREATE TABLE "feeds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(200) NOT NULL,
  "url" text NOT NULL UNIQUE,
  "feed_type" varchar(20) NOT NULL DEFAULT 'rss',
  "category_id" uuid,
  "default_visibility" varchar(20) NOT NULL DEFAULT 'public',
  "is_active" boolean NOT NULL DEFAULT true,
  "is_auto_publish" boolean NOT NULL DEFAULT false,
  "is_ai_rewrite" boolean NOT NULL DEFAULT false,
  "poll_interval_minutes" integer NOT NULL DEFAULT 60,
  "last_polled_at" timestamptz,
  "last_etag" varchar(200),
  "last_modified" varchar(200),
  "articles_imported_count" integer NOT NULL DEFAULT 0,
  "error_count" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "last_error_at" timestamptz,
  "source_name" varchar(200),
  "source_icon_url" text,
  "language" varchar(10),
  "transform_rules" jsonb NOT NULL DEFAULT '{}',
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- data_requests (System)
-- ------------------------------------------------------------
CREATE TABLE "data_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "type" varchar(20) NOT NULL,
  "regulation" varchar(20) NOT NULL DEFAULT 'gdpr',
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "reason" text,
  "requested_data_types" text[],
  "identity_verified" boolean NOT NULL DEFAULT false,
  "identity_verified_at" timestamptz,
  "identity_verified_by" varchar(50),
  "processing_started_at" timestamptz,
  "completed_at" timestamptz,
  "download_url" text,
  "download_expires_at" timestamptz,
  "file_size_bytes" bigint,
  "processed_by" uuid,
  "notes" text,
  "legal_hold" boolean NOT NULL DEFAULT false,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deadline_at" timestamptz
);

-- ------------------------------------------------------------
-- cohorts (Campaigns)
-- ------------------------------------------------------------
CREATE TABLE "cohorts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(200) NOT NULL,
  "description" text,
  "type" varchar(30) NOT NULL DEFAULT 'dynamic',
  "criteria" jsonb NOT NULL DEFAULT '{}',
  "is_active" boolean NOT NULL DEFAULT true,
  "last_computed_at" timestamptz,
  "created_by" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- consent_records (Users)
-- ------------------------------------------------------------
CREATE TABLE "consent_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "consent_type" varchar(50) NOT NULL,
  "regulation" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL,
  "version" varchar(50),
  "granted_at" timestamptz,
  "withdrawn_at" timestamptz,
  "expires_at" timestamptz,
  "ip_address" varchar(45),
  "user_agent" text,
  "collection_method" varchar(30) NOT NULL,
  "proof" jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- app_config (Config)
-- ------------------------------------------------------------
CREATE TABLE "app_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(200) NOT NULL,
  "value" text NOT NULL,
  "value_type" varchar(20) NOT NULL DEFAULT 'string',
  "platform" varchar(20),
  "min_app_version" varchar(30),
  "max_app_version" varchar(30),
  "min_os_version" varchar(30),
  "country_codes" text[],
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "priority" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz,
  "updated_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- translations (Config)
-- ------------------------------------------------------------
CREATE TABLE "translations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "locale" varchar(10) NOT NULL,
  "namespace" varchar(50) NOT NULL,
  "key" varchar(300) NOT NULL,
  "value" text NOT NULL,
  "is_reviewed" boolean NOT NULL DEFAULT false,
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "context" text,
  "max_length" integer,
  "platform" varchar(20),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- media_assets (Content)
-- ------------------------------------------------------------
CREATE TABLE "media_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "uploaded_by" uuid,
  "file_name" varchar(500) NOT NULL,
  "file_key" varchar(500) NOT NULL UNIQUE,
  "file_url" text NOT NULL,
  "thumbnail_url" text,
  "mime_type" varchar(100) NOT NULL,
  "file_size_bytes" bigint NOT NULL,
  "width" integer,
  "height" integer,
  "duration_seconds" float,
  "alt_text" varchar(500),
  "caption" text,
  "source_credit" varchar(300),
  "category" varchar(30),
  "associated_type" varchar(30),
  "associated_id" uuid,
  "blurhash" varchar(100),
  "color_dominant" varchar(7),
  "exif_data" jsonb,
  "is_processed" boolean NOT NULL DEFAULT false,
  "processing_status" varchar(20) NOT NULL DEFAULT 'pending',
  "csam_scanned" boolean NOT NULL DEFAULT false,
  "csam_flagged" boolean NOT NULL DEFAULT false,
  "nsfw_score" float,
  "moderation_status" varchar(20) NOT NULL DEFAULT 'pending',
  "storage_provider" varchar(20) NOT NULL DEFAULT 's3',
  "storage_region" varchar(30),
  "cdn_status" varchar(20),
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

-- ------------------------------------------------------------
-- rate_limit_events (System)
-- ------------------------------------------------------------
CREATE TABLE "rate_limit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_id" uuid,
  "user_id" uuid,
  "ip_address" varchar(45) NOT NULL,
  "endpoint" varchar(255) NOT NULL,
  "action" varchar(50) NOT NULL,
  "request_count" integer NOT NULL,
  "window_start" timestamptz NOT NULL,
  "user_agent" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- ad_campaigns (Ads)
-- ------------------------------------------------------------
CREATE TABLE "ad_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(200) NOT NULL,
  "advertiser_name" varchar(200) NOT NULL,
  "advertiser_contact" varchar(200),
  "campaign_type" varchar(30) NOT NULL,
  "objective" varchar(30),
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "start_date" timestamptz NOT NULL,
  "end_date" timestamptz,
  "total_budget_cents" integer,
  "daily_budget_cents" integer,
  "spent_cents" integer NOT NULL DEFAULT 0,
  "pricing_model" varchar(20) NOT NULL,
  "rate_cents" integer,
  "rev_share_percent" decimal(5,2),
  "total_impressions" bigint NOT NULL DEFAULT 0,
  "total_clicks" bigint NOT NULL DEFAULT 0,
  "total_conversions" integer NOT NULL DEFAULT 0,
  "contract_url" text,
  "notes" text,
  "created_by" uuid,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- user_preferred_categories (Users)
-- ------------------------------------------------------------
CREATE TABLE "user_preferred_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- audit_log (System)
-- ------------------------------------------------------------
CREATE TABLE "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" uuid,
  "actor_type" varchar(20) NOT NULL DEFAULT 'user',
  "action" varchar(100) NOT NULL,
  "target_type" varchar(50),
  "target_id" uuid,
  "description" text,
  "old_values" jsonb,
  "new_values" jsonb,
  "ip_address" varchar(45),
  "user_agent" text,
  "device_info" varchar(200),
  "session_id" uuid,
  "request_id" varchar(100),
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- user_sessions (Analytics)
-- ------------------------------------------------------------
CREATE TABLE "user_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "device_session_id" uuid,
  "anonymous_id" varchar(200),
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz,
  "duration_seconds" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "device_type" varchar(20),
  "device_model" varchar(100),
  "os_name" varchar(30),
  "os_version" varchar(30),
  "app_version" varchar(30),
  "browser_name" varchar(100),
  "browser_version" varchar(50),
  "screen_width" integer,
  "screen_height" integer,
  "ip_address" varchar(45),
  "country_code" varchar(2),
  "city" varchar(100),
  "entry_point" varchar(200),
  "exit_point" varchar(200),
  "referrer" text,
  "utm_source" varchar(100),
  "utm_medium" varchar(100),
  "utm_campaign" varchar(100),
  "events_count" integer NOT NULL DEFAULT 0,
  "screens_viewed" integer NOT NULL DEFAULT 0,
  "articles_read" integer NOT NULL DEFAULT 0,
  "is_bounce" boolean NOT NULL DEFAULT false,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- category_scores (Scoring)
-- ------------------------------------------------------------
CREATE TABLE "category_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "kid_profile_id" uuid,
  "category_id" uuid NOT NULL,
  "score" integer NOT NULL DEFAULT 0,
  "articles_read" integer NOT NULL DEFAULT 0,
  "quizzes_correct" integer NOT NULL DEFAULT 0,
  "last_activity_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- user_achievements (Scoring)
-- ------------------------------------------------------------
CREATE TABLE "user_achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "kid_profile_id" uuid,
  "achievement_id" uuid NOT NULL,
  "earned_at" timestamptz NOT NULL DEFAULT now(),
  "points_awarded" integer NOT NULL DEFAULT 0,
  "seen_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- streaks (Scoring)
-- ------------------------------------------------------------
CREATE TABLE "streaks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "kid_profile_id" uuid,
  "date" date NOT NULL,
  "activity_type" varchar(30) NOT NULL,
  "is_freeze" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- kid_category_permissions (Users)
-- ------------------------------------------------------------
CREATE TABLE "kid_category_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kid_profile_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "permission_type" varchar(20) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- expert_application_categories (Experts)
-- ------------------------------------------------------------
CREATE TABLE "expert_application_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "application_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- expert_discussion_votes (Experts)
-- ------------------------------------------------------------
CREATE TABLE "expert_discussion_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "discussion_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "vote_type" varchar(10) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- access_requests (Access)
-- ------------------------------------------------------------
CREATE TABLE "access_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(320) NOT NULL,
  "name" varchar(200),
  "type" varchar(30) NOT NULL,
  "reason" text,
  "referral_source" varchar(100),
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "approved_by" uuid,
  "approved_at" timestamptz,
  "access_code_id" uuid,
  "invite_sent_at" timestamptz,
  "user_agent" text,
  "ip_address" varchar(45),
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- access_code_uses (Access)
-- ------------------------------------------------------------
CREATE TABLE "access_code_uses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "access_code_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "redeemed_at" timestamptz NOT NULL DEFAULT now(),
  "metadata" jsonb NOT NULL DEFAULT '{}'
);

-- ------------------------------------------------------------
-- pipeline_runs (Pipeline)
-- ------------------------------------------------------------
CREATE TABLE "pipeline_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pipeline_type" varchar(50) NOT NULL,
  "feed_id" uuid,
  "status" varchar(20) NOT NULL DEFAULT 'running',
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  "duration_ms" integer,
  "items_processed" integer NOT NULL DEFAULT 0,
  "items_created" integer NOT NULL DEFAULT 0,
  "items_failed" integer NOT NULL DEFAULT 0,
  "error_message" text,
  "error_stack" text,
  "input_params" jsonb NOT NULL DEFAULT '{}',
  "output_summary" jsonb NOT NULL DEFAULT '{}',
  "triggered_by" varchar(30),
  "triggered_by_user" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- campaigns (Campaigns)
-- ------------------------------------------------------------
CREATE TABLE "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(200) NOT NULL,
  "description" text,
  "type" varchar(30) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "channel" varchar(20) NOT NULL,
  "subject" varchar(500),
  "title" varchar(300),
  "body" text,
  "body_html" text,
  "action_url" text,
  "image_url" text,
  "email_template_id" uuid,
  "cohort_id" uuid,
  "target_plan_tiers" text[],
  "target_platforms" text[],
  "target_user_count" integer,
  "sponsor_id" uuid,
  "scheduled_at" timestamptz,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "sent_count" integer NOT NULL DEFAULT 0,
  "delivered_count" integer NOT NULL DEFAULT 0,
  "opened_count" integer NOT NULL DEFAULT 0,
  "clicked_count" integer NOT NULL DEFAULT 0,
  "bounced_count" integer NOT NULL DEFAULT 0,
  "unsubscribed_count" integer NOT NULL DEFAULT 0,
  "conversion_count" integer NOT NULL DEFAULT 0,
  "a_b_test" jsonb,
  "created_by" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- cohort_members (Campaigns)
-- ------------------------------------------------------------
CREATE TABLE "cohort_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cohort_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "added_at" timestamptz NOT NULL DEFAULT now(),
  "removed_at" timestamptz
);

-- ------------------------------------------------------------
-- ad_units (Ads)
-- ------------------------------------------------------------
CREATE TABLE "ad_units" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(200) NOT NULL,
  "advertiser_name" varchar(200),
  "ad_network" varchar(50) NOT NULL,
  "ad_network_unit_id" varchar(255),
  "ad_format" varchar(30) NOT NULL,
  "placement_id" uuid NOT NULL,
  "campaign_id" uuid,
  "creative_url" text,
  "creative_html" text,
  "click_url" text,
  "alt_text" varchar(500),
  "cta_text" varchar(50),
  "targeting_categories" jsonb,
  "targeting_plans" jsonb,
  "targeting_cohorts" jsonb,
  "targeting_countries" jsonb,
  "targeting_platforms" jsonb,
  "frequency_cap_per_user" integer,
  "frequency_cap_per_session" integer,
  "start_date" timestamptz,
  "end_date" timestamptz,
  "daily_budget_cents" integer,
  "total_budget_cents" integer,
  "bid_type" varchar(20),
  "bid_amount_cents" integer,
  "weight" integer NOT NULL DEFAULT 100,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_nsfw" boolean NOT NULL DEFAULT false,
  "approval_status" varchar(20) NOT NULL DEFAULT 'pending',
  "approved_by" uuid,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- search_history (Content)
-- ------------------------------------------------------------
CREATE TABLE "search_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "query" varchar(500) NOT NULL,
  "query_normalized" varchar(500),
  "result_count" integer,
  "result_type" varchar(30),
  "filters_applied" jsonb,
  "selected_result_id" uuid,
  "selected_result_type" varchar(30),
  "selected_position" integer,
  "device_type" varchar(20),
  "session_id" uuid,
  "search_duration_ms" integer,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- notifications (Messaging)
-- ------------------------------------------------------------
CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "type" varchar(50) NOT NULL,
  "title" varchar(300) NOT NULL,
  "body" text,
  "image_url" text,
  "action_url" text,
  "action_type" varchar(30),
  "action_id" uuid,
  "sender_id" uuid,
  "channel" varchar(20) NOT NULL DEFAULT 'in_app',
  "priority" varchar(20) NOT NULL DEFAULT 'normal',
  "is_read" boolean NOT NULL DEFAULT false,
  "read_at" timestamptz,
  "is_seen" boolean NOT NULL DEFAULT false,
  "seen_at" timestamptz,
  "push_sent" boolean NOT NULL DEFAULT false,
  "push_sent_at" timestamptz,
  "push_receipt" varchar(200),
  "email_sent" boolean NOT NULL DEFAULT false,
  "email_sent_at" timestamptz,
  "campaign_id" uuid,
  "expires_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- promo_codes (Billing)
-- ------------------------------------------------------------
CREATE TABLE "promo_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(50) NOT NULL UNIQUE,
  "description" text,
  "discount_type" varchar(20) NOT NULL,
  "discount_value" integer NOT NULL,
  "applies_to_plans" uuid[],
  "duration" varchar(20) NOT NULL DEFAULT 'once',
  "duration_months" integer,
  "max_uses" integer,
  "max_uses_per_user" integer NOT NULL DEFAULT 1,
  "current_uses" integer NOT NULL DEFAULT 0,
  "minimum_amount_cents" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "starts_at" timestamptz,
  "expires_at" timestamptz,
  "stripe_coupon_id" varchar(100),
  "campaign_id" uuid,
  "created_by" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- deep_links (Analytics)
-- ------------------------------------------------------------
CREATE TABLE "deep_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "short_code" varchar(50) NOT NULL UNIQUE,
  "full_url" text NOT NULL,
  "target_type" varchar(30) NOT NULL,
  "target_id" uuid,
  "campaign_id" uuid,
  "source" varchar(50),
  "medium" varchar(50),
  "utm_source" varchar(100),
  "utm_medium" varchar(100),
  "utm_campaign" varchar(100),
  "utm_content" varchar(100),
  "utm_term" varchar(100),
  "click_count" integer NOT NULL DEFAULT 0,
  "unique_click_count" integer NOT NULL DEFAULT 0,
  "install_count" integer NOT NULL DEFAULT 0,
  "fallback_url" text,
  "ios_url" text,
  "android_url" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "expires_at" timestamptz,
  "created_by" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- campaign_recipients (Campaigns)
-- ------------------------------------------------------------
CREATE TABLE "campaign_recipients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "sent_at" timestamptz,
  "delivered_at" timestamptz,
  "opened_at" timestamptz,
  "clicked_at" timestamptz,
  "bounced_at" timestamptz,
  "unsubscribed_at" timestamptz,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- ad_daily_stats (Ads)
-- ------------------------------------------------------------
CREATE TABLE "ad_daily_stats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "date" date NOT NULL,
  "ad_unit_id" uuid,
  "placement_id" uuid NOT NULL,
  "campaign_id" uuid,
  "platform" varchar(20) NOT NULL DEFAULT 'all',
  "impressions" bigint NOT NULL DEFAULT 0,
  "viewable_impressions" bigint NOT NULL DEFAULT 0,
  "clicks" bigint NOT NULL DEFAULT 0,
  "unique_impressions" bigint NOT NULL DEFAULT 0,
  "unique_clicks" bigint NOT NULL DEFAULT 0,
  "conversions" integer NOT NULL DEFAULT 0,
  "revenue_cents" integer NOT NULL DEFAULT 0,
  "ecpm_cents" integer NOT NULL DEFAULT 0,
  "ctr" decimal(6,4) NOT NULL DEFAULT 0,
  "fill_rate" decimal(5,2) NOT NULL DEFAULT 0,
  "bot_impressions" bigint NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- push_receipts (Messaging)
-- ------------------------------------------------------------
CREATE TABLE "push_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "notification_id" uuid,
  "user_id" uuid NOT NULL,
  "session_id" uuid,
  "provider" varchar(20) NOT NULL,
  "push_token" text NOT NULL,
  "status" varchar(20) NOT NULL,
  "provider_message_id" varchar(255),
  "error_code" varchar(50),
  "error_message" text,
  "token_invalidated" boolean NOT NULL DEFAULT false,
  "sent_at" timestamptz NOT NULL,
  "delivered_at" timestamptz,
  "opened_at" timestamptz,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- subscriptions (Billing)
-- ------------------------------------------------------------
CREATE TABLE "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "plan_id" uuid NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "source" varchar(20) NOT NULL,
  "stripe_subscription_id" varchar(100) UNIQUE,
  "stripe_payment_method_id" varchar(100),
  "apple_original_transaction_id" varchar(100),
  "google_purchase_token" varchar(500),
  "current_period_start" timestamptz NOT NULL,
  "current_period_end" timestamptz NOT NULL,
  "trial_start" timestamptz,
  "trial_end" timestamptz,
  "cancel_at" timestamptz,
  "cancelled_at" timestamptz,
  "cancel_reason" text,
  "cancel_feedback" text,
  "pause_start" timestamptz,
  "pause_end" timestamptz,
  "promo_code_id" uuid,
  "discount_percent" integer,
  "family_owner_id" uuid,
  "is_family_member" boolean NOT NULL DEFAULT false,
  "auto_renew" boolean NOT NULL DEFAULT true,
  "billing_retry_count" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "grace_period_ends_at" timestamptz,
  "grace_period_started_at" timestamptz,
  "downgraded_at" timestamptz,
  "downgraded_from_plan_id" uuid,
  "win_back_eligible_at" timestamptz,
  "win_back_sent_at" timestamptz
);

-- ------------------------------------------------------------
-- invoices (Billing)
-- ------------------------------------------------------------
CREATE TABLE "invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "subscription_id" uuid,
  "stripe_invoice_id" varchar(100) UNIQUE,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "subtotal_cents" integer NOT NULL,
  "discount_cents" integer NOT NULL DEFAULT 0,
  "tax_cents" integer NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL,
  "payment_method" varchar(30),
  "paid_at" timestamptz,
  "due_date" timestamptz,
  "invoice_url" text,
  "invoice_pdf_url" text,
  "description" text,
  "line_items" jsonb NOT NULL DEFAULT '[]',
  "billing_address" jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- iap_transactions (Billing)
-- ------------------------------------------------------------
CREATE TABLE "iap_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "subscription_id" uuid,
  "store" varchar(10) NOT NULL,
  "product_id" varchar(200) NOT NULL,
  "original_transaction_id" varchar(100) NOT NULL,
  "transaction_id" varchar(100) NOT NULL UNIQUE,
  "web_order_line_item_id" varchar(100),
  "purchase_date" timestamptz NOT NULL,
  "expires_date" timestamptz,
  "cancellation_date" timestamptz,
  "cancellation_reason" varchar(50),
  "is_trial_period" boolean NOT NULL DEFAULT false,
  "is_intro_offer" boolean NOT NULL DEFAULT false,
  "is_upgraded" boolean NOT NULL DEFAULT false,
  "is_revoked" boolean NOT NULL DEFAULT false,
  "ownership_type" varchar(20),
  "environment" varchar(20) NOT NULL DEFAULT 'production',
  "storefront" varchar(10),
  "price_cents" integer,
  "currency" varchar(3),
  "receipt_data" text,
  "jws_representation" text,
  "server_notification_type" varchar(50),
  "raw_transaction" jsonb,
  "verification_status" varchar(20) NOT NULL DEFAULT 'pending',
  "verified_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- promo_uses (Billing)
-- ------------------------------------------------------------
CREATE TABLE "promo_uses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "promo_code_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "subscription_id" uuid,
  "discount_applied_cents" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- subscription_events (Billing)
-- ------------------------------------------------------------
CREATE TABLE "subscription_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "subscription_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "event_type" varchar(50) NOT NULL,
  "from_plan" varchar(50),
  "to_plan" varchar(50),
  "amount" decimal(10,2),
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "provider" varchar(20) NOT NULL,
  "provider_event_id" varchar(255) UNIQUE,
  "reason" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- articles (Content)
-- ------------------------------------------------------------
CREATE TABLE "articles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" varchar(500) NOT NULL,
  "slug" varchar(600) NOT NULL UNIQUE,
  "subtitle" varchar(1000),
  "body" text NOT NULL,
  "body_html" text,
  "excerpt" varchar(2000),
  "cover_image_url" text,
  "cover_image_alt" varchar(500),
  "cover_image_credit" varchar(300),
  "thumbnail_url" text,
  "category_id" uuid NOT NULL,
  "author_id" uuid,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "visibility" varchar(20) NOT NULL DEFAULT 'public',
  "is_ai_generated" boolean NOT NULL DEFAULT false,
  "ai_model" varchar(100),
  "ai_provider" varchar(50),
  "ai_prompt_id" uuid,
  "ai_confidence_score" float CHECK (ai_confidence_score >= 0.0 AND ai_confidence_score <= 1.0),
  "is_verified" boolean NOT NULL DEFAULT false,
  "verified_by" uuid,
  "verified_at" timestamptz,
  "is_breaking" boolean NOT NULL DEFAULT false,
  "is_featured" boolean NOT NULL DEFAULT false,
  "is_opinion" boolean NOT NULL DEFAULT false,
  "is_kids_safe" boolean NOT NULL DEFAULT false,
  "kids_summary" text,
  "reading_time_minutes" integer,
  "word_count" integer,
  "difficulty_level" varchar(20),
  "language" varchar(10) NOT NULL DEFAULT 'en',
  "seo_title" varchar(500),
  "seo_description" varchar(1000),
  "seo_keywords" text[],
  "canonical_url" text,
  "tags" text[],
  "source_feed_id" uuid,
  "source_url" text,
  "external_id" varchar(500),
  "publish_at" timestamptz,
  "published_at" timestamptz,
  "unpublished_at" timestamptz,
  "retraction_reason" text,
  "view_count" integer NOT NULL DEFAULT 0,
  "share_count" integer NOT NULL DEFAULT 0,
  "comment_count" integer NOT NULL DEFAULT 0,
  "bookmark_count" integer NOT NULL DEFAULT 0,
  "content_flags" jsonb NOT NULL DEFAULT '{}',
  "csam_scanned" boolean NOT NULL DEFAULT false,
  "nsfw_score" float CHECK (nsfw_score >= 0.0 AND nsfw_score <= 1.0),
  "moderation_status" varchar(20) NOT NULL DEFAULT 'pending',
  "moderation_notes" text,
  "push_sent" boolean NOT NULL DEFAULT false,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "sponsor_id" uuid,
  "cluster_id" uuid,
  "search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title,'')), 'A') || setweight(to_tsvector('english', coalesce(excerpt,'')), 'B') || setweight(to_tsvector('english', coalesce(body,'')), 'C')) STORED
);

-- ------------------------------------------------------------
-- sources (Content)
-- ------------------------------------------------------------
CREATE TABLE "sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_id" uuid NOT NULL,
  "title" varchar(500),
  "url" text,
  "publisher" varchar(300),
  "author_name" varchar(300),
  "published_date" timestamptz,
  "source_type" varchar(50),
  "quote" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- timelines (Content)
-- ------------------------------------------------------------
CREATE TABLE "timelines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_id" uuid NOT NULL,
  "title" varchar(500),
  "description" text,
  "event_date" timestamptz NOT NULL,
  "event_label" varchar(500) NOT NULL,
  "event_body" text,
  "event_image_url" text,
  "source_url" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- quizzes (Content)
-- ------------------------------------------------------------
CREATE TABLE "quizzes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_id" uuid NOT NULL,
  "title" varchar(500) NOT NULL,
  "description" text,
  "question_text" text NOT NULL,
  "question_type" varchar(30) NOT NULL DEFAULT 'multiple_choice',
  "options" jsonb NOT NULL DEFAULT '[]',
  "explanation" text,
  "difficulty" varchar(20),
  "points" integer NOT NULL DEFAULT 10,
  "pool_group" integer NOT NULL DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "correct_count" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

-- ------------------------------------------------------------
-- quiz_attempts (Content)
-- ------------------------------------------------------------
CREATE TABLE "quiz_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "quiz_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "kid_profile_id" uuid,
  "article_id" uuid,
  "attempt_number" integer NOT NULL DEFAULT 1,
  "questions_served" uuid[] DEFAULT '{}',
  "selected_answer" text NOT NULL,
  "is_correct" boolean NOT NULL,
  "points_earned" integer NOT NULL DEFAULT 0,
  "time_taken_seconds" integer,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- comments (Social)
-- ------------------------------------------------------------
CREATE TABLE "comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "parent_id" uuid,
  "root_id" uuid,
  "thread_depth" integer NOT NULL DEFAULT 0,
  "body" text NOT NULL,
  "body_html" text,
  "ai_tag" varchar(50),
  "ai_tag_confidence" float CHECK (ai_tag_confidence >= 0.0 AND ai_tag_confidence <= 1.0),
  "ai_sentiment" varchar(20),
  "ai_toxicity_score" float CHECK (ai_toxicity_score >= 0.0 AND ai_toxicity_score <= 1.0),
  "is_edited" boolean NOT NULL DEFAULT false,
  "edited_at" timestamptz,
  "edit_count" integer NOT NULL DEFAULT 0,
  "upvote_count" integer NOT NULL DEFAULT 0,
  "downvote_count" integer NOT NULL DEFAULT 0,
  "reply_count" integer NOT NULL DEFAULT 0,
  "is_pinned" boolean NOT NULL DEFAULT false,
  "is_context_pinned" boolean NOT NULL DEFAULT false,
  "context_tag_count" integer NOT NULL DEFAULT 0,
  "context_pinned_at" timestamptz,
  "is_expert_question" boolean NOT NULL DEFAULT false,
  "expert_question_target_type" varchar(20),
  "expert_question_target_id" uuid,
  "expert_question_status" varchar(20) DEFAULT 'pending',
  "is_author_reply" boolean NOT NULL DEFAULT false,
  "is_expert_reply" boolean NOT NULL DEFAULT false,
  "status" varchar(20) NOT NULL DEFAULT 'visible',
  "moderation_reason" text,
  "moderated_by" uuid,
  "moderated_at" timestamptz,
  "ip_address" varchar(45),
  "user_agent" text,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "mentions" jsonb NOT NULL DEFAULT '[]'
);

-- ------------------------------------------------------------
-- comment_votes (Social)
-- ------------------------------------------------------------
CREATE TABLE "comment_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "comment_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "vote_type" varchar(10) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- bookmarks (Social)
-- ------------------------------------------------------------
CREATE TABLE "bookmarks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "article_id" uuid NOT NULL,
  "collection_id" uuid,
  "collection_name" varchar(100),
  "notes" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- reading_log (Social)
-- ------------------------------------------------------------
CREATE TABLE "reading_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "kid_profile_id" uuid,
  "article_id" uuid NOT NULL,
  "session_id" uuid,
  "read_percentage" float NOT NULL DEFAULT 0,
  "time_spent_seconds" integer NOT NULL DEFAULT 0,
  "completed" boolean NOT NULL DEFAULT false,
  "source" varchar(50),
  "referrer_url" text,
  "device_type" varchar(20),
  "points_earned" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- conversations (Messaging)
-- ------------------------------------------------------------
CREATE TABLE "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" varchar(20) NOT NULL DEFAULT 'direct',
  "title" varchar(200),
  "created_by" uuid NOT NULL,
  "last_message_id" uuid,
  "last_message_at" timestamptz,
  "last_message_preview" varchar(200),
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- messages (Messaging)
-- ------------------------------------------------------------
CREATE TABLE "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL,
  "sender_id" uuid NOT NULL,
  "body" text NOT NULL,
  "body_html" text,
  "attachment_url" text,
  "attachment_type" varchar(30),
  "attachment_metadata" jsonb,
  "reply_to_id" uuid,
  "is_edited" boolean NOT NULL DEFAULT false,
  "edited_at" timestamptz,
  "is_system" boolean NOT NULL DEFAULT false,
  "status" varchar(20) NOT NULL DEFAULT 'sent',
  "moderation_status" varchar(20) NOT NULL DEFAULT 'clean',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

-- ------------------------------------------------------------
-- community_notes (Social)
-- ------------------------------------------------------------
CREATE TABLE "community_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "body" text NOT NULL,
  "source_urls" text[],
  "status" varchar(20) NOT NULL DEFAULT 'proposed',
  "helpful_count" integer NOT NULL DEFAULT 0,
  "not_helpful_count" integer NOT NULL DEFAULT 0,
  "rating_score" float NOT NULL DEFAULT 0,
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "review_notes" text,
  "is_visible" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- feed_clusters (Pipeline)
-- ------------------------------------------------------------
CREATE TABLE "feed_clusters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" varchar(500),
  "summary" text,
  "primary_article_id" uuid,
  "category_id" uuid,
  "keywords" text[],
  "similarity_threshold" float,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_breaking" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz
);

-- ------------------------------------------------------------
-- analytics_events (Analytics)
-- ------------------------------------------------------------
CREATE TABLE "analytics_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "kid_profile_id" uuid,
  "session_id" uuid,
  "event_name" varchar(100) NOT NULL,
  "event_category" varchar(50),
  "event_properties" jsonb NOT NULL DEFAULT '{}',
  "article_id" uuid,
  "screen_name" varchar(100),
  "element_id" varchar(100),
  "element_text" varchar(200),
  "device_type" varchar(20),
  "device_model" varchar(100),
  "os_version" varchar(30),
  "app_version" varchar(30),
  "platform" varchar(20),
  "ip_address" varchar(45),
  "country_code" varchar(2),
  "city" varchar(100),
  "latitude" float,
  "longitude" float,
  "referrer" text,
  "deep_link_id" uuid,
  "duration_ms" integer,
  "value_numeric" float,
  "value_string" varchar(500),
  "is_first_time" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- pipeline_costs (Pipeline)
-- ------------------------------------------------------------
CREATE TABLE "pipeline_costs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pipeline_run_id" uuid NOT NULL,
  "article_id" uuid,
  "model" varchar(100) NOT NULL,
  "provider" varchar(50) NOT NULL,
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "total_tokens" integer NOT NULL DEFAULT 0,
  "cost_usd" decimal(10,6) NOT NULL,
  "step" varchar(50) NOT NULL,
  "latency_ms" integer,
  "success" boolean NOT NULL DEFAULT true,
  "error_message" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- ad_impressions (Ads)
-- ------------------------------------------------------------
CREATE TABLE "ad_impressions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ad_unit_id" uuid NOT NULL,
  "placement_id" uuid NOT NULL,
  "campaign_id" uuid,
  "user_id" uuid,
  "session_id" uuid,
  "article_id" uuid,
  "page" varchar(100) NOT NULL,
  "position" varchar(50) NOT NULL,
  "device_type" varchar(20),
  "platform" varchar(20),
  "country_code" varchar(2),
  "is_viewable" boolean NOT NULL DEFAULT false,
  "viewable_seconds" float,
  "is_clicked" boolean NOT NULL DEFAULT false,
  "clicked_at" timestamptz,
  "revenue_cents" integer NOT NULL DEFAULT 0,
  "bid_cents" integer,
  "ad_network" varchar(50),
  "ip_address" varchar(45),
  "user_agent" text,
  "is_bot" boolean NOT NULL DEFAULT false,
  "fraud_reason" varchar(100),
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- ticket_messages (Support)
-- ------------------------------------------------------------
CREATE TABLE "ticket_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id" uuid NOT NULL,
  "sender_id" uuid,
  "is_staff" boolean NOT NULL DEFAULT false,
  "is_internal_note" boolean NOT NULL DEFAULT false,
  "body" text NOT NULL,
  "body_html" text,
  "attachment_urls" jsonb,
  "is_automated" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- article_relations (Content)
-- ------------------------------------------------------------
CREATE TABLE "article_relations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_id" uuid NOT NULL,
  "related_article_id" uuid NOT NULL,
  "relation_type" varchar(30) NOT NULL DEFAULT 'related',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- conversation_participants (Messaging)
-- ------------------------------------------------------------
CREATE TABLE "conversation_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" varchar(20) NOT NULL DEFAULT 'member',
  "is_muted" boolean NOT NULL DEFAULT false,
  "last_read_at" timestamptz,
  "joined_at" timestamptz NOT NULL DEFAULT now(),
  "left_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- message_receipts (Messaging)
-- ------------------------------------------------------------
CREATE TABLE "message_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "delivered_at" timestamptz,
  "read_at" timestamptz
);

-- ------------------------------------------------------------
-- community_note_votes (Social)
-- ------------------------------------------------------------
CREATE TABLE "community_note_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "note_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "vote_type" varchar(10) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- support_tickets (Support)
-- ------------------------------------------------------------
CREATE TABLE "support_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_number" varchar(20) NOT NULL UNIQUE,
  "user_id" uuid,
  "email" varchar(320),
  "category" varchar(50) NOT NULL,
  "subject" varchar(300) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "priority" varchar(20) NOT NULL DEFAULT 'normal',
  "assigned_to" uuid,
  "tags" jsonb,
  "source" varchar(30) NOT NULL DEFAULT 'in_app',
  "app_version" varchar(30),
  "os_version" varchar(30),
  "device_model" varchar(100),
  "platform" varchar(20),
  "page_url" varchar(500),
  "screenshot_urls" jsonb,
  "related_article_id" uuid,
  "related_comment_id" uuid,
  "satisfaction_rating" integer,
  "satisfaction_comment" text,
  "first_response_at" timestamptz,
  "resolved_at" timestamptz,
  "closed_at" timestamptz,
  "reopened_count" integer NOT NULL DEFAULT 0,
  "is_public" boolean NOT NULL DEFAULT false,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- feed_cluster_articles (Pipeline)
-- ------------------------------------------------------------
CREATE TABLE "feed_cluster_articles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cluster_id" uuid NOT NULL,
  "article_id" uuid NOT NULL,
  "added_at" timestamptz NOT NULL DEFAULT now()
);



-- ------------------------------------------------------------
-- bookmark_collections (D13: Verity+ bookmark organization)
-- ------------------------------------------------------------
CREATE TABLE "bookmark_collections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "name" varchar(100) NOT NULL,
  "description" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "bookmark_count" integer NOT NULL DEFAULT 0,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- comment_context_tags (D15/D16: organic context pinning)
-- ------------------------------------------------------------
CREATE TABLE "comment_context_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "comment_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "tag_type" varchar(30) NOT NULL DEFAULT 'article_context',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- category_supervisors (D22: self-policing category watchdogs)
-- ------------------------------------------------------------
CREATE TABLE "category_supervisors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "verity_score_at_grant" integer NOT NULL,
  "opted_in_at" timestamptz NOT NULL DEFAULT now(),
  "opted_out_at" timestamptz,
  "flags_submitted" integer NOT NULL DEFAULT 0,
  "reports_submitted" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- expert_queue_items (D20/D33: expert question routing)
-- ------------------------------------------------------------
CREATE TABLE "expert_queue_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_id" uuid NOT NULL,
  "comment_id" uuid NOT NULL,
  "asking_user_id" uuid NOT NULL,
  "target_type" varchar(20) NOT NULL DEFAULT 'category',
  "target_category_id" uuid,
  "target_expert_id" uuid,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "claimed_by" uuid,
  "claimed_at" timestamptz,
  "answered_at" timestamptz,
  "answer_comment_id" uuid,
  "declined_by" uuid[],
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- family_achievements (D24: shared family engagement)
-- ------------------------------------------------------------
CREATE TABLE "family_achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(100) NOT NULL UNIQUE,
  "name" varchar(200) NOT NULL,
  "description" text NOT NULL,
  "icon_name" varchar(100),
  "criteria" jsonb NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- family_achievement_progress (D24: tracking family completion)
-- ------------------------------------------------------------
CREATE TABLE "family_achievement_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "family_owner_id" uuid NOT NULL,
  "family_achievement_id" uuid NOT NULL,
  "progress" jsonb NOT NULL DEFAULT '{}',
  "earned_at" timestamptz,
  "seen_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- weekly_recap_quizzes (D36: weekly recap quiz instances)
-- ------------------------------------------------------------
CREATE TABLE "weekly_recap_quizzes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "category_id" uuid,
  "week_start" date NOT NULL,
  "week_end" date NOT NULL,
  "title" varchar(500) NOT NULL,
  "description" text,
  "article_ids" uuid[] NOT NULL DEFAULT '{}',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- weekly_recap_questions (D36: questions for weekly recaps)
-- ------------------------------------------------------------
CREATE TABLE "weekly_recap_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "recap_quiz_id" uuid NOT NULL,
  "article_id" uuid,
  "question_text" text NOT NULL,
  "options" jsonb NOT NULL DEFAULT '[]',
  "explanation" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- weekly_recap_attempts (D36: user attempts on weekly recaps)
-- ------------------------------------------------------------
CREATE TABLE "weekly_recap_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "recap_quiz_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "score" integer NOT NULL DEFAULT 0,
  "total_questions" integer NOT NULL,
  "answers" jsonb NOT NULL DEFAULT '[]',
  "articles_missed" uuid[] DEFAULT '{}',
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- user_warnings (Blueprint: progressive penalty tracking)
-- ------------------------------------------------------------
CREATE TABLE "user_warnings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "warning_level" integer NOT NULL,
  "reason" text NOT NULL,
  "action_taken" varchar(30) NOT NULL,
  "mute_until" timestamptz,
  "issued_by" uuid,
  "appeal_status" varchar(20),
  "appeal_text" text,
  "appeal_resolved_at" timestamptz,
  "appeal_resolved_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- behavioral_anomalies (Blueprint: anti-bot/troll detection)
-- ------------------------------------------------------------
CREATE TABLE "behavioral_anomalies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "anomaly_type" varchar(50) NOT NULL,
  "severity" varchar(20) NOT NULL DEFAULT 'low',
  "description" text,
  "evidence" jsonb NOT NULL DEFAULT '{}',
  "status" varchar(20) NOT NULL DEFAULT 'detected',
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "action_taken" varchar(30),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- sponsored_quizzes (D35: reputable sponsored quiz tracking)
-- ------------------------------------------------------------
CREATE TABLE "sponsored_quizzes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sponsor_id" uuid NOT NULL,
  "article_id" uuid,
  "category_id" uuid,
  "title" varchar(500) NOT NULL,
  "description" text,
  "bonus_points_multiplier" decimal(3,1) NOT NULL DEFAULT 2.0,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "approved_by" uuid,
  "approved_at" timestamptz,
  "starts_at" timestamptz,
  "ends_at" timestamptz,
  "impressions" integer NOT NULL DEFAULT 0,
  "completions" integer NOT NULL DEFAULT 0,
  "budget_cents" integer,
  "spent_cents" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- kid_expert_sessions (D9: scheduled expert sessions for kids)
-- ------------------------------------------------------------
CREATE TABLE "kid_expert_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "expert_id" uuid NOT NULL,
  "category_id" uuid,
  "title" varchar(500) NOT NULL,
  "description" text,
  "session_type" varchar(20) NOT NULL DEFAULT 'live',
  "scheduled_at" timestamptz NOT NULL,
  "duration_minutes" integer NOT NULL DEFAULT 30,
  "status" varchar(20) NOT NULL DEFAULT 'scheduled',
  "max_questions" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- kid_expert_questions (D9: questions kids ask in sessions)
-- ------------------------------------------------------------
CREATE TABLE "kid_expert_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL,
  "kid_profile_id" uuid NOT NULL,
  "question_text" text NOT NULL,
  "answer_text" text,
  "answered_at" timestamptz,
  "is_approved" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Foreign Key Constraints
-- ============================================================
ALTER TABLE "categories" ADD CONSTRAINT "fk_categories_parent_id" FOREIGN KEY ("parent_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "fk_users_plan_id" FOREIGN KEY ("plan_id") REFERENCES "plans" ("id") ON DELETE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "fk_users_banned_by" FOREIGN KEY ("banned_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "fk_users_referred_by" FOREIGN KEY ("referred_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "plan_features" ADD CONSTRAINT "fk_plan_features_plan_id" FOREIGN KEY ("plan_id") REFERENCES "plans" ("id") ON DELETE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "fk_role_permissions_role_id" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "fk_role_permissions_permission_id" FOREIGN KEY ("permission_id") REFERENCES "permissions" ("id") ON DELETE CASCADE;
ALTER TABLE "auth_providers" ADD CONSTRAINT "fk_auth_providers_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "fk_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "kid_profiles" ADD CONSTRAINT "fk_kid_profiles_parent_user_id" FOREIGN KEY ("parent_user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "follows" ADD CONSTRAINT "fk_follows_follower_id" FOREIGN KEY ("follower_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "follows" ADD CONSTRAINT "fk_follows_following_id" FOREIGN KEY ("following_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "reactions" ADD CONSTRAINT "fk_reactions_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_applications" ADD CONSTRAINT "fk_expert_applications_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_applications" ADD CONSTRAINT "fk_expert_applications_reviewed_by" FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_discussions" ADD CONSTRAINT "fk_expert_discussions_category_id" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_discussions" ADD CONSTRAINT "fk_expert_discussions_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_discussions" ADD CONSTRAINT "fk_expert_discussions_parent_id" FOREIGN KEY ("parent_id") REFERENCES "expert_discussions" ("id") ON DELETE CASCADE;
ALTER TABLE "alert_preferences" ADD CONSTRAINT "fk_alert_preferences_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_reporter_id" FOREIGN KEY ("reporter_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_resolved_by" FOREIGN KEY ("resolved_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_escalated_to" FOREIGN KEY ("escalated_to") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_duplicate_of" FOREIGN KEY ("duplicate_of") REFERENCES "reports" ("id") ON DELETE CASCADE;
ALTER TABLE "blocked_words" ADD CONSTRAINT "fk_blocked_words_added_by" FOREIGN KEY ("added_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "reserved_usernames" ADD CONSTRAINT "fk_reserved_usernames_reserved_for" FOREIGN KEY ("reserved_for") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "blocked_users" ADD CONSTRAINT "fk_blocked_users_blocker_id" FOREIGN KEY ("blocker_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "blocked_users" ADD CONSTRAINT "fk_blocked_users_blocked_id" FOREIGN KEY ("blocked_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "settings" ADD CONSTRAINT "fk_settings_updated_by" FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "feature_flags" ADD CONSTRAINT "fk_feature_flags_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "feature_flags" ADD CONSTRAINT "fk_feature_flags_updated_by" FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "email_templates" ADD CONSTRAINT "fk_email_templates_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "email_templates" ADD CONSTRAINT "fk_email_templates_updated_by" FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "fk_user_roles_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "fk_user_roles_role_id" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "fk_user_roles_assigned_by" FOREIGN KEY ("assigned_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "access_codes" ADD CONSTRAINT "fk_access_codes_grants_plan_id" FOREIGN KEY ("grants_plan_id") REFERENCES "plans" ("id") ON DELETE CASCADE;
ALTER TABLE "access_codes" ADD CONSTRAINT "fk_access_codes_grants_role_id" FOREIGN KEY ("grants_role_id") REFERENCES "roles" ("id") ON DELETE CASCADE;
ALTER TABLE "access_codes" ADD CONSTRAINT "fk_access_codes_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "feeds" ADD CONSTRAINT "fk_feeds_category_id" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "feeds" ADD CONSTRAINT "fk_feeds_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "data_requests" ADD CONSTRAINT "fk_data_requests_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "data_requests" ADD CONSTRAINT "fk_data_requests_processed_by" FOREIGN KEY ("processed_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "cohorts" ADD CONSTRAINT "fk_cohorts_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "consent_records" ADD CONSTRAINT "fk_consent_records_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "app_config" ADD CONSTRAINT "fk_app_config_updated_by" FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "translations" ADD CONSTRAINT "fk_translations_reviewed_by" FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "media_assets" ADD CONSTRAINT "fk_media_assets_uploaded_by" FOREIGN KEY ("uploaded_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "rate_limit_events" ADD CONSTRAINT "fk_rate_limit_events_rule_id" FOREIGN KEY ("rule_id") REFERENCES "rate_limits" ("id") ON DELETE CASCADE;
ALTER TABLE "rate_limit_events" ADD CONSTRAINT "fk_rate_limit_events_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "fk_ad_campaigns_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "user_preferred_categories" ADD CONSTRAINT "fk_user_preferred_categories_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "user_preferred_categories" ADD CONSTRAINT "fk_user_preferred_categories_category_id" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "fk_audit_log_actor_id" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "fk_audit_log_session_id" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE CASCADE;
ALTER TABLE "user_sessions" ADD CONSTRAINT "fk_user_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "user_sessions" ADD CONSTRAINT "fk_user_sessions_device_session_id" FOREIGN KEY ("device_session_id") REFERENCES "sessions" ("id") ON DELETE CASCADE;
ALTER TABLE "category_scores" ADD CONSTRAINT "fk_category_scores_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "category_scores" ADD CONSTRAINT "fk_category_scores_kid_profile_id" FOREIGN KEY ("kid_profile_id") REFERENCES "kid_profiles" ("id") ON DELETE CASCADE;
ALTER TABLE "category_scores" ADD CONSTRAINT "fk_category_scores_category_id" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "user_achievements" ADD CONSTRAINT "fk_user_achievements_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "user_achievements" ADD CONSTRAINT "fk_user_achievements_kid_profile_id" FOREIGN KEY ("kid_profile_id") REFERENCES "kid_profiles" ("id") ON DELETE CASCADE;
ALTER TABLE "user_achievements" ADD CONSTRAINT "fk_user_achievements_achievement_id" FOREIGN KEY ("achievement_id") REFERENCES "achievements" ("id") ON DELETE CASCADE;
ALTER TABLE "streaks" ADD CONSTRAINT "fk_streaks_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "streaks" ADD CONSTRAINT "fk_streaks_kid_profile_id" FOREIGN KEY ("kid_profile_id") REFERENCES "kid_profiles" ("id") ON DELETE CASCADE;
ALTER TABLE "kid_category_permissions" ADD CONSTRAINT "fk_kid_category_permissions_kid_profile_id" FOREIGN KEY ("kid_profile_id") REFERENCES "kid_profiles" ("id") ON DELETE CASCADE;
ALTER TABLE "kid_category_permissions" ADD CONSTRAINT "fk_kid_category_permissions_category_id" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_application_categories" ADD CONSTRAINT "fk_expert_application_categories_application_id" FOREIGN KEY ("application_id") REFERENCES "expert_applications" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_application_categories" ADD CONSTRAINT "fk_expert_application_categories_category_id" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_discussion_votes" ADD CONSTRAINT "fk_expert_discussion_votes_discussion_id" FOREIGN KEY ("discussion_id") REFERENCES "expert_discussions" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_discussion_votes" ADD CONSTRAINT "fk_expert_discussion_votes_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "fk_access_requests_approved_by" FOREIGN KEY ("approved_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "access_requests" ADD CONSTRAINT "fk_access_requests_access_code_id" FOREIGN KEY ("access_code_id") REFERENCES "access_codes" ("id") ON DELETE CASCADE;
ALTER TABLE "access_code_uses" ADD CONSTRAINT "fk_access_code_uses_access_code_id" FOREIGN KEY ("access_code_id") REFERENCES "access_codes" ("id") ON DELETE CASCADE;
ALTER TABLE "access_code_uses" ADD CONSTRAINT "fk_access_code_uses_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "fk_pipeline_runs_feed_id" FOREIGN KEY ("feed_id") REFERENCES "feeds" ("id") ON DELETE CASCADE;
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "fk_pipeline_runs_triggered_by_user" FOREIGN KEY ("triggered_by_user") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "fk_campaigns_email_template_id" FOREIGN KEY ("email_template_id") REFERENCES "email_templates" ("id") ON DELETE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "fk_campaigns_cohort_id" FOREIGN KEY ("cohort_id") REFERENCES "cohorts" ("id") ON DELETE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "fk_campaigns_sponsor_id" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors" ("id") ON DELETE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "fk_campaigns_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "cohort_members" ADD CONSTRAINT "fk_cohort_members_cohort_id" FOREIGN KEY ("cohort_id") REFERENCES "cohorts" ("id") ON DELETE CASCADE;
ALTER TABLE "cohort_members" ADD CONSTRAINT "fk_cohort_members_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "ad_units" ADD CONSTRAINT "fk_ad_units_placement_id" FOREIGN KEY ("placement_id") REFERENCES "ad_placements" ("id") ON DELETE CASCADE;
ALTER TABLE "ad_units" ADD CONSTRAINT "fk_ad_units_campaign_id" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "ad_units" ADD CONSTRAINT "fk_ad_units_approved_by" FOREIGN KEY ("approved_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "search_history" ADD CONSTRAINT "fk_search_history_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "search_history" ADD CONSTRAINT "fk_search_history_session_id" FOREIGN KEY ("session_id") REFERENCES "user_sessions" ("id") ON DELETE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_sender_id" FOREIGN KEY ("sender_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "fk_notifications_campaign_id" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "promo_codes" ADD CONSTRAINT "fk_promo_codes_campaign_id" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "promo_codes" ADD CONSTRAINT "fk_promo_codes_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "deep_links" ADD CONSTRAINT "fk_deep_links_campaign_id" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "deep_links" ADD CONSTRAINT "fk_deep_links_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "fk_campaign_recipients_campaign_id" FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "fk_campaign_recipients_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "fk_ad_daily_stats_ad_unit_id" FOREIGN KEY ("ad_unit_id") REFERENCES "ad_units" ("id") ON DELETE CASCADE;
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "fk_ad_daily_stats_placement_id" FOREIGN KEY ("placement_id") REFERENCES "ad_placements" ("id") ON DELETE CASCADE;
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "fk_ad_daily_stats_campaign_id" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "push_receipts" ADD CONSTRAINT "fk_push_receipts_notification_id" FOREIGN KEY ("notification_id") REFERENCES "notifications" ("id") ON DELETE CASCADE;
ALTER TABLE "push_receipts" ADD CONSTRAINT "fk_push_receipts_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "push_receipts" ADD CONSTRAINT "fk_push_receipts_session_id" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "fk_subscriptions_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "fk_subscriptions_plan_id" FOREIGN KEY ("plan_id") REFERENCES "plans" ("id") ON DELETE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "fk_subscriptions_promo_code_id" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes" ("id") ON DELETE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "fk_subscriptions_family_owner_id" FOREIGN KEY ("family_owner_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "fk_subscriptions_downgraded_from_plan_id" FOREIGN KEY ("downgraded_from_plan_id") REFERENCES "plans" ("id") ON DELETE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "fk_invoices_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "fk_invoices_subscription_id" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions" ("id") ON DELETE CASCADE;
ALTER TABLE "iap_transactions" ADD CONSTRAINT "fk_iap_transactions_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "iap_transactions" ADD CONSTRAINT "fk_iap_transactions_subscription_id" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions" ("id") ON DELETE CASCADE;
ALTER TABLE "promo_uses" ADD CONSTRAINT "fk_promo_uses_promo_code_id" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes" ("id") ON DELETE CASCADE;
ALTER TABLE "promo_uses" ADD CONSTRAINT "fk_promo_uses_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "promo_uses" ADD CONSTRAINT "fk_promo_uses_subscription_id" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions" ("id") ON DELETE CASCADE;
ALTER TABLE "subscription_events" ADD CONSTRAINT "fk_subscription_events_subscription_id" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions" ("id") ON DELETE CASCADE;
ALTER TABLE "subscription_events" ADD CONSTRAINT "fk_subscription_events_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "articles" ADD CONSTRAINT "fk_articles_category_id" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "articles" ADD CONSTRAINT "fk_articles_author_id" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "articles" ADD CONSTRAINT "fk_articles_verified_by" FOREIGN KEY ("verified_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "articles" ADD CONSTRAINT "fk_articles_source_feed_id" FOREIGN KEY ("source_feed_id") REFERENCES "feeds" ("id") ON DELETE CASCADE;
ALTER TABLE "articles" ADD CONSTRAINT "fk_articles_sponsor_id" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors" ("id") ON DELETE CASCADE;
ALTER TABLE "articles" ADD CONSTRAINT "fk_articles_cluster_id" FOREIGN KEY ("cluster_id") REFERENCES "feed_clusters" ("id") ON DELETE CASCADE;
ALTER TABLE "sources" ADD CONSTRAINT "fk_sources_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "timelines" ADD CONSTRAINT "fk_timelines_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "quizzes" ADD CONSTRAINT "fk_quizzes_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "fk_quiz_attempts_quiz_id" FOREIGN KEY ("quiz_id") REFERENCES "quizzes" ("id") ON DELETE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "fk_quiz_attempts_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "fk_quiz_attempts_kid_profile_id" FOREIGN KEY ("kid_profile_id") REFERENCES "kid_profiles" ("id") ON DELETE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "fk_comments_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "fk_comments_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "fk_comments_parent_id" FOREIGN KEY ("parent_id") REFERENCES "comments" ("id") ON DELETE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "fk_comments_root_id" FOREIGN KEY ("root_id") REFERENCES "comments" ("id") ON DELETE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "fk_comments_moderated_by" FOREIGN KEY ("moderated_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "comment_votes" ADD CONSTRAINT "fk_comment_votes_comment_id" FOREIGN KEY ("comment_id") REFERENCES "comments" ("id") ON DELETE CASCADE;
ALTER TABLE "comment_votes" ADD CONSTRAINT "fk_comment_votes_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "bookmarks" ADD CONSTRAINT "fk_bookmarks_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "bookmarks" ADD CONSTRAINT "fk_bookmarks_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "reading_log" ADD CONSTRAINT "fk_reading_log_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "reading_log" ADD CONSTRAINT "fk_reading_log_kid_profile_id" FOREIGN KEY ("kid_profile_id") REFERENCES "kid_profiles" ("id") ON DELETE CASCADE;
ALTER TABLE "reading_log" ADD CONSTRAINT "fk_reading_log_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "reading_log" ADD CONSTRAINT "fk_reading_log_session_id" FOREIGN KEY ("session_id") REFERENCES "user_sessions" ("id") ON DELETE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "fk_conversations_created_by" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "fk_conversations_last_message_id" FOREIGN KEY ("last_message_id") REFERENCES "messages" ("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_sender_id" FOREIGN KEY ("sender_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_reply_to_id" FOREIGN KEY ("reply_to_id") REFERENCES "messages" ("id") ON DELETE CASCADE;
ALTER TABLE "community_notes" ADD CONSTRAINT "fk_community_notes_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "community_notes" ADD CONSTRAINT "fk_community_notes_author_id" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "community_notes" ADD CONSTRAINT "fk_community_notes_reviewed_by" FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "feed_clusters" ADD CONSTRAINT "fk_feed_clusters_primary_article_id" FOREIGN KEY ("primary_article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "feed_clusters" ADD CONSTRAINT "fk_feed_clusters_category_id" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "analytics_events" ADD CONSTRAINT "fk_analytics_events_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "analytics_events" ADD CONSTRAINT "fk_analytics_events_kid_profile_id" FOREIGN KEY ("kid_profile_id") REFERENCES "kid_profiles" ("id") ON DELETE CASCADE;
ALTER TABLE "analytics_events" ADD CONSTRAINT "fk_analytics_events_session_id" FOREIGN KEY ("session_id") REFERENCES "user_sessions" ("id") ON DELETE CASCADE;
ALTER TABLE "analytics_events" ADD CONSTRAINT "fk_analytics_events_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "analytics_events" ADD CONSTRAINT "fk_analytics_events_deep_link_id" FOREIGN KEY ("deep_link_id") REFERENCES "deep_links" ("id") ON DELETE CASCADE;
ALTER TABLE "pipeline_costs" ADD CONSTRAINT "fk_pipeline_costs_pipeline_run_id" FOREIGN KEY ("pipeline_run_id") REFERENCES "pipeline_runs" ("id") ON DELETE CASCADE;
ALTER TABLE "pipeline_costs" ADD CONSTRAINT "fk_pipeline_costs_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "ad_impressions" ADD CONSTRAINT "fk_ad_impressions_ad_unit_id" FOREIGN KEY ("ad_unit_id") REFERENCES "ad_units" ("id") ON DELETE CASCADE;
ALTER TABLE "ad_impressions" ADD CONSTRAINT "fk_ad_impressions_placement_id" FOREIGN KEY ("placement_id") REFERENCES "ad_placements" ("id") ON DELETE CASCADE;
ALTER TABLE "ad_impressions" ADD CONSTRAINT "fk_ad_impressions_campaign_id" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "ad_impressions" ADD CONSTRAINT "fk_ad_impressions_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "ad_impressions" ADD CONSTRAINT "fk_ad_impressions_session_id" FOREIGN KEY ("session_id") REFERENCES "user_sessions" ("id") ON DELETE CASCADE;
ALTER TABLE "ad_impressions" ADD CONSTRAINT "fk_ad_impressions_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "ticket_messages" ADD CONSTRAINT "fk_ticket_messages_ticket_id" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets" ("id") ON DELETE CASCADE;
ALTER TABLE "ticket_messages" ADD CONSTRAINT "fk_ticket_messages_sender_id" FOREIGN KEY ("sender_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "article_relations" ADD CONSTRAINT "fk_article_relations_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "article_relations" ADD CONSTRAINT "fk_article_relations_related_article_id" FOREIGN KEY ("related_article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "fk_conversation_participants_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE CASCADE;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "fk_conversation_participants_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "message_receipts" ADD CONSTRAINT "fk_message_receipts_message_id" FOREIGN KEY ("message_id") REFERENCES "messages" ("id") ON DELETE CASCADE;
ALTER TABLE "message_receipts" ADD CONSTRAINT "fk_message_receipts_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "community_note_votes" ADD CONSTRAINT "fk_community_note_votes_note_id" FOREIGN KEY ("note_id") REFERENCES "community_notes" ("id") ON DELETE CASCADE;
ALTER TABLE "community_note_votes" ADD CONSTRAINT "fk_community_note_votes_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "fk_support_tickets_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "fk_support_tickets_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "fk_support_tickets_related_article_id" FOREIGN KEY ("related_article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "fk_support_tickets_related_comment_id" FOREIGN KEY ("related_comment_id") REFERENCES "comments" ("id") ON DELETE CASCADE;
ALTER TABLE "feed_cluster_articles" ADD CONSTRAINT "fk_feed_cluster_articles_cluster_id" FOREIGN KEY ("cluster_id") REFERENCES "feed_clusters" ("id") ON DELETE CASCADE;
ALTER TABLE "feed_cluster_articles" ADD CONSTRAINT "fk_feed_cluster_articles_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;

-- New table foreign keys
ALTER TABLE "bookmark_collections" ADD CONSTRAINT "fk_bookmark_collections_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "bookmarks" ADD CONSTRAINT "fk_bookmarks_collection_id" FOREIGN KEY ("collection_id") REFERENCES "bookmark_collections" ("id") ON DELETE SET NULL;
ALTER TABLE "comment_context_tags" ADD CONSTRAINT "fk_comment_context_tags_comment_id" FOREIGN KEY ("comment_id") REFERENCES "comments" ("id") ON DELETE CASCADE;
ALTER TABLE "comment_context_tags" ADD CONSTRAINT "fk_comment_context_tags_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "category_supervisors" ADD CONSTRAINT "fk_category_supervisors_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "category_supervisors" ADD CONSTRAINT "fk_category_supervisors_category_id" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_queue_items" ADD CONSTRAINT "fk_expert_queue_items_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_queue_items" ADD CONSTRAINT "fk_expert_queue_items_comment_id" FOREIGN KEY ("comment_id") REFERENCES "comments" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_queue_items" ADD CONSTRAINT "fk_expert_queue_items_asking_user_id" FOREIGN KEY ("asking_user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_queue_items" ADD CONSTRAINT "fk_expert_queue_items_target_category_id" FOREIGN KEY ("target_category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_queue_items" ADD CONSTRAINT "fk_expert_queue_items_target_expert_id" FOREIGN KEY ("target_expert_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_queue_items" ADD CONSTRAINT "fk_expert_queue_items_claimed_by" FOREIGN KEY ("claimed_by") REFERENCES "users" ("id") ON DELETE SET NULL;
ALTER TABLE "expert_queue_items" ADD CONSTRAINT "fk_expert_queue_items_answer_comment_id" FOREIGN KEY ("answer_comment_id") REFERENCES "comments" ("id") ON DELETE SET NULL;
ALTER TABLE "family_achievement_progress" ADD CONSTRAINT "fk_family_achievement_progress_owner" FOREIGN KEY ("family_owner_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "family_achievement_progress" ADD CONSTRAINT "fk_family_achievement_progress_achievement" FOREIGN KEY ("family_achievement_id") REFERENCES "family_achievements" ("id") ON DELETE CASCADE;
ALTER TABLE "weekly_recap_quizzes" ADD CONSTRAINT "fk_weekly_recap_quizzes_category_id" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "weekly_recap_questions" ADD CONSTRAINT "fk_weekly_recap_questions_recap_quiz_id" FOREIGN KEY ("recap_quiz_id") REFERENCES "weekly_recap_quizzes" ("id") ON DELETE CASCADE;
ALTER TABLE "weekly_recap_questions" ADD CONSTRAINT "fk_weekly_recap_questions_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "weekly_recap_attempts" ADD CONSTRAINT "fk_weekly_recap_attempts_recap_quiz_id" FOREIGN KEY ("recap_quiz_id") REFERENCES "weekly_recap_quizzes" ("id") ON DELETE CASCADE;
ALTER TABLE "weekly_recap_attempts" ADD CONSTRAINT "fk_weekly_recap_attempts_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "user_warnings" ADD CONSTRAINT "fk_user_warnings_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "user_warnings" ADD CONSTRAINT "fk_user_warnings_issued_by" FOREIGN KEY ("issued_by") REFERENCES "users" ("id") ON DELETE SET NULL;
ALTER TABLE "behavioral_anomalies" ADD CONSTRAINT "fk_behavioral_anomalies_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "behavioral_anomalies" ADD CONSTRAINT "fk_behavioral_anomalies_reviewed_by" FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id") ON DELETE SET NULL;
ALTER TABLE "sponsored_quizzes" ADD CONSTRAINT "fk_sponsored_quizzes_sponsor_id" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors" ("id") ON DELETE CASCADE;
ALTER TABLE "sponsored_quizzes" ADD CONSTRAINT "fk_sponsored_quizzes_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "sponsored_quizzes" ADD CONSTRAINT "fk_sponsored_quizzes_category_id" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "sponsored_quizzes" ADD CONSTRAINT "fk_sponsored_quizzes_approved_by" FOREIGN KEY ("approved_by") REFERENCES "users" ("id") ON DELETE SET NULL;
ALTER TABLE "kid_expert_sessions" ADD CONSTRAINT "fk_kid_expert_sessions_expert_id" FOREIGN KEY ("expert_id") REFERENCES "users" ("id") ON DELETE CASCADE;
ALTER TABLE "kid_expert_sessions" ADD CONSTRAINT "fk_kid_expert_sessions_category_id" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;
ALTER TABLE "kid_expert_questions" ADD CONSTRAINT "fk_kid_expert_questions_session_id" FOREIGN KEY ("session_id") REFERENCES "kid_expert_sessions" ("id") ON DELETE CASCADE;
ALTER TABLE "kid_expert_questions" ADD CONSTRAINT "fk_kid_expert_questions_kid_profile_id" FOREIGN KEY ("kid_profile_id") REFERENCES "kid_profiles" ("id") ON DELETE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "fk_quiz_attempts_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_discussions" ADD CONSTRAINT "fk_expert_discussions_article_id" FOREIGN KEY ("article_id") REFERENCES "articles" ("id") ON DELETE CASCADE;
ALTER TABLE "expert_discussions" ADD CONSTRAINT "fk_expert_discussions_source_comment_id" FOREIGN KEY ("source_comment_id") REFERENCES "comments" ("id") ON DELETE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_supervisor_category_id" FOREIGN KEY ("supervisor_category_id") REFERENCES "categories" ("id") ON DELETE SET NULL;


-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX "idx_categories_slug" ON "categories" ("slug");
CREATE INDEX "idx_categories_parent_id" ON "categories" ("parent_id");
CREATE INDEX "idx_categories_deleted_at" ON "categories" ("deleted_at");
CREATE INDEX "idx_score_rules_action" ON "score_rules" ("action");
CREATE INDEX "idx_score_tiers_deleted_at" ON "score_tiers" ("deleted_at");
CREATE INDEX "idx_achievements_key" ON "achievements" ("key");
CREATE INDEX "idx_achievements_category" ON "achievements" ("category");
CREATE INDEX "idx_plans_tier" ON "plans" ("tier");
CREATE INDEX "idx_roles_name" ON "roles" ("name");
CREATE INDEX "idx_permissions_key" ON "permissions" ("key");
CREATE INDEX "idx_permissions_category" ON "permissions" ("category");
CREATE INDEX "idx_rate_limits_key" ON "rate_limits" ("key");
CREATE INDEX "idx_webhook_log_source" ON "webhook_log" ("source");
CREATE INDEX "idx_webhook_log_event_type" ON "webhook_log" ("event_type");
CREATE INDEX "idx_webhook_log_event_id" ON "webhook_log" ("event_id");
CREATE INDEX "idx_webhook_log_processing_status" ON "webhook_log" ("processing_status");
CREATE INDEX "idx_webhook_log_created_at" ON "webhook_log" ("created_at");
CREATE INDEX "idx_sponsors_slug" ON "sponsors" ("slug");
CREATE INDEX "idx_users_email" ON "users" ("email");
CREATE INDEX "idx_users_phone" ON "users" ("phone");
CREATE INDEX "idx_users_username" ON "users" ("username");
CREATE INDEX "idx_users_plan_id" ON "users" ("plan_id");
CREATE INDEX "idx_users_stripe_customer_id" ON "users" ("stripe_customer_id");
CREATE INDEX "idx_users_banned_by" ON "users" ("banned_by");
CREATE INDEX "idx_users_deletion_requested_at" ON "users" ("deletion_requested_at");
CREATE INDEX "idx_users_referred_by" ON "users" ("referred_by");
CREATE INDEX "idx_users_created_at" ON "users" ("created_at");
CREATE INDEX "idx_users_deleted_at" ON "users" ("deleted_at");
CREATE INDEX "idx_plan_features_plan_id" ON "plan_features" ("plan_id");
CREATE INDEX "idx_role_permissions_role_id" ON "role_permissions" ("role_id");
CREATE INDEX "idx_role_permissions_permission_id" ON "role_permissions" ("permission_id");
CREATE INDEX "idx_auth_providers_user_id" ON "auth_providers" ("user_id");
CREATE INDEX "idx_sessions_user_id" ON "sessions" ("user_id");
CREATE INDEX "idx_sessions_token_hash" ON "sessions" ("token_hash");
CREATE INDEX "idx_sessions_refresh_token_hash" ON "sessions" ("refresh_token_hash");
CREATE INDEX "idx_sessions_device_id" ON "sessions" ("device_id");
CREATE INDEX "idx_sessions_is_active" ON "sessions" ("is_active");
CREATE INDEX "idx_kid_profiles_parent_user_id" ON "kid_profiles" ("parent_user_id");
CREATE INDEX "idx_follows_follower_id" ON "follows" ("follower_id");
CREATE INDEX "idx_follows_following_id" ON "follows" ("following_id");
CREATE INDEX "idx_reactions_user_id" ON "reactions" ("user_id");
CREATE INDEX "idx_reactions_target_type" ON "reactions" ("target_type");
CREATE INDEX "idx_reactions_target_id" ON "reactions" ("target_id");
CREATE INDEX "idx_expert_applications_user_id" ON "expert_applications" ("user_id");
CREATE INDEX "idx_expert_applications_status" ON "expert_applications" ("status");
CREATE INDEX "idx_expert_discussions_category_id" ON "expert_discussions" ("category_id");
CREATE INDEX "idx_expert_discussions_user_id" ON "expert_discussions" ("user_id");
CREATE INDEX "idx_expert_discussions_parent_id" ON "expert_discussions" ("parent_id");
CREATE INDEX "idx_alert_preferences_user_id" ON "alert_preferences" ("user_id");
CREATE INDEX "idx_reports_reporter_id" ON "reports" ("reporter_id");
CREATE INDEX "idx_reports_target_type" ON "reports" ("target_type");
CREATE INDEX "idx_reports_target_id" ON "reports" ("target_id");
CREATE INDEX "idx_reports_status" ON "reports" ("status");
CREATE INDEX "idx_blocked_words_word" ON "blocked_words" ("word");
CREATE INDEX "idx_reserved_usernames_username" ON "reserved_usernames" ("username");
CREATE INDEX "idx_blocked_users_blocker_id" ON "blocked_users" ("blocker_id");
CREATE INDEX "idx_blocked_users_blocked_id" ON "blocked_users" ("blocked_id");
CREATE INDEX "idx_settings_key" ON "settings" ("key");
CREATE INDEX "idx_settings_category" ON "settings" ("category");
CREATE INDEX "idx_feature_flags_key" ON "feature_flags" ("key");
CREATE INDEX "idx_email_templates_key" ON "email_templates" ("key");
CREATE INDEX "idx_user_roles_user_id" ON "user_roles" ("user_id");
CREATE INDEX "idx_user_roles_role_id" ON "user_roles" ("role_id");
CREATE INDEX "idx_access_codes_code" ON "access_codes" ("code");
CREATE INDEX "idx_feeds_category_id" ON "feeds" ("category_id");
CREATE INDEX "idx_feeds_is_active" ON "feeds" ("is_active");
CREATE INDEX "idx_data_requests_user_id" ON "data_requests" ("user_id");
CREATE INDEX "idx_data_requests_type" ON "data_requests" ("type");
CREATE INDEX "idx_data_requests_status" ON "data_requests" ("status");
CREATE INDEX "idx_consent_records_user_id" ON "consent_records" ("user_id");
CREATE INDEX "idx_consent_records_consent_type" ON "consent_records" ("consent_type");
CREATE INDEX "idx_app_config_key" ON "app_config" ("key");
CREATE INDEX "idx_translations_locale" ON "translations" ("locale");
CREATE INDEX "idx_translations_namespace" ON "translations" ("namespace");
CREATE INDEX "idx_translations_key" ON "translations" ("key");
CREATE INDEX "idx_media_assets_uploaded_by" ON "media_assets" ("uploaded_by");
CREATE INDEX "idx_media_assets_file_key" ON "media_assets" ("file_key");
CREATE INDEX "idx_media_assets_associated_type_associated_id" ON "media_assets" ("associated_type", "associated_id");
CREATE INDEX "idx_media_assets_created_at" ON "media_assets" ("created_at");
CREATE INDEX "idx_rate_limit_events_rule_id" ON "rate_limit_events" ("rule_id");
CREATE INDEX "idx_rate_limit_events_user_id" ON "rate_limit_events" ("user_id");
CREATE INDEX "idx_rate_limit_events_ip_address" ON "rate_limit_events" ("ip_address");
CREATE INDEX "idx_rate_limit_events_created_at" ON "rate_limit_events" ("created_at");
CREATE INDEX "idx_user_preferred_categories_user_id" ON "user_preferred_categories" ("user_id");
CREATE INDEX "idx_user_preferred_categories_category_id" ON "user_preferred_categories" ("category_id");
CREATE INDEX "idx_audit_log_actor_id" ON "audit_log" ("actor_id");
CREATE INDEX "idx_audit_log_action" ON "audit_log" ("action");
CREATE INDEX "idx_audit_log_target_type" ON "audit_log" ("target_type");
CREATE INDEX "idx_audit_log_target_id" ON "audit_log" ("target_id");
CREATE INDEX "idx_audit_log_created_at" ON "audit_log" ("created_at");
CREATE INDEX "idx_user_sessions_user_id" ON "user_sessions" ("user_id");
CREATE INDEX "idx_user_sessions_device_session_id" ON "user_sessions" ("device_session_id");
CREATE INDEX "idx_user_sessions_anonymous_id" ON "user_sessions" ("anonymous_id");
CREATE INDEX "idx_user_sessions_started_at" ON "user_sessions" ("started_at");
CREATE INDEX "idx_category_scores_user_id" ON "category_scores" ("user_id");
CREATE INDEX "idx_category_scores_kid_profile_id" ON "category_scores" ("kid_profile_id");
CREATE INDEX "idx_category_scores_category_id" ON "category_scores" ("category_id");
CREATE INDEX "idx_user_achievements_user_id" ON "user_achievements" ("user_id");
CREATE INDEX "idx_user_achievements_kid_profile_id" ON "user_achievements" ("kid_profile_id");
CREATE INDEX "idx_user_achievements_achievement_id" ON "user_achievements" ("achievement_id");
CREATE INDEX "idx_streaks_user_id" ON "streaks" ("user_id");
CREATE INDEX "idx_streaks_kid_profile_id" ON "streaks" ("kid_profile_id");
CREATE INDEX "idx_kid_category_permissions_kid_profile_id" ON "kid_category_permissions" ("kid_profile_id");
CREATE INDEX "idx_kid_category_permissions_category_id" ON "kid_category_permissions" ("category_id");
CREATE INDEX "idx_expert_application_categories_application_id" ON "expert_application_categories" ("application_id");
CREATE INDEX "idx_expert_application_categories_category_id" ON "expert_application_categories" ("category_id");
CREATE INDEX "idx_expert_discussion_votes_discussion_id" ON "expert_discussion_votes" ("discussion_id");
CREATE INDEX "idx_expert_discussion_votes_user_id" ON "expert_discussion_votes" ("user_id");
CREATE INDEX "idx_access_requests_email" ON "access_requests" ("email");
CREATE INDEX "idx_access_requests_type" ON "access_requests" ("type");
CREATE INDEX "idx_access_requests_status" ON "access_requests" ("status");
CREATE INDEX "idx_access_code_uses_access_code_id" ON "access_code_uses" ("access_code_id");
CREATE INDEX "idx_access_code_uses_user_id" ON "access_code_uses" ("user_id");
CREATE INDEX "idx_pipeline_runs_pipeline_type" ON "pipeline_runs" ("pipeline_type");
CREATE INDEX "idx_pipeline_runs_feed_id" ON "pipeline_runs" ("feed_id");
CREATE INDEX "idx_pipeline_runs_status" ON "pipeline_runs" ("status");
CREATE INDEX "idx_campaigns_type" ON "campaigns" ("type");
CREATE INDEX "idx_campaigns_status" ON "campaigns" ("status");
CREATE INDEX "idx_campaigns_cohort_id" ON "campaigns" ("cohort_id");
CREATE INDEX "idx_campaigns_sponsor_id" ON "campaigns" ("sponsor_id");
CREATE INDEX "idx_cohort_members_cohort_id" ON "cohort_members" ("cohort_id");
CREATE INDEX "idx_cohort_members_user_id" ON "cohort_members" ("user_id");
CREATE INDEX "idx_ad_units_placement_id" ON "ad_units" ("placement_id");
CREATE INDEX "idx_ad_units_campaign_id" ON "ad_units" ("campaign_id");
CREATE INDEX "idx_search_history_user_id" ON "search_history" ("user_id");
CREATE INDEX "idx_search_history_query_normalized" ON "search_history" ("query_normalized");
CREATE INDEX "idx_search_history_created_at" ON "search_history" ("created_at");
CREATE INDEX "idx_notifications_user_id" ON "notifications" ("user_id");
CREATE INDEX "idx_notifications_type" ON "notifications" ("type");
CREATE INDEX "idx_notifications_is_read" ON "notifications" ("is_read");
CREATE INDEX "idx_notifications_campaign_id" ON "notifications" ("campaign_id");
CREATE INDEX "idx_notifications_created_at" ON "notifications" ("created_at");
CREATE INDEX "idx_promo_codes_code" ON "promo_codes" ("code");
CREATE INDEX "idx_promo_codes_expires_at" ON "promo_codes" ("expires_at");
CREATE INDEX "idx_promo_codes_campaign_id" ON "promo_codes" ("campaign_id");
CREATE INDEX "idx_deep_links_short_code" ON "deep_links" ("short_code");
CREATE INDEX "idx_deep_links_target_type_target_id" ON "deep_links" ("target_type", "target_id");
CREATE INDEX "idx_deep_links_campaign_id" ON "deep_links" ("campaign_id");
CREATE INDEX "idx_campaign_recipients_campaign_id" ON "campaign_recipients" ("campaign_id");
CREATE INDEX "idx_campaign_recipients_user_id" ON "campaign_recipients" ("user_id");
CREATE INDEX "idx_ad_daily_stats_date" ON "ad_daily_stats" ("date");
CREATE INDEX "idx_ad_daily_stats_ad_unit_id" ON "ad_daily_stats" ("ad_unit_id");
CREATE INDEX "idx_ad_daily_stats_placement_id" ON "ad_daily_stats" ("placement_id");
CREATE INDEX "idx_ad_daily_stats_campaign_id" ON "ad_daily_stats" ("campaign_id");
CREATE INDEX "idx_push_receipts_notification_id" ON "push_receipts" ("notification_id");
CREATE INDEX "idx_push_receipts_user_id" ON "push_receipts" ("user_id");
CREATE INDEX "idx_push_receipts_session_id" ON "push_receipts" ("session_id");
CREATE INDEX "idx_subscriptions_user_id" ON "subscriptions" ("user_id");
CREATE INDEX "idx_subscriptions_plan_id" ON "subscriptions" ("plan_id");
CREATE INDEX "idx_subscriptions_status" ON "subscriptions" ("status");
CREATE INDEX "idx_subscriptions_stripe_subscription_id" ON "subscriptions" ("stripe_subscription_id");
CREATE INDEX "idx_subscriptions_apple_original_transaction_id" ON "subscriptions" ("apple_original_transaction_id");
CREATE INDEX "idx_subscriptions_current_period_end" ON "subscriptions" ("current_period_end");
CREATE INDEX "idx_subscriptions_family_owner_id" ON "subscriptions" ("family_owner_id");
CREATE INDEX "idx_invoices_user_id" ON "invoices" ("user_id");
CREATE INDEX "idx_invoices_subscription_id" ON "invoices" ("subscription_id");
CREATE INDEX "idx_invoices_stripe_invoice_id" ON "invoices" ("stripe_invoice_id");
CREATE INDEX "idx_invoices_status" ON "invoices" ("status");
CREATE INDEX "idx_iap_transactions_user_id" ON "iap_transactions" ("user_id");
CREATE INDEX "idx_iap_transactions_subscription_id" ON "iap_transactions" ("subscription_id");
CREATE INDEX "idx_iap_transactions_store" ON "iap_transactions" ("store");
CREATE INDEX "idx_iap_transactions_original_transaction_id" ON "iap_transactions" ("original_transaction_id");
CREATE INDEX "idx_iap_transactions_transaction_id" ON "iap_transactions" ("transaction_id");
CREATE INDEX "idx_promo_uses_promo_code_id" ON "promo_uses" ("promo_code_id");
CREATE INDEX "idx_promo_uses_user_id" ON "promo_uses" ("user_id");
CREATE INDEX "idx_subscription_events_subscription_id" ON "subscription_events" ("subscription_id");
CREATE INDEX "idx_subscription_events_user_id" ON "subscription_events" ("user_id");
CREATE INDEX "idx_subscription_events_event_type" ON "subscription_events" ("event_type");
CREATE INDEX "idx_subscription_events_created_at" ON "subscription_events" ("created_at");
CREATE INDEX "idx_articles_slug" ON "articles" ("slug");
CREATE INDEX "idx_articles_category_id" ON "articles" ("category_id");
CREATE INDEX "idx_articles_author_id" ON "articles" ("author_id");
CREATE INDEX "idx_articles_status" ON "articles" ("status");
CREATE INDEX "idx_articles_verified_by" ON "articles" ("verified_by");
CREATE INDEX "idx_articles_is_kids_safe" ON "articles" ("is_kids_safe");
CREATE INDEX "idx_articles_tags" ON "articles" USING GIN ("tags");
CREATE INDEX "idx_articles_source_feed_id" ON "articles" ("source_feed_id");
CREATE INDEX "idx_articles_external_id" ON "articles" ("external_id");
CREATE INDEX "idx_articles_publish_at" ON "articles" ("publish_at");
CREATE INDEX "idx_articles_published_at" ON "articles" ("published_at");
CREATE INDEX "idx_articles_deleted_at" ON "articles" ("deleted_at");
CREATE INDEX "idx_articles_sponsor_id" ON "articles" ("sponsor_id");
CREATE INDEX "idx_articles_cluster_id" ON "articles" ("cluster_id");
CREATE INDEX "idx_articles_search_vector" ON "articles" USING GIN ("search_vector");
CREATE INDEX "idx_sources_article_id" ON "sources" ("article_id");
CREATE INDEX "idx_timelines_article_id" ON "timelines" ("article_id");
CREATE INDEX "idx_quizzes_article_id" ON "quizzes" ("article_id");
CREATE INDEX "idx_quizzes_deleted_at" ON "quizzes" ("deleted_at");
CREATE INDEX "idx_quiz_attempts_quiz_id" ON "quiz_attempts" ("quiz_id");
CREATE INDEX "idx_quiz_attempts_user_id" ON "quiz_attempts" ("user_id");
CREATE INDEX "idx_quiz_attempts_kid_profile_id" ON "quiz_attempts" ("kid_profile_id");
CREATE INDEX "idx_comments_article_id" ON "comments" ("article_id");
CREATE INDEX "idx_comments_user_id" ON "comments" ("user_id");
CREATE INDEX "idx_comments_parent_id" ON "comments" ("parent_id");
CREATE INDEX "idx_comments_root_id" ON "comments" ("root_id");
CREATE INDEX "idx_comments_ai_tag" ON "comments" ("ai_tag");
CREATE INDEX "idx_comments_status" ON "comments" ("status");
CREATE INDEX "idx_comments_moderated_by" ON "comments" ("moderated_by");
CREATE INDEX "idx_comments_created_at" ON "comments" ("created_at");
CREATE INDEX "idx_comments_deleted_at" ON "comments" ("deleted_at");
CREATE INDEX "idx_comment_votes_comment_id" ON "comment_votes" ("comment_id");
CREATE INDEX "idx_comment_votes_user_id" ON "comment_votes" ("user_id");
CREATE INDEX "idx_bookmarks_user_id" ON "bookmarks" ("user_id");
CREATE INDEX "idx_bookmarks_article_id" ON "bookmarks" ("article_id");
CREATE INDEX "idx_reading_log_user_id" ON "reading_log" ("user_id");
CREATE INDEX "idx_reading_log_kid_profile_id" ON "reading_log" ("kid_profile_id");
CREATE INDEX "idx_reading_log_article_id" ON "reading_log" ("article_id");
CREATE INDEX "idx_reading_log_session_id" ON "reading_log" ("session_id");
CREATE INDEX "idx_reading_log_created_at" ON "reading_log" ("created_at");
CREATE INDEX "idx_conversations_created_by" ON "conversations" ("created_by");
CREATE INDEX "idx_conversations_last_message_at" ON "conversations" ("last_message_at");
CREATE INDEX "idx_messages_conversation_id" ON "messages" ("conversation_id");
CREATE INDEX "idx_messages_sender_id" ON "messages" ("sender_id");
CREATE INDEX "idx_messages_created_at" ON "messages" ("created_at");
CREATE INDEX "idx_community_notes_article_id" ON "community_notes" ("article_id");
CREATE INDEX "idx_community_notes_author_id" ON "community_notes" ("author_id");
CREATE INDEX "idx_community_notes_status" ON "community_notes" ("status");
CREATE INDEX "idx_feed_clusters_category_id" ON "feed_clusters" ("category_id");
CREATE INDEX "idx_analytics_events_user_id" ON "analytics_events" ("user_id");
CREATE INDEX "idx_analytics_events_kid_profile_id" ON "analytics_events" ("kid_profile_id");
CREATE INDEX "idx_analytics_events_session_id" ON "analytics_events" ("session_id");
CREATE INDEX "idx_analytics_events_event_name" ON "analytics_events" ("event_name");
CREATE INDEX "idx_analytics_events_event_category" ON "analytics_events" ("event_category");
CREATE INDEX "idx_analytics_events_article_id" ON "analytics_events" ("article_id");
CREATE INDEX "idx_analytics_events_created_at" ON "analytics_events" ("created_at");
CREATE INDEX "idx_pipeline_costs_pipeline_run_id" ON "pipeline_costs" ("pipeline_run_id");
CREATE INDEX "idx_pipeline_costs_article_id" ON "pipeline_costs" ("article_id");
CREATE INDEX "idx_ad_impressions_ad_unit_id" ON "ad_impressions" ("ad_unit_id");
CREATE INDEX "idx_ad_impressions_placement_id" ON "ad_impressions" ("placement_id");
CREATE INDEX "idx_ad_impressions_campaign_id" ON "ad_impressions" ("campaign_id");
CREATE INDEX "idx_ad_impressions_user_id" ON "ad_impressions" ("user_id");
CREATE INDEX "idx_ad_impressions_session_id" ON "ad_impressions" ("session_id");
CREATE INDEX "idx_ad_impressions_article_id" ON "ad_impressions" ("article_id");
CREATE INDEX "idx_ad_impressions_created_at" ON "ad_impressions" ("created_at");
CREATE INDEX "idx_ticket_messages_ticket_id" ON "ticket_messages" ("ticket_id");
CREATE INDEX "idx_article_relations_article_id" ON "article_relations" ("article_id");
CREATE INDEX "idx_article_relations_related_article_id" ON "article_relations" ("related_article_id");
CREATE INDEX "idx_conversation_participants_conversation_id" ON "conversation_participants" ("conversation_id");
CREATE INDEX "idx_conversation_participants_user_id" ON "conversation_participants" ("user_id");
CREATE INDEX "idx_message_receipts_message_id" ON "message_receipts" ("message_id");
CREATE INDEX "idx_message_receipts_user_id" ON "message_receipts" ("user_id");
CREATE INDEX "idx_community_note_votes_note_id" ON "community_note_votes" ("note_id");
CREATE INDEX "idx_community_note_votes_user_id" ON "community_note_votes" ("user_id");
CREATE INDEX "idx_support_tickets_ticket_number" ON "support_tickets" ("ticket_number");
CREATE INDEX "idx_support_tickets_user_id" ON "support_tickets" ("user_id");
CREATE INDEX "idx_support_tickets_status" ON "support_tickets" ("status");
CREATE INDEX "idx_support_tickets_assigned_to" ON "support_tickets" ("assigned_to");
CREATE INDEX "idx_support_tickets_created_at" ON "support_tickets" ("created_at");
CREATE INDEX "idx_feed_cluster_articles_cluster_id" ON "feed_cluster_articles" ("cluster_id");
CREATE INDEX "idx_feed_cluster_articles_article_id" ON "feed_cluster_articles" ("article_id");

-- ============================================================
-- Unique Constraints & Partial Indexes
-- ============================================================
ALTER TABLE "plan_features" ADD CONSTRAINT "uq_plan_features_plan_id_feature_key" UNIQUE ("plan_id", "feature_key");
ALTER TABLE "role_permissions" ADD CONSTRAINT "uq_role_permissions_role_id_permission_id" UNIQUE ("role_id", "permission_id");
ALTER TABLE "auth_providers" ADD CONSTRAINT "uq_auth_providers_provider_provider_user_id" UNIQUE ("provider", "provider_user_id");
ALTER TABLE "follows" ADD CONSTRAINT "uq_follows_follower_id_following_id" UNIQUE ("follower_id", "following_id");
ALTER TABLE "reactions" ADD CONSTRAINT "uq_reactions_user_id_target_type_target_id_reaction_type" UNIQUE ("user_id", "target_type", "target_id", "reaction_type");
ALTER TABLE "alert_preferences" ADD CONSTRAINT "uq_alert_preferences_user_id_alert_type" UNIQUE ("user_id", "alert_type");
ALTER TABLE "blocked_users" ADD CONSTRAINT "uq_blocked_users_blocker_id_blocked_id" UNIQUE ("blocker_id", "blocked_id");
ALTER TABLE "user_roles" ADD CONSTRAINT "uq_user_roles_user_id_role_id_scope" UNIQUE ("user_id", "role_id", "scope");
ALTER TABLE "app_config" ADD CONSTRAINT "uq_app_config_key_platform_min_app_version" UNIQUE ("key", "platform", "min_app_version");
ALTER TABLE "translations" ADD CONSTRAINT "uq_translations_locale_namespace_key_platform" UNIQUE ("locale", "namespace", "key", "platform");
ALTER TABLE "user_preferred_categories" ADD CONSTRAINT "uq_user_preferred_categories_user_id_category_id" UNIQUE ("user_id", "category_id");
CREATE UNIQUE INDEX "idx_category_scores_user_id_category_id_partial" ON "category_scores" ("user_id", "category_id") WHERE kid_profile_id IS NULL;
CREATE UNIQUE INDEX "idx_category_scores_kid_profile_id_category_id_partial" ON "category_scores" ("kid_profile_id", "category_id") WHERE kid_profile_id IS NOT NULL;
CREATE UNIQUE INDEX "idx_user_achievements_user_id_achievement_id_partial" ON "user_achievements" ("user_id", "achievement_id") WHERE kid_profile_id IS NULL;
CREATE UNIQUE INDEX "idx_user_achievements_kid_profile_id_achievement_id_partial" ON "user_achievements" ("kid_profile_id", "achievement_id") WHERE kid_profile_id IS NOT NULL;
CREATE UNIQUE INDEX "idx_streaks_user_id_date_partial" ON "streaks" ("user_id", "date") WHERE kid_profile_id IS NULL;
CREATE UNIQUE INDEX "idx_streaks_kid_profile_id_date_partial" ON "streaks" ("kid_profile_id", "date") WHERE kid_profile_id IS NOT NULL;
ALTER TABLE "streaks" ADD CONSTRAINT "chk_streaks" CHECK (user_id IS NOT NULL OR kid_profile_id IS NOT NULL);
ALTER TABLE "users" ADD CONSTRAINT "chk_users_plan_status" CHECK ((plan_id IS NULL AND plan_status IN ('free', 'frozen')) OR (plan_id IS NOT NULL AND plan_status NOT IN ('free', 'frozen')));
ALTER TABLE "email_templates" ADD CONSTRAINT "uq_email_templates_key_language" UNIQUE ("key", "language");
ALTER TABLE "ad_daily_stats" ADD CONSTRAINT "uq_ad_daily_stats_date_combo" UNIQUE ("date", "ad_unit_id", "placement_id", "campaign_id", "platform");
ALTER TABLE "kid_category_permissions" ADD CONSTRAINT "uq_kid_category_permissions_kid_profile_id_category_id" UNIQUE ("kid_profile_id", "category_id");
ALTER TABLE "expert_application_categories" ADD CONSTRAINT "uq_expert_application_categories_application_id_category_id" UNIQUE ("application_id", "category_id");
ALTER TABLE "expert_discussion_votes" ADD CONSTRAINT "uq_expert_discussion_votes_discussion_id_user_id" UNIQUE ("discussion_id", "user_id");
ALTER TABLE "access_code_uses" ADD CONSTRAINT "uq_access_code_uses_access_code_id_user_id" UNIQUE ("access_code_id", "user_id");
ALTER TABLE "cohort_members" ADD CONSTRAINT "uq_cohort_members_cohort_id_user_id" UNIQUE ("cohort_id", "user_id");
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "uq_campaign_recipients_campaign_id_user_id" UNIQUE ("campaign_id", "user_id");
ALTER TABLE "comment_votes" ADD CONSTRAINT "uq_comment_votes_comment_id_user_id" UNIQUE ("comment_id", "user_id");
ALTER TABLE "bookmarks" ADD CONSTRAINT "uq_bookmarks_user_id_article_id" UNIQUE ("user_id", "article_id");
ALTER TABLE "article_relations" ADD CONSTRAINT "uq_article_relations_article_id_related_article_id" UNIQUE ("article_id", "related_article_id");
ALTER TABLE "conversation_participants" ADD CONSTRAINT "uq_conversation_participants_conversation_id_user_id" UNIQUE ("conversation_id", "user_id");
ALTER TABLE "message_receipts" ADD CONSTRAINT "uq_message_receipts_message_id_user_id" UNIQUE ("message_id", "user_id");
ALTER TABLE "community_note_votes" ADD CONSTRAINT "uq_community_note_votes_note_id_user_id" UNIQUE ("note_id", "user_id");
ALTER TABLE "feed_cluster_articles" ADD CONSTRAINT "uq_feed_cluster_articles_cluster_id_article_id" UNIQUE ("cluster_id", "article_id");

ALTER TABLE "comment_context_tags" ADD CONSTRAINT "uq_comment_context_tags_comment_user" UNIQUE ("comment_id", "user_id");
ALTER TABLE "category_supervisors" ADD CONSTRAINT "uq_category_supervisors_user_category" UNIQUE ("user_id", "category_id");
ALTER TABLE "bookmark_collections" ADD CONSTRAINT "uq_bookmark_collections_user_name" UNIQUE ("user_id", "name");
ALTER TABLE "weekly_recap_attempts" ADD CONSTRAINT "uq_weekly_recap_attempts_quiz_user" UNIQUE ("recap_quiz_id", "user_id");
ALTER TABLE "family_achievement_progress" ADD CONSTRAINT "uq_family_achievement_progress_owner_achievement" UNIQUE ("family_owner_id", "family_achievement_id");


-- New table indexes
CREATE INDEX "idx_bookmark_collections_user_id" ON "bookmark_collections" ("user_id");
CREATE INDEX "idx_comment_context_tags_comment_id" ON "comment_context_tags" ("comment_id");
CREATE INDEX "idx_comment_context_tags_user_id" ON "comment_context_tags" ("user_id");
CREATE INDEX "idx_category_supervisors_user_id" ON "category_supervisors" ("user_id");
CREATE INDEX "idx_category_supervisors_category_id" ON "category_supervisors" ("category_id");
CREATE INDEX "idx_category_supervisors_is_active" ON "category_supervisors" ("is_active");
CREATE INDEX "idx_expert_queue_items_article_id" ON "expert_queue_items" ("article_id");
CREATE INDEX "idx_expert_queue_items_status" ON "expert_queue_items" ("status");
CREATE INDEX "idx_expert_queue_items_target_category_id" ON "expert_queue_items" ("target_category_id");
CREATE INDEX "idx_expert_queue_items_target_expert_id" ON "expert_queue_items" ("target_expert_id");
CREATE INDEX "idx_expert_queue_items_claimed_by" ON "expert_queue_items" ("claimed_by");
CREATE INDEX "idx_family_achievement_progress_owner" ON "family_achievement_progress" ("family_owner_id");
CREATE INDEX "idx_weekly_recap_quizzes_week_start" ON "weekly_recap_quizzes" ("week_start");
CREATE INDEX "idx_weekly_recap_quizzes_category_id" ON "weekly_recap_quizzes" ("category_id");
CREATE INDEX "idx_weekly_recap_attempts_user_id" ON "weekly_recap_attempts" ("user_id");
CREATE INDEX "idx_weekly_recap_attempts_recap_quiz_id" ON "weekly_recap_attempts" ("recap_quiz_id");
CREATE INDEX "idx_user_warnings_user_id" ON "user_warnings" ("user_id");
CREATE INDEX "idx_behavioral_anomalies_user_id" ON "behavioral_anomalies" ("user_id");
CREATE INDEX "idx_behavioral_anomalies_anomaly_type" ON "behavioral_anomalies" ("anomaly_type");
CREATE INDEX "idx_behavioral_anomalies_status" ON "behavioral_anomalies" ("status");
CREATE INDEX "idx_sponsored_quizzes_sponsor_id" ON "sponsored_quizzes" ("sponsor_id");
CREATE INDEX "idx_sponsored_quizzes_status" ON "sponsored_quizzes" ("status");
CREATE INDEX "idx_kid_expert_sessions_expert_id" ON "kid_expert_sessions" ("expert_id");
CREATE INDEX "idx_kid_expert_sessions_scheduled_at" ON "kid_expert_sessions" ("scheduled_at");
CREATE INDEX "idx_kid_expert_questions_session_id" ON "kid_expert_questions" ("session_id");
CREATE INDEX "idx_comments_is_context_pinned" ON "comments" ("is_context_pinned") WHERE is_context_pinned = true;
CREATE INDEX "idx_comments_is_expert_question" ON "comments" ("is_expert_question") WHERE is_expert_question = true;
CREATE INDEX "idx_quiz_attempts_article_id" ON "quiz_attempts" ("article_id");
CREATE INDEX "idx_reports_is_supervisor_flag" ON "reports" ("is_supervisor_flag") WHERE is_supervisor_flag = true;
CREATE INDEX "idx_users_frozen_at" ON "users" ("frozen_at") WHERE frozen_at IS NOT NULL;
CREATE INDEX "idx_bookmarks_collection_id" ON "bookmarks" ("collection_id");


-- ============================================================
-- Auto-update updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_categories_updated_at" BEFORE UPDATE ON "categories" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_score_rules_updated_at" BEFORE UPDATE ON "score_rules" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_score_tiers_updated_at" BEFORE UPDATE ON "score_tiers" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_achievements_updated_at" BEFORE UPDATE ON "achievements" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_plans_updated_at" BEFORE UPDATE ON "plans" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_roles_updated_at" BEFORE UPDATE ON "roles" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_rate_limits_updated_at" BEFORE UPDATE ON "rate_limits" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_sponsors_updated_at" BEFORE UPDATE ON "sponsors" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_ad_placements_updated_at" BEFORE UPDATE ON "ad_placements" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_users_updated_at" BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_plan_features_updated_at" BEFORE UPDATE ON "plan_features" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_auth_providers_updated_at" BEFORE UPDATE ON "auth_providers" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_kid_profiles_updated_at" BEFORE UPDATE ON "kid_profiles" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_follows_updated_at" BEFORE UPDATE ON "follows" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_expert_applications_updated_at" BEFORE UPDATE ON "expert_applications" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_expert_discussions_updated_at" BEFORE UPDATE ON "expert_discussions" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_alert_preferences_updated_at" BEFORE UPDATE ON "alert_preferences" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_reports_updated_at" BEFORE UPDATE ON "reports" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_blocked_words_updated_at" BEFORE UPDATE ON "blocked_words" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_settings_updated_at" BEFORE UPDATE ON "settings" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_feature_flags_updated_at" BEFORE UPDATE ON "feature_flags" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_email_templates_updated_at" BEFORE UPDATE ON "email_templates" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_access_codes_updated_at" BEFORE UPDATE ON "access_codes" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_feeds_updated_at" BEFORE UPDATE ON "feeds" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_data_requests_updated_at" BEFORE UPDATE ON "data_requests" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_cohorts_updated_at" BEFORE UPDATE ON "cohorts" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_consent_records_updated_at" BEFORE UPDATE ON "consent_records" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_app_config_updated_at" BEFORE UPDATE ON "app_config" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_translations_updated_at" BEFORE UPDATE ON "translations" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_media_assets_updated_at" BEFORE UPDATE ON "media_assets" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_ad_campaigns_updated_at" BEFORE UPDATE ON "ad_campaigns" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_category_scores_updated_at" BEFORE UPDATE ON "category_scores" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_access_requests_updated_at" BEFORE UPDATE ON "access_requests" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_campaigns_updated_at" BEFORE UPDATE ON "campaigns" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_ad_units_updated_at" BEFORE UPDATE ON "ad_units" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_notifications_updated_at" BEFORE UPDATE ON "notifications" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_promo_codes_updated_at" BEFORE UPDATE ON "promo_codes" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_deep_links_updated_at" BEFORE UPDATE ON "deep_links" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_ad_daily_stats_updated_at" BEFORE UPDATE ON "ad_daily_stats" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_subscriptions_updated_at" BEFORE UPDATE ON "subscriptions" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_invoices_updated_at" BEFORE UPDATE ON "invoices" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_iap_transactions_updated_at" BEFORE UPDATE ON "iap_transactions" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_articles_updated_at" BEFORE UPDATE ON "articles" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_sources_updated_at" BEFORE UPDATE ON "sources" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_timelines_updated_at" BEFORE UPDATE ON "timelines" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_quizzes_updated_at" BEFORE UPDATE ON "quizzes" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_comments_updated_at" BEFORE UPDATE ON "comments" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_reading_log_updated_at" BEFORE UPDATE ON "reading_log" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_conversations_updated_at" BEFORE UPDATE ON "conversations" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_messages_updated_at" BEFORE UPDATE ON "messages" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_community_notes_updated_at" BEFORE UPDATE ON "community_notes" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_feed_clusters_updated_at" BEFORE UPDATE ON "feed_clusters" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_conversation_participants_updated_at" BEFORE UPDATE ON "conversation_participants" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_support_tickets_updated_at" BEFORE UPDATE ON "support_tickets" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "trg_bookmark_collections_updated_at" BEFORE UPDATE ON "bookmark_collections" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_category_supervisors_updated_at" BEFORE UPDATE ON "category_supervisors" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_expert_queue_items_updated_at" BEFORE UPDATE ON "expert_queue_items" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_family_achievements_updated_at" BEFORE UPDATE ON "family_achievements" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_family_achievement_progress_updated_at" BEFORE UPDATE ON "family_achievement_progress" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_weekly_recap_quizzes_updated_at" BEFORE UPDATE ON "weekly_recap_quizzes" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_sponsored_quizzes_updated_at" BEFORE UPDATE ON "sponsored_quizzes" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER "trg_kid_expert_sessions_updated_at" BEFORE UPDATE ON "kid_expert_sessions" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Enable Row Level Security
-- ============================================================
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "score_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "score_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "achievements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sponsors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ad_placements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_features" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kid_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "follows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expert_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expert_discussions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alert_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blocked_words" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reserved_usernames" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "blocked_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "access_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feeds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cohorts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "translations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ad_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_preferred_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "category_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_achievements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "streaks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kid_category_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expert_application_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expert_discussion_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "access_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "access_code_uses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pipeline_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cohort_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ad_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "search_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promo_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deep_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaign_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ad_daily_stats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "iap_transactions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "bookmark_collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comment_context_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "category_supervisors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expert_queue_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_achievements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "family_achievement_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weekly_recap_quizzes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weekly_recap_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weekly_recap_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_warnings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behavioral_anomalies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sponsored_quizzes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kid_expert_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kid_expert_questions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "promo_uses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "articles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timelines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quizzes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quiz_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comment_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookmarks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reading_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feed_clusters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pipeline_costs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ad_impressions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "article_relations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversation_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_note_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feed_cluster_articles" ENABLE ROW LEVEL SECURITY;
-- ============================================================
-- 002_seed.sql
-- ============================================================

-- ============================================================
-- Verity Post Seed Data
-- (inlined — runs in sequence, no separate file needed)
-- ============================================================

-- ============================================================
-- 1. ROLES
-- ============================================================
INSERT INTO "roles" ("name", "display_name", "description", "hierarchy_level", "is_system") VALUES
  ('owner',       'Owner',       'Platform owner. Full system access.',                  100, true),
  ('superadmin',  'Superadmin',  'Top admin. Everything except owner-only features.',    90,  true),
  ('admin',       'Admin',       'Full admin panel. User/content/settings management.',  80,  true),
  ('editor',      'Editor',      'Content management. Publish articles, run pipeline.',  70,  true),
  ('moderator',   'Moderator',   'Moderation queue. Comments, reports, community notes.',60,  true),
  ('expert',      'Expert',      'Verified subject-matter expert.',                      50,  true),
  ('educator',    'Educator',    'Verified educator.',                                   50,  true),
  ('journalist',  'Journalist',  'Verified journalist.',                                 50,  true),
  ('user',        'User',        'Default registered user.',                             10,  true);

-- ============================================================
-- 2. PERMISSIONS / 3. ROLE -> PERMISSION MAPPINGS
-- ============================================================
-- v2 NOTE: the legacy colon-namespaced permission catalog
-- ('comment:create', 'social:follow', 'quiz:take', etc.) and the
-- role_permissions bulk seeds that referenced it are intentionally
-- not seeded here. The dot-namespaced v2 permissions
-- ('article.view_comments', 'comments.post', 'social.follow', etc.)
-- are seeded in section 016 below and bound to plans/roles through
-- permission_sets. get_my_capabilities() is the single source of
-- truth for effective user permissions.

-- ============================================================
-- 4. PLANS
-- ============================================================
INSERT INTO "plans" ("name", "display_name", "description", "price_cents", "currency", "billing_period", "tier", "stripe_price_id", "apple_product_id", "is_active", "sort_order", "max_family_members", "metadata") VALUES
  ('free',                    'Free',                  'Full reading, quizzes (2 attempts), comments, 10 bookmarks, streaks, achievements.',
    0,     'USD', NULL,    'free',              NULL, NULL, true, 1,  0,  '{}'),
  ('verity_monthly',          'Verity',                'Reduced ads, unlimited bookmarks, quiz retakes, TTS, advanced search, DMs, follows.',
    399,   'USD', 'month', 'verity',            NULL, NULL, true, 2,  0,  '{}'),
  ('verity_annual',           'Verity (Annual)',        'Verity — billed annually. Save ~17%.',
    3999,  'USD', 'year',  'verity',            NULL, NULL, true, 3,  0,  '{"is_annual": true}'),
  ('verity_pro_monthly',      'Verity Pro',            'Ad-free, Ask an Expert, streak freezes, unlimited DMs, priority support.',
    999,   'USD', 'month', 'verity_pro',        NULL, NULL, true, 4,  0,  '{}'),
  ('verity_pro_annual',       'Verity Pro (Annual)',    'Verity Pro — billed annually. Save ~17%.',
    9999,  'USD', 'year',  'verity_pro',        NULL, NULL, true, 5,  0,  '{"is_annual": true}'),
  ('verity_family_monthly',   'Verity Family',         'Verity Pro for 2 adults + up to 2 kids. Family leaderboard, shared achievements.',
    1499,  'USD', 'month', 'verity_family',     NULL, NULL, true, 6,  2,  '{"max_adults": 2, "max_kids": 2}'),
  ('verity_family_annual',    'Verity Family (Annual)', 'Verity Family — billed annually. Save ~17%.',
    14999, 'USD', 'year',  'verity_family',     NULL, NULL, true, 7,  2,  '{"max_adults": 2, "max_kids": 2, "is_annual": true}'),
  ('verity_family_xl_monthly','Verity Family XL',      'Verity Pro for 2 adults + up to 4 kids.',
    1999,  'USD', 'month', 'verity_family_xl',  NULL, NULL, true, 8,  4,  '{"max_adults": 2, "max_kids": 4}'),
  ('verity_family_xl_annual', 'Verity Family XL (Annual)','Verity Family XL — billed annually. Save ~17%.',
    19999, 'USD', 'year',  'verity_family_xl',  NULL, NULL, true, 9,  4,  '{"max_adults": 2, "max_kids": 4, "is_annual": true}');

-- ============================================================
-- 5. PLAN FEATURES
-- ============================================================
-- ============================================================
-- Plan features — rebuilt for Blueprint v2
-- ============================================================

-- Free plan features
INSERT INTO "plan_features" ("plan_id", "feature_key", "feature_name", "is_enabled", "limit_value", "limit_type")
SELECT p.id, f.key, f.name, f.enabled, f.lim, f.ltype
FROM "plans" p,
(VALUES
  ('quiz_attempts',       'Quiz attempts per article',   true,  2,     'per_article'),
  ('bookmarks',           'Bookmarks',                   true,  10,    'max'),
  ('bookmark_collections','Bookmark collections',         false, NULL,  NULL),
  ('direct_messages',     'Direct messages',              false, NULL,  NULL),
  ('follow_users',        'Follow users',                false, NULL,  NULL),
  ('mention_users',       'Mention users in comments',   false, NULL,  NULL),
  ('advanced_search',     'Advanced search filters',     false, NULL,  NULL),
  ('ad_free',             'Ad-free experience',           false, NULL,  NULL),
  ('reduced_ads',         'Reduced ads',                  false, NULL,  NULL),
  ('breaking_alerts',     'Breaking news push alerts',   true,  1,     'per_day'),
  ('text_to_speech',      'Text to speech',               false, NULL,  NULL),
  ('streak_freeze',       'Streak freezes per week',     false, 0,     'per_week'),
  ('ask_expert',          'Ask an Expert',                false, NULL,  NULL),
  ('view_expert_full',    'View full expert responses',  false, NULL,  NULL),
  ('view_verity_scores',  'View others Verity Scores',   false, NULL,  NULL),
  ('category_leaderboard','Category leaderboards',        false, NULL,  NULL),
  ('weekly_recap_quiz',   'Weekly recap quiz',            false, NULL,  NULL),
  ('weekly_report',       'Weekly reading report',        false, NULL,  NULL),
  ('profile_banner',      'Custom profile banner',       false, NULL,  NULL),
  ('profile_card',        'Shareable profile card',      false, NULL,  NULL),
  ('kid_profiles',        'Kid profiles',                 false, NULL,  NULL)
) AS f(key, name, enabled, lim, ltype)
WHERE p.name = 'free';

-- Verity plan features
INSERT INTO "plan_features" ("plan_id", "feature_key", "feature_name", "is_enabled", "limit_value", "limit_type")
SELECT p.id, f.key, f.name, f.enabled, f.lim, f.ltype
FROM "plans" p,
(VALUES
  ('quiz_attempts',       'Quiz attempts per article',   true,  NULL,  NULL),
  ('bookmarks',           'Bookmarks',                   true,  NULL,  NULL),
  ('bookmark_collections','Bookmark collections',         true,  NULL,  NULL),
  ('direct_messages',     'Direct messages',              true,  NULL,  NULL),
  ('follow_users',        'Follow users',                true,  NULL,  NULL),
  ('mention_users',       'Mention users in comments',   true,  NULL,  NULL),
  ('advanced_search',     'Advanced search filters',     true,  NULL,  NULL),
  ('ad_free',             'Ad-free experience',           false, NULL,  NULL),
  ('reduced_ads',         'Reduced ads',                  true,  NULL,  NULL),
  ('breaking_alerts',     'Breaking news push alerts',   true,  NULL,  NULL),
  ('text_to_speech',      'Text to speech',               true,  NULL,  NULL),
  ('streak_freeze',       'Streak freezes per week',     false, 0,     'per_week'),
  ('ask_expert',          'Ask an Expert',                false, NULL,  NULL),
  ('view_expert_full',    'View full expert responses',  true,  NULL,  NULL),
  ('view_verity_scores',  'View others Verity Scores',   true,  NULL,  NULL),
  ('category_leaderboard','Category leaderboards',        true,  NULL,  NULL),
  ('weekly_recap_quiz',   'Weekly recap quiz',            true,  NULL,  NULL),
  ('weekly_report',       'Weekly reading report',        true,  NULL,  NULL),
  ('profile_banner',      'Custom profile banner',       true,  NULL,  NULL),
  ('profile_card',        'Shareable profile card',      true,  NULL,  NULL),
  ('kid_profiles',        'Kid profiles',                 false, NULL,  NULL)
) AS f(key, name, enabled, lim, ltype)
WHERE p.name IN ('verity_monthly', 'verity_annual');

-- Verity Pro plan features
INSERT INTO "plan_features" ("plan_id", "feature_key", "feature_name", "is_enabled", "limit_value", "limit_type")
SELECT p.id, f.key, f.name, f.enabled, f.lim, f.ltype
FROM "plans" p,
(VALUES
  ('quiz_attempts',       'Quiz attempts per article',   true,  NULL,  NULL),
  ('bookmarks',           'Bookmarks',                   true,  NULL,  NULL),
  ('bookmark_collections','Bookmark collections',         true,  NULL,  NULL),
  ('direct_messages',     'Direct messages',              true,  NULL,  NULL),
  ('follow_users',        'Follow users',                true,  NULL,  NULL),
  ('mention_users',       'Mention users in comments',   true,  NULL,  NULL),
  ('advanced_search',     'Advanced search filters',     true,  NULL,  NULL),
  ('ad_free',             'Ad-free experience',           true,  NULL,  NULL),
  ('reduced_ads',         'Reduced ads',                  true,  NULL,  NULL),
  ('breaking_alerts',     'Breaking news push alerts',   true,  NULL,  NULL),
  ('text_to_speech',      'Text to speech',               true,  NULL,  NULL),
  ('streak_freeze',       'Streak freezes per week',     true,  2,     'per_week'),
  ('ask_expert',          'Ask an Expert',                true,  NULL,  NULL),
  ('view_expert_full',    'View full expert responses',  true,  NULL,  NULL),
  ('view_verity_scores',  'View others Verity Scores',   true,  NULL,  NULL),
  ('category_leaderboard','Category leaderboards',        true,  NULL,  NULL),
  ('weekly_recap_quiz',   'Weekly recap quiz',            true,  NULL,  NULL),
  ('weekly_report',       'Weekly reading report',        true,  NULL,  NULL),
  ('profile_banner',      'Custom profile banner',       true,  NULL,  NULL),
  ('profile_card',        'Shareable profile card',      true,  NULL,  NULL),
  ('kid_profiles',        'Kid profiles',                 false, NULL,  NULL),
  ('priority_support',    'Priority support',             true,  NULL,  NULL)
) AS f(key, name, enabled, lim, ltype)
WHERE p.name IN ('verity_pro_monthly', 'verity_pro_annual');

-- Verity Family plan features
INSERT INTO "plan_features" ("plan_id", "feature_key", "feature_name", "is_enabled", "limit_value", "limit_type")
SELECT p.id, f.key, f.name, f.enabled, f.lim, f.ltype
FROM "plans" p,
(VALUES
  ('quiz_attempts',       'Quiz attempts per article',   true,  NULL,  NULL),
  ('bookmarks',           'Bookmarks',                   true,  NULL,  NULL),
  ('bookmark_collections','Bookmark collections',         true,  NULL,  NULL),
  ('direct_messages',     'Direct messages',              true,  NULL,  NULL),
  ('follow_users',        'Follow users',                true,  NULL,  NULL),
  ('mention_users',       'Mention users in comments',   true,  NULL,  NULL),
  ('advanced_search',     'Advanced search filters',     true,  NULL,  NULL),
  ('ad_free',             'Ad-free experience',           true,  NULL,  NULL),
  ('reduced_ads',         'Reduced ads',                  true,  NULL,  NULL),
  ('breaking_alerts',     'Breaking news push alerts',   true,  NULL,  NULL),
  ('text_to_speech',      'Text to speech',               true,  NULL,  NULL),
  ('streak_freeze',       'Streak freezes per week',     true,  2,     'per_week'),
  ('ask_expert',          'Ask an Expert',                true,  NULL,  NULL),
  ('view_expert_full',    'View full expert responses',  true,  NULL,  NULL),
  ('view_verity_scores',  'View others Verity Scores',   true,  NULL,  NULL),
  ('category_leaderboard','Category leaderboards',        true,  NULL,  NULL),
  ('weekly_recap_quiz',   'Weekly recap quiz',            true,  NULL,  NULL),
  ('weekly_report',       'Weekly reading report',        true,  NULL,  NULL),
  ('weekly_family_report','Weekly family report',         true,  NULL,  NULL),
  ('profile_banner',      'Custom profile banner',       true,  NULL,  NULL),
  ('profile_card',        'Shareable profile card',      true,  NULL,  NULL),
  ('kid_profiles',        'Kid profiles',                 true,  2,     'max'),
  ('family_leaderboard',  'Family leaderboard',           true,  NULL,  NULL),
  ('shared_achievements', 'Shared family achievements',  true,  NULL,  NULL),
  ('family_challenges',   'Family reading challenges',   true,  NULL,  NULL),
  ('kid_streak_freeze',   'Kid streak freezes',           true,  2,     'per_week'),
  ('priority_support',    'Priority support',             true,  NULL,  NULL)
) AS f(key, name, enabled, lim, ltype)
WHERE p.name IN ('verity_family_monthly', 'verity_family_annual');

-- Verity Family XL plan features (same as Family but 4 kids)
INSERT INTO "plan_features" ("plan_id", "feature_key", "feature_name", "is_enabled", "limit_value", "limit_type")
SELECT p.id, f.key, f.name, f.enabled, f.lim, f.ltype
FROM "plans" p,
(VALUES
  ('quiz_attempts',       'Quiz attempts per article',   true,  NULL,  NULL),
  ('bookmarks',           'Bookmarks',                   true,  NULL,  NULL),
  ('bookmark_collections','Bookmark collections',         true,  NULL,  NULL),
  ('direct_messages',     'Direct messages',              true,  NULL,  NULL),
  ('follow_users',        'Follow users',                true,  NULL,  NULL),
  ('mention_users',       'Mention users in comments',   true,  NULL,  NULL),
  ('advanced_search',     'Advanced search filters',     true,  NULL,  NULL),
  ('ad_free',             'Ad-free experience',           true,  NULL,  NULL),
  ('reduced_ads',         'Reduced ads',                  true,  NULL,  NULL),
  ('breaking_alerts',     'Breaking news push alerts',   true,  NULL,  NULL),
  ('text_to_speech',      'Text to speech',               true,  NULL,  NULL),
  ('streak_freeze',       'Streak freezes per week',     true,  2,     'per_week'),
  ('ask_expert',          'Ask an Expert',                true,  NULL,  NULL),
  ('view_expert_full',    'View full expert responses',  true,  NULL,  NULL),
  ('view_verity_scores',  'View others Verity Scores',   true,  NULL,  NULL),
  ('category_leaderboard','Category leaderboards',        true,  NULL,  NULL),
  ('weekly_recap_quiz',   'Weekly recap quiz',            true,  NULL,  NULL),
  ('weekly_report',       'Weekly reading report',        true,  NULL,  NULL),
  ('weekly_family_report','Weekly family report',         true,  NULL,  NULL),
  ('profile_banner',      'Custom profile banner',       true,  NULL,  NULL),
  ('profile_card',        'Shareable profile card',      true,  NULL,  NULL),
  ('kid_profiles',        'Kid profiles',                 true,  4,     'max'),
  ('family_leaderboard',  'Family leaderboard',           true,  NULL,  NULL),
  ('shared_achievements', 'Shared family achievements',  true,  NULL,  NULL),
  ('family_challenges',   'Family reading challenges',   true,  NULL,  NULL),
  ('kid_streak_freeze',   'Kid streak freezes',           true,  2,     'per_week'),
  ('priority_support',    'Priority support',             true,  NULL,  NULL)
) AS f(key, name, enabled, lim, ltype)
WHERE p.name IN ('verity_family_xl_monthly', 'verity_family_xl_annual');

-- ============================================================
-- 6. SCORE TIERS
-- ============================================================
INSERT INTO "score_tiers" ("name", "display_name", "description", "icon_name", "color_hex", "min_score", "max_score", "perks", "sort_order", "is_active") VALUES
  ('newcomer',   'Newcomer',   'Just getting started.',           'star',           '#9CA3AF', 0,    99,   '[]', 1, true),
  ('reader',     'Reader',     'Building a reading habit.',       'book',           '#60A5FA', 100,  299,  '["streak_freeze_1"]', 2, true),
  ('informed',   'Informed',   'Regularly engaged with the news.','newspaper',      '#34D399', 300,  599,  '["streak_freeze_2", "profile_badge"]', 3, true),
  ('analyst',    'Analyst',    'Deep understanding of current events.','magnifyingglass','#FBBF24', 600, 999, '["streak_freeze_3", "profile_badge", "comment_highlight"]', 4, true),
  ('scholar',    'Scholar',    'Expert-level news consumer.',     'graduationcap',  '#F97316', 1000, 1499, '["streak_freeze_5", "profile_badge", "comment_highlight", "early_access"]', 5, true),
  ('luminary',   'Luminary',   'Top tier. A beacon of informed citizenship.','sun.max','#EF4444', 1500, NULL, '["streak_freeze_unlimited", "profile_badge", "comment_highlight", "early_access", "luminary_flair"]', 6, true);

-- ============================================================
-- 7. SCORE RULES
-- ============================================================
INSERT INTO "score_rules" ("action", "display_name", "description", "points", "max_per_day", "max_per_article", "cooldown_seconds", "is_active", "applies_to_kids", "category_multiplier") VALUES
  ('read_article',       'Read an article',           'Finish reading an article (scroll to end or 60s on page)', 5,  50,  1,   NULL, true,  true,  false),
  ('quiz_correct',       'Quiz correct answer',       'Answer a quiz question correctly',                         10, 100, 10,  NULL, true,  true,  true),
  ('quiz_perfect',       'Perfect quiz score',         'Get 100% on a quiz',                                      25, 50,  25,  NULL, true,  true,  true),
  ('first_quiz_of_day',  'First quiz of the day',     'Bonus for first quiz attempt each day',                    5,  5,   NULL, NULL, true,  true,  false),
  ('post_comment',       'Post a comment',             'Leave a comment on an article',                           3,  15,  1,   60,   true,  false, false),
  ('receive_upvote',     'Receive upvote',             'Someone upvotes your comment',                            2,  20,  NULL, NULL, true,  false, false),
  ('streak_day',         'Daily streak',               'Maintain your reading streak for another day',             5,  5,   NULL, NULL, true,  true,  false),
  ('streak_7',           'Week streak bonus',          '7-day streak milestone',                                  25, NULL, NULL, NULL, true,  true,  false),
  ('streak_30',          '30-day streak bonus',        '30-day streak milestone',                                 100,NULL, NULL, NULL, true,  true,  false),
  ('streak_90',          '90-day streak bonus',        '90-day streak milestone',                                 250,NULL, NULL, NULL, true,  true,  false),
  ('streak_365',         '365-day streak bonus',       'One year streak milestone',                                1000,NULL,NULL, NULL, true,  true,  false),
  ('achievement_earned', 'Achievement unlocked',       'Bonus points when earning an achievement',                 0,  NULL, NULL, NULL, true,  true,  false),
  ('community_note',     'Community note accepted',    'Your community note was approved',                         15, NULL, NULL, NULL, true,  false, false),
  ('daily_login',        'Daily login',                'Log in once per day',                                      1,  1,   NULL, NULL, true,  true,  false);

-- ============================================================
-- 8. CATEGORIES (Adult)
-- ============================================================
INSERT INTO "categories" ("name", "slug", "description", "sort_order", "is_active", "is_kids_safe", "is_premium", "metadata") VALUES
  ('Politics',        'politics',        'Congress, Supreme Court, White House, Elections, State & Local, Policy',                1,  true, false, false, '{"subcategories": ["Congress", "Supreme Court", "White House", "Elections", "State & Local", "Policy"]}'),
  ('World',           'world',           'International news from Asia, Europe, Middle East, Africa, Americas, Oceania',          2,  true, false, false, '{"subcategories": ["Asia", "Europe", "Middle East", "Africa", "Americas", "Oceania"]}'),
  ('Business',        'business',        'Markets, Startups, Corporate, Real Estate, Retail',                                    3,  true, false, false, '{"subcategories": ["Markets", "Startups", "Corporate", "Real Estate", "Retail"]}'),
  ('Economy',         'economy',         'Jobs, Inflation, Trade, Federal Reserve, GDP',                                         4,  true, false, false, '{"subcategories": ["Jobs", "Inflation", "Trade", "Federal Reserve", "GDP"]}'),
  ('Technology',      'technology',      'AI, Social Media, Cybersecurity, Big Tech, Crypto, Hardware',                          5,  true, false, false, '{"subcategories": ["AI", "Social Media", "Cybersecurity", "Big Tech", "Crypto", "Hardware"]}'),
  ('Science',         'science',         'Space, Biology, Physics, Climate Research, Medicine',                                  6,  true, true,  false, '{"subcategories": ["Space", "Biology", "Physics", "Climate Research", "Medicine"]}'),
  ('Health',          'health',          'Public Health, Mental Health, Nutrition, Pharma, Insurance',                            7,  true, false, false, '{"subcategories": ["Public Health", "Mental Health", "Nutrition", "Pharma", "Insurance"]}'),
  ('Sports',          'sports',          'NFL, NBA, MLB, Soccer, Olympics, College, Tennis, Golf',                                8,  true, true,  false, '{"subcategories": ["NFL", "NBA", "MLB", "Soccer", "Olympics", "College", "Tennis", "Golf"]}'),
  ('Entertainment',   'entertainment',   'Movies, TV, Music, Streaming, Celebrity, Gaming',                                      9,  true, false, false, '{"subcategories": ["Movies", "TV", "Music", "Streaming", "Celebrity", "Gaming"]}'),
  ('Environment',     'environment',     'Climate Change, Conservation, Energy, Pollution, Wildlife',                             10, true, true,  false, '{"subcategories": ["Climate Change", "Conservation", "Energy", "Pollution", "Wildlife"]}'),
  ('Education',       'education',       'K-12, Higher Ed, Student Debt, Policy, EdTech',                                        11, true, true,  false, '{"subcategories": ["K-12", "Higher Ed", "Student Debt", "Policy", "EdTech"]}'),
  ('Crime & Justice', 'crime-justice',   'Courts, Law Enforcement, Prisons, Civil Rights',                                       12, true, false, false, '{"subcategories": ["Courts", "Law Enforcement", "Prisons", "Civil Rights"]}'),
  ('Media',           'media',           'Journalism, Misinformation, Press Freedom, Social Media',                              13, true, false, false, '{"subcategories": ["Journalism", "Misinformation", "Press Freedom", "Social Media"]}'),
  ('Culture',         'culture',         'Society, Religion, Demographics, Immigration, Trends',                                 14, true, false, false, '{"subcategories": ["Society", "Religion", "Demographics", "Immigration", "Trends"]}'),
  ('Finance',         'finance',         'Personal Finance, Banking, Investing, Taxes, Retirement',                              15, true, false, false, '{"subcategories": ["Personal Finance", "Banking", "Investing", "Taxes", "Retirement"]}'),
  ('Climate',         'climate',         'Weather, Natural Disasters, Climate Policy, Renewable Energy',                         16, true, true,  false, '{"subcategories": ["Weather", "Natural Disasters", "Climate Policy", "Renewable Energy"]}');

-- ============================================================
-- 9. CATEGORIES (Kids)
-- ============================================================
INSERT INTO "categories" ("name", "slug", "description", "sort_order", "is_active", "is_kids_safe", "is_premium", "metadata") VALUES
  ('Science (Kids)',  'kids-science',  'Space, Dinosaurs, Experiments, Inventions, Animals',            1, true, true, false, '{"audience": "kids", "subcategories": ["Space", "Dinosaurs", "Experiments", "Inventions", "Animals"]}'),
  ('Animals',         'kids-animals',  'Pets, Wild Animals, Ocean Life, Endangered Species',            2, true, true, false, '{"audience": "kids", "subcategories": ["Pets", "Wild Animals", "Ocean Life", "Endangered Species"]}'),
  ('World (Kids)',    'kids-world',    'Countries, Cultures, Languages, Holidays, Maps',                3, true, true, false, '{"audience": "kids", "subcategories": ["Countries", "Cultures", "Languages", "Holidays", "Maps"]}'),
  ('Tech (Kids)',     'kids-tech',     'Coding, Robots, Apps, Internet Safety, Gaming',                 4, true, true, false, '{"audience": "kids", "subcategories": ["Coding", "Robots", "Apps", "Internet Safety", "Gaming"]}'),
  ('Sports (Kids)',   'kids-sports',   'Youth Sports, Olympics, Records, Athletes, Rules',              5, true, true, false, '{"audience": "kids", "subcategories": ["Youth Sports", "Olympics", "Records", "Athletes", "Rules"]}'),
  ('History',         'kids-history',  'Famous People, Inventions, Ancient Civilizations, Events',      6, true, true, false, '{"audience": "kids", "subcategories": ["Famous People", "Inventions", "Ancient Civilizations", "Events"]}'),
  ('Health (Kids)',   'kids-health',   'Nutrition, Exercise, Feelings, Safety, Sleep',                  7, true, true, false, '{"audience": "kids", "subcategories": ["Nutrition", "Exercise", "Feelings", "Safety", "Sleep"]}'),
  ('Arts',            'kids-arts',     'Drawing, Music, Dance, Theater, Crafts, Books',                 8, true, true, false, '{"audience": "kids", "subcategories": ["Drawing", "Music", "Dance", "Theater", "Crafts", "Books"]}');


-- ============================================================
-- 10. ACHIEVEMENTS
-- ============================================================
INSERT INTO "achievements" ("key", "name", "description", "icon_name", "category", "rarity", "points_reward", "criteria", "is_secret", "is_active", "is_kids_eligible", "sort_order") VALUES
  -- Reading achievements
  ('first_read',        'First Read',          'Read your first article.',                              'book',              'reading',  'common',    5,   '{"type": "read_count", "threshold": 1}',       false, true, true,  1),
  ('bookworm_10',       'Bookworm',            'Read 10 articles.',                                     'books.vertical',    'reading',  'common',    10,  '{"type": "read_count", "threshold": 10}',      false, true, true,  2),
  ('voracious_50',      'Voracious Reader',    'Read 50 articles.',                                     'book.fill',         'reading',  'uncommon',  25,  '{"type": "read_count", "threshold": 50}',      false, true, true,  3),
  ('scholar_100',       'News Scholar',        'Read 100 articles.',                                    'graduationcap',     'reading',  'rare',      50,  '{"type": "read_count", "threshold": 100}',     false, true, true,  4),
  ('librarian_500',     'Librarian',           'Read 500 articles.',                                    'building.columns',  'reading',  'epic',      100, '{"type": "read_count", "threshold": 500}',     false, true, true,  5),
  -- Quiz achievements
  ('first_quiz',        'Quiz Taker',          'Complete your first quiz.',                              'questionmark.circle','quiz',    'common',    5,   '{"type": "quiz_count", "threshold": 1}',       false, true, true,  10),
  ('quiz_ace_10',       'Quiz Ace',            'Get 10 perfect quiz scores.',                            'star.circle',       'quiz',     'uncommon',  25,  '{"type": "perfect_quiz_count", "threshold": 10}', false, true, true, 11),
  ('quiz_master_50',    'Quiz Master',         'Get 50 perfect quiz scores.',                            'star.circle.fill',  'quiz',     'rare',      50,  '{"type": "perfect_quiz_count", "threshold": 50}', false, true, true, 12),
  -- Streak achievements
  ('streak_7',          'Week Warrior',        'Maintain a 7-day reading streak.',                       'flame',             'streak',   'common',    10,  '{"type": "streak", "threshold": 7}',           false, true, true,  20),
  ('streak_30',         'Monthly Dedication',  'Maintain a 30-day reading streak.',                      'flame.fill',        'streak',   'uncommon',  50,  '{"type": "streak", "threshold": 30}',          false, true, true,  21),
  ('streak_90',         'Quarterly Champion',  'Maintain a 90-day reading streak.',                      'flame.circle',      'streak',   'rare',      100, '{"type": "streak", "threshold": 90}',          false, true, true,  22),
  ('streak_365',        'Year of News',        'Maintain a 365-day reading streak.',                     'flame.circle.fill', 'streak',   'legendary', 500, '{"type": "streak", "threshold": 365}',         false, true, true,  23),
  -- Social achievements
  ('first_comment',     'Conversation Starter','Post your first comment.',                               'bubble.left',       'social',   'common',    5,   '{"type": "comment_count", "threshold": 1}',    false, true, false, 30),
  ('popular_comment',   'Popular Voice',       'Get 25 upvotes on a single comment.',                    'hand.thumbsup.fill','social',   'uncommon',  25,  '{"type": "single_comment_upvotes", "threshold": 25}', false, true, false, 31),
  ('context_contributor','Context Contributor', 'Have 5 comments pinned as Article Context.',             'checkmark.seal',    'social',   'rare',      50,  '{"type": "context_pinned", "threshold": 5}', false, true, false, 32),
  -- Score milestone achievements (replace tier achievements)
  ('score_100',         'Century Reader',      'Reach 100 total Verity Score.',                           'star',              'score',    'common',    0,   '{"type": "score_reached", "threshold": 100}',  false, true, true,  50),
  ('score_500',         'Knowledge Seeker',    'Reach 500 total Verity Score.',                           'star.fill',         'score',    'uncommon',  0,   '{"type": "score_reached", "threshold": 500}',  false, true, true,  51),
  ('score_1000',        'Informed Citizen',    'Reach 1000 total Verity Score.',                          'star.circle',       'score',    'rare',      0,   '{"type": "score_reached", "threshold": 1000}', false, true, true,  52),
  ('score_5000',        'Knowledge Leader',    'Reach 5000 total Verity Score.',                          'star.circle.fill',  'score',    'epic',      0,   '{"type": "score_reached", "threshold": 5000}', false, true, false, 53),
  ('score_10000',       'Verity Master',       'Reach 10000 total Verity Score.',                         'crown',             'score',    'legendary', 0,   '{"type": "score_reached", "threshold": 10000}',false, true, false, 54),
  ('first_follower',    'First Follower',      'Get your first follower.',                               'person.badge.plus', 'social',   'common',    5,   '{"type": "follower_count", "threshold": 1}',   false, true, false, 33),
  -- Category achievements
  ('category_explorer', 'Category Explorer',   'Read articles from 10 different categories.',            'square.grid.3x3',  'category', 'uncommon',  25,  '{"type": "unique_categories_read", "threshold": 10}', false, true, true, 40),
  ('well_rounded',      'Well Rounded',        'Read articles from every adult category.',               'circle.grid.cross', 'category', 'rare',     50,  '{"type": "all_categories_read", "threshold": 16}', false, true, false, 41),
  -- Score achievements
  -- Secret achievements
  ('night_owl',         'Night Owl',           'Read 5 articles between midnight and 5am.',               'moon.stars',        'secret',   'uncommon',  15,  '{"type": "read_between_hours", "start": 0, "end": 5, "threshold": 5}', true, true, false, 90),
  ('speed_reader',      'Speed Reader',        'Read 10 articles in a single day.',                       'hare',              'secret',   'uncommon',  15,  '{"type": "read_in_day", "threshold": 10}',     true, true, true,  91),
  ('early_bird',        'Early Bird',          'Complete a quiz before 7am.',                              'sunrise',           'secret',   'common',    10,  '{"type": "quiz_before_hour", "hour": 7}',      true, true, true,  92);

-- ============================================================
-- 11. APP SETTINGS (defaults)
-- ============================================================
INSERT INTO "settings" ("key", "value", "value_type", "category", "description", "is_public") VALUES
  ('app.name',                    '"Verity Post"',           'string',  'general',     'Application name',                                  true),
  ('app.tagline',                 '"News you can trust."',   'string',  'general',     'App tagline',                                       true),
  ('app.maintenance_mode',        'false',                   'boolean', 'general',     'Enable maintenance mode',                            true),
  ('comments.daily_limit_free',   '5',                       'number',  'comments',    'Daily comment limit for free users',                  false),
  ('comments.min_word_count',     '1',                       'number',  'comments',    'Minimum words per comment',                           false),
  ('comments.max_length',         '2000',                    'number',  'comments',    'Maximum comment character length',                     false),
  ('scoring.enabled',             'true',                    'boolean', 'scoring',     'Enable Verity Score system',                           false),
  ('scoring.kids_enabled',        'true',                    'boolean', 'scoring',     'Enable scoring for kids profiles',                     false),
  ('streak.freeze_max_free',      '0',                       'number',  'scoring',     'Max streak freezes for free users',                    false),
  ('streak.freeze_max_verity_pro','2',                       'number',  'scoring',     'Max streak freezes for Verity Pro users per week',      false),
  ('streak.freeze_max_kids',      '2',                       'number',  'scoring',     'Max streak freezes for kid profiles per week',           false),
  ('kids.min_age',                '6',                       'number',  'kids',        'Minimum kid profile age',                              false),
  ('kids.max_age',                '14',                      'number',  'kids',        'Maximum kid profile age',                              false),
  ('kids.max_profiles_family',    '5',                       'number',  'kids',        'Max kid profiles per family plan',                     false),
  ('moderation.auto_flag_toxicity','0.8',                    'number',  'moderation',  'Auto-flag comments above this toxicity score',         false),
  ('pipeline.enabled',            'true',                    'boolean', 'pipeline',    'Enable content pipeline',                              false),
  ('ads.enabled',                 'true',                    'boolean', 'ads',         'Enable ad placements',                                 false),
  ('billing.grace_period_days',   '7',                       'number',  'billing',     'Days of grace period after payment failure',            false),
  ('quiz.min_pass_score',         '3',                       'number',  'quiz',        'Minimum score out of 5 to unlock discussion',            false),
  ('quiz.pool_min_questions',     '10',                      'number',  'quiz',        'Minimum questions per article pool',                     false),
  ('quiz.questions_per_attempt',  '5',                       'number',  'quiz',        'Questions served per attempt',                           false),
  ('quiz.free_attempts',          '2',                       'number',  'quiz',        'Max attempts per article for free users',                false),
  ('kid_trial.duration_days',     '7',                       'number',  'kids',        'Kid trial duration in days',                             false),
  ('cancellation.grace_days',     '7',                       'number',  'billing',     'Grace period days after cancellation',                   false),
  ('context_pin.min_tags',        '5',                       'number',  'comments',    'Minimum context tags to auto-pin a comment',             false),
  ('context_pin.threshold_pct',   '10',                      'number',  'comments',    'Percent of discussion participants needed to pin',       false),
  ('supervisor.score_threshold',  '500',                     'number',  'scoring',     'Min category score to be eligible as supervisor',        false);

-- ============================================================
-- 12. EMAIL TEMPLATES
-- ============================================================
INSERT INTO "email_templates" ("key", "name", "subject", "body_html", "body_text", "variables", "is_active", "language") VALUES
  ('welcome',              'Welcome',                   'Welcome to Verity Post, {{name}}!',                     '<p>Welcome template - customize in admin</p>',  NULL, '["name", "username"]',                                           true, 'en'),
  ('verify_email',         'Verify Email',              'Verify your email address',                              '<p>Verify template - customize in admin</p>',   NULL, '["name", "verify_link", "expires_in"]',                          true, 'en'),
  ('password_reset',       'Password Reset',            'Reset your password',                                    '<p>Reset template - customize in admin</p>',    NULL, '["name", "reset_link", "expires_in"]',                           true, 'en'),
  ('password_changed',     'Password Changed',          'Your password was changed',                              '<p>Changed template - customize in admin</p>',  NULL, '["name", "date", "device"]',                                     true, 'en'),
  ('comment_reply',        'Comment Reply',             '{{replier}} replied to your comment',                    '<p>Reply template - customize in admin</p>',    NULL, '["name", "replier", "story_title", "comment_preview", "link"]',  true, 'en'),
  ('mention',              'Mention',                   '{{mentioner}} mentioned you',                            '<p>Mention template - customize in admin</p>',  NULL, '["name", "mentioner", "context", "link"]',                       true, 'en'),
  ('achievement',          'Achievement Unlocked',      'You unlocked: {{achievement_name}}!',                    '<p>Achievement template - customize in admin</p>',NULL,'["name", "achievement_name", "description", "points"]',         true, 'en'),
  ('streak_milestone',     'Streak Milestone',          '{{streak_days}}-day streak!',                            '<p>Streak template - customize in admin</p>',   NULL, '["name", "streak_days", "milestone"]',                           true, 'en'),
  ('weekly_summary',       'Weekly Summary',            'Your week in review',                                    '<p>Weekly template - customize in admin</p>',   NULL, '["name", "stats", "top_stories", "score_change"]',              true, 'en'),
  ('breaking_news',        'Breaking News',             'Breaking: {{story_title}}',                              '<p>Breaking template - customize in admin</p>', NULL, '["story_title", "summary", "link"]',                             true, 'en'),
  ('subscription_confirmed','Subscription Confirmed',   'Welcome to {{plan}} -- you are all set!',                 '<p>Sub confirm template - customize in admin</p>',NULL,'["name", "plan", "price", "next_billing"]',                    true, 'en'),
  ('payment_failed',       'Payment Failed',            'Action needed: payment issue',                           '<p>Payment template - customize in admin</p>',  NULL, '["name", "plan", "update_link", "grace_period_end"]',           true, 'en'),
  ('subscription_cancelled','Subscription Cancelled',   'Your subscription has been cancelled',                   '<p>Cancel template - customize in admin</p>',   NULL, '["name", "plan", "access_until", "resubscribe_link"]',          true, 'en'),
  ('winback',              'Win-Back Offer',            'We miss you -- here is a special offer',                  '<p>Winback template - customize in admin</p>',  NULL, '["name", "offer", "link"]',                                      true, 'en'),
  ('support_reply',        'Support Reply',             'Update on your support ticket #{{ticket_number}}',       '<p>Support template - customize in admin</p>',  NULL, '["name", "ticket_number", "message_preview", "link"]',          true, 'en'),
  ('expert_approved',      'Expert Approved',           'Your {{type}} application has been approved!',           '<p>Approved template - customize in admin</p>', NULL, '["name", "type", "badge_info"]',                                 true, 'en'),
  ('expert_rejected',      'Expert Rejected',           'Update on your {{type}} application',                    '<p>Rejected template - customize in admin</p>', NULL, '["name", "type", "reason"]',                                     true, 'en'),
  ('data_export_ready',    'Data Export Ready',         'Your data export is ready to download',                  '<p>Export template - customize in admin</p>',   NULL, '["name", "download_link", "expires_in"]',                        true, 'en'),
  ('deletion_scheduled',   'Account Deletion Scheduled','Your account deletion is scheduled',                     '<p>Deletion template - customize in admin</p>', NULL, '["name", "deletion_date", "cancel_link"]',                       true, 'en'),
  ('re_engagement',        'Re-engagement',             'Catch up on what you missed',                            '<p>Re-engage template - customize in admin</p>',NULL, '["name", "days_inactive", "top_stories"]',                      true, 'en');

-- ============================================================
-- 13. BLOCKED WORDS (starter set)
-- ============================================================
INSERT INTO "blocked_words" ("word", "action", "severity", "applies_to", "is_regex", "language", "is_active") VALUES
  ('fuck',     'contains', 'high',   '{comments,messages,usernames,bios}', false, 'en', true),
  ('shit',     'contains', 'high',   '{comments,messages,usernames,bios}', false, 'en', true),
  ('nigger',   'contains', 'high',   '{comments,messages,usernames,bios}', false, 'en', true),
  ('faggot',   'contains', 'high',   '{comments,messages,usernames,bios}', false, 'en', true),
  ('retard',   'contains', 'medium', '{comments,messages,usernames,bios}', false, 'en', true),
  ('kill yourself', 'contains', 'high', '{comments,messages}',             false, 'en', true),
  ('kys',      'exact',    'high',   '{comments,messages}',                false, 'en', true);

-- ============================================================
-- 14. RESERVED USERNAMES
-- ============================================================
INSERT INTO "reserved_usernames" ("username", "reason", "is_active") VALUES
  ('admin',        'System reserved',    true),
  ('administrator','System reserved',    true),
  ('moderator',    'System reserved',    true),
  ('mod',          'System reserved',    true),
  ('support',      'System reserved',    true),
  ('help',         'System reserved',    true),
  ('veritypost',   'Brand reserved',     true),
  ('verity',       'Brand reserved',     true),
  ('vp',           'Brand reserved',     true),
  ('official',     'System reserved',    true),
  ('system',       'System reserved',    true),
  ('root',         'System reserved',    true),
  ('null',         'System reserved',    true),
  ('undefined',    'System reserved',    true),
  ('api',          'System reserved',    true),
  ('www',          'System reserved',    true),
  ('mail',         'System reserved',    true),
  ('email',        'System reserved',    true),
  ('test',         'System reserved',    true),
  ('dev',          'System reserved',    true),
  ('staff',        'System reserved',    true),
  ('team',         'System reserved',    true),
  ('news',         'Brand reserved',     true),
  ('editor',       'Role reserved',      true),
  ('journalist',   'Role reserved',      true),
  ('expert',       'Role reserved',      true),
  ('educator',     'Role reserved',      true);


-- ============================================================
-- 003_rls_policies.sql
-- ============================================================

-- ============================================================
-- Verity Post RLS Policies
-- (inlined — runs in sequence, no separate file needed)
-- ============================================================
-- 
-- auth.uid() = Supabase auth user id
-- auth.role() = 'anon' (not logged in) or 'authenticated'
--
-- Helper: get user role hierarchy level
-- ============================================================

-- Helper function: check if current user has a specific role (or higher)
CREATE OR REPLACE FUNCTION public.user_has_role(required_role text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN roles req ON req.name = required_role
    WHERE ur.user_id = auth.uid()
      AND r.hierarchy_level >= req.hierarchy_level
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is at least moderator level
CREATE OR REPLACE FUNCTION public.is_mod_or_above()
RETURNS boolean AS $$
  SELECT public.user_has_role('moderator');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is at least editor level
CREATE OR REPLACE FUNCTION public.is_editor_or_above()
RETURNS boolean AS $$
  SELECT public.user_has_role('editor');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is at least admin level
CREATE OR REPLACE FUNCTION public.is_admin_or_above()
RETURNS boolean AS $$
  SELECT public.user_has_role('admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- Helper: check if user passed quiz for an article (D1: quiz-gated discussions)
CREATE OR REPLACE FUNCTION public.user_passed_quiz(p_user_id uuid, p_article_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM quiz_attempts qa
    JOIN quizzes q ON q.id = qa.quiz_id
    WHERE qa.user_id = p_user_id
      AND q.article_id = p_article_id
      AND qa.is_correct = true
    GROUP BY q.article_id
    HAVING COUNT(*) FILTER (WHERE qa.is_correct) >= 3
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is a category supervisor for a given category
CREATE OR REPLACE FUNCTION public.is_category_supervisor(p_user_id uuid, p_category_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM category_supervisors
    WHERE user_id = p_user_id
      AND category_id = p_category_id
      AND is_active = true
      AND opted_out_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is on a paid plan (verity, verity_pro, family)
CREATE OR REPLACE FUNCTION public.is_paid_user()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT plan_status IN ('active', 'trialing') AND plan_id IS NOT NULL
     FROM users WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user has verified email
CREATE OR REPLACE FUNCTION public.has_verified_email()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT email_verified FROM users WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is banned
CREATE OR REPLACE FUNCTION public.is_banned()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT is_banned FROM users WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user is premium (or family)
CREATE OR REPLACE FUNCTION public.is_premium()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT plan_status IN ('active', 'trialing') AND plan_id IS NOT NULL FROM users WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user owns a kid profile
CREATE OR REPLACE FUNCTION public.owns_kid_profile(profile_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM kid_profiles WHERE id = profile_id AND parent_user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- CONTENT TABLES (public read, restricted write)
-- ============================================================

-- articles: anyone can read published, editors+ can write
CREATE POLICY "articles_select" ON "articles" FOR SELECT USING (
  status = 'published' AND deleted_at IS NULL
  OR auth.uid() = author_id
  OR public.is_editor_or_above()
);
CREATE POLICY "articles_insert" ON "articles" FOR INSERT WITH CHECK (
  public.is_editor_or_above()
);
CREATE POLICY "articles_update" ON "articles" FOR UPDATE USING (
  public.is_editor_or_above()
);
CREATE POLICY "articles_delete" ON "articles" FOR DELETE USING (
  public.is_admin_or_above()
);

-- categories: anyone can read active, admins can write
CREATE POLICY "categories_select" ON "categories" FOR SELECT USING (
  is_active = true AND deleted_at IS NULL
  OR public.is_admin_or_above()
);
CREATE POLICY "categories_insert" ON "categories" FOR INSERT WITH CHECK (
  public.is_admin_or_above()
);
CREATE POLICY "categories_update" ON "categories" FOR UPDATE USING (
  public.is_admin_or_above()
);

-- sources: anyone can read, editors+ can write
CREATE POLICY "sources_select" ON "sources" FOR SELECT USING (true);
CREATE POLICY "sources_insert" ON "sources" FOR INSERT WITH CHECK (
  public.is_editor_or_above()
);
CREATE POLICY "sources_update" ON "sources" FOR UPDATE USING (
  public.is_editor_or_above()
);

-- timelines: anyone can read, editors+ can write
CREATE POLICY "timelines_select" ON "timelines" FOR SELECT USING (true);
CREATE POLICY "timelines_insert" ON "timelines" FOR INSERT WITH CHECK (
  public.is_editor_or_above()
);
CREATE POLICY "timelines_update" ON "timelines" FOR UPDATE USING (
  public.is_editor_or_above()
);

-- quizzes: anyone can read active, editors+ can write
CREATE POLICY "quizzes_select" ON "quizzes" FOR SELECT USING (
  is_active = true AND deleted_at IS NULL
  OR public.is_editor_or_above()
);
CREATE POLICY "quizzes_insert" ON "quizzes" FOR INSERT WITH CHECK (
  public.is_editor_or_above()
);
CREATE POLICY "quizzes_update" ON "quizzes" FOR UPDATE USING (
  public.is_editor_or_above()
);

-- quiz_attempts: user sees own, admins see all
CREATE POLICY "quiz_attempts_select" ON "quiz_attempts" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "quiz_attempts_insert" ON "quiz_attempts" FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.has_verified_email() AND NOT public.is_banned()
);

-- article_relations: anyone can read, editors+ can write
CREATE POLICY "article_relations_select" ON "article_relations" FOR SELECT USING (true);
CREATE POLICY "article_relations_insert" ON "article_relations" FOR INSERT WITH CHECK (
  public.is_editor_or_above()
);

-- media_assets: anyone can read, editors+ can write
CREATE POLICY "media_assets_select" ON "media_assets" FOR SELECT USING (true);
CREATE POLICY "media_assets_insert" ON "media_assets" FOR INSERT WITH CHECK (
  public.is_editor_or_above()
);
CREATE POLICY "media_assets_update" ON "media_assets" FOR UPDATE USING (
  public.is_editor_or_above()
);

-- ============================================================
-- USER TABLES
-- ============================================================

-- users: own profile full access, others see public fields via view/function
CREATE POLICY "users_select" ON "users" FOR SELECT USING (
  id = auth.uid()
  OR profile_visibility = 'public'
  OR public.is_admin_or_above()
);
CREATE POLICY "users_insert" ON "users" FOR INSERT WITH CHECK (
  id = auth.uid()
);
CREATE POLICY "users_update" ON "users" FOR UPDATE USING (
  id = auth.uid() OR public.is_admin_or_above()
);

-- auth_providers: own only
CREATE POLICY "auth_providers_select" ON "auth_providers" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "auth_providers_insert" ON "auth_providers" FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "auth_providers_update" ON "auth_providers" FOR UPDATE USING (
  user_id = auth.uid()
);

-- sessions: own only, admins can view
CREATE POLICY "sessions_select" ON "sessions" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "sessions_insert" ON "sessions" FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "sessions_update" ON "sessions" FOR UPDATE USING (
  user_id = auth.uid()
);
CREATE POLICY "sessions_delete" ON "sessions" FOR DELETE USING (
  user_id = auth.uid()
);

-- kid_profiles: parent owns, admins can view
CREATE POLICY "kid_profiles_select" ON "kid_profiles" FOR SELECT USING (
  parent_user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "kid_profiles_insert" ON "kid_profiles" FOR INSERT WITH CHECK (
  parent_user_id = auth.uid() AND public.is_premium()
);
CREATE POLICY "kid_profiles_update" ON "kid_profiles" FOR UPDATE USING (
  parent_user_id = auth.uid()
);
CREATE POLICY "kid_profiles_delete" ON "kid_profiles" FOR DELETE USING (
  parent_user_id = auth.uid()
);

-- consent_records: own only
CREATE POLICY "consent_records_select" ON "consent_records" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "consent_records_insert" ON "consent_records" FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

-- user_preferred_categories: own only
CREATE POLICY "user_preferred_categories_select" ON "user_preferred_categories" FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY "user_preferred_categories_insert" ON "user_preferred_categories" FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "user_preferred_categories_delete" ON "user_preferred_categories" FOR DELETE USING (
  user_id = auth.uid()
);

-- kid_category_permissions: parent owns
CREATE POLICY "kid_category_permissions_select" ON "kid_category_permissions" FOR SELECT USING (
  public.owns_kid_profile(kid_profile_id)
);
CREATE POLICY "kid_category_permissions_insert" ON "kid_category_permissions" FOR INSERT WITH CHECK (
  public.owns_kid_profile(kid_profile_id)
);
CREATE POLICY "kid_category_permissions_delete" ON "kid_category_permissions" FOR DELETE USING (
  public.owns_kid_profile(kid_profile_id)
);

-- ============================================================
-- SCORING TABLES
-- ============================================================

-- score_rules: anyone can read, admins write
CREATE POLICY "score_rules_select" ON "score_rules" FOR SELECT USING (true);
CREATE POLICY "score_rules_insert" ON "score_rules" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "score_rules_update" ON "score_rules" FOR UPDATE USING (public.is_admin_or_above());

-- score_tiers: anyone can read, admins write
CREATE POLICY "score_tiers_select" ON "score_tiers" FOR SELECT USING (
  is_active = true AND deleted_at IS NULL OR public.is_admin_or_above()
);
CREATE POLICY "score_tiers_insert" ON "score_tiers" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "score_tiers_update" ON "score_tiers" FOR UPDATE USING (public.is_admin_or_above());

-- category_scores: own only, admins see all
CREATE POLICY "category_scores_select" ON "category_scores" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "category_scores_insert" ON "category_scores" FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "category_scores_update" ON "category_scores" FOR UPDATE USING (
  user_id = auth.uid()
);

-- achievements: anyone can read active
CREATE POLICY "achievements_select" ON "achievements" FOR SELECT USING (
  is_active = true OR public.is_admin_or_above()
);
CREATE POLICY "achievements_insert" ON "achievements" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "achievements_update" ON "achievements" FOR UPDATE USING (public.is_admin_or_above());

-- user_achievements: own or public profile
CREATE POLICY "user_achievements_select" ON "user_achievements" FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM users WHERE id = user_achievements.user_id AND profile_visibility = 'public' AND show_activity = true)
  OR public.is_admin_or_above()
);
CREATE POLICY "user_achievements_insert" ON "user_achievements" FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

-- streaks: own only
CREATE POLICY "streaks_select" ON "streaks" FOR SELECT USING (
  user_id = auth.uid() OR public.owns_kid_profile(kid_profile_id) OR public.is_admin_or_above()
);
CREATE POLICY "streaks_insert" ON "streaks" FOR INSERT WITH CHECK (
  user_id = auth.uid() OR public.owns_kid_profile(kid_profile_id)
);

-- ============================================================
-- SOCIAL TABLES
-- ============================================================

-- comments: published visible to all, own always visible, mods see hidden
CREATE POLICY "comments_select" ON "comments" FOR SELECT USING (
  (status = 'published' AND deleted_at IS NULL)
  OR user_id = auth.uid()
  OR public.is_mod_or_above()
);
CREATE POLICY "comments_insert" ON "comments" FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.has_verified_email() AND NOT public.is_banned()
);
CREATE POLICY "comments_update" ON "comments" FOR UPDATE USING (
  user_id = auth.uid() OR public.is_mod_or_above()
);
CREATE POLICY "comments_delete" ON "comments" FOR DELETE USING (
  user_id = auth.uid() OR public.is_mod_or_above()
);

-- comment_votes: own only for write, public read
CREATE POLICY "comment_votes_select" ON "comment_votes" FOR SELECT USING (true);
CREATE POLICY "comment_votes_insert" ON "comment_votes" FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.has_verified_email() AND NOT public.is_banned()
);
CREATE POLICY "comment_votes_delete" ON "comment_votes" FOR DELETE USING (
  user_id = auth.uid()
);

-- follows: authenticated users
CREATE POLICY "follows_select" ON "follows" FOR SELECT USING (
  follower_id = auth.uid() OR following_id = auth.uid() OR true
);
CREATE POLICY "follows_insert" ON "follows" FOR INSERT WITH CHECK (
  follower_id = auth.uid() AND public.has_verified_email() AND NOT public.is_banned()
);
CREATE POLICY "follows_delete" ON "follows" FOR DELETE USING (
  follower_id = auth.uid()
);

-- bookmarks: own only
CREATE POLICY "bookmarks_select" ON "bookmarks" FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY "bookmarks_insert" ON "bookmarks" FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.is_premium()
);
CREATE POLICY "bookmarks_update" ON "bookmarks" FOR UPDATE USING (
  user_id = auth.uid()
);
CREATE POLICY "bookmarks_delete" ON "bookmarks" FOR DELETE USING (
  user_id = auth.uid()
);

-- reading_log: own only, admins see all
CREATE POLICY "reading_log_select" ON "reading_log" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "reading_log_insert" ON "reading_log" FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "reading_log_update" ON "reading_log" FOR UPDATE USING (
  user_id = auth.uid()
);

-- reactions: public read, own write
CREATE POLICY "reactions_select" ON "reactions" FOR SELECT USING (true);
CREATE POLICY "reactions_insert" ON "reactions" FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.has_verified_email() AND NOT public.is_banned()
);
CREATE POLICY "reactions_delete" ON "reactions" FOR DELETE USING (
  user_id = auth.uid()
);

-- community_notes: public read published, mods manage
CREATE POLICY "community_notes_select" ON "community_notes" FOR SELECT USING (
  status = 'approved' OR author_id = auth.uid() OR public.is_mod_or_above()
);
CREATE POLICY "community_notes_insert" ON "community_notes" FOR INSERT WITH CHECK (
  author_id = auth.uid() AND public.has_verified_email() AND NOT public.is_banned()
);
CREATE POLICY "community_notes_update" ON "community_notes" FOR UPDATE USING (
  author_id = auth.uid() OR public.is_mod_or_above()
);

-- community_note_votes: own only
CREATE POLICY "community_note_votes_select" ON "community_note_votes" FOR SELECT USING (true);
CREATE POLICY "community_note_votes_insert" ON "community_note_votes" FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.has_verified_email()
);

-- ============================================================
-- EXPERTS
-- ============================================================

-- expert_applications: own or admins
CREATE POLICY "expert_applications_select" ON "expert_applications" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "expert_applications_insert" ON "expert_applications" FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.has_verified_email()
);
CREATE POLICY "expert_applications_update" ON "expert_applications" FOR UPDATE USING (
  public.is_admin_or_above()
);

CREATE POLICY "expert_application_categories_select" ON "expert_application_categories" FOR SELECT USING (true);
CREATE POLICY "expert_application_categories_insert" ON "expert_application_categories" FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM expert_applications WHERE id = application_id AND user_id = auth.uid())
);

-- expert_discussions: authenticated can read, experts+ can write
CREATE POLICY "expert_discussions_select" ON "expert_discussions" FOR SELECT USING (
  auth.role() = 'authenticated'
);
CREATE POLICY "expert_discussions_insert" ON "expert_discussions" FOR INSERT WITH CHECK (
  user_id = auth.uid() AND (
    public.user_has_role('expert') OR public.user_has_role('educator') OR public.user_has_role('journalist')
  )
);
CREATE POLICY "expert_discussions_update" ON "expert_discussions" FOR UPDATE USING (
  user_id = auth.uid() OR public.is_mod_or_above()
);

CREATE POLICY "expert_discussion_votes_select" ON "expert_discussion_votes" FOR SELECT USING (true);
CREATE POLICY "expert_discussion_votes_insert" ON "expert_discussion_votes" FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.has_verified_email()
);

-- ============================================================
-- MESSAGING
-- ============================================================

-- conversations: participant only
CREATE POLICY "conversations_select" ON "conversations" FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = conversations.id AND user_id = auth.uid() AND left_at IS NULL)
  OR public.is_admin_or_above()
);
CREATE POLICY "conversations_insert" ON "conversations" FOR INSERT WITH CHECK (
  created_by = auth.uid() AND public.is_premium()
);
CREATE POLICY "conversations_update" ON "conversations" FOR UPDATE USING (
  EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = conversations.id AND user_id = auth.uid() AND role = 'owner')
  OR public.is_admin_or_above()
);

-- conversation_participants: participant or admin
CREATE POLICY "conversation_participants_select" ON "conversation_participants" FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = conversation_participants.conversation_id AND cp.user_id = auth.uid())
  OR public.is_admin_or_above()
);
CREATE POLICY "conversation_participants_insert" ON "conversation_participants" FOR INSERT WITH CHECK (
  user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM conversation_participants cp 
    WHERE cp.conversation_id = conversation_participants.conversation_id 
    AND cp.user_id = auth.uid() AND cp.role IN ('owner', 'admin')
  )
);
CREATE POLICY "conversation_participants_update" ON "conversation_participants" FOR UPDATE USING (
  user_id = auth.uid()
);

-- messages: participant only
CREATE POLICY "messages_select" ON "messages" FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid() AND left_at IS NULL)
  OR public.is_admin_or_above()
);
CREATE POLICY "messages_insert" ON "messages" FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND public.is_premium() AND NOT public.is_banned()
  AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = messages.conversation_id AND user_id = auth.uid() AND left_at IS NULL)
);
CREATE POLICY "messages_update" ON "messages" FOR UPDATE USING (
  sender_id = auth.uid()
);

-- message_receipts: own only
CREATE POLICY "message_receipts_select" ON "message_receipts" FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY "message_receipts_insert" ON "message_receipts" FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "message_receipts_update" ON "message_receipts" FOR UPDATE USING (
  user_id = auth.uid()
);

-- notifications: own only
CREATE POLICY "notifications_select" ON "notifications" FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY "notifications_insert" ON "notifications" FOR INSERT WITH CHECK (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "notifications_update" ON "notifications" FOR UPDATE USING (
  user_id = auth.uid()
);

-- alert_preferences: own only
CREATE POLICY "alert_preferences_select" ON "alert_preferences" FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "alert_preferences_insert" ON "alert_preferences" FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "alert_preferences_update" ON "alert_preferences" FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "alert_preferences_delete" ON "alert_preferences" FOR DELETE USING (user_id = auth.uid());

-- push_receipts: own or admin
CREATE POLICY "push_receipts_select" ON "push_receipts" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "push_receipts_insert" ON "push_receipts" FOR INSERT WITH CHECK (
  user_id = auth.uid() OR public.is_admin_or_above()
);

-- ============================================================
-- MODERATION
-- ============================================================

-- reports: own or mods
CREATE POLICY "reports_select" ON "reports" FOR SELECT USING (
  reporter_id = auth.uid() OR public.is_mod_or_above()
);
CREATE POLICY "reports_insert" ON "reports" FOR INSERT WITH CHECK (
  reporter_id = auth.uid() AND public.has_verified_email() AND NOT public.is_banned()
);
CREATE POLICY "reports_update" ON "reports" FOR UPDATE USING (
  public.is_mod_or_above()
);

-- blocked_words: admins only
CREATE POLICY "blocked_words_select" ON "blocked_words" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "blocked_words_insert" ON "blocked_words" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "blocked_words_update" ON "blocked_words" FOR UPDATE USING (public.is_admin_or_above());
CREATE POLICY "blocked_words_delete" ON "blocked_words" FOR DELETE USING (public.is_admin_or_above());

-- reserved_usernames: public read (for validation), admin write
CREATE POLICY "reserved_usernames_select" ON "reserved_usernames" FOR SELECT USING (true);
CREATE POLICY "reserved_usernames_insert" ON "reserved_usernames" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "reserved_usernames_delete" ON "reserved_usernames" FOR DELETE USING (public.is_admin_or_above());

-- blocked_users: own blocks visible, admins see all
CREATE POLICY "blocked_users_select" ON "blocked_users" FOR SELECT USING (
  blocker_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "blocked_users_insert" ON "blocked_users" FOR INSERT WITH CHECK (
  blocker_id = auth.uid() AND public.has_verified_email()
);
CREATE POLICY "blocked_users_delete" ON "blocked_users" FOR DELETE USING (
  blocker_id = auth.uid()
);

-- ============================================================
-- BILLING
-- ============================================================

-- plans: public read
CREATE POLICY "plans_select" ON "plans" FOR SELECT USING (is_active = true OR public.is_admin_or_above());
CREATE POLICY "plans_insert" ON "plans" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "plans_update" ON "plans" FOR UPDATE USING (public.is_admin_or_above());

-- plan_features: public read
CREATE POLICY "plan_features_select" ON "plan_features" FOR SELECT USING (true);
CREATE POLICY "plan_features_insert" ON "plan_features" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "plan_features_update" ON "plan_features" FOR UPDATE USING (public.is_admin_or_above());

-- subscriptions: own only, admins see all
CREATE POLICY "subscriptions_select" ON "subscriptions" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "subscriptions_insert" ON "subscriptions" FOR INSERT WITH CHECK (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "subscriptions_update" ON "subscriptions" FOR UPDATE USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);

-- invoices: own only
CREATE POLICY "invoices_select" ON "invoices" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "invoices_insert" ON "invoices" FOR INSERT WITH CHECK (public.is_admin_or_above());

-- iap_transactions: own only
CREATE POLICY "iap_transactions_select" ON "iap_transactions" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "iap_transactions_insert" ON "iap_transactions" FOR INSERT WITH CHECK (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "iap_transactions_update" ON "iap_transactions" FOR UPDATE USING (
  public.is_admin_or_above()
);

-- subscription_events: own or admin
CREATE POLICY "subscription_events_select" ON "subscription_events" FOR SELECT USING (
  subscription_id IN (SELECT id FROM subscriptions WHERE user_id = auth.uid())
  OR public.is_admin_or_above()
);
CREATE POLICY "subscription_events_insert" ON "subscription_events" FOR INSERT WITH CHECK (public.is_admin_or_above());

-- promo_codes: public read active, admin write
CREATE POLICY "promo_codes_select" ON "promo_codes" FOR SELECT USING (
  is_active = true OR public.is_admin_or_above()
);
CREATE POLICY "promo_codes_insert" ON "promo_codes" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "promo_codes_update" ON "promo_codes" FOR UPDATE USING (public.is_admin_or_above());

-- promo_uses: own or admin
CREATE POLICY "promo_uses_select" ON "promo_uses" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "promo_uses_insert" ON "promo_uses" FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================================
-- CONFIG TABLES (public read, admin write)
-- ============================================================

CREATE POLICY "settings_select" ON "settings" FOR SELECT USING (is_public = true OR public.is_admin_or_above());
CREATE POLICY "settings_insert" ON "settings" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "settings_update" ON "settings" FOR UPDATE USING (public.is_admin_or_above());

CREATE POLICY "feature_flags_select" ON "feature_flags" FOR SELECT USING (true);
CREATE POLICY "feature_flags_insert" ON "feature_flags" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "feature_flags_update" ON "feature_flags" FOR UPDATE USING (public.is_admin_or_above());

CREATE POLICY "email_templates_select" ON "email_templates" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "email_templates_insert" ON "email_templates" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "email_templates_update" ON "email_templates" FOR UPDATE USING (public.is_admin_or_above());

CREATE POLICY "app_config_select" ON "app_config" FOR SELECT USING (true);
CREATE POLICY "app_config_insert" ON "app_config" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "app_config_update" ON "app_config" FOR UPDATE USING (public.is_admin_or_above());

CREATE POLICY "translations_select" ON "translations" FOR SELECT USING (true);
CREATE POLICY "translations_insert" ON "translations" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "translations_update" ON "translations" FOR UPDATE USING (public.is_admin_or_above());

-- ============================================================
-- PERMISSIONS TABLES (admin only write, public read for roles)
-- ============================================================

CREATE POLICY "roles_select" ON "roles" FOR SELECT USING (true);
CREATE POLICY "roles_insert" ON "roles" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "roles_update" ON "roles" FOR UPDATE USING (public.is_admin_or_above());

CREATE POLICY "permissions_select" ON "permissions" FOR SELECT USING (true);
CREATE POLICY "permissions_insert" ON "permissions" FOR INSERT WITH CHECK (public.is_admin_or_above());

CREATE POLICY "role_permissions_select" ON "role_permissions" FOR SELECT USING (true);
CREATE POLICY "role_permissions_insert" ON "role_permissions" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "role_permissions_delete" ON "role_permissions" FOR DELETE USING (public.is_admin_or_above());

CREATE POLICY "user_roles_select" ON "user_roles" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "user_roles_insert" ON "user_roles" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "user_roles_update" ON "user_roles" FOR UPDATE USING (public.is_admin_or_above());
CREATE POLICY "user_roles_delete" ON "user_roles" FOR DELETE USING (public.is_admin_or_above());

-- ============================================================
-- ACCESS TABLES
-- ============================================================

CREATE POLICY "access_codes_select" ON "access_codes" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "access_codes_insert" ON "access_codes" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "access_codes_update" ON "access_codes" FOR UPDATE USING (public.is_admin_or_above());

CREATE POLICY "access_code_uses_select" ON "access_code_uses" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "access_code_uses_insert" ON "access_code_uses" FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "access_requests_select" ON "access_requests" FOR SELECT USING (
  email = (SELECT email FROM users WHERE id = auth.uid()) OR public.is_admin_or_above()
);
CREATE POLICY "access_requests_insert" ON "access_requests" FOR INSERT WITH CHECK (true);
CREATE POLICY "access_requests_update" ON "access_requests" FOR UPDATE USING (public.is_admin_or_above());

-- ============================================================
-- PIPELINE TABLES (editors+ only)
-- ============================================================

CREATE POLICY "feeds_select" ON "feeds" FOR SELECT USING (public.is_editor_or_above());
CREATE POLICY "feeds_insert" ON "feeds" FOR INSERT WITH CHECK (public.is_editor_or_above());
CREATE POLICY "feeds_update" ON "feeds" FOR UPDATE USING (public.is_editor_or_above());

CREATE POLICY "feed_clusters_select" ON "feed_clusters" FOR SELECT USING (public.is_editor_or_above());
CREATE POLICY "feed_clusters_insert" ON "feed_clusters" FOR INSERT WITH CHECK (public.is_editor_or_above());
CREATE POLICY "feed_clusters_update" ON "feed_clusters" FOR UPDATE USING (public.is_editor_or_above());

CREATE POLICY "feed_cluster_articles_select" ON "feed_cluster_articles" FOR SELECT USING (public.is_editor_or_above());
CREATE POLICY "feed_cluster_articles_insert" ON "feed_cluster_articles" FOR INSERT WITH CHECK (public.is_editor_or_above());

CREATE POLICY "pipeline_runs_select" ON "pipeline_runs" FOR SELECT USING (public.is_editor_or_above());
CREATE POLICY "pipeline_runs_insert" ON "pipeline_runs" FOR INSERT WITH CHECK (public.is_editor_or_above());
CREATE POLICY "pipeline_runs_update" ON "pipeline_runs" FOR UPDATE USING (public.is_editor_or_above());

CREATE POLICY "pipeline_costs_select" ON "pipeline_costs" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "pipeline_costs_insert" ON "pipeline_costs" FOR INSERT WITH CHECK (public.is_admin_or_above());

-- ============================================================
-- CAMPAIGNS / COHORTS
-- ============================================================

CREATE POLICY "cohorts_select" ON "cohorts" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "cohorts_insert" ON "cohorts" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "cohorts_update" ON "cohorts" FOR UPDATE USING (public.is_admin_or_above());

CREATE POLICY "cohort_members_select" ON "cohort_members" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "cohort_members_insert" ON "cohort_members" FOR INSERT WITH CHECK (public.is_admin_or_above());

CREATE POLICY "campaigns_select" ON "campaigns" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "campaigns_insert" ON "campaigns" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "campaigns_update" ON "campaigns" FOR UPDATE USING (public.is_admin_or_above());

CREATE POLICY "campaign_recipients_select" ON "campaign_recipients" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "campaign_recipients_insert" ON "campaign_recipients" FOR INSERT WITH CHECK (public.is_admin_or_above());

CREATE POLICY "sponsors_select" ON "sponsors" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "sponsors_insert" ON "sponsors" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "sponsors_update" ON "sponsors" FOR UPDATE USING (public.is_admin_or_above());

-- ============================================================
-- SYSTEM TABLES (admin only)
-- ============================================================

CREATE POLICY "audit_log_select" ON "audit_log" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "audit_log_insert" ON "audit_log" FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "rate_limits_select" ON "rate_limits" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "rate_limits_insert" ON "rate_limits" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "rate_limits_update" ON "rate_limits" FOR UPDATE USING (public.is_admin_or_above());

CREATE POLICY "rate_limit_events_select" ON "rate_limit_events" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "rate_limit_events_insert" ON "rate_limit_events" FOR INSERT WITH CHECK (true);

CREATE POLICY "webhook_log_select" ON "webhook_log" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "webhook_log_insert" ON "webhook_log" FOR INSERT WITH CHECK (true);

CREATE POLICY "data_requests_select" ON "data_requests" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "data_requests_insert" ON "data_requests" FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "data_requests_update" ON "data_requests" FOR UPDATE USING (public.is_admin_or_above());

-- ============================================================
-- ANALYTICS (write from app, admin read)
-- ============================================================

CREATE POLICY "deep_links_select" ON "deep_links" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "deep_links_insert" ON "deep_links" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "deep_links_update" ON "deep_links" FOR UPDATE USING (public.is_admin_or_above());

CREATE POLICY "analytics_events_select" ON "analytics_events" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "analytics_events_insert" ON "analytics_events" FOR INSERT WITH CHECK (true);

CREATE POLICY "user_sessions_select" ON "user_sessions" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "user_sessions_insert" ON "user_sessions" FOR INSERT WITH CHECK (true);
CREATE POLICY "user_sessions_update" ON "user_sessions" FOR UPDATE USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);

CREATE POLICY "search_history_select" ON "search_history" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "search_history_insert" ON "search_history" FOR INSERT WITH CHECK (
  user_id = auth.uid() OR user_id IS NULL
);
CREATE POLICY "search_history_delete" ON "search_history" FOR DELETE USING (
  user_id = auth.uid()
);

-- ============================================================
-- ADS (admin only)
-- ============================================================

CREATE POLICY "ad_placements_select" ON "ad_placements" FOR SELECT USING (
  is_active = true OR public.is_admin_or_above()
);
CREATE POLICY "ad_placements_insert" ON "ad_placements" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "ad_placements_update" ON "ad_placements" FOR UPDATE USING (public.is_admin_or_above());

CREATE POLICY "ad_units_select" ON "ad_units" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "ad_units_insert" ON "ad_units" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "ad_units_update" ON "ad_units" FOR UPDATE USING (public.is_admin_or_above());

CREATE POLICY "ad_campaigns_select" ON "ad_campaigns" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "ad_campaigns_insert" ON "ad_campaigns" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "ad_campaigns_update" ON "ad_campaigns" FOR UPDATE USING (public.is_admin_or_above());

CREATE POLICY "ad_impressions_select" ON "ad_impressions" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "ad_impressions_insert" ON "ad_impressions" FOR INSERT WITH CHECK (true);

CREATE POLICY "ad_daily_stats_select" ON "ad_daily_stats" FOR SELECT USING (public.is_admin_or_above());
CREATE POLICY "ad_daily_stats_insert" ON "ad_daily_stats" FOR INSERT WITH CHECK (public.is_admin_or_above());
CREATE POLICY "ad_daily_stats_update" ON "ad_daily_stats" FOR UPDATE USING (public.is_admin_or_above());

-- ============================================================
-- SUPPORT
-- ============================================================

CREATE POLICY "support_tickets_select" ON "support_tickets" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "support_tickets_insert" ON "support_tickets" FOR INSERT WITH CHECK (
  user_id = auth.uid() OR user_id IS NULL
);
CREATE POLICY "support_tickets_update" ON "support_tickets" FOR UPDATE USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);

CREATE POLICY "ticket_messages_select" ON "ticket_messages" FOR SELECT USING (
  EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_messages.ticket_id AND (user_id = auth.uid() OR public.is_admin_or_above()))
);
CREATE POLICY "ticket_messages_insert" ON "ticket_messages" FOR INSERT WITH CHECK (
  sender_id = auth.uid() OR sender_id IS NULL OR public.is_admin_or_above()
);

-- ============================================================
-- Grant anon and authenticated access to public schema
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;


-- ============================================================
-- 004_rpc_functions.sql
-- ============================================================

-- ============================================================
-- Verity Post RPC Functions
-- (inlined — runs in sequence, no separate file needed)
-- ============================================================

-- Generic atomic counter increment
-- Usage: SELECT increment_field('articles', '<uuid>', 'view_count', 1);
CREATE OR REPLACE FUNCTION public.increment_field(
  table_name text,
  row_id uuid,
  field_name text,
  amount integer DEFAULT 1
)
RETURNS void AS $$
BEGIN
  EXECUTE format(
    'UPDATE %I SET %I = %I + $1 WHERE id = $2',
    table_name, field_name, field_name
  ) USING amount, row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment article view count (convenience wrapper)
CREATE OR REPLACE FUNCTION public.increment_view_count(article_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE articles SET view_count = view_count + 1 WHERE id = article_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment article comment count
CREATE OR REPLACE FUNCTION public.increment_comment_count(article_id uuid, amount integer DEFAULT 1)
RETURNS void AS $$
BEGIN
  UPDATE articles SET comment_count = comment_count + amount WHERE id = article_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment article bookmark count
CREATE OR REPLACE FUNCTION public.increment_bookmark_count(article_id uuid, amount integer DEFAULT 1)
RETURNS void AS $$
BEGIN
  UPDATE articles SET bookmark_count = bookmark_count + amount WHERE id = article_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment article share count
CREATE OR REPLACE FUNCTION public.increment_share_count(article_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE articles SET share_count = share_count + 1 WHERE id = article_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment comment vote counts
CREATE OR REPLACE FUNCTION public.increment_comment_vote(comment_id uuid, vote_type text, amount integer DEFAULT 1)
RETURNS void AS $$
BEGIN
  IF vote_type = 'upvote' THEN
    UPDATE comments SET upvote_count = upvote_count + amount WHERE id = comment_id;
  ELSIF vote_type = 'downvote' THEN
    UPDATE comments SET downvote_count = downvote_count + amount WHERE id = comment_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment user follower/following counts
CREATE OR REPLACE FUNCTION public.update_follow_counts(follower uuid, following uuid, amount integer DEFAULT 1)
RETURNS void AS $$
BEGIN
  UPDATE users SET following_count = following_count + amount WHERE id = follower;
  UPDATE users SET followers_count = followers_count + amount WHERE id = following;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Purge old rate limit events (called by cron)
CREATE OR REPLACE FUNCTION public.purge_rate_limit_events(older_than interval DEFAULT '1 hour')
RETURNS integer AS $$
DECLARE
  deleted integer;
BEGIN
  DELETE FROM rate_limit_events WHERE created_at < now() - older_than;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated and anon
GRANT EXECUTE ON FUNCTION public.increment_field TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_view_count TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.increment_comment_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_bookmark_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_share_count TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.increment_comment_vote TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_follow_counts TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_rate_limit_events TO authenticated;

-- ============================================================
-- 007_category_scores.sql
-- ============================================================

-- ============================================================
-- Seed category_scores for all users + all categories
-- Run in Supabase SQL Editor
-- ============================================================

INSERT INTO "category_scores" ("user_id", "category_id", "score", "articles_read", "quizzes_correct", "last_activity_at")
SELECT
  u.id,
  c.id,
  floor(random() * 200)::int + 5,
  floor(random() * 30)::int + 1,
  floor(random() * 15)::int,
  now() - (random() * interval '14 days')
FROM
  (SELECT id FROM users WHERE username IS NOT NULL) u
CROSS JOIN
  (SELECT id FROM categories WHERE is_active = true AND deleted_at IS NULL) c
WHERE random() < 0.4
ON CONFLICT DO NOTHING;

-- ============================================================
-- 008_fix_scores.sql
-- ============================================================

-- ============================================================
-- Fix verity_score to be sum of category_scores
-- Run in Supabase SQL Editor
-- ============================================================

-- Update each user's verity_score to be the sum of their category scores
UPDATE users SET verity_score = COALESCE(
  (SELECT SUM(score) FROM category_scores WHERE category_scores.user_id = users.id),
  0
)
WHERE username IS NOT NULL;

-- Show results (verity_tier removed per Blueprint v2 — score is pure number)
SELECT username, verity_score,
  (SELECT COUNT(*) FROM category_scores WHERE category_scores.user_id = users.id) as num_categories
FROM users
WHERE username IS NOT NULL
ORDER BY verity_score DESC
LIMIT 20;

-- ============================================================
-- 011_fix_messaging_rls.sql
-- ============================================================

-- Fix infinite recursion in conversation_participants and conversations RLS
-- Run in Supabase SQL Editor

-- Drop the recursive policies
DROP POLICY IF EXISTS "conversation_participants_select" ON "conversation_participants";
DROP POLICY IF EXISTS "conversation_participants_insert" ON "conversation_participants";
DROP POLICY IF EXISTS "conversation_participants_update" ON "conversation_participants";
DROP POLICY IF EXISTS "conversations_select" ON "conversations";
DROP POLICY IF EXISTS "conversations_insert" ON "conversations";
DROP POLICY IF EXISTS "conversations_update" ON "conversations";
DROP POLICY IF EXISTS "messages_select" ON "messages";
DROP POLICY IF EXISTS "messages_insert" ON "messages";
DROP POLICY IF EXISTS "messages_update" ON "messages";

-- conversation_participants: users can see their own rows, admins see all
CREATE POLICY "conversation_participants_select" ON "conversation_participants" FOR SELECT USING (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "conversation_participants_insert" ON "conversation_participants" FOR INSERT WITH CHECK (
  user_id = auth.uid() OR public.is_admin_or_above()
);
CREATE POLICY "conversation_participants_update" ON "conversation_participants" FOR UPDATE USING (
  user_id = auth.uid()
);

-- conversations: participants can see, creators can insert
CREATE POLICY "conversations_select" ON "conversations" FOR SELECT USING (
  id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid())
  OR public.is_admin_or_above()
);
CREATE POLICY "conversations_insert" ON "conversations" FOR INSERT WITH CHECK (
  created_by = auth.uid()
);
CREATE POLICY "conversations_update" ON "conversations" FOR UPDATE USING (
  created_by = auth.uid() OR public.is_admin_or_above()
);

-- messages: participants of the conversation can see/send
CREATE POLICY "messages_select" ON "messages" FOR SELECT USING (
  conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid())
  OR public.is_admin_or_above()
);
CREATE POLICY "messages_insert" ON "messages" FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid())
);
CREATE POLICY "messages_update" ON "messages" FOR UPDATE USING (
  sender_id = auth.uid()
);

-- ============================================================
-- 012_seed_subcategories.sql
-- ============================================================

-- Seed subcategories as child rows in categories table
-- Run in Supabase SQL Editor

-- Politics subcategories
INSERT INTO categories (name, slug, parent_id, sort_order, is_active, is_kids_safe) VALUES
  ('Congress', 'congress', (SELECT id FROM categories WHERE slug = 'politics'), 1, true, false),
  ('Supreme Court', 'supreme-court', (SELECT id FROM categories WHERE slug = 'politics'), 2, true, false),
  ('White House', 'white-house', (SELECT id FROM categories WHERE slug = 'politics'), 3, true, false),
  ('Elections', 'elections', (SELECT id FROM categories WHERE slug = 'politics'), 4, true, false);

-- World subcategories
INSERT INTO categories (name, slug, parent_id, sort_order, is_active, is_kids_safe) VALUES
  ('Asia', 'asia', (SELECT id FROM categories WHERE slug = 'world'), 1, true, false),
  ('Europe', 'europe', (SELECT id FROM categories WHERE slug = 'world'), 2, true, false),
  ('Middle East', 'middle-east', (SELECT id FROM categories WHERE slug = 'world'), 3, true, false),
  ('Africa', 'africa', (SELECT id FROM categories WHERE slug = 'world'), 4, true, false),
  ('Americas', 'americas', (SELECT id FROM categories WHERE slug = 'world'), 5, true, false);

-- Technology subcategories
INSERT INTO categories (name, slug, parent_id, sort_order, is_active, is_kids_safe) VALUES
  ('AI', 'ai', (SELECT id FROM categories WHERE slug = 'technology'), 1, true, false),
  ('Social Media', 'social-media', (SELECT id FROM categories WHERE slug = 'technology'), 2, true, false),
  ('Cybersecurity', 'cybersecurity', (SELECT id FROM categories WHERE slug = 'technology'), 3, true, false),
  ('Big Tech', 'big-tech', (SELECT id FROM categories WHERE slug = 'technology'), 4, true, false),
  ('Crypto', 'crypto', (SELECT id FROM categories WHERE slug = 'technology'), 5, true, false);

-- Business subcategories
INSERT INTO categories (name, slug, parent_id, sort_order, is_active, is_kids_safe) VALUES
  ('Markets', 'markets', (SELECT id FROM categories WHERE slug = 'business'), 1, true, false),
  ('Startups', 'startups', (SELECT id FROM categories WHERE slug = 'business'), 2, true, false),
  ('Corporate', 'corporate', (SELECT id FROM categories WHERE slug = 'business'), 3, true, false),
  ('Real Estate', 'real-estate', (SELECT id FROM categories WHERE slug = 'business'), 4, true, false);

-- Economy subcategories
INSERT INTO categories (name, slug, parent_id, sort_order, is_active, is_kids_safe) VALUES
  ('Jobs', 'jobs', (SELECT id FROM categories WHERE slug = 'economy'), 1, true, false),
  ('Inflation', 'inflation', (SELECT id FROM categories WHERE slug = 'economy'), 2, true, false),
  ('Trade', 'trade', (SELECT id FROM categories WHERE slug = 'economy'), 3, true, false),
  ('Federal Reserve', 'federal-reserve', (SELECT id FROM categories WHERE slug = 'economy'), 4, true, false);

-- Science subcategories
INSERT INTO categories (name, slug, parent_id, sort_order, is_active, is_kids_safe) VALUES
  ('Space', 'space', (SELECT id FROM categories WHERE slug = 'science'), 1, true, true),
  ('Biology', 'biology', (SELECT id FROM categories WHERE slug = 'science'), 2, true, true),
  ('Physics', 'physics', (SELECT id FROM categories WHERE slug = 'science'), 3, true, false),
  ('Medicine', 'medicine', (SELECT id FROM categories WHERE slug = 'science'), 4, true, false);

-- Health subcategories
INSERT INTO categories (name, slug, parent_id, sort_order, is_active, is_kids_safe) VALUES
  ('Public Health', 'public-health', (SELECT id FROM categories WHERE slug = 'health'), 1, true, false),
  ('Mental Health', 'mental-health', (SELECT id FROM categories WHERE slug = 'health'), 2, true, false),
  ('Nutrition', 'nutrition', (SELECT id FROM categories WHERE slug = 'health'), 3, true, true),
  ('Pharma', 'pharma', (SELECT id FROM categories WHERE slug = 'health'), 4, true, false);

-- Sports subcategories
INSERT INTO categories (name, slug, parent_id, sort_order, is_active, is_kids_safe) VALUES
  ('NFL', 'nfl', (SELECT id FROM categories WHERE slug = 'sports'), 1, true, true),
  ('NBA', 'nba', (SELECT id FROM categories WHERE slug = 'sports'), 2, true, true),
  ('MLB', 'mlb', (SELECT id FROM categories WHERE slug = 'sports'), 3, true, true),
  ('Soccer', 'soccer', (SELECT id FROM categories WHERE slug = 'sports'), 4, true, true),
  ('Olympics', 'olympics', (SELECT id FROM categories WHERE slug = 'sports'), 5, true, true);

-- Entertainment subcategories
INSERT INTO categories (name, slug, parent_id, sort_order, is_active, is_kids_safe) VALUES
  ('Movies', 'movies', (SELECT id FROM categories WHERE slug = 'entertainment'), 1, true, false),
  ('TV', 'tv', (SELECT id FROM categories WHERE slug = 'entertainment'), 2, true, false),
  ('Music', 'music', (SELECT id FROM categories WHERE slug = 'entertainment'), 3, true, false),
  ('Gaming', 'gaming', (SELECT id FROM categories WHERE slug = 'entertainment'), 4, true, false);

-- Climate subcategories
INSERT INTO categories (name, slug, parent_id, sort_order, is_active, is_kids_safe) VALUES
  ('Weather', 'weather', (SELECT id FROM categories WHERE slug = 'climate'), 1, true, true),
  ('Renewable Energy', 'renewable-energy', (SELECT id FROM categories WHERE slug = 'climate'), 2, true, true),
  ('Climate Policy', 'climate-policy', (SELECT id FROM categories WHERE slug = 'climate'), 3, true, false);

-- Finance subcategories
INSERT INTO categories (name, slug, parent_id, sort_order, is_active, is_kids_safe) VALUES
  ('Personal Finance', 'personal-finance', (SELECT id FROM categories WHERE slug = 'finance'), 1, true, false),
  ('Banking', 'banking', (SELECT id FROM categories WHERE slug = 'finance'), 2, true, false),
  ('Investing', 'investing', (SELECT id FROM categories WHERE slug = 'finance'), 3, true, false);


-- ============================================================
-- 013_auth_sync.sql (inlined)
-- Bridges auth.users ↔ public.users so signups auto-provision a profile.
-- Also promotes the first signup to owner.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count int;
  owner_role_id uuid;
BEGIN
  -- Always start public.email_verified = false so signups see the
  -- unverified UI in the app even when Supabase auto-confirms at the
  -- auth layer. The public flag flips true when the user explicitly
  -- clicks the verification link (handled by handle_auth_user_updated).
  INSERT INTO public.users (id, email, email_verified, email_verified_at, plan_status, locale)
  VALUES (
    NEW.id,
    NEW.email,
    false,
    NULL,
    'free',
    'en'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO user_count FROM public.users;
  IF user_count = 1 THEN
    SELECT id INTO owner_role_id FROM public.roles WHERE name = 'owner' LIMIT 1;
    IF owner_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, owner_role_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS DISTINCT FROM OLD.email_confirmed_at THEN
    UPDATE public.users
    SET email_verified = NEW.email_confirmed_at IS NOT NULL,
        email_verified_at = NEW.email_confirmed_at
    WHERE id = NEW.id;
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_auth_user_updated() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
AFTER UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_updated();

-- Backfill: any auth.users without a public.users row
INSERT INTO public.users (id, email, email_verified, email_verified_at, plan_status, locale)
SELECT au.id, au.email, au.email_confirmed_at IS NOT NULL, au.email_confirmed_at, 'free', 'en'
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL;

-- If any auth.users already exist and no one has the owner role yet,
-- promote the earliest-created user.
DO $$
DECLARE
  owner_role_id uuid;
  first_user_id uuid;
  owners_exist boolean;
BEGIN
  SELECT id INTO owner_role_id FROM public.roles WHERE name = 'owner' LIMIT 1;
  IF owner_role_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role_id = owner_role_id
  ) INTO owners_exist;
  IF owners_exist THEN RETURN; END IF;

  SELECT id INTO first_user_id FROM public.users ORDER BY created_at ASC LIMIT 1;
  IF first_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (first_user_id, owner_role_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;


-- ============================================================
-- 014_expert_gate.sql (inlined)
-- DB-enforced expert-queue access (replaces client-side role checks)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_expert_or_above()
RETURNS boolean AS $$
  SELECT public.user_has_role('expert');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "expert_discussions_select" ON "expert_discussions";
CREATE POLICY "expert_discussions_select" ON "expert_discussions" FOR SELECT USING (
  public.is_expert_or_above() OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "expert_discussions_insert" ON "expert_discussions";
CREATE POLICY "expert_discussions_insert" ON "expert_discussions" FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.is_expert_or_above() AND public.has_verified_email() AND NOT public.is_banned()
);

DROP POLICY IF EXISTS "expert_discussion_votes_insert" ON "expert_discussion_votes";
CREATE POLICY "expert_discussion_votes_insert" ON "expert_discussion_votes" FOR INSERT WITH CHECK (
  user_id = auth.uid() AND public.is_expert_or_above() AND public.has_verified_email()
);


-- ============================================================
-- (kid_profiles RLS is re-declared below using has_permission)
-- ============================================================

-- ============================================================
-- 016_permission_sets.sql (inlined)
-- Salesforce-style permission model:
--   permissions          = atomic capabilities (existing table, extended here)
--   permission_sets      = named bundles of permissions
--   permission_set_perms = M2M: set -> permission
--   role_permission_sets = role auto-grants a set
--   plan_permission_sets = plan auto-grants a set (when plan_status is active/trialing)
--   user_permission_sets = direct grant to a user (with optional expiry)
--
-- Effective permissions for a user =
--   (sets granted by their role) ∪ (sets granted by their plan) ∪ (direct sets)
--   filtered by: not banned, not expired, and if perm.requires_verified then email_verified.
--
-- Client calls get_my_capabilities('profile') to render locked/unlocked tabs.
-- Drops the old feature_gates + user_has_feature for a single source of truth.
-- ============================================================

-- Drop legacy objects from previous iterations (idempotent).
DROP FUNCTION IF EXISTS public.user_has_feature(text);
DROP FUNCTION IF EXISTS public.feature_unlocked(text);
DROP FUNCTION IF EXISTS public.get_user_capabilities();
DROP FUNCTION IF EXISTS public.plan_tier_rank(text);
DROP FUNCTION IF EXISTS public.role_rank(text);
DROP TABLE IF EXISTS "feature_gates" CASCADE;

-- ---------------------------------------------------------
-- Extend permissions table with UI-gating metadata.
-- ---------------------------------------------------------
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "ui_section"        varchar(50);
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "ui_element"        varchar(100);
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "lock_message"      varchar(300);
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "requires_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "sort_order"        integer NOT NULL DEFAULT 0;
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "deny_mode"         varchar(10) NOT NULL DEFAULT 'locked';
ALTER TABLE "permissions" DROP CONSTRAINT IF EXISTS "chk_permissions_deny_mode";
ALTER TABLE "permissions" ADD CONSTRAINT  "chk_permissions_deny_mode" CHECK ("deny_mode" IN ('locked','hidden'));
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "is_public"          boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "idx_permissions_ui_section" ON "permissions" ("ui_section");

-- ---------------------------------------------------------
-- permission_sets
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "permission_sets" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key"          varchar(100) NOT NULL UNIQUE,   -- 'base', 'verified_base', 'verity_perks', 'verity_pro_perks', 'family_perks', 'expert_tools', etc.
  "display_name" varchar(150) NOT NULL,
  "description"  text,
  "is_system"    boolean NOT NULL DEFAULT false,
  "is_active"    boolean NOT NULL DEFAULT true,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "permission_set_perms" (
  "permission_set_id" uuid NOT NULL REFERENCES "permission_sets"("id") ON DELETE CASCADE,
  "permission_id"     uuid NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
  PRIMARY KEY ("permission_set_id", "permission_id")
);

CREATE TABLE IF NOT EXISTS "role_permission_sets" (
  "role_id"           uuid NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "permission_set_id" uuid NOT NULL REFERENCES "permission_sets"("id") ON DELETE CASCADE,
  PRIMARY KEY ("role_id", "permission_set_id")
);

CREATE TABLE IF NOT EXISTS "plan_permission_sets" (
  "plan_id"           uuid NOT NULL REFERENCES "plans"("id") ON DELETE CASCADE,
  "permission_set_id" uuid NOT NULL REFERENCES "permission_sets"("id") ON DELETE CASCADE,
  PRIMARY KEY ("plan_id", "permission_set_id")
);

CREATE TABLE IF NOT EXISTS "user_permission_sets" (
  "user_id"           uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "permission_set_id" uuid NOT NULL REFERENCES "permission_sets"("id") ON DELETE CASCADE,
  "granted_by"        uuid REFERENCES "users"("id"),
  "granted_at"        timestamptz NOT NULL DEFAULT now(),
  "expires_at"        timestamptz,
  "reason"            text,
  PRIMARY KEY ("user_id", "permission_set_id")
);

CREATE INDEX IF NOT EXISTS "idx_user_permission_sets_user" ON "user_permission_sets" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_permission_sets_expires" ON "user_permission_sets" ("expires_at") WHERE expires_at IS NOT NULL;

ALTER TABLE "permission_sets"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permission_set_perms"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permission_sets"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_permission_sets"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_permission_sets"  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permission_sets_select"      ON "permission_sets";
DROP POLICY IF EXISTS "permission_set_perms_select" ON "permission_set_perms";
DROP POLICY IF EXISTS "role_permission_sets_select" ON "role_permission_sets";
DROP POLICY IF EXISTS "plan_permission_sets_select" ON "plan_permission_sets";
DROP POLICY IF EXISTS "user_permission_sets_select" ON "user_permission_sets";

CREATE POLICY "permission_sets_select"      ON "permission_sets"      FOR SELECT USING (is_active = true OR public.is_admin_or_above());
CREATE POLICY "permission_set_perms_select" ON "permission_set_perms" FOR SELECT USING (true);
CREATE POLICY "role_permission_sets_select" ON "role_permission_sets" FOR SELECT USING (true);
CREATE POLICY "plan_permission_sets_select" ON "plan_permission_sets" FOR SELECT USING (true);
CREATE POLICY "user_permission_sets_select" ON "user_permission_sets" FOR SELECT USING (user_id = auth.uid() OR public.is_admin_or_above());

-- Writes to these tables: admins only.
DROP POLICY IF EXISTS "permission_sets_write"      ON "permission_sets";
DROP POLICY IF EXISTS "permission_set_perms_write" ON "permission_set_perms";
DROP POLICY IF EXISTS "role_permission_sets_write" ON "role_permission_sets";
DROP POLICY IF EXISTS "plan_permission_sets_write" ON "plan_permission_sets";
DROP POLICY IF EXISTS "user_permission_sets_write" ON "user_permission_sets";
CREATE POLICY "permission_sets_write"      ON "permission_sets"      FOR ALL USING (public.is_admin_or_above()) WITH CHECK (public.is_admin_or_above());
CREATE POLICY "permission_set_perms_write" ON "permission_set_perms" FOR ALL USING (public.is_admin_or_above()) WITH CHECK (public.is_admin_or_above());
CREATE POLICY "role_permission_sets_write" ON "role_permission_sets" FOR ALL USING (public.is_admin_or_above()) WITH CHECK (public.is_admin_or_above());
CREATE POLICY "plan_permission_sets_write" ON "plan_permission_sets" FOR ALL USING (public.is_admin_or_above()) WITH CHECK (public.is_admin_or_above());
CREATE POLICY "user_permission_sets_write" ON "user_permission_sets" FOR ALL USING (public.is_admin_or_above()) WITH CHECK (public.is_admin_or_above());

DROP TRIGGER IF EXISTS "trg_permission_sets_updated_at" ON "permission_sets";
CREATE TRIGGER "trg_permission_sets_updated_at"
  BEFORE UPDATE ON "permission_sets"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------
-- Resolver: all permission keys granted to the current user.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_permission_keys()
RETURNS TABLE (permission_key varchar) AS $$
  WITH me AS (
    SELECT id, email_verified, is_banned, plan_id, plan_status
    FROM users WHERE id = auth.uid()
  ),
  granted_set_ids AS (
    -- sets granted by the user's roles
    SELECT DISTINCT rps.permission_set_id
    FROM role_permission_sets rps
    JOIN user_roles ur ON ur.role_id = rps.role_id
    WHERE ur.user_id = (SELECT id FROM me)
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
    UNION
    -- sets granted by the user's active plan
    SELECT DISTINCT pps.permission_set_id
    FROM plan_permission_sets pps
    WHERE pps.plan_id = (SELECT plan_id FROM me)
      AND (SELECT plan_status FROM me) IN ('active','trialing')
    UNION
    -- sets granted directly to the user
    SELECT DISTINCT ups.permission_set_id
    FROM user_permission_sets ups
    WHERE ups.user_id = (SELECT id FROM me)
      AND (ups.expires_at IS NULL OR ups.expires_at > now())
  )
  SELECT DISTINCT p.key::varchar
  FROM granted_set_ids gs
  JOIN permission_set_perms psp ON psp.permission_set_id = gs.permission_set_id
  JOIN permissions p            ON p.id = psp.permission_id
  WHERE p.is_active = true
    AND NOT COALESCE((SELECT is_banned FROM me), false)
    AND (NOT p.requires_verified OR COALESCE((SELECT email_verified FROM me), false));
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Single-key check (for use in RLS policies).
CREATE OR REPLACE FUNCTION public.has_permission(p_key text)
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.my_permission_keys() WHERE permission_key = p_key);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Capability list for a UI section (e.g. 'profile'). Returns EVERY UI perm
-- in that section with whether the current user has it unlocked + why not.
CREATE OR REPLACE FUNCTION public.get_my_capabilities(p_section text)
RETURNS TABLE (
  permission_key varchar,
  ui_element     varchar,
  label          varchar,
  granted        boolean,
  deny_mode      varchar,
  lock_reason    varchar,
  lock_message   varchar,
  sort_order     integer
) AS $$
  WITH me AS (
    SELECT id, email_verified, is_banned, plan_id, plan_status
    FROM users WHERE id = auth.uid()
  ),
  my_keys AS (
    SELECT permission_key FROM public.my_permission_keys()
  )
  SELECT
    p.key::varchar                         AS permission_key,
    p.ui_element                           AS ui_element,
    p.display_name                         AS label,
    EXISTS (SELECT 1 FROM my_keys mk WHERE mk.permission_key = p.key) AS granted,
    p.deny_mode                            AS deny_mode,
    CASE
      WHEN COALESCE((SELECT is_banned FROM me), false) THEN 'banned'
      WHEN p.requires_verified AND NOT COALESCE((SELECT email_verified FROM me), false) THEN 'email_unverified'
      WHEN NOT EXISTS (SELECT 1 FROM my_keys mk WHERE mk.permission_key = p.key) THEN 'not_granted'
      ELSE NULL
    END::varchar                           AS lock_reason,
    p.lock_message                         AS lock_message,
    p.sort_order                           AS sort_order
  FROM permissions p
  WHERE p.ui_section = p_section
    AND p.is_active = true
  ORDER BY p.sort_order, p.key;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- SEED: UI permissions for the profile surface
-- ============================================================
INSERT INTO "permissions"
  ("key", "display_name", "description", "category", "ui_section", "ui_element", "lock_message", "requires_verified", "sort_order")
VALUES
  ('profile.header_stats', 'View header stats',  'Shows the 4-stat card on profile', 'ui', 'profile', 'header_stats', 'Verify your email to unlock', true,  10),
  ('profile.profile_card', 'View profile card',  'Profile card tab',                 'ui', 'profile', 'profile_card', 'Verify your email to unlock', true,  20),
  ('profile.activity',     'View activity',      'Activity tab',                     'ui', 'profile', 'activity',     'Verify your email to unlock', true,  30),
  ('profile.categories',   'View categories',    'Preferred categories tab',         'ui', 'profile', 'categories',   'Verify your email to unlock', true,  40),
  ('profile.achievements', 'View achievements',  'Achievements tab',                 'ui', 'profile', 'achievements', 'Verify your email to unlock', true,  50),
  ('profile.messages',     'Open messages',      'Direct messages tab',              'ui', 'profile', 'messages',     'Upgrade to Premium to unlock', true,  60),
  ('profile.kids',         'Manage kid profiles','Kids tab',                         'ui', 'profile', 'kids',         'Family plan required',        false, 70),
  ('profile.expert_queue', 'Expert queue',       'Expert review queue tab',          'ui', 'profile', 'expert_queue', 'Experts only',                false, 80),
  ('profile.settings',     'Open settings',      'Settings tab',                     'ui', 'profile', 'settings',     NULL,                          false, 90),
  ('profile.contact_us',   'Contact support',    'Contact us tab',                   'ui', 'profile', 'contact_us',   NULL,                          false, 100)
ON CONFLICT ("key") DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  description       = EXCLUDED.description,
  category          = EXCLUDED.category,
  ui_section        = EXCLUDED.ui_section,
  ui_element        = EXCLUDED.ui_element,
  lock_message      = EXCLUDED.lock_message,
  requires_verified = EXCLUDED.requires_verified,
  sort_order        = EXCLUDED.sort_order;

-- ============================================================
-- SEED: UI permissions for the home surface
-- ============================================================
INSERT INTO "permissions"
  ("key", "display_name", "description", "category", "ui_section", "ui_element", "lock_message", "requires_verified", "sort_order")
VALUES
  ('home.search',        'Home search',         'Home search: keyword, modes, date range, source, category/subcategory filters', 'ui', 'home', 'search',        NULL, false, 10),
  ('home.subcategories', 'Browse subcategories', 'Subcategory drilldown on home',                                                 'ui', 'home', 'subcategories', NULL, false, 30)
ON CONFLICT ("key") DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  description       = EXCLUDED.description,
  category          = EXCLUDED.category,
  ui_section        = EXCLUDED.ui_section,
  ui_element        = EXCLUDED.ui_element,
  lock_message      = EXCLUDED.lock_message,
  requires_verified = EXCLUDED.requires_verified,
  sort_order        = EXCLUDED.sort_order;

-- ============================================================
-- SEED: UI permissions for the article/story surface
-- ============================================================
INSERT INTO "permissions"
  ("key", "display_name", "description", "category", "ui_section", "ui_element", "lock_message", "requires_verified", "is_public", "sort_order")
VALUES
  ('article.view',                   'View article',              'Open and read a story/article',            'ui', 'article', 'view',                   NULL,                                   false, true,  10),
  ('article.view_timeline',          'View timeline',             'Open the article timeline',                'ui', 'article', 'view_timeline',          NULL,                                   false, true,  20),
  ('article.view_comments',          'View comments',             'See the comments thread on an article',    'ui', 'article', 'view_comments',          'Sign up and verify your email',        true,  false, 30),
  ('article.take_quiz',              'Take quiz',                 'Take the article''s quiz',                 'ui', 'article', 'take_quiz',              'Sign up and verify your email',        true,  false, 40),
  ('article.post_comment',           'Post comment',              'Write and submit a comment',               'ui', 'article', 'post_comment',           'Sign up and verify your email',        true,  false, 50),
  ('article.ask_expert',             'Ask an expert',             'Submit a question to the expert queue',    'ui', 'article', 'ask_expert',             'Upgrade to Premium',                   true,  false, 60),
  ('article.view_other_scores',      'View other users'' scores', 'See other users'' Verity scores',          'ui', 'article', 'view_other_scores',      'Upgrade to Premium',                   true,  false, 70),
  ('article.retake_quiz',            'Retake quiz',               'Retake the quiz (Premium).',               'ui', 'article', 'retake_quiz',            'Upgrade to Premium',                   true,  false, 80),
  ('article.view_expert_responses',  'View expert responses',     'See expert answers on the article',        'ui', 'article', 'view_expert_responses',  'Upgrade to Premium',                   true,  false, 90),
  ('article.tag_user',               'Tag a user',                'Mention/tag another user',                 'ui', 'article', 'tag_user',               'Upgrade to Premium',                   true,  false, 100)
ON CONFLICT ("key") DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  description       = EXCLUDED.description,
  category          = EXCLUDED.category,
  ui_section        = EXCLUDED.ui_section,
  ui_element        = EXCLUDED.ui_element,
  lock_message      = EXCLUDED.lock_message,
  requires_verified = EXCLUDED.requires_verified,
  is_public         = EXCLUDED.is_public,
  sort_order        = EXCLUDED.sort_order;

-- ============================================================
-- SEED: UI permissions for the KIDS parallel experience
-- (Resolved only during a valid kid session. Adult-session users
-- see none of these because the resolver filters by is_kids_set.)
-- ============================================================
INSERT INTO "permissions"
  ("key", "display_name", "description", "category", "ui_section", "ui_element", "lock_message", "requires_verified", "is_public", "sort_order")
VALUES
  ('kids.home.view',                 'Kids home',           'Kids home screen',                             'ui', 'kids', 'home_view',             NULL, false, false, 10),
  ('kids.home.browse_categories',    'Browse categories',   'Kid-safe category browsing',                   'ui', 'kids', 'home_categories',       NULL, false, false, 20),
  ('kids.home.daily_limit_remaining','Daily time remaining','Show remaining minutes in today''s screen time','ui', 'kids', 'daily_limit',          NULL, false, false, 30),
  ('kids.article.view',              'Read article',        'Open a kid-safe article',                      'ui', 'kids', 'article_view',          NULL, false, false, 40),
  ('kids.article.view_timeline',     'Timeline',            'Kid-safe timeline view',                       'ui', 'kids', 'article_timeline',      NULL, false, false, 50),
  ('kids.article.listen_tts',        'Listen',              'Read aloud for kids',                          'ui', 'kids', 'article_tts',           NULL, false, false, 60),
  ('kids.quiz.take',                 'Take quiz',           'Take a kid quiz',                              'ui', 'kids', 'quiz_take',             NULL, false, false, 70),
  ('kids.quiz.retake',               'Retake quiz',         'Retake within plan limit',                     'ui', 'kids', 'quiz_retake',           NULL, false, false, 80),
  ('kids.quiz.view_history',         'Quiz history',        'See my past quizzes',                          'ui', 'kids', 'quiz_history',          NULL, false, false, 90),
  ('kids.bookmarks.add',             'Save story',          'Bookmark a story (kid)',                       'ui', 'kids', 'bookmarks_add',         NULL, false, false, 100),
  ('kids.bookmarks.view',            'Saved stories',       'See my bookmarks (kid)',                       'ui', 'kids', 'bookmarks_view',        NULL, false, false, 110),
  ('kids.reading_log.view',          'Reading log',         'My kid reading log',                           'ui', 'kids', 'reading_log',           NULL, false, false, 120),
  ('kids.streaks.view_own',          'Streak',              'See my streak (kid)',                          'ui', 'kids', 'streaks',               NULL, false, false, 130),
  ('kids.achievements.view_own',     'Achievements',        'See my achievements (kid)',                    'ui', 'kids', 'achievements',          NULL, false, false, 140),
  ('kids.leaderboard.view_kids',     'Kids leaderboard',    'Kid leaderboard',                              'ui', 'kids', 'leaderboard',           NULL, false, false, 150),
  ('kids.profile.view_own',          'My profile',          'View own kid profile',                         'ui', 'kids', 'profile_own',           NULL, false, false, 160),
  ('kids.profile.edit_avatar',       'Edit avatar',         'Customize avatar',                             'ui', 'kids', 'profile_avatar',        NULL, false, false, 170),
  ('kids.share.ask_parent',          'Ask parent',          'Send a question to parent',                    'ui', 'kids', 'ask_parent',            NULL, false, false, 180),
  ('kids.share.share_to_parent',     'Share to parent',     'Share a story to parent',                      'ui', 'kids', 'share_to_parent',       NULL, false, false, 190)
ON CONFLICT ("key") DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  description       = EXCLUDED.description,
  category          = EXCLUDED.category,
  ui_section        = EXCLUDED.ui_section,
  ui_element        = EXCLUDED.ui_element,
  lock_message      = EXCLUDED.lock_message,
  requires_verified = EXCLUDED.requires_verified,
  is_public         = EXCLUDED.is_public,
  sort_order        = EXCLUDED.sort_order;

-- ============================================================
-- SEED: UI permissions for the leaderboard surface
-- ============================================================
INSERT INTO "permissions"
  ("key", "display_name", "description", "category", "ui_section", "ui_element", "lock_message", "requires_verified", "is_public", "sort_order")
VALUES
  ('leaderboard.view', 'View leaderboard', 'Open the leaderboard (public; anons see CTA banner)', 'ui', 'leaderboard', 'view', NULL, false, true, 10)
ON CONFLICT ("key") DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  description       = EXCLUDED.description,
  category          = EXCLUDED.category,
  ui_section        = EXCLUDED.ui_section,
  ui_element        = EXCLUDED.ui_element,
  lock_message      = EXCLUDED.lock_message,
  requires_verified = EXCLUDED.requires_verified,
  is_public         = EXCLUDED.is_public,
  sort_order        = EXCLUDED.sort_order;

-- ============================================================
-- SEED: v2 feature permissions (Blueprint v2 — D11/D13/D14/D15/D16/D17/D19/D21/D22/D24/D26/D28/D36)
--   Covers: comments, paid social graph (follow/DM), advanced search,
--   bookmark power features, unlimited breaking alerts, streak freeze,
--   weekly recap, paid profile extras, article UX extras, family
--   engagement, and category supervisor actions.
-- ============================================================

-- comments.* : mirrors site/src/lib/permissionKeys.js
INSERT INTO "permissions"
  ("key", "display_name", "description", "category", "ui_section", "ui_element", "lock_message", "requires_verified", "is_public", "sort_order")
VALUES
  ('comments.view',              'View comments',          'See the comments thread',                     'ui', 'comments', 'view',              NULL, false, true,  10),
  ('comments.view_user_profile', 'View commenter profile', 'Tap a commenter to see their profile',        'ui', 'comments', 'view_user_profile', NULL, false, true,  20),
  ('comments.sort_top',          'Sort: Top',              'Sort comments by top',                        'ui', 'comments', 'sort_top',          NULL, false, true,  30),
  ('comments.sort_newest',       'Sort: Newest',           'Sort comments by newest',                     'ui', 'comments', 'sort_newest',       NULL, false, true,  40),
  ('comments.filter_expert',     'Filter: Expert',         'Filter to expert-only comments',              'ui', 'comments', 'filter_expert',     NULL, false, true,  50),
  ('comments.view_pinned',       'View pinned',            'See pinned Article Context comments',         'ui', 'comments', 'view_pinned',       NULL, false, true,  60),
  ('comments.expand_replies',    'Expand replies',         'Open reply threads',                          'ui', 'comments', 'expand_replies',    NULL, false, true,  70),
  ('comments.view_reply_count',  'Reply count',            'Show reply counts on comments',               'ui', 'comments', 'view_reply_count',  NULL, false, true,  80),
  ('comments.view_edited_flag',  'Edited flag',            'Show "edited" indicator',                     'ui', 'comments', 'view_edited_flag',  NULL, false, true,  90),
  ('comments.view_edit_history', 'Edit history',           'View a comment''s edit history',              'ui', 'comments', 'view_edit_history', NULL, false, true,  100),
  ('comments.view_permalink',    'Permalink',              'Copy link to a comment',                      'ui', 'comments', 'view_permalink',    NULL, false, true,  110),
  ('comments.view_vote_counts',  'Vote counts',            'See upvote/downvote counts',                  'ui', 'comments', 'view_vote_counts',  NULL, false, true,  120),
  ('comments.post',              'Post comment',           'Post a new top-level comment',                'ui', 'comments', 'post',              'Verify your email and pass the quiz.', true, false, 130),
  ('comments.reply',             'Reply',                  'Reply to a comment',                          'ui', 'comments', 'reply',             'Verify your email and pass the quiz.', true, false, 140),
  ('comments.edit_own',          'Edit own',               'Edit your own comments',                      'ui', 'comments', 'edit_own',          NULL, true,  false, 150),
  ('comments.delete_own',        'Delete own',             'Delete your own comments',                    'ui', 'comments', 'delete_own',        NULL, true,  false, 160),
  ('comments.mention_user',      'Mention user',           '@mention another user',                       'ui', 'comments', 'mention_user',      'Upgrade to Verity to mention users.', true, false, 170),
  ('comments.upvote',            'Upvote',                 'Upvote a comment',                            'ui', 'comments', 'upvote',            NULL, true,  false, 180),
  ('comments.downvote',          'Downvote',               'Downvote a comment',                          'ui', 'comments', 'downvote',          NULL, true,  false, 190),
  ('comments.remove_vote',       'Remove vote',            'Undo your vote',                              'ui', 'comments', 'remove_vote',       NULL, true,  false, 200),
  ('comments.report',            'Report',                 'Report a comment for moderation',             'ui', 'comments', 'report',            NULL, true,  false, 210),
  ('comments.block_user',        'Block user',             'Block another user',                          'ui', 'comments', 'block_user',        NULL, true,  false, 220),
  ('comments.unblock_user',      'Unblock user',           'Unblock a previously blocked user',           'ui', 'comments', 'unblock_user',      NULL, true,  false, 230)
ON CONFLICT ("key") DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  description       = EXCLUDED.description,
  category          = EXCLUDED.category,
  ui_section        = EXCLUDED.ui_section,
  ui_element        = EXCLUDED.ui_element,
  lock_message      = EXCLUDED.lock_message,
  requires_verified = EXCLUDED.requires_verified,
  is_public         = EXCLUDED.is_public,
  sort_order        = EXCLUDED.sort_order;

-- social.* (D11 DMs, D28 Follow) / search.* (D26) / bookmarks.* (D13) /
-- alerts.* (D14) / streak.* (D19) / recap.* (D36) / profile.* extras (D32) /
-- article.* extras (D15/D16/D17) / family.* (D24) / supervisor.* (D22)
INSERT INTO "permissions"
  ("key", "display_name", "description", "category", "ui_section", "ui_element", "lock_message", "requires_verified", "sort_order")
VALUES
  ('social.follow',              'Follow users',              'Follow another user (Verity+).',                               'ui', 'social',     'follow',              'Upgrade to Verity to follow users.',                 true, 10),
  ('social.dm',                  'Direct messages',           'Send and receive DMs (Verity+).',                              'ui', 'social',     'dm',                  'Upgrade to Verity for direct messages.',             true, 20),
  ('search.advanced',            'Advanced search',           'Date range, source, category, subcategory filters.',           'ui', 'search',     'advanced',            'Upgrade to Verity for advanced filters.',            true, 10),
  ('bookmarks.unlimited',        'Unlimited bookmarks',       'Bookmark past the 10-article free cap.',                       'ui', 'bookmarks',  'unlimited',           'Upgrade to Verity for unlimited bookmarks.',         true, 10),
  ('bookmarks.collections',      'Bookmark collections',      'Named folders and notes on bookmarks.',                        'ui', 'bookmarks',  'collections',         'Upgrade to Verity for collections and notes.',       true, 20),
  ('alerts.breaking_unlimited',  'Unlimited breaking alerts', 'More than one breaking-news push per day.',                    'ui', 'alerts',     'breaking_unlimited',  'Upgrade to Verity for unlimited breaking alerts.',   true, 10),
  ('streak.freeze',              'Streak freeze',             'Protect a streak from a missed day (2/week at Verity Pro+).',  'ui', 'streak',     'freeze',              'Upgrade to Verity Pro for streak freezes.',          true, 10),
  ('recap.weekly',               'Weekly recap quiz',         'End-of-week recap quiz across categories.',                    'ui', 'recap',      'weekly',              'Upgrade to Verity for weekly recap quizzes.',        true, 10),
  ('profile.banner',             'Custom profile banner',     'Upload a banner image on your profile.',                       'ui', 'profile',    'banner',              'Upgrade to Verity for the custom banner.',           true, 110),
  ('profile.card_share',         'Shareable profile card',    'Export a shareable profile card.',                             'ui', 'profile',    'card_share',          'Upgrade to Verity for the shareable card.',          true, 120),
  ('article.tag_context',        'Tag as Article Context',    'Tag a comment as Article Context (requires quiz pass).',       'ui', 'article',    'tag_context',         'Pass the article quiz to tag comments.',             true, 110),
  ('article.listen_tts',         'Listen to article',         'Text-to-speech playback (Verity+).',                           'ui', 'article',    'listen_tts',          'Upgrade to Verity for text-to-speech.',              true, 120),
  ('family.view_leaderboard',    'Family leaderboard',        'Private household leaderboard across parents and kids.',       'ui', 'family',     'view_leaderboard',    'Upgrade to Verity Family.',                          true, 10),
  ('family.shared_achievements', 'Shared family achievements','Family-wide badges and shared challenges.',                    'ui', 'family',     'shared_achievements', 'Upgrade to Verity Family.',                          true, 20),
  ('supervisor.opt_in',          'Opt in as supervisor',      'Accept category supervisor role when eligible.',               'ui', 'supervisor', 'opt_in',              NULL,                                                 true, 10),
  ('supervisor.flag_fast_lane',  'Fast-lane flag',            'Flag a comment directly to the moderator queue.',              'ui', 'supervisor', 'flag_fast_lane',      NULL,                                                 true, 20)
ON CONFLICT ("key") DO UPDATE SET
  display_name      = EXCLUDED.display_name,
  description       = EXCLUDED.description,
  category          = EXCLUDED.category,
  ui_section        = EXCLUDED.ui_section,
  ui_element        = EXCLUDED.ui_element,
  lock_message      = EXCLUDED.lock_message,
  requires_verified = EXCLUDED.requires_verified,
  sort_order        = EXCLUDED.sort_order;

-- ============================================================
-- SEED: permission sets (v2 tier-aligned)
--   base                — always-on (settings, contact_us) for signed-in users
--   verified_base       — profile/activity/etc. once email is verified
--   home_browse         — home search + subcategories
--   article_viewer      — public: read article + timeline + read-only comment view
--   article_interactive — verified: view_comments, take quiz, post comment, tag_context
--   comments_base       — post/reply/vote/report/block/edit-own (verified, quiz-gated by RLS)
--   verity_perks        — Verity+: DMs, follows, mentions, advanced search, TTS,
--                         weekly recap, unlimited bookmarks, collections, banner,
--                         shareable card, unlimited breaking alerts, view other scores,
--                         view expert responses, retake quiz, article.tag_user
--   verity_pro_perks    — Verity Pro+: Ask an Expert, streak freezes
--   family_perks        — Verity Family / XL: profile.kids tab, family leaderboard,
--                         shared achievements
--   kids_session        — kids parallel experience, only during a valid kid session
--   expert_tools        — expert review queue (Expert/Editor/Admin/Superadmin/Owner)
-- ============================================================

-- Retire v1 set keys if a previous reset left them behind.
DELETE FROM "permission_sets" WHERE key IN ('premium','family','article_premium');

INSERT INTO "permission_sets" ("key", "display_name", "description", "is_system") VALUES
  ('base',                'Base',                 'Always-on basics (settings, contact).',                                                                                          true),
  ('verified_base',       'Verified Base',        'Profile/activity/categories/achievements once email is verified.',                                                               true),
  ('home_browse',         'Home Browse',          'Home-screen search and subcategories.',                                                                                           true),
  ('article_viewer',      'Article Viewer',       'Read articles, timelines and (read-only) comments. Public — granted to every role.',                                              true),
  ('article_interactive', 'Article Interactive',  'View comments, take quiz, post comment, tag Article Context (verified signed-in; quiz-gated by RLS for posting).',                true),
  ('comments_base',       'Comments Base',        'Post/reply/vote/report/block/edit-own on comments (verified; quiz-gated by RLS).',                                                true),
  ('verity_perks',        'Verity Perks',         'Verity+: DMs, follows, mentions, advanced search, TTS, recap, unlimited bookmarks, collections, banner, scores, expert responses, retake quiz.', true),
  ('verity_pro_perks',    'Verity Pro Perks',     'Verity Pro+: Ask an Expert, streak freezes.',                                                                                     true),
  ('family_perks',        'Family Perks',         'Verity Family/XL: kid profiles tab, family leaderboard, shared achievements.',                                                    true),
  ('kids_session',        'Kids Session',         'Kids parallel experience — resolved only during a valid kid session.',                                                            true),
  ('expert_tools',        'Expert Tools',         'Expert review queue and expert workflows (Expert/Editor/Admin+ roles).',                                                          true)
ON CONFLICT ("key") DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  is_system    = EXCLUDED.is_system,
  updated_at   = now();

-- ============================================================
-- SEED: permission_set_perms (permissions bundled into sets)
-- ============================================================

-- base: settings + contact_us (everyone signed in)
INSERT INTO "permission_set_perms" ("permission_set_id", "permission_id")
SELECT ps.id, p.id FROM permission_sets ps JOIN permissions p ON p.key IN ('profile.settings','profile.contact_us')
WHERE ps.key = 'base'
ON CONFLICT DO NOTHING;

-- verified_base: verified profile surface + leaderboard view
INSERT INTO "permission_set_perms" ("permission_set_id", "permission_id")
SELECT ps.id, p.id FROM permission_sets ps JOIN permissions p ON p.key IN (
  'profile.header_stats','profile.profile_card','profile.activity','profile.categories','profile.achievements',
  'leaderboard.view'
)
WHERE ps.key = 'verified_base'
ON CONFLICT DO NOTHING;

-- home_browse: home search + subcategories (hidden when not granted)
INSERT INTO "permission_set_perms" ("permission_set_id", "permission_id")
SELECT ps.id, p.id FROM permission_sets ps JOIN permissions p ON p.key IN (
  'home.search','home.subcategories'
)
WHERE ps.key = 'home_browse'
ON CONFLICT DO NOTHING;

UPDATE permissions SET deny_mode = 'hidden'
WHERE id IN (
  SELECT permission_id FROM permission_set_perms
  WHERE permission_set_id = (SELECT id FROM permission_sets WHERE key = 'home_browse')
);

-- article_viewer: public (article + timeline + read-only comment surface)
INSERT INTO "permission_set_perms" ("permission_set_id", "permission_id")
SELECT ps.id, p.id FROM permission_sets ps JOIN permissions p ON p.key IN (
  'article.view','article.view_timeline',
  'comments.view','comments.view_user_profile',
  'comments.sort_top','comments.sort_newest','comments.filter_expert','comments.view_pinned',
  'comments.expand_replies','comments.view_reply_count','comments.view_edited_flag',
  'comments.view_edit_history','comments.view_permalink','comments.view_vote_counts'
)
WHERE ps.key = 'article_viewer'
ON CONFLICT DO NOTHING;

-- article_interactive: view_comments / take_quiz / post_comment / tag_context (verified; quiz-gated by RLS)
INSERT INTO "permission_set_perms" ("permission_set_id", "permission_id")
SELECT ps.id, p.id FROM permission_sets ps JOIN permissions p ON p.key IN (
  'article.view_comments','article.take_quiz','article.post_comment','article.tag_context'
)
WHERE ps.key = 'article_interactive'
ON CONFLICT DO NOTHING;

-- comments_base: post/reply/vote/report/block/edit-own (verified; quiz-gated by RLS)
INSERT INTO "permission_set_perms" ("permission_set_id", "permission_id")
SELECT ps.id, p.id FROM permission_sets ps JOIN permissions p ON p.key IN (
  'comments.post','comments.reply','comments.edit_own','comments.delete_own',
  'comments.upvote','comments.downvote','comments.remove_vote',
  'comments.report','comments.block_user','comments.unblock_user'
)
WHERE ps.key = 'comments_base'
ON CONFLICT DO NOTHING;

-- verity_perks: Verity ($3.99) and all higher tiers
INSERT INTO "permission_set_perms" ("permission_set_id", "permission_id")
SELECT ps.id, p.id FROM permission_sets ps JOIN permissions p ON p.key IN (
  'profile.messages',
  'social.follow','social.dm',
  'comments.mention_user',
  'search.advanced',
  'article.view_other_scores','article.retake_quiz','article.view_expert_responses',
  'article.tag_user','article.listen_tts',
  'bookmarks.unlimited','bookmarks.collections',
  'alerts.breaking_unlimited',
  'recap.weekly',
  'profile.banner','profile.card_share'
)
WHERE ps.key = 'verity_perks'
ON CONFLICT DO NOTHING;

-- verity_pro_perks: Verity Pro ($9.99) and above
INSERT INTO "permission_set_perms" ("permission_set_id", "permission_id")
SELECT ps.id, p.id FROM permission_sets ps JOIN permissions p ON p.key IN (
  'article.ask_expert',
  'streak.freeze'
)
WHERE ps.key = 'verity_pro_perks'
ON CONFLICT DO NOTHING;

-- family_perks: Verity Family / Family XL
INSERT INTO "permission_set_perms" ("permission_set_id", "permission_id")
SELECT ps.id, p.id FROM permission_sets ps JOIN permissions p ON p.key IN (
  'profile.kids','family.view_leaderboard','family.shared_achievements'
)
WHERE ps.key = 'family_perks'
ON CONFLICT DO NOTHING;

-- expert_tools: expert review queue surface
INSERT INTO "permission_set_perms" ("permission_set_id", "permission_id")
SELECT ps.id, p.id FROM permission_sets ps JOIN permissions p ON p.key IN ('profile.expert_queue')
WHERE ps.key = 'expert_tools'
ON CONFLICT DO NOTHING;

-- kids_session: all kids.* perms. is_kids_set=true so resolver only returns
-- these during an active kid_session (token in p_kid_token).
-- (Column is also added in section 017; declared here too so seed order works.)
ALTER TABLE permission_sets ADD COLUMN IF NOT EXISTS "is_kids_set" boolean NOT NULL DEFAULT false;
UPDATE permission_sets SET is_kids_set = true WHERE key = 'kids_session';

INSERT INTO "permission_set_perms" ("permission_set_id", "permission_id")
SELECT ps.id, p.id FROM permission_sets ps JOIN permissions p
  ON p.ui_section = 'kids'
WHERE ps.key = 'kids_session'
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: role -> permission_set bindings
-- Every signed-in role gets base + verified_base + home_browse +
-- article_viewer + article_interactive + comments_base.
-- Expert-like roles and staff roles additionally get expert_tools.
-- ============================================================
INSERT INTO "role_permission_sets" ("role_id", "permission_set_id")
SELECT r.id, ps.id
FROM roles r CROSS JOIN permission_sets ps
WHERE ps.key IN ('base','verified_base','home_browse','article_viewer','article_interactive','comments_base')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permission_sets" ("role_id", "permission_set_id")
SELECT r.id, ps.id
FROM roles r CROSS JOIN permission_sets ps
WHERE r.name IN ('expert','educator','journalist','moderator','editor','admin','superadmin','owner')
  AND ps.key = 'expert_tools'
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: plan -> permission_set bindings (v2 tier ladder)
--   free             — no plan-level perks (stacks on role grants)
--   verity           — verity_perks
--   verity_pro       — verity_perks + verity_pro_perks
--   verity_family    — verity_perks + verity_pro_perks + family_perks + kids_session
--   verity_family_xl — verity_perks + verity_pro_perks + family_perks + kids_session
-- ============================================================
INSERT INTO "plan_permission_sets" ("plan_id", "permission_set_id")
SELECT p.id, ps.id
FROM plans p CROSS JOIN permission_sets ps
WHERE p.tier IN ('verity','verity_pro','verity_family','verity_family_xl')
  AND ps.key = 'verity_perks'
ON CONFLICT DO NOTHING;

INSERT INTO "plan_permission_sets" ("plan_id", "permission_set_id")
SELECT p.id, ps.id
FROM plans p CROSS JOIN permission_sets ps
WHERE p.tier IN ('verity_pro','verity_family','verity_family_xl')
  AND ps.key = 'verity_pro_perks'
ON CONFLICT DO NOTHING;

INSERT INTO "plan_permission_sets" ("plan_id", "permission_set_id")
SELECT p.id, ps.id
FROM plans p CROSS JOIN permission_sets ps
WHERE p.tier IN ('verity_family','verity_family_xl')
  AND ps.key IN ('family_perks','kids_session')
ON CONFLICT DO NOTHING;

-- ============================================================
-- kid_profiles RLS: now expressed via has_permission('profile.kids')
-- ============================================================
DROP POLICY IF EXISTS "kid_profiles_select" ON "kid_profiles";
CREATE POLICY "kid_profiles_select" ON "kid_profiles" FOR SELECT USING (
  (parent_user_id = auth.uid() AND public.has_permission('profile.kids'))
  OR public.is_admin_or_above()
);

DROP POLICY IF EXISTS "kid_profiles_insert" ON "kid_profiles";
CREATE POLICY "kid_profiles_insert" ON "kid_profiles" FOR INSERT WITH CHECK (
  parent_user_id = auth.uid() AND public.has_permission('profile.kids')
);

DROP POLICY IF EXISTS "kid_profiles_update" ON "kid_profiles";
CREATE POLICY "kid_profiles_update" ON "kid_profiles" FOR UPDATE USING (
  parent_user_id = auth.uid() AND public.has_permission('profile.kids')
);

DROP POLICY IF EXISTS "kid_profiles_delete" ON "kid_profiles";
CREATE POLICY "kid_profiles_delete" ON "kid_profiles" FOR DELETE USING (
  parent_user_id = auth.uid()
);

-- ============================================================
-- 017_kid_sessions_and_pins.sql (inlined)
-- Multi-profile: parent + up to 4 kids. PIN-based profile switching.
-- Works across iOS, Android, web, desktop (plain RPCs, no JWT refresh).
-- Kid context is passed as (p_as_kid, p_kid_token) args; server verifies.
-- ============================================================

-- Max-kids metadata is seeded with the plans INSERT (2 for verity_family,
-- 4 for verity_family_xl). No catch-up UPDATE needed.

-- Parent PIN on users (required for switching into parent profile).
ALTER TABLE users ADD COLUMN IF NOT EXISTS "parent_pin_hash"    varchar(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS "pin_attempts"       integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "pin_locked_until"   timestamptz;

-- Kid PIN lockout fields (pin_hash already exists on kid_profiles).
ALTER TABLE kid_profiles ADD COLUMN IF NOT EXISTS "pin_attempts"     integer NOT NULL DEFAULT 0;
ALTER TABLE kid_profiles ADD COLUMN IF NOT EXISTS "pin_locked_until" timestamptz;

-- Enforce per-plan kid cap. verity_family metadata.max_kids = 2,
-- verity_family_xl = 4. Non-family plans get 0. (D34)
CREATE OR REPLACE FUNCTION public.enforce_max_kids()
RETURNS trigger AS $$
DECLARE
  v_max integer;
  v_current integer;
BEGIN
  SELECT COALESCE((p.metadata->>'max_kids')::integer, 0)
    INTO v_max
    FROM users u
    LEFT JOIN plans p ON p.id = u.plan_id AND u.plan_status IN ('active','trialing')
    WHERE u.id = NEW.parent_user_id;

  SELECT count(*)
    INTO v_current
    FROM kid_profiles
    WHERE parent_user_id = NEW.parent_user_id AND is_active = true;

  IF v_current >= COALESCE(v_max, 0) THEN
    RAISE EXCEPTION 'Kid profile limit reached for this plan (max=%)', COALESCE(v_max, 0);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_enforce_max_kids" ON kid_profiles;
CREATE TRIGGER "trg_enforce_max_kids"
  BEFORE INSERT ON kid_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_kids();

-- ---------------------------------------------------------
-- kid_sessions: a row exists while a device is unlocked to a kid.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "kid_sessions" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kid_profile_id"  uuid NOT NULL REFERENCES kid_profiles(id) ON DELETE CASCADE,
  "parent_user_id"  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "device_id"       varchar(200) NOT NULL,
  "token"           varchar(100) NOT NULL UNIQUE,
  "started_at"      timestamptz NOT NULL DEFAULT now(),
  "expires_at"      timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  "revoked_at"      timestamptz
);
CREATE INDEX IF NOT EXISTS "idx_kid_sessions_parent" ON kid_sessions(parent_user_id);
CREATE INDEX IF NOT EXISTS "idx_kid_sessions_device" ON kid_sessions(device_id);
CREATE INDEX IF NOT EXISTS "idx_kid_sessions_live"   ON kid_sessions(kid_profile_id) WHERE revoked_at IS NULL;

ALTER TABLE "kid_sessions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kid_sessions_select"  ON "kid_sessions";
DROP POLICY IF EXISTS "kid_sessions_nowrite" ON "kid_sessions";
CREATE POLICY "kid_sessions_select"  ON "kid_sessions" FOR SELECT USING (parent_user_id = auth.uid() OR public.is_admin_or_above());
CREATE POLICY "kid_sessions_nowrite" ON "kid_sessions" FOR ALL    USING (false) WITH CHECK (false);

-- ---------------------------------------------------------
-- device_profile_bindings: parent/kid/shared per device.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "device_profile_bindings" (
  "device_id"             varchar(200) PRIMARY KEY,
  "parent_user_id"        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "mode"                  varchar(20)  NOT NULL CHECK ("mode" IN ('parent','kid','shared')),
  "bound_kid_profile_id"  uuid REFERENCES kid_profiles(id) ON DELETE SET NULL,
  "updated_at"            timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_dpb_parent" ON device_profile_bindings(parent_user_id);

ALTER TABLE "device_profile_bindings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dpb_select" ON "device_profile_bindings";
DROP POLICY IF EXISTS "dpb_upsert" ON "device_profile_bindings";
CREATE POLICY "dpb_select" ON "device_profile_bindings" FOR SELECT USING (parent_user_id = auth.uid() OR public.is_admin_or_above());
CREATE POLICY "dpb_upsert" ON "device_profile_bindings" FOR ALL    USING (parent_user_id = auth.uid()) WITH CHECK (parent_user_id = auth.uid());

-- ---------------------------------------------------------
-- RPCs: PIN management + unlock/lock + device binding
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_parent_pin(p_pin text)
RETURNS boolean AS $$
BEGIN
  IF p_pin IS NULL OR length(p_pin) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 digits';
  END IF;
  UPDATE users
    SET parent_pin_hash = crypt(p_pin, gen_salt('bf')),
        pin_attempts = 0,
        pin_locked_until = NULL
  WHERE id = auth.uid();
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.set_kid_pin(p_kid_profile_id uuid, p_pin text)
RETURNS boolean AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM kid_profiles WHERE id = p_kid_profile_id AND parent_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE kid_profiles
    SET pin_hash = CASE WHEN p_pin IS NULL THEN NULL ELSE crypt(p_pin, gen_salt('bf')) END,
        pin_attempts = 0,
        pin_locked_until = NULL
  WHERE id = p_kid_profile_id;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Unlock parent profile (PIN required).
CREATE OR REPLACE FUNCTION public.unlock_as_parent(p_pin text, p_device_id text)
RETURNS jsonb AS $$
DECLARE v_user users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM users WHERE id = auth.uid();
  IF v_user.pin_locked_until IS NOT NULL AND v_user.pin_locked_until > now() THEN
    RAISE EXCEPTION 'Parent profile locked until %', v_user.pin_locked_until;
  END IF;
  IF v_user.parent_pin_hash IS NULL THEN
    RAISE EXCEPTION 'Parent PIN not set. Call set_parent_pin first.';
  END IF;
  IF v_user.parent_pin_hash <> crypt(p_pin, v_user.parent_pin_hash) THEN
    UPDATE users SET
      pin_attempts = pin_attempts + 1,
      pin_locked_until = CASE WHEN pin_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE pin_locked_until END
    WHERE id = auth.uid();
    RAISE EXCEPTION 'Invalid PIN';
  END IF;
  UPDATE users SET pin_attempts = 0, pin_locked_until = NULL WHERE id = auth.uid();
  UPDATE kid_sessions SET revoked_at = now() WHERE device_id = p_device_id AND revoked_at IS NULL;
  RETURN jsonb_build_object('ok', true, 'mode', 'parent', 'user_id', auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Unlock kid profile. PIN optional if kid has no pin_hash. Parent PIN always overrides (and can bypass kid lockout).
CREATE OR REPLACE FUNCTION public.unlock_as_kid(p_kid_profile_id uuid, p_pin text, p_device_id text)
RETURNS jsonb AS $$
DECLARE
  v_kid    kid_profiles%ROWTYPE;
  v_parent users%ROWTYPE;
  v_token  varchar(100);
  v_ok     boolean := false;
  v_parent_override boolean := false;
BEGIN
  SELECT * INTO v_kid FROM kid_profiles WHERE id = p_kid_profile_id AND parent_user_id = auth.uid();
  IF v_kid.id IS NULL THEN
    RAISE EXCEPTION 'Kid profile not found';
  END IF;

  -- Try parent PIN override first (works even when kid is locked out).
  SELECT * INTO v_parent FROM users WHERE id = auth.uid();
  IF p_pin IS NOT NULL AND v_parent.parent_pin_hash IS NOT NULL
     AND v_parent.parent_pin_hash = crypt(p_pin, v_parent.parent_pin_hash) THEN
    v_ok := true;
    v_parent_override := true;
  END IF;

  -- If kid is locked and parent override didn't work, bail.
  IF NOT v_ok AND v_kid.pin_locked_until IS NOT NULL AND v_kid.pin_locked_until > now() THEN
    RAISE EXCEPTION 'Kid profile locked until %', v_kid.pin_locked_until;
  END IF;

  -- Try kid PIN (or no-pin case).
  IF NOT v_ok THEN
    IF v_kid.pin_hash IS NULL THEN
      v_ok := true;
    ELSIF p_pin IS NOT NULL AND v_kid.pin_hash = crypt(p_pin, v_kid.pin_hash) THEN
      v_ok := true;
    END IF;
  END IF;

  IF NOT v_ok THEN
    UPDATE kid_profiles SET
      pin_attempts = pin_attempts + 1,
      pin_locked_until = CASE WHEN pin_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE pin_locked_until END
    WHERE id = p_kid_profile_id;
    RAISE EXCEPTION 'Invalid PIN';
  END IF;

  UPDATE kid_profiles SET pin_attempts = 0, pin_locked_until = NULL, last_active_at = now()
    WHERE id = p_kid_profile_id;

  UPDATE kid_sessions SET revoked_at = now() WHERE device_id = p_device_id AND revoked_at IS NULL;

  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO kid_sessions (kid_profile_id, parent_user_id, device_id, token)
    VALUES (p_kid_profile_id, auth.uid(), p_device_id, v_token);

  RETURN jsonb_build_object(
    'ok', true,
    'mode', 'kid',
    'kid_profile_id', p_kid_profile_id,
    'token', v_token,
    'parent_override', v_parent_override
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Parent explicitly clears a kid's lockout (requires parent PIN).
CREATE OR REPLACE FUNCTION public.clear_kid_lockout(p_kid_profile_id uuid, p_parent_pin text)
RETURNS boolean AS $$
DECLARE v_parent users%ROWTYPE;
BEGIN
  SELECT * INTO v_parent FROM users WHERE id = auth.uid();
  IF v_parent.parent_pin_hash IS NULL
     OR v_parent.parent_pin_hash <> crypt(p_parent_pin, v_parent.parent_pin_hash) THEN
    RAISE EXCEPTION 'Invalid parent PIN';
  END IF;
  UPDATE kid_profiles SET pin_attempts = 0, pin_locked_until = NULL
    WHERE id = p_kid_profile_id AND parent_user_id = auth.uid();
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Lock the current device session (revokes any kid session on this device).
CREATE OR REPLACE FUNCTION public.lock_device(p_device_id text)
RETURNS boolean AS $$
BEGIN
  UPDATE kid_sessions SET revoked_at = now()
    WHERE device_id = p_device_id AND parent_user_id = auth.uid() AND revoked_at IS NULL;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set device binding: parent-only / assigned-to-kid / shared.
CREATE OR REPLACE FUNCTION public.set_device_mode(
  p_device_id text, p_mode text, p_bound_kid_profile_id uuid DEFAULT NULL
) RETURNS boolean AS $$
BEGIN
  IF p_mode NOT IN ('parent','kid','shared') THEN
    RAISE EXCEPTION 'Invalid mode';
  END IF;
  IF p_mode = 'kid' AND p_bound_kid_profile_id IS NULL THEN
    RAISE EXCEPTION 'kid mode requires bound_kid_profile_id';
  END IF;
  IF p_bound_kid_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM kid_profiles WHERE id = p_bound_kid_profile_id AND parent_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for that kid profile';
  END IF;
  INSERT INTO device_profile_bindings (device_id, parent_user_id, mode, bound_kid_profile_id, updated_at)
    VALUES (p_device_id, auth.uid(), p_mode, p_bound_kid_profile_id, now())
    ON CONFLICT (device_id) DO UPDATE SET
      mode = EXCLUDED.mode,
      bound_kid_profile_id = EXCLUDED.bound_kid_profile_id,
      updated_at = now();
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles selectable on a device (for the shared-device selector screen).
CREATE OR REPLACE FUNCTION public.list_profiles_for_device(p_device_id text)
RETURNS TABLE (kind text, id uuid, display_name text, needs_pin boolean, locked boolean) AS $$
  SELECT 'parent'::text,
         u.id,
         COALESCE(u.display_name, u.username)::text,
         true,
         (u.pin_locked_until IS NOT NULL AND u.pin_locked_until > now())
    FROM users u
   WHERE u.id = auth.uid()
  UNION ALL
  SELECT 'kid'::text,
         k.id,
         k.display_name::text,
         k.pin_hash IS NOT NULL,
         (k.pin_locked_until IS NOT NULL AND k.pin_locked_until > now())
    FROM kid_profiles k
   WHERE k.parent_user_id = auth.uid() AND k.is_active = true
   ORDER BY 1 DESC, 3;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check whether (kid_profile_id, token) is a live session for the current parent.
CREATE OR REPLACE FUNCTION public.kid_session_valid(p_kid_profile_id uuid, p_token text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM kid_sessions
     WHERE kid_profile_id = p_kid_profile_id
       AND token = p_token
       AND parent_user_id = auth.uid()
       AND revoked_at IS NULL
       AND expires_at > now()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------
-- Permission resolver upgrades: kids-aware.
-- Sets flagged is_kids_set only resolve during a valid kid session;
-- adult sets only resolve when no kid session is active.
-- ---------------------------------------------------------
ALTER TABLE permission_sets ADD COLUMN IF NOT EXISTS "is_kids_set" boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.my_permission_keys();
DROP FUNCTION IF EXISTS public.my_permission_keys(uuid, text);
CREATE OR REPLACE FUNCTION public.my_permission_keys(p_as_kid uuid DEFAULT NULL, p_kid_token text DEFAULT NULL)
RETURNS TABLE (permission_key varchar) AS $$
  WITH me AS (
    SELECT u.id, u.email_verified, u.is_banned, u.plan_id, u.plan_status,
           CASE
             WHEN p_as_kid IS NOT NULL
              AND p_kid_token IS NOT NULL
              AND public.kid_session_valid(p_as_kid, p_kid_token)
             THEN p_as_kid
             ELSE NULL
           END AS active_kid
    FROM users u
    WHERE u.id = auth.uid()
  ),
  granted_set_ids AS (
    SELECT DISTINCT rps.permission_set_id
      FROM role_permission_sets rps
      JOIN user_roles ur ON ur.role_id = rps.role_id
     WHERE ur.user_id = (SELECT id FROM me)
       AND (ur.expires_at IS NULL OR ur.expires_at > now())
    UNION
    SELECT DISTINCT pps.permission_set_id
      FROM plan_permission_sets pps
     WHERE pps.plan_id = (SELECT plan_id FROM me)
       AND (SELECT plan_status FROM me) IN ('active','trialing')
    UNION
    SELECT DISTINCT ups.permission_set_id
      FROM user_permission_sets ups
     WHERE ups.user_id = (SELECT id FROM me)
       AND (ups.expires_at IS NULL OR ups.expires_at > now())
  ),
  from_sets AS (
    SELECT DISTINCT p.key
      FROM granted_set_ids gs
      JOIN permission_sets      ps  ON ps.id  = gs.permission_set_id
      JOIN permission_set_perms psp ON psp.permission_set_id = ps.id
      JOIN permissions          p   ON p.id   = psp.permission_id
     WHERE p.is_active = true
       AND NOT COALESCE((SELECT is_banned FROM me), false)
       AND (NOT p.requires_verified OR COALESCE((SELECT email_verified FROM me), false))
       AND (
         CASE WHEN (SELECT active_kid FROM me) IS NOT NULL
              THEN ps.is_kids_set = true
              ELSE ps.is_kids_set = false
         END
       )
  ),
  from_public AS (
    -- Public perms: granted to everyone (including anonymous visitors), except banned users.
    SELECT DISTINCT p.key
      FROM permissions p
     WHERE p.is_active = true
       AND p.is_public = true
       AND NOT COALESCE((SELECT is_banned FROM me), false)
  )
  SELECT key::varchar FROM from_sets
  UNION
  SELECT key::varchar FROM from_public;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- kid_profiles policies reference the old has_permission(text) signature;
-- drop them first so we can swap to the kid-aware 3-arg version.
DROP POLICY IF EXISTS "kid_profiles_select" ON "kid_profiles";
DROP POLICY IF EXISTS "kid_profiles_insert" ON "kid_profiles";
DROP POLICY IF EXISTS "kid_profiles_update" ON "kid_profiles";
DROP POLICY IF EXISTS "kid_profiles_delete" ON "kid_profiles";

DROP FUNCTION IF EXISTS public.has_permission(text);
DROP FUNCTION IF EXISTS public.has_permission(text, uuid, text);
CREATE OR REPLACE FUNCTION public.has_permission(p_key text, p_as_kid uuid DEFAULT NULL, p_kid_token text DEFAULT NULL)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.my_permission_keys(p_as_kid, p_kid_token) WHERE permission_key = p_key
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Re-declare the kid_profiles policies against the new has_permission.
CREATE POLICY "kid_profiles_select" ON "kid_profiles" FOR SELECT USING (
  (parent_user_id = auth.uid() AND public.has_permission('profile.kids'))
  OR public.is_admin_or_above()
);
CREATE POLICY "kid_profiles_insert" ON "kid_profiles" FOR INSERT WITH CHECK (
  parent_user_id = auth.uid() AND public.has_permission('profile.kids')
);
CREATE POLICY "kid_profiles_update" ON "kid_profiles" FOR UPDATE USING (
  parent_user_id = auth.uid() AND public.has_permission('profile.kids')
);
CREATE POLICY "kid_profiles_delete" ON "kid_profiles" FOR DELETE USING (
  parent_user_id = auth.uid()
);

DROP FUNCTION IF EXISTS public.get_my_capabilities(text);
DROP FUNCTION IF EXISTS public.get_my_capabilities(text, uuid, text);
CREATE OR REPLACE FUNCTION public.get_my_capabilities(p_section text, p_as_kid uuid DEFAULT NULL, p_kid_token text DEFAULT NULL)
RETURNS TABLE (
  permission_key varchar,
  ui_element     varchar,
  label          varchar,
  granted        boolean,
  deny_mode      varchar,
  lock_reason    varchar,
  lock_message   varchar,
  sort_order     integer
) AS $$
  WITH me AS (
    SELECT id, email_verified, is_banned FROM users WHERE id = auth.uid()
  ),
  my_keys AS (
    SELECT permission_key FROM public.my_permission_keys(p_as_kid, p_kid_token)
  )
  SELECT
    p.key::varchar AS permission_key,
    p.ui_element   AS ui_element,
    p.display_name AS label,
    EXISTS (SELECT 1 FROM my_keys mk WHERE mk.permission_key = p.key) AS granted,
    p.deny_mode    AS deny_mode,
    CASE
      WHEN COALESCE((SELECT is_banned FROM me), false) THEN 'banned'
      WHEN p.requires_verified AND NOT COALESCE((SELECT email_verified FROM me), false) THEN 'email_unverified'
      WHEN NOT EXISTS (SELECT 1 FROM my_keys mk WHERE mk.permission_key = p.key) THEN 'not_granted'
      ELSE NULL
    END::varchar   AS lock_reason,
    p.lock_message AS lock_message,
    p.sort_order   AS sort_order
  FROM permissions p
  WHERE p.ui_section = p_section AND p.is_active = true
  ORDER BY p.sort_order, p.key;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 018_hardening.sql (inlined)
-- Phase-2-ready scaffolding so the permission layer scales without
-- rewrites: stable keys, version counter, audit triggers, structured
-- CTA config, feature-flag wrapper, is_system guardrails,
-- content-level overrides, admin preview RPC.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Structured CTA + feature-flag wrapper on permissions.
-- ------------------------------------------------------------
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "cta_config"       jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "permissions" ADD COLUMN IF NOT EXISTS "feature_flag_key" varchar(100);

COMMENT ON COLUMN "permissions"."key"              IS 'Stable ID. Never rename, never reuse. Deprecate with is_active=false.';
COMMENT ON COLUMN "permissions"."cta_config"       IS 'Structured CTA: {headline,body,cta_label,cta_action,icon}. Client renders generically.';
COMMENT ON COLUMN "permissions"."feature_flag_key" IS 'If set, perm only resolves when feature_flags.key matches and is_enabled=true.';

-- ------------------------------------------------------------
-- 2. Version counter — clients cache capabilities, refetch on bump.
-- ------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "perms_version" bigint NOT NULL DEFAULT 1;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "perms_version_bumped_at" timestamptz;

-- Global version (incremented when a shared perm/set/grant changes so all users know to refetch).
CREATE TABLE IF NOT EXISTS "perms_global_version" (
  "id"         integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  "version"    bigint  NOT NULL DEFAULT 1,
  "bumped_at"  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO "perms_global_version" ("id","version") VALUES (1, 1) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.bump_perms_global_version()
RETURNS void AS $$
  UPDATE perms_global_version SET version = version + 1, bumped_at = now() WHERE id = 1;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION public.bump_user_perms_version(p_user_id uuid)
RETURNS void AS $$
  UPDATE users SET perms_version = perms_version + 1, perms_version_bumped_at = now()
   WHERE id = p_user_id;
$$ LANGUAGE sql;

-- Version fetcher for the client.
CREATE OR REPLACE FUNCTION public.my_perms_version()
RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'user_version',   COALESCE((SELECT perms_version FROM users WHERE id = auth.uid()), 0),
    'global_version', (SELECT version FROM perms_global_version WHERE id = 1),
    'checked_at',     now()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 3. Audit triggers on every permission/set/grant table.
--    Writes to audit_log. Later swap the target to Kafka with one
--    change to audit_perm_change().
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_perm_change()
RETURNS trigger AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;

  INSERT INTO audit_log (actor_id, actor_type, action, target_type, target_id, old_values, new_values, description)
  VALUES (
    auth.uid(),
    'user',
    lower(TG_OP) || ':' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    COALESCE( (v_new->>'id')::uuid, (v_old->>'id')::uuid ),
    v_old,
    v_new,
    TG_TABLE_NAME || ' ' || TG_OP
  );

  PERFORM public.bump_perms_global_version();

  IF TG_TABLE_NAME = 'user_permission_sets' THEN
    PERFORM public.bump_user_perms_version(
      COALESCE((v_new->>'user_id')::uuid, (v_old->>'user_id')::uuid)
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_audit_permissions"          ON "permissions";
DROP TRIGGER IF EXISTS "trg_audit_permission_sets"      ON "permission_sets";
DROP TRIGGER IF EXISTS "trg_audit_permission_set_perms" ON "permission_set_perms";
DROP TRIGGER IF EXISTS "trg_audit_role_permission_sets" ON "role_permission_sets";
DROP TRIGGER IF EXISTS "trg_audit_plan_permission_sets" ON "plan_permission_sets";
DROP TRIGGER IF EXISTS "trg_audit_user_permission_sets" ON "user_permission_sets";

CREATE TRIGGER "trg_audit_permissions"          AFTER INSERT OR UPDATE OR DELETE ON "permissions"
  FOR EACH ROW EXECUTE FUNCTION public.audit_perm_change();
CREATE TRIGGER "trg_audit_permission_sets"      AFTER INSERT OR UPDATE OR DELETE ON "permission_sets"
  FOR EACH ROW EXECUTE FUNCTION public.audit_perm_change();
CREATE TRIGGER "trg_audit_permission_set_perms" AFTER INSERT OR UPDATE OR DELETE ON "permission_set_perms"
  FOR EACH ROW EXECUTE FUNCTION public.audit_perm_change();
CREATE TRIGGER "trg_audit_role_permission_sets" AFTER INSERT OR UPDATE OR DELETE ON "role_permission_sets"
  FOR EACH ROW EXECUTE FUNCTION public.audit_perm_change();
CREATE TRIGGER "trg_audit_plan_permission_sets" AFTER INSERT OR UPDATE OR DELETE ON "plan_permission_sets"
  FOR EACH ROW EXECUTE FUNCTION public.audit_perm_change();
CREATE TRIGGER "trg_audit_user_permission_sets" AFTER INSERT OR UPDATE OR DELETE ON "user_permission_sets"
  FOR EACH ROW EXECUTE FUNCTION public.audit_perm_change();

-- ------------------------------------------------------------
-- 4. is_system guardrail — block edits to system sets/perms unless
--    a migration session explicitly opts in via
--    SELECT set_config('app.allow_system_perm_edits','true', true);
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_system_permissions()
RETURNS trigger AS $$
BEGIN
  IF current_setting('app.allow_system_perm_edits', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_TABLE_NAME = 'permission_sets' THEN
    IF TG_OP = 'DELETE' AND OLD.is_system THEN
      RAISE EXCEPTION 'Cannot delete system permission_set %; use is_active=false.', OLD.key;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.is_system AND NEW.key IS DISTINCT FROM OLD.key THEN
      RAISE EXCEPTION 'Cannot rename system permission_set %; keys are stable IDs.', OLD.key;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'permissions' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cannot delete permission %; use is_active=false to retire.', OLD.key;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.key IS DISTINCT FROM OLD.key THEN
      RAISE EXCEPTION 'Cannot rename permission %; keys are stable IDs. Add a new one and deprecate.', OLD.key;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_guard_system_permission_sets" ON "permission_sets";
DROP TRIGGER IF EXISTS "trg_guard_system_permissions"     ON "permissions";
CREATE TRIGGER "trg_guard_system_permission_sets"
  BEFORE UPDATE OR DELETE ON "permission_sets"
  FOR EACH ROW EXECUTE FUNCTION public.guard_system_permissions();
CREATE TRIGGER "trg_guard_system_permissions"
  BEFORE UPDATE OR DELETE ON "permissions"
  FOR EACH ROW EXECUTE FUNCTION public.guard_system_permissions();

-- ------------------------------------------------------------
-- 5. Content-level overrides — per-article / per-category locks
--    that supersede the surface-level gate.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "permission_scope_overrides" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "permission_key"  varchar(100) NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  "scope_type"      varchar(30)  NOT NULL CHECK ("scope_type" IN ('article','category','source','user')),
  "scope_id"        uuid NOT NULL,
  "override_action" varchar(20)  NOT NULL CHECK ("override_action" IN ('allow','block','require_verified','require_premium','require_family','require_role')),
  "override_value"  varchar(100),   -- role name when override_action='require_role', or message
  "reason"          text,
  "created_by"      uuid REFERENCES users(id),
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "expires_at"      timestamptz
);
CREATE INDEX IF NOT EXISTS "idx_pso_perm"  ON "permission_scope_overrides" (permission_key);
CREATE INDEX IF NOT EXISTS "idx_pso_scope" ON "permission_scope_overrides" (scope_type, scope_id);

ALTER TABLE "permission_scope_overrides" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pso_select" ON "permission_scope_overrides";
DROP POLICY IF EXISTS "pso_write"  ON "permission_scope_overrides";
CREATE POLICY "pso_select" ON "permission_scope_overrides" FOR SELECT USING (true);
CREATE POLICY "pso_write"  ON "permission_scope_overrides" FOR ALL    USING (public.is_admin_or_above()) WITH CHECK (public.is_admin_or_above());

-- Resolve a content-scoped check: given a permission + scope, is it allowed?
-- Used by the app when the action targets a specific article/category/user.
CREATE OR REPLACE FUNCTION public.has_permission_for(
  p_key text, p_scope_type text, p_scope_id uuid,
  p_as_kid uuid DEFAULT NULL, p_kid_token text DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_base     boolean;
  v_override record;
  v_verified boolean;
  v_plan     text;
  v_roles    text[];
BEGIN
  v_base := public.has_permission(p_key, p_as_kid, p_kid_token);

  SELECT * INTO v_override
    FROM permission_scope_overrides
   WHERE permission_key = p_key
     AND scope_type = p_scope_type
     AND scope_id = p_scope_id
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_override.id IS NULL THEN RETURN v_base; END IF;

  IF v_override.override_action = 'block' THEN RETURN false; END IF;
  IF v_override.override_action = 'allow' THEN RETURN true; END IF;

  SELECT u.email_verified, p.tier,
         ARRAY(SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id)
    INTO v_verified, v_plan, v_roles
    FROM users u LEFT JOIN plans p ON p.id = u.plan_id AND u.plan_status IN ('active','trialing')
   WHERE u.id = auth.uid();

  IF v_override.override_action = 'require_verified' THEN
    RETURN v_base AND COALESCE(v_verified, false);
  END IF;
  IF v_override.override_action = 'require_premium' THEN
    -- v2: any paid tier (Verity and above).
    RETURN v_base AND COALESCE(v_plan, 'free') IN ('verity','verity_pro','verity_family','verity_family_xl');
  END IF;
  IF v_override.override_action = 'require_family' THEN
    -- v2: Verity Family or Family XL.
    RETURN v_base AND COALESCE(v_plan, 'free') IN ('verity_family','verity_family_xl');
  END IF;
  IF v_override.override_action = 'require_role' THEN
    RETURN v_base AND v_override.override_value = ANY(v_roles);
  END IF;

  RETURN v_base;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 6. Feature-flag-aware resolver override.
-- Permissions with a feature_flag_key only resolve when the flag is enabled.
-- Same signature as section 017, so CREATE OR REPLACE just swaps the body —
-- no DROP needed (DROP would fail because has_permission/get_my_capabilities depend on it).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_permission_keys(p_as_kid uuid DEFAULT NULL, p_kid_token text DEFAULT NULL)
RETURNS TABLE (permission_key varchar) AS $$
  WITH me AS (
    SELECT u.id, u.email_verified, u.is_banned, u.plan_id, u.plan_status,
           CASE
             WHEN p_as_kid IS NOT NULL
              AND p_kid_token IS NOT NULL
              AND public.kid_session_valid(p_as_kid, p_kid_token)
             THEN p_as_kid
             ELSE NULL
           END AS active_kid
    FROM users u WHERE u.id = auth.uid()
  ),
  granted_set_ids AS (
    -- Explicit role grants.
    SELECT DISTINCT rps.permission_set_id
      FROM role_permission_sets rps
      JOIN user_roles ur ON ur.role_id = rps.role_id
     WHERE ur.user_id = (SELECT id FROM me)
       AND (ur.expires_at IS NULL OR ur.expires_at > now())
    UNION
    -- Implicit default 'user' role. Every signed-in user carries these
    -- grants as a baseline; elevated roles inherit via the same seed
    -- CROSS JOIN so this just guarantees coverage for users with zero
    -- user_roles rows (the intentional "default User is implicit" case).
    SELECT DISTINCT rps.permission_set_id
      FROM role_permission_sets rps
      JOIN roles r ON r.id = rps.role_id
     WHERE r.name = 'user'
       AND (SELECT id FROM me) IS NOT NULL
    UNION
    SELECT DISTINCT pps.permission_set_id
      FROM plan_permission_sets pps
     WHERE pps.plan_id = (SELECT plan_id FROM me)
       AND (SELECT plan_status FROM me) IN ('active','trialing')
    UNION
    SELECT DISTINCT ups.permission_set_id
      FROM user_permission_sets ups
     WHERE ups.user_id = (SELECT id FROM me)
       AND (ups.expires_at IS NULL OR ups.expires_at > now())
  ),
  from_sets AS (
    SELECT DISTINCT p.key
      FROM granted_set_ids gs
      JOIN permission_sets      ps  ON ps.id  = gs.permission_set_id
      JOIN permission_set_perms psp ON psp.permission_set_id = ps.id
      JOIN permissions          p   ON p.id   = psp.permission_id
      LEFT JOIN feature_flags   ff  ON ff.key = p.feature_flag_key
     WHERE p.is_active = true
       AND NOT COALESCE((SELECT is_banned FROM me), false)
       AND (NOT p.requires_verified OR COALESCE((SELECT email_verified FROM me), false))
       AND (p.feature_flag_key IS NULL OR COALESCE(ff.is_enabled, false) = true)
       AND (
         CASE WHEN (SELECT active_kid FROM me) IS NOT NULL
              THEN ps.is_kids_set = true
              ELSE ps.is_kids_set = false
         END
       )
  ),
  from_public AS (
    SELECT DISTINCT p.key
      FROM permissions p
      LEFT JOIN feature_flags ff ON ff.key = p.feature_flag_key
     WHERE p.is_active = true
       AND p.is_public = true
       AND NOT COALESCE((SELECT is_banned FROM me), false)
       AND (p.feature_flag_key IS NULL OR COALESCE(ff.is_enabled, false) = true)
  )
  SELECT key::varchar FROM from_sets
  UNION
  SELECT key::varchar FROM from_public;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 7. Admin preview: see effective caps for any user (support/debug).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_capabilities_as(p_user_id uuid, p_section text)
RETURNS TABLE (
  permission_key varchar,
  ui_element     varchar,
  label          varchar,
  granted        boolean,
  deny_mode      varchar,
  lock_reason    varchar,
  lock_message   varchar,
  sort_order     integer
) AS $$
  -- Mirrors get_my_capabilities but resolves for an arbitrary user.
  -- Requires admin.
  WITH guard AS (
    -- Admins (via user_roles) OR service_role connections (verify scripts, cron).
    SELECT (public.is_admin_or_above()
            OR current_setting('role', true) = 'service_role'
            OR current_user = 'service_role') AS ok
  ),
  me AS (
    SELECT id, email_verified, is_banned, plan_id, plan_status
      FROM users WHERE id = p_user_id
  ),
  granted_set_ids AS (
    -- Explicit role grants.
    SELECT DISTINCT rps.permission_set_id
      FROM role_permission_sets rps
      JOIN user_roles ur ON ur.role_id = rps.role_id
     WHERE ur.user_id = p_user_id
       AND (ur.expires_at IS NULL OR ur.expires_at > now())
    UNION
    -- Implicit default 'user' role for any existing user.
    SELECT DISTINCT rps.permission_set_id
      FROM role_permission_sets rps
      JOIN roles r ON r.id = rps.role_id
     WHERE r.name = 'user'
       AND (SELECT id FROM me) IS NOT NULL
    UNION
    SELECT DISTINCT pps.permission_set_id
      FROM plan_permission_sets pps
     WHERE pps.plan_id = (SELECT plan_id FROM me)
       AND (SELECT plan_status FROM me) IN ('active','trialing')
    UNION
    SELECT DISTINCT ups.permission_set_id
      FROM user_permission_sets ups
     WHERE ups.user_id = p_user_id
       AND (ups.expires_at IS NULL OR ups.expires_at > now())
  ),
  my_keys AS (
    SELECT DISTINCT p.key
      FROM granted_set_ids gs
      JOIN permission_sets      ps  ON ps.id  = gs.permission_set_id
      JOIN permission_set_perms psp ON psp.permission_set_id = ps.id
      JOIN permissions          p   ON p.id   = psp.permission_id
      LEFT JOIN feature_flags   ff  ON ff.key = p.feature_flag_key
     WHERE p.is_active = true
       AND NOT COALESCE((SELECT is_banned FROM me), false)
       AND (NOT p.requires_verified OR COALESCE((SELECT email_verified FROM me), false))
       AND (p.feature_flag_key IS NULL OR COALESCE(ff.is_enabled, false) = true)
       AND ps.is_kids_set = false
    UNION
    SELECT DISTINCT p.key
      FROM permissions p
      LEFT JOIN feature_flags ff ON ff.key = p.feature_flag_key
     WHERE p.is_active = true
       AND p.is_public = true
       AND NOT COALESCE((SELECT is_banned FROM me), false)
       AND (p.feature_flag_key IS NULL OR COALESCE(ff.is_enabled, false) = true)
  )
  SELECT
    p.key::varchar,
    p.ui_element,
    p.display_name,
    EXISTS (SELECT 1 FROM my_keys mk WHERE mk.key = p.key),
    p.deny_mode,
    CASE
      WHEN COALESCE((SELECT is_banned FROM me), false) THEN 'banned'
      WHEN p.requires_verified AND NOT COALESCE((SELECT email_verified FROM me), false) THEN 'email_unverified'
      WHEN NOT EXISTS (SELECT 1 FROM my_keys mk WHERE mk.key = p.key) THEN 'not_granted'
      ELSE NULL
    END::varchar,
    p.lock_message,
    p.sort_order
  FROM permissions p
  WHERE p.ui_section = p_section AND p.is_active = true
    AND EXISTS (SELECT 1 FROM guard WHERE ok)
  ORDER BY p.sort_order, p.key;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 8. Grant EXECUTE so Supabase anon/authenticated roles can call the RPCs.
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.my_permission_keys(uuid, text)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid, text)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission_for(text, text, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_capabilities(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_perms_version()                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_capabilities_as(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- 9. Mark all existing seeded sets and perms as is_system=true
--    so the guardrail protects them.
-- ------------------------------------------------------------
UPDATE "permission_sets" SET "is_system" = true
WHERE "key" IN (
  'base','verified_base','home_browse',
  'article_viewer','article_interactive','comments_base',
  'verity_perks','verity_pro_perks','family_perks',
  'kids_session','expert_tools'
);

-- ============================================================
-- NOTES FOR VERCEL + SUPABASE SETUP (not SQL, for the deploy)
-- ============================================================
-- 1. Supabase project: single-region for now; upgrade to read-replicas at ~1M users.
-- 2. Client: call get_my_capabilities(section, p_as_kid, p_kid_token) ONCE per page load.
--    Cache the result in memory keyed by my_perms_version(). Refetch on version mismatch.
-- 3. Phase-2 JWT bake-in: add a Supabase "Custom Access Token" hook that reads
--    my_permission_keys() and embeds the array under jwt.claims.permissions.
--    Clients then read permissions from the token — zero DB hit per check.
-- 4. RLS is the hard enforcement layer; the resolver only drives UI state.
--    Never trust the client's claim about what it can do.
-- 5. Admin UI: build on Supabase studio OR a simple Next.js page that edits
--    permissions/permission_sets/role_permission_sets/plan_permission_sets rows.
--    All writes audit-logged by the triggers above.
-- 6. Observability: attach a Supabase webhook on audit_log inserts to ship to
--    a warehouse (ClickHouse, BigQuery) once traffic is non-trivial.
-- 7. Scale migration path when outgrowing Postgres-as-auth:
--      (a) ingest grants into SpiceDB / OpenFGA via CDC
--      (b) switch my_permission_keys() to read from a cache populated by SpiceDB
--      (c) Postgres remains the source-of-truth for intent; SpiceDB is the evaluator
-- ============================================================

-- ============================================================
-- 019_cross_platform.sql (inlined)
-- Cross-platform helpers for iOS, Android, web, desktop.
-- Every RPC here is callable identically from any Supabase client.
-- ============================================================

-- ------------------------------------------------------------
-- Push token registration — one call, any platform.
-- Provider values: 'apns' (iOS), 'fcm' (Android + Web), 'web_push' (web VAPID), 'expo' (Expo push)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_push_token(
  p_session_id    uuid,
  p_provider      text,
  p_token         text,
  p_device_id     text DEFAULT NULL,
  p_platform      text DEFAULT NULL,
  p_app_version   text DEFAULT NULL,
  p_os_name       text DEFAULT NULL,
  p_os_version    text DEFAULT NULL
) RETURNS boolean AS $$
BEGIN
  IF p_provider NOT IN ('apns','fcm','web_push','expo') THEN
    RAISE EXCEPTION 'Invalid push provider';
  END IF;
  UPDATE sessions SET
    push_token            = p_token,
    push_token_type       = p_provider,
    push_token_updated_at = now(),
    device_id             = COALESCE(p_device_id, device_id),
    app_version           = COALESCE(p_app_version, app_version),
    os_name               = COALESCE(p_os_name, os_name),
    os_version            = COALESCE(p_os_version, os_version),
    last_active_at        = now()
  WHERE id = p_session_id AND user_id = auth.uid();
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.invalidate_push_token(p_token text)
RETURNS boolean AS $$
BEGIN
  UPDATE sessions SET push_token = NULL, push_token_updated_at = now()
  WHERE push_token = p_token AND user_id = auth.uid();
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Feature-flag evaluation with platform + version targeting.
-- Uses existing feature_flags columns: target_platforms, target_min_app_version,
-- target_max_app_version, target_min_os_version, target_user_ids, target_plan_tiers,
-- rollout_percentage.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.feature_flag_enabled_for(
  p_key           text,
  p_platform      text DEFAULT NULL,
  p_app_version   text DEFAULT NULL,
  p_os_version    text DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  ff feature_flags%ROWTYPE;
  v_user users%ROWTYPE;
  v_plan_tier text;
  v_hash int;
BEGIN
  SELECT * INTO ff FROM feature_flags WHERE key = p_key;
  IF ff.id IS NULL OR NOT ff.is_enabled THEN RETURN false; END IF;

  -- Platform targeting
  IF ff.target_platforms IS NOT NULL AND array_length(ff.target_platforms, 1) > 0
     AND (p_platform IS NULL OR NOT (p_platform = ANY(ff.target_platforms))) THEN
    RETURN false;
  END IF;

  -- Version targeting (lexicographic string compare; clients send semver)
  IF ff.target_min_app_version IS NOT NULL AND p_app_version IS NOT NULL
     AND p_app_version < ff.target_min_app_version THEN
    RETURN false;
  END IF;
  IF ff.target_max_app_version IS NOT NULL AND p_app_version IS NOT NULL
     AND p_app_version > ff.target_max_app_version THEN
    RETURN false;
  END IF;
  IF ff.target_min_os_version IS NOT NULL AND p_os_version IS NOT NULL
     AND p_os_version < ff.target_min_os_version THEN
    RETURN false;
  END IF;

  -- Auth context (when called with a JWT)
  SELECT * INTO v_user FROM users WHERE id = auth.uid();

  -- Plan tier targeting
  IF ff.target_plan_tiers IS NOT NULL AND array_length(ff.target_plan_tiers, 1) > 0 THEN
    SELECT tier INTO v_plan_tier FROM plans
    WHERE id = v_user.plan_id AND v_user.plan_status IN ('active','trialing');
    IF v_plan_tier IS NULL OR NOT (v_plan_tier = ANY(ff.target_plan_tiers)) THEN
      RETURN false;
    END IF;
  END IF;

  -- User-list targeting
  IF ff.target_user_ids IS NOT NULL AND array_length(ff.target_user_ids, 1) > 0 THEN
    IF v_user.id IS NULL OR NOT (v_user.id = ANY(ff.target_user_ids)) THEN
      RETURN false;
    END IF;
  END IF;

  -- Rollout percentage (hash of user_id for deterministic bucketing)
  IF ff.rollout_percentage IS NOT NULL AND ff.rollout_percentage < 100 THEN
    IF v_user.id IS NULL THEN RETURN false; END IF;
    v_hash := abs(hashtext(v_user.id::text || ':' || p_key)) % 100;
    IF v_hash >= ff.rollout_percentage THEN RETURN false; END IF;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- Session heartbeat — client pings this periodically so we know
-- which devices are live and can prune dead sessions.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.session_heartbeat(
  p_session_id uuid,
  p_app_version text DEFAULT NULL,
  p_os_version  text DEFAULT NULL
) RETURNS boolean AS $$
BEGIN
  UPDATE sessions SET
    last_active_at = now(),
    app_version    = COALESCE(p_app_version, app_version),
    os_version     = COALESCE(p_os_version, os_version)
  WHERE id = p_session_id AND user_id = auth.uid();
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Revoke a specific session (for "sign out of device X").
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_session(p_session_id uuid)
RETURNS boolean AS $$
BEGIN
  UPDATE sessions SET is_active = false, is_current = false
  WHERE id = p_session_id AND user_id = auth.uid();
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.revoke_all_other_sessions(p_current_session_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
  UPDATE sessions SET is_active = false, is_current = false
  WHERE user_id = auth.uid() AND id <> p_current_session_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- Enable Supabase Realtime on tables that need live updates
-- across devices (notifications inbox, DMs, kid sessions).
-- ------------------------------------------------------------
DO $$ BEGIN
  PERFORM 1 FROM pg_publication WHERE pubname = 'supabase_realtime';
  IF FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    ALTER PUBLICATION supabase_realtime ADD TABLE message_receipts;
    ALTER PUBLICATION supabase_realtime ADD TABLE conversation_participants;
    ALTER PUBLICATION supabase_realtime ADD TABLE kid_sessions;
    ALTER PUBLICATION supabase_realtime ADD TABLE perms_global_version;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Table already in publication, or publication doesn't exist on non-Supabase Postgres. Safe to ignore.
  NULL;
END $$;

-- ------------------------------------------------------------
-- Grants for cross-platform clients
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.register_push_token(uuid, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invalidate_push_token(text)                                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.feature_flag_enabled_for(text, text, text, text)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_heartbeat(uuid, text, text)                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_session(uuid)                                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_other_sessions(uuid)                                     TO authenticated;

-- ============================================================
-- CROSS-PLATFORM CLIENT CONTRACT
-- ============================================================
-- On login each client creates a session row and stores:
--   session_id (uuid)             — the sessions.id
--   device_id  (text, stable)     — iOS: Keychain UUID, Android: EncryptedSharedPrefs UUID,
--                                   Web: cookie+localStorage UUID, Desktop: file-stored UUID
--   platform   ('ios'|'android'|'web'|'desktop')
--   app_version, os_name, os_version
-- Every RPC call that's user-scoped can reference (session_id, device_id) by storing them
-- on the client. Capabilities RPC ignores device — purely user-scoped.
--
-- On boot, clients should:
--   1. Validate/refresh Supabase Auth session
--   2. Call register_push_token() with the platform's push provider:
--        - iOS   → provider='apns',    token=APNs device token (hex)
--        - Android → provider='fcm',   token=Firebase registration token
--        - Web   → provider='web_push', token=VAPID subscription endpoint
--   3. Subscribe to Realtime channels:
--        - notifications     (filter: user_id = auth.uid())
--        - perms_global_version  (any change → refetch capabilities)
--        - conversation_participants (for DM list)
--        - messages          (filter: conversation_id IN (my conversations))
--   4. Call get_my_capabilities(section) for the visible screen; cache by (user, perms_version)
--   5. Call session_heartbeat(session_id) every 5–10 min when app is foregrounded
--
-- On feature checks:
--   - UI capability         → hasPermission('article.view')  [reads cached caps]
--   - Feature rollout/exp   → feature_flag_enabled_for('new_ui', platform, app_version, os_version)
--   - Content-scoped        → has_permission_for('article.view', 'article', article_id)
--
-- On logout:
--   - call invalidate_push_token(token)
--   - call revoke_session(session_id)
--   - clear client cache
--
-- IAP / billing:
--   - iOS       → receive Apple StoreKit receipt, call an edge function or RPC that inserts
--                 into iap_transactions with apple_product_id → flip subscriptions/plan accordingly
--   - Android   → Google Play Billing → iap_transactions with google_product_id
--   - Web/Desktop → Stripe checkout → webhook → subscriptions/invoices
--   plans table already has all three identifiers.
-- ============================================================

-- ============================================================
-- 020_test_data.sql (inlined)
-- Wipes user/activity data (preserves schema + system seeds:
-- roles, plans, permissions, categories, etc.) then creates 13
-- test accounts with realistic verity_scores so the leaderboard
-- has data on first load.
-- All passwords: password
-- Test account emails: <name>@vp.test
-- Idempotent — rerun any time.
-- ============================================================

TRUNCATE TABLE
  audit_log, analytics_events, ad_impressions,
  comments, comment_votes, bookmarks, reading_log, follows, reactions,
  community_notes, community_note_votes,
  quiz_attempts, category_scores, user_achievements, streaks,
  conversations, conversation_participants, messages, message_receipts,
  notifications, push_receipts, alert_preferences,
  reports, blocked_users,
  expert_applications, expert_application_categories,
  expert_discussions, expert_discussion_votes,
  subscriptions, invoices, iap_transactions, promo_uses, subscription_events,
  consent_records, data_requests,
  user_preferred_categories, kid_category_permissions,
  user_roles, user_permission_sets,
  kid_sessions, device_profile_bindings, kid_profiles,
  sessions, user_sessions, search_history,
  campaign_recipients,
  rate_limit_events, webhook_log,
  pipeline_runs, pipeline_costs,
  access_code_uses, access_requests,
  support_tickets, ticket_messages,
  users
RESTART IDENTITY CASCADE;

DELETE FROM auth.users WHERE email LIKE '%@vp.test';

DO $$
DECLARE
  v_pwd text := crypt('password', gen_salt('bf'));
  v_user_id uuid;
  v_role_id uuid;
  v_premium uuid;
  v_family  uuid;
  v_name text;
  v_email text;
  v_confirm timestamptz;
BEGIN
  SELECT id INTO v_premium FROM plans WHERE name='verity_pro_monthly';
  SELECT id INTO v_family  FROM plans WHERE name='verity_family_monthly';

  FOREACH v_name IN ARRAY ARRAY[
    'owner','superadmin','admin','editor','moderator',
    'expert','educator','journalist','user',
    'premium','family','unverified','banned'
  ] LOOP
    v_email := v_name || '@vp.test';
    v_confirm := CASE WHEN v_name = 'unverified' THEN NULL ELSE now() END;

    -- GoTrue scans these token columns into Go strings and errors on NULL,
    -- so they must be empty strings, not NULL.
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token,
      email_change, email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated',
      v_email, v_pwd, v_confirm,
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(),
      '', '',
      '', '', '',
      '', '', ''
    )
    RETURNING id INTO v_user_id;

    UPDATE public.users SET
      username        = v_name,
      display_name    = initcap(v_name),
      email_verified  = (v_name <> 'unverified'),
      email_verified_at = CASE WHEN v_name='unverified' THEN NULL ELSE now() END,
      is_banned       = (v_name = 'banned'),
      plan_id         = CASE v_name WHEN 'premium' THEN v_premium WHEN 'family' THEN v_family ELSE NULL END,
      plan_status     = CASE WHEN v_name IN ('premium','family') THEN 'active' ELSE 'free' END
    WHERE id = v_user_id;

    DELETE FROM user_roles WHERE user_id = v_user_id;
    SELECT id INTO v_role_id FROM roles
      WHERE name = CASE WHEN v_name IN ('premium','family','unverified','banned') THEN 'user' ELSE v_name END;
    INSERT INTO user_roles (user_id, role_id) VALUES (v_user_id, v_role_id);
  END LOOP;
END $$;

-- Verity scores + activity counts so the leaderboard has data
UPDATE public.users SET
  verity_score = CASE username
    WHEN 'owner' THEN 2000 WHEN 'superadmin' THEN 1800 WHEN 'admin' THEN 1500
    WHEN 'editor' THEN 1200 WHEN 'moderator' THEN 900 WHEN 'expert' THEN 800
    WHEN 'educator' THEN 700 WHEN 'journalist' THEN 650
    WHEN 'premium' THEN 400 WHEN 'user' THEN 250 WHEN 'family' THEN 150
    ELSE 0 END,
  articles_read_count = CASE username
    WHEN 'owner' THEN 250 WHEN 'superadmin' THEN 220 WHEN 'admin' THEN 180
    WHEN 'editor' THEN 140 WHEN 'moderator' THEN 100 WHEN 'expert' THEN 90
    WHEN 'educator' THEN 80 WHEN 'journalist' THEN 70
    WHEN 'premium' THEN 40 WHEN 'user' THEN 25 WHEN 'family' THEN 15
    ELSE 0 END,
  quizzes_completed_count = CASE username
    WHEN 'owner' THEN 80 WHEN 'superadmin' THEN 70 WHEN 'admin' THEN 60
    WHEN 'editor' THEN 45 WHEN 'moderator' THEN 35 WHEN 'expert' THEN 30
    WHEN 'educator' THEN 25 WHEN 'journalist' THEN 22
    WHEN 'premium' THEN 12 WHEN 'user' THEN 8 WHEN 'family' THEN 4
    ELSE 0 END,
  comment_count = CASE username
    WHEN 'owner' THEN 120 WHEN 'superadmin' THEN 100 WHEN 'admin' THEN 80
    WHEN 'editor' THEN 60 WHEN 'moderator' THEN 50 WHEN 'expert' THEN 40
    WHEN 'educator' THEN 30 WHEN 'journalist' THEN 28
    WHEN 'premium' THEN 15 WHEN 'user' THEN 8 WHEN 'family' THEN 3
    ELSE 0 END,
  streak_current = CASE username
    WHEN 'owner' THEN 45 WHEN 'superadmin' THEN 30 WHEN 'admin' THEN 21
    WHEN 'editor' THEN 14 WHEN 'moderator' THEN 9 WHEN 'expert' THEN 7
    WHEN 'educator' THEN 5 WHEN 'journalist' THEN 4
    WHEN 'premium' THEN 3 WHEN 'user' THEN 2 WHEN 'family' THEN 1
    ELSE 0 END,
  streak_best = CASE username
    WHEN 'owner' THEN 90 WHEN 'superadmin' THEN 60 WHEN 'admin' THEN 40
    WHEN 'editor' THEN 30 WHEN 'moderator' THEN 20 WHEN 'expert' THEN 15
    WHEN 'educator' THEN 12 WHEN 'journalist' THEN 10
    WHEN 'premium' THEN 7 WHEN 'user' THEN 5 WHEN 'family' THEN 2
    ELSE 0 END
WHERE email LIKE '%@vp.test';

-- Per-category scores so the category tabs have data
INSERT INTO public.category_scores
  (user_id, category_id, score, articles_read, quizzes_correct, last_activity_at)
SELECT
  u.id,
  c.id,
  GREATEST(5, floor(u.verity_score::float / 8 * (0.5 + random()))::int),
  floor(random() * (u.articles_read_count / 8.0 + 1))::int,
  floor(random() * (u.quizzes_completed_count / 8.0 + 1))::int,
  now() - (random() * interval '14 days')
FROM public.users u
CROSS JOIN public.categories c
WHERE u.email LIKE '%@vp.test'
  AND u.verity_score > 0
  AND c.is_active = true
  AND c.deleted_at IS NULL
  AND c.parent_id IS NULL
  AND random() < 0.6
ON CONFLICT DO NOTHING;

