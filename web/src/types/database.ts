export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_code_uses: {
        Row: {
          access_code_id: string
          code_slot: number | null
          code_tier: string | null
          country_code: string | null
          created_at: string
          device_type: string | null
          http_referer: string | null
          id: string
          ip_address: unknown
          landing_url: string | null
          metadata: Json
          referrer_user_id: string | null
          reward_granted_at: string | null
          reward_kind: string | null
          reward_value: number | null
          signup_session_id: string | null
          used_by_user_id: string
          user_agent: string | null
        }
        Insert: {
          access_code_id: string
          code_slot?: number | null
          code_tier?: string | null
          country_code?: string | null
          created_at?: string
          device_type?: string | null
          http_referer?: string | null
          id?: string
          ip_address?: unknown
          landing_url?: string | null
          metadata?: Json
          referrer_user_id?: string | null
          reward_granted_at?: string | null
          reward_kind?: string | null
          reward_value?: number | null
          signup_session_id?: string | null
          used_by_user_id: string
          user_agent?: string | null
        }
        Update: {
          access_code_id?: string
          code_slot?: number | null
          code_tier?: string | null
          country_code?: string | null
          created_at?: string
          device_type?: string | null
          http_referer?: string | null
          id?: string
          ip_address?: unknown
          landing_url?: string | null
          metadata?: Json
          referrer_user_id?: string | null
          reward_granted_at?: string | null
          reward_kind?: string | null
          reward_value?: number | null
          signup_session_id?: string | null
          used_by_user_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_code_uses_access_code_id_fkey"
            columns: ["access_code_id"]
            isOneToOne: false
            referencedRelation: "access_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_code_uses_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_code_uses_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_code_uses_referrer_user_id_fkey"
            columns: ["referrer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_code_uses_used_by_user_id_fkey"
            columns: ["used_by_user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_code_uses_used_by_user_id_fkey"
            columns: ["used_by_user_id"]
            isOneToOne: true
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_code_uses_used_by_user_id_fkey"
            columns: ["used_by_user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      access_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          current_uses: number
          description: string | null
          disabled_at: string | null
          expires_at: string | null
          grants_plan_id: string | null
          grants_role_id: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          metadata: Json
          owner_user_id: string | null
          slot: number | null
          tier: string | null
          type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          disabled_at?: string | null
          expires_at?: string | null
          grants_plan_id?: string | null
          grants_role_id?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          metadata?: Json
          owner_user_id?: string | null
          slot?: number | null
          tier?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          disabled_at?: string | null
          expires_at?: string | null
          grants_plan_id?: string | null
          grants_role_id?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          metadata?: Json
          owner_user_id?: string | null
          slot?: number | null
          tier?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_codes_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_codes_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_codes_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_access_codes_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_access_codes_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_access_codes_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_access_codes_grants_plan_id"
            columns: ["grants_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_access_codes_grants_role_id"
            columns: ["grants_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_requests: {
        Row: {
          access_code_id: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          email: string
          email_confirm_expires_at: string | null
          email_confirm_token: string | null
          email_confirmed_at: string | null
          id: string
          invite_sent_at: string | null
          ip_address: string | null
          metadata: Json
          name: string | null
          reason: string | null
          referral_source: string | null
          status: string
          type: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          access_code_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email: string
          email_confirm_expires_at?: string | null
          email_confirm_token?: string | null
          email_confirmed_at?: string | null
          id?: string
          invite_sent_at?: string | null
          ip_address?: string | null
          metadata?: Json
          name?: string | null
          reason?: string | null
          referral_source?: string | null
          status?: string
          type: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          access_code_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string
          email_confirm_expires_at?: string | null
          email_confirm_token?: string | null
          email_confirmed_at?: string | null
          id?: string
          invite_sent_at?: string | null
          ip_address?: string | null
          metadata?: Json
          name?: string | null
          reason?: string | null
          referral_source?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_access_requests_access_code_id"
            columns: ["access_code_id"]
            isOneToOne: false
            referencedRelation: "access_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_access_requests_approved_by"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_access_requests_approved_by"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_access_requests_approved_by"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      achievements: {
        Row: {
          category: string
          created_at: string
          criteria: Json
          description: string
          icon_name: string | null
          icon_url: string | null
          id: string
          is_active: boolean
          is_kids_eligible: boolean
          is_secret: boolean
          key: string
          name: string
          points_reward: number
          rarity: string
          sort_order: number
          total_earned_count: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          criteria: Json
          description: string
          icon_name?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_kids_eligible?: boolean
          is_secret?: boolean
          key: string
          name: string
          points_reward?: number
          rarity?: string
          sort_order?: number
          total_earned_count?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          criteria?: Json
          description?: string
          icon_name?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_kids_eligible?: boolean
          is_secret?: boolean
          key?: string
          name?: string
          points_reward?: number
          rarity?: string
          sort_order?: number
          total_earned_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      ad_campaigns: {
        Row: {
          advertiser_contact: string | null
          advertiser_name: string
          campaign_type: string
          contract_url: string | null
          created_at: string
          created_by: string | null
          daily_budget_cents: number | null
          end_date: string | null
          id: string
          metadata: Json | null
          name: string
          notes: string | null
          objective: string | null
          pricing_model: string
          rate_cents: number | null
          rev_share_percent: number | null
          spent_cents: number
          start_date: string
          status: string
          total_budget_cents: number | null
          total_clicks: number
          total_conversions: number
          total_impressions: number
          updated_at: string
        }
        Insert: {
          advertiser_contact?: string | null
          advertiser_name: string
          campaign_type: string
          contract_url?: string | null
          created_at?: string
          created_by?: string | null
          daily_budget_cents?: number | null
          end_date?: string | null
          id?: string
          metadata?: Json | null
          name: string
          notes?: string | null
          objective?: string | null
          pricing_model: string
          rate_cents?: number | null
          rev_share_percent?: number | null
          spent_cents?: number
          start_date: string
          status?: string
          total_budget_cents?: number | null
          total_clicks?: number
          total_conversions?: number
          total_impressions?: number
          updated_at?: string
        }
        Update: {
          advertiser_contact?: string | null
          advertiser_name?: string
          campaign_type?: string
          contract_url?: string | null
          created_at?: string
          created_by?: string | null
          daily_budget_cents?: number | null
          end_date?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          notes?: string | null
          objective?: string | null
          pricing_model?: string
          rate_cents?: number | null
          rev_share_percent?: number | null
          spent_cents?: number
          start_date?: string
          status?: string
          total_budget_cents?: number | null
          total_clicks?: number
          total_conversions?: number
          total_impressions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_ad_campaigns_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_campaigns_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_campaigns_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_daily_stats: {
        Row: {
          ad_unit_id: string | null
          bot_impressions: number
          campaign_id: string | null
          clicks: number
          conversions: number
          created_at: string
          ctr: number
          date: string
          ecpm_cents: number
          fill_rate: number
          id: string
          impressions: number
          placement_id: string
          platform: string
          revenue_cents: number
          unique_clicks: number
          unique_impressions: number
          updated_at: string
          viewable_impressions: number
        }
        Insert: {
          ad_unit_id?: string | null
          bot_impressions?: number
          campaign_id?: string | null
          clicks?: number
          conversions?: number
          created_at?: string
          ctr?: number
          date: string
          ecpm_cents?: number
          fill_rate?: number
          id?: string
          impressions?: number
          placement_id: string
          platform?: string
          revenue_cents?: number
          unique_clicks?: number
          unique_impressions?: number
          updated_at?: string
          viewable_impressions?: number
        }
        Update: {
          ad_unit_id?: string | null
          bot_impressions?: number
          campaign_id?: string | null
          clicks?: number
          conversions?: number
          created_at?: string
          ctr?: number
          date?: string
          ecpm_cents?: number
          fill_rate?: number
          id?: string
          impressions?: number
          placement_id?: string
          platform?: string
          revenue_cents?: number
          unique_clicks?: number
          unique_impressions?: number
          updated_at?: string
          viewable_impressions?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_ad_daily_stats_ad_unit_id"
            columns: ["ad_unit_id"]
            isOneToOne: false
            referencedRelation: "ad_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_daily_stats_campaign_id"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_daily_stats_placement_id"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "ad_placements"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_impressions: {
        Row: {
          ad_network: string | null
          ad_unit_id: string
          article_id: string | null
          bid_cents: number | null
          campaign_id: string | null
          clicked_at: string | null
          country_code: string | null
          created_at: string
          device_type: string | null
          fraud_reason: string | null
          id: string
          ip_address: string | null
          is_bot: boolean
          is_clicked: boolean
          is_viewable: boolean
          metadata: Json | null
          page: string
          placement_id: string
          platform: string | null
          position: string
          revenue_cents: number
          session_id: string | null
          user_agent: string | null
          user_id: string | null
          viewable_seconds: number | null
        }
        Insert: {
          ad_network?: string | null
          ad_unit_id: string
          article_id?: string | null
          bid_cents?: number | null
          campaign_id?: string | null
          clicked_at?: string | null
          country_code?: string | null
          created_at?: string
          device_type?: string | null
          fraud_reason?: string | null
          id?: string
          ip_address?: string | null
          is_bot?: boolean
          is_clicked?: boolean
          is_viewable?: boolean
          metadata?: Json | null
          page: string
          placement_id: string
          platform?: string | null
          position: string
          revenue_cents?: number
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          viewable_seconds?: number | null
        }
        Update: {
          ad_network?: string | null
          ad_unit_id?: string
          article_id?: string | null
          bid_cents?: number | null
          campaign_id?: string | null
          clicked_at?: string | null
          country_code?: string | null
          created_at?: string
          device_type?: string | null
          fraud_reason?: string | null
          id?: string
          ip_address?: string | null
          is_bot?: boolean
          is_clicked?: boolean
          is_viewable?: boolean
          metadata?: Json | null
          page?: string
          placement_id?: string
          platform?: string | null
          position?: string
          revenue_cents?: number
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          viewable_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ad_impressions_ad_unit_id"
            columns: ["ad_unit_id"]
            isOneToOne: false
            referencedRelation: "ad_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_impressions_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_impressions_campaign_id"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_impressions_placement_id"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "ad_placements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_impressions_session_id"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "user_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_impressions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_impressions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_impressions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_placements: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          fallback_image_url: string | null
          fallback_url: string | null
          height: number | null
          hidden_for_tiers: string[]
          id: string
          is_active: boolean
          is_kids_safe: boolean
          max_ads_per_page: number
          metadata: Json | null
          min_content_before: number | null
          name: string
          page: string
          placement_type: string
          platform: string
          position: string
          priority: number
          reduced_for_tiers: string[]
          refresh_interval_seconds: number | null
          updated_at: string
          width: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          fallback_image_url?: string | null
          fallback_url?: string | null
          height?: number | null
          hidden_for_tiers?: string[]
          id?: string
          is_active?: boolean
          is_kids_safe?: boolean
          max_ads_per_page?: number
          metadata?: Json | null
          min_content_before?: number | null
          name: string
          page: string
          placement_type: string
          platform?: string
          position: string
          priority?: number
          reduced_for_tiers?: string[]
          refresh_interval_seconds?: number | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          fallback_image_url?: string | null
          fallback_url?: string | null
          height?: number | null
          hidden_for_tiers?: string[]
          id?: string
          is_active?: boolean
          is_kids_safe?: boolean
          max_ads_per_page?: number
          metadata?: Json | null
          min_content_before?: number | null
          name?: string
          page?: string
          placement_type?: string
          platform?: string
          position?: string
          priority?: number
          reduced_for_tiers?: string[]
          refresh_interval_seconds?: number | null
          updated_at?: string
          width?: number | null
        }
        Relationships: []
      }
      ad_units: {
        Row: {
          ad_format: string
          ad_network: string
          ad_network_unit_id: string | null
          advertiser_name: string | null
          alt_text: string | null
          approval_status: string
          approved_by: string | null
          bid_amount_cents: number | null
          bid_type: string | null
          campaign_id: string | null
          click_url: string | null
          created_at: string
          creative_html: string | null
          creative_url: string | null
          cta_text: string | null
          daily_budget_cents: number | null
          end_date: string | null
          frequency_cap_per_session: number | null
          frequency_cap_per_user: number | null
          id: string
          is_active: boolean
          is_nsfw: boolean
          metadata: Json | null
          name: string
          placement_id: string
          start_date: string | null
          targeting_categories: Json | null
          targeting_cohorts: Json | null
          targeting_countries: Json | null
          targeting_plans: Json | null
          targeting_platforms: Json | null
          total_budget_cents: number | null
          updated_at: string
          weight: number
        }
        Insert: {
          ad_format: string
          ad_network: string
          ad_network_unit_id?: string | null
          advertiser_name?: string | null
          alt_text?: string | null
          approval_status?: string
          approved_by?: string | null
          bid_amount_cents?: number | null
          bid_type?: string | null
          campaign_id?: string | null
          click_url?: string | null
          created_at?: string
          creative_html?: string | null
          creative_url?: string | null
          cta_text?: string | null
          daily_budget_cents?: number | null
          end_date?: string | null
          frequency_cap_per_session?: number | null
          frequency_cap_per_user?: number | null
          id?: string
          is_active?: boolean
          is_nsfw?: boolean
          metadata?: Json | null
          name: string
          placement_id: string
          start_date?: string | null
          targeting_categories?: Json | null
          targeting_cohorts?: Json | null
          targeting_countries?: Json | null
          targeting_plans?: Json | null
          targeting_platforms?: Json | null
          total_budget_cents?: number | null
          updated_at?: string
          weight?: number
        }
        Update: {
          ad_format?: string
          ad_network?: string
          ad_network_unit_id?: string | null
          advertiser_name?: string | null
          alt_text?: string | null
          approval_status?: string
          approved_by?: string | null
          bid_amount_cents?: number | null
          bid_type?: string | null
          campaign_id?: string | null
          click_url?: string | null
          created_at?: string
          creative_html?: string | null
          creative_url?: string | null
          cta_text?: string | null
          daily_budget_cents?: number | null
          end_date?: string | null
          frequency_cap_per_session?: number | null
          frequency_cap_per_user?: number | null
          id?: string
          is_active?: boolean
          is_nsfw?: boolean
          metadata?: Json | null
          name?: string
          placement_id?: string
          start_date?: string | null
          targeting_categories?: Json | null
          targeting_cohorts?: Json | null
          targeting_countries?: Json | null
          targeting_plans?: Json | null
          targeting_platforms?: Json | null
          total_budget_cents?: number | null
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_ad_units_approved_by"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_units_approved_by"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_units_approved_by"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_units_campaign_id"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ad_units_placement_id"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "ad_placements"
            referencedColumns: ["id"]
          },
        ]
      }
      add_kid_idempotency: {
        Row: {
          body: Json
          completed_at: string | null
          created_at: string
          idempotency_key: string
          status: number
          user_id: string
        }
        Insert: {
          body?: Json
          completed_at?: string | null
          created_at?: string
          idempotency_key: string
          status?: number
          user_id: string
        }
        Update: {
          body?: Json
          completed_at?: string | null
          created_at?: string
          idempotency_key?: string
          status?: number
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          ip: unknown
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          target_id: string | null
          target_table: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          ip?: unknown
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          ip?: unknown
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_admin_audit_log_actor"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_admin_audit_log_actor"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_admin_audit_log_actor"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_models: {
        Row: {
          created_at: string
          display_name: string
          id: string
          input_price_per_1m_tokens: number
          is_active: boolean
          model: string
          output_price_per_1m_tokens: number
          provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          input_price_per_1m_tokens: number
          is_active?: boolean
          model: string
          output_price_per_1m_tokens: number
          provider: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          input_price_per_1m_tokens?: number
          is_active?: boolean
          model?: string
          output_price_per_1m_tokens?: number
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_prompt_overrides: {
        Row: {
          additional_instructions: string
          audience: string
          category_id: string | null
          created_at: string
          id: string
          is_active: boolean
          step_name: string
          subcategory_id: string | null
          updated_at: string
        }
        Insert: {
          additional_instructions: string
          audience: string
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          step_name: string
          subcategory_id?: string | null
          updated_at?: string
        }
        Update: {
          additional_instructions?: string
          audience?: string
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          step_name?: string
          subcategory_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_overrides_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_presets: {
        Row: {
          audience: string
          body: string
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          version: number
        }
        Insert: {
          audience?: string
          body: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Update: {
          audience?: string
          body?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_presets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_preferences: {
        Row: {
          alert_type: string
          channel_email: boolean
          channel_in_app: boolean
          channel_push: boolean
          channel_sms: boolean
          created_at: string
          frequency: string | null
          id: string
          is_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_type: string
          channel_email?: boolean
          channel_in_app?: boolean
          channel_push?: boolean
          channel_sms?: boolean
          created_at?: string
          frequency?: string | null
          id?: string
          is_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_type?: string
          channel_email?: boolean
          channel_in_app?: boolean
          channel_push?: boolean
          channel_sms?: boolean
          created_at?: string
          frequency?: string | null
          id?: string
          is_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_alert_preferences_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_alert_preferences_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_alert_preferences_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          app_version: string | null
          article_id: string | null
          city: string | null
          country_code: string | null
          created_at: string
          deep_link_id: string | null
          device_model: string | null
          device_type: string | null
          duration_ms: number | null
          element_id: string | null
          element_text: string | null
          event_category: string | null
          event_name: string
          event_properties: Json
          id: string
          ip_address: string | null
          is_first_time: boolean
          kid_profile_id: string | null
          latitude: number | null
          longitude: number | null
          os_version: string | null
          platform: string | null
          referrer: string | null
          screen_name: string | null
          session_id: string | null
          user_id: string | null
          value_numeric: number | null
          value_string: string | null
        }
        Insert: {
          app_version?: string | null
          article_id?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          deep_link_id?: string | null
          device_model?: string | null
          device_type?: string | null
          duration_ms?: number | null
          element_id?: string | null
          element_text?: string | null
          event_category?: string | null
          event_name: string
          event_properties?: Json
          id?: string
          ip_address?: string | null
          is_first_time?: boolean
          kid_profile_id?: string | null
          latitude?: number | null
          longitude?: number | null
          os_version?: string | null
          platform?: string | null
          referrer?: string | null
          screen_name?: string | null
          session_id?: string | null
          user_id?: string | null
          value_numeric?: number | null
          value_string?: string | null
        }
        Update: {
          app_version?: string | null
          article_id?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          deep_link_id?: string | null
          device_model?: string | null
          device_type?: string | null
          duration_ms?: number | null
          element_id?: string | null
          element_text?: string | null
          event_category?: string | null
          event_name?: string
          event_properties?: Json
          id?: string
          ip_address?: string | null
          is_first_time?: boolean
          kid_profile_id?: string | null
          latitude?: number | null
          longitude?: number | null
          os_version?: string | null
          platform?: string | null
          referrer?: string | null
          screen_name?: string | null
          session_id?: string | null
          user_id?: string | null
          value_numeric?: number | null
          value_string?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_analytics_events_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_analytics_events_kid_profile_id"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "kid_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_analytics_events_session_id"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "user_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_analytics_events_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_analytics_events_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_analytics_events_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          country_codes: string[] | null
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          key: string
          max_app_version: string | null
          min_app_version: string | null
          min_os_version: string | null
          platform: string | null
          priority: number
          updated_at: string
          updated_by: string | null
          value: string
          value_type: string
        }
        Insert: {
          country_codes?: string[] | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key: string
          max_app_version?: string | null
          min_app_version?: string | null
          min_os_version?: string | null
          platform?: string | null
          priority?: number
          updated_at?: string
          updated_by?: string | null
          value: string
          value_type?: string
        }
        Update: {
          country_codes?: string[] | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key?: string
          max_app_version?: string | null
          min_app_version?: string | null
          min_os_version?: string | null
          platform?: string | null
          priority?: number
          updated_at?: string
          updated_by?: string | null
          value?: string
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_app_config_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_app_config_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_app_config_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      article_relations: {
        Row: {
          article_id: string
          created_at: string
          id: string
          related_article_id: string
          relation_type: string
          sort_order: number
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          related_article_id: string
          relation_type?: string
          sort_order?: number
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          related_article_id?: string
          relation_type?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_article_relations_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_article_relations_related_article_id"
            columns: ["related_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          age_band: string | null
          ai_model: string | null
          ai_prompt_id: string | null
          ai_provider: string | null
          author_id: string | null
          body: string
          body_html: string | null
          bookmark_count: number
          category_id: string
          cluster_id: string | null
          comment_count: number
          content_flags: Json
          cover_image_alt: string | null
          cover_image_credit: string | null
          cover_image_url: string | null
          created_at: string
          deleted_at: string | null
          excerpt: string | null
          external_id: string | null
          generated_at: string | null
          generated_by_model: string | null
          generated_by_provider: string | null
          hero_pick_for_date: string | null
          hero_pick_set_at: string | null
          hero_pick_set_by: string | null
          id: string
          is_ai_generated: boolean
          is_breaking: boolean
          is_developing: boolean
          is_featured: boolean
          is_kids_safe: boolean
          is_opinion: boolean
          is_verified: boolean
          kids_summary: string | null
          language: string
          metadata: Json
          moderation_notes: string | null
          moderation_status: string
          needs_manual_review: boolean
          nsfw_score: number | null
          plagiarism_status: string | null
          prompt_fingerprint: string | null
          publish_at: string | null
          published_at: string | null
          push_sent: boolean
          reading_time_minutes: number | null
          retraction_reason: string | null
          search_tsv: unknown
          search_vector: unknown
          seo_description: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          share_count: number
          slug: string
          source_feed_id: string | null
          source_url: string | null
          sponsor_id: string | null
          status: string
          subcategory_id: string | null
          subtitle: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          unpublished_at: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          view_count: number
          visibility: string
          word_count: number | null
        }
        Insert: {
          age_band?: string | null
          ai_model?: string | null
          ai_prompt_id?: string | null
          ai_provider?: string | null
          author_id?: string | null
          body: string
          body_html?: string | null
          bookmark_count?: number
          category_id: string
          cluster_id?: string | null
          comment_count?: number
          content_flags?: Json
          cover_image_alt?: string | null
          cover_image_credit?: string | null
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          excerpt?: string | null
          external_id?: string | null
          generated_at?: string | null
          generated_by_model?: string | null
          generated_by_provider?: string | null
          hero_pick_for_date?: string | null
          hero_pick_set_at?: string | null
          hero_pick_set_by?: string | null
          id?: string
          is_ai_generated?: boolean
          is_breaking?: boolean
          is_developing?: boolean
          is_featured?: boolean
          is_kids_safe?: boolean
          is_opinion?: boolean
          is_verified?: boolean
          kids_summary?: string | null
          language?: string
          metadata?: Json
          moderation_notes?: string | null
          moderation_status?: string
          needs_manual_review?: boolean
          nsfw_score?: number | null
          plagiarism_status?: string | null
          prompt_fingerprint?: string | null
          publish_at?: string | null
          published_at?: string | null
          push_sent?: boolean
          reading_time_minutes?: number | null
          retraction_reason?: string | null
          search_tsv?: unknown
          search_vector?: unknown
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          share_count?: number
          slug: string
          source_feed_id?: string | null
          source_url?: string | null
          sponsor_id?: string | null
          status?: string
          subcategory_id?: string | null
          subtitle?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          unpublished_at?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          view_count?: number
          visibility?: string
          word_count?: number | null
        }
        Update: {
          age_band?: string | null
          ai_model?: string | null
          ai_prompt_id?: string | null
          ai_provider?: string | null
          author_id?: string | null
          body?: string
          body_html?: string | null
          bookmark_count?: number
          category_id?: string
          cluster_id?: string | null
          comment_count?: number
          content_flags?: Json
          cover_image_alt?: string | null
          cover_image_credit?: string | null
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          excerpt?: string | null
          external_id?: string | null
          generated_at?: string | null
          generated_by_model?: string | null
          generated_by_provider?: string | null
          hero_pick_for_date?: string | null
          hero_pick_set_at?: string | null
          hero_pick_set_by?: string | null
          id?: string
          is_ai_generated?: boolean
          is_breaking?: boolean
          is_developing?: boolean
          is_featured?: boolean
          is_kids_safe?: boolean
          is_opinion?: boolean
          is_verified?: boolean
          kids_summary?: string | null
          language?: string
          metadata?: Json
          moderation_notes?: string | null
          moderation_status?: string
          needs_manual_review?: boolean
          nsfw_score?: number | null
          plagiarism_status?: string | null
          prompt_fingerprint?: string | null
          publish_at?: string | null
          published_at?: string | null
          push_sent?: boolean
          reading_time_minutes?: number | null
          retraction_reason?: string | null
          search_tsv?: unknown
          search_vector?: unknown
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          share_count?: number
          slug?: string
          source_feed_id?: string | null
          source_url?: string | null
          sponsor_id?: string | null
          status?: string
          subcategory_id?: string | null
          subtitle?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          unpublished_at?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          view_count?: number
          visibility?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_hero_pick_set_by_fkey"
            columns: ["hero_pick_set_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_hero_pick_set_by_fkey"
            columns: ["hero_pick_set_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_hero_pick_set_by_fkey"
            columns: ["hero_pick_set_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_articles_author_id"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_articles_author_id"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_articles_author_id"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_articles_category_id"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_articles_cluster_id"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "feed_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_articles_cluster_id"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "v_cluster_lifecycle"
            referencedColumns: ["cluster_id"]
          },
          {
            foreignKeyName: "fk_articles_source_feed_id"
            columns: ["source_feed_id"]
            isOneToOne: false
            referencedRelation: "feeds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_articles_sponsor_id"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_articles_verified_by"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_articles_verified_by"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_articles_verified_by"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          description: string | null
          device_info: string | null
          id: string
          ip_address: string | null
          metadata: Json
          new_values: Json | null
          old_values: Json | null
          request_id: string | null
          session_id: string | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          description?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
          request_id?: string | null
          session_id?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          description?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
          request_id?: string | null
          session_id?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_audit_log_actor_id"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_audit_log_actor_id"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_audit_log_actor_id"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_audit_log_session_id"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_providers: {
        Row: {
          access_token: string | null
          created_at: string
          id: string
          id_token: string | null
          is_primary: boolean
          last_used_at: string | null
          linked_at: string
          provider: string
          provider_avatar_url: string | null
          provider_display_name: string | null
          provider_email: string | null
          provider_user_id: string
          raw_profile: Json | null
          refresh_token: string | null
          scopes: string[] | null
          token_expires_at: string | null
          unlinked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          id?: string
          id_token?: string | null
          is_primary?: boolean
          last_used_at?: string | null
          linked_at?: string
          provider: string
          provider_avatar_url?: string | null
          provider_display_name?: string | null
          provider_email?: string | null
          provider_user_id: string
          raw_profile?: Json | null
          refresh_token?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          unlinked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          id?: string
          id_token?: string | null
          is_primary?: boolean
          last_used_at?: string | null
          linked_at?: string
          provider?: string
          provider_avatar_url?: string | null
          provider_display_name?: string | null
          provider_email?: string | null
          provider_user_id?: string
          raw_profile?: Json | null
          refresh_token?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          unlinked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_auth_providers_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_auth_providers_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_auth_providers_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_blocked_users_blocked_id"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_blocked_users_blocked_id"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_blocked_users_blocked_id"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_blocked_users_blocker_id"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_blocked_users_blocker_id"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_blocked_users_blocker_id"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_words: {
        Row: {
          action: string
          added_by: string | null
          applies_to: string[]
          created_at: string
          id: string
          is_active: boolean
          is_regex: boolean
          language: string
          notes: string | null
          severity: string
          updated_at: string
          word: string
        }
        Insert: {
          action?: string
          added_by?: string | null
          applies_to?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          is_regex?: boolean
          language?: string
          notes?: string | null
          severity?: string
          updated_at?: string
          word: string
        }
        Update: {
          action?: string
          added_by?: string | null
          applies_to?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          is_regex?: boolean
          language?: string
          notes?: string | null
          severity?: string
          updated_at?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_blocked_words_added_by"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_blocked_words_added_by"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_blocked_words_added_by"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmark_collections: {
        Row: {
          bookmark_count: number
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bookmark_count?: number
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bookmark_count?: number
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_bookmark_collections_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bookmark_collections_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bookmark_collections_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          article_id: string
          collection_id: string | null
          collection_name: string | null
          created_at: string
          id: string
          notes: string | null
          sort_order: number
          user_id: string
        }
        Insert: {
          article_id: string
          collection_id?: string | null
          collection_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          sort_order?: number
          user_id: string
        }
        Update: {
          article_id?: string
          collection_id?: string | null
          collection_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_bookmarks_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bookmarks_collection_id"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "bookmark_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bookmarks_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bookmarks_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bookmarks_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          a_b_test: Json | null
          action_url: string | null
          body: string | null
          body_html: string | null
          bounced_count: number
          channel: string
          clicked_count: number
          cohort_id: string | null
          completed_at: string | null
          conversion_count: number
          created_at: string
          created_by: string | null
          delivered_count: number
          description: string | null
          email_template_id: string | null
          id: string
          image_url: string | null
          metadata: Json
          name: string
          opened_count: number
          scheduled_at: string | null
          sent_count: number
          sponsor_id: string | null
          started_at: string | null
          status: string
          subject: string | null
          target_plan_tiers: string[] | null
          target_platforms: string[] | null
          target_user_count: number | null
          title: string | null
          type: string
          unsubscribed_count: number
          updated_at: string
        }
        Insert: {
          a_b_test?: Json | null
          action_url?: string | null
          body?: string | null
          body_html?: string | null
          bounced_count?: number
          channel: string
          clicked_count?: number
          cohort_id?: string | null
          completed_at?: string | null
          conversion_count?: number
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
          email_template_id?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json
          name: string
          opened_count?: number
          scheduled_at?: string | null
          sent_count?: number
          sponsor_id?: string | null
          started_at?: string | null
          status?: string
          subject?: string | null
          target_plan_tiers?: string[] | null
          target_platforms?: string[] | null
          target_user_count?: number | null
          title?: string | null
          type: string
          unsubscribed_count?: number
          updated_at?: string
        }
        Update: {
          a_b_test?: Json | null
          action_url?: string | null
          body?: string | null
          body_html?: string | null
          bounced_count?: number
          channel?: string
          clicked_count?: number
          cohort_id?: string | null
          completed_at?: string | null
          conversion_count?: number
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
          email_template_id?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json
          name?: string
          opened_count?: number
          scheduled_at?: string | null
          sent_count?: number
          sponsor_id?: string | null
          started_at?: string | null
          status?: string
          subject?: string | null
          target_plan_tiers?: string[] | null
          target_platforms?: string[] | null
          target_user_count?: number | null
          title?: string | null
          type?: string
          unsubscribed_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_campaigns_cohort_id"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_campaigns_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_campaigns_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_campaigns_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_campaigns_email_template_id"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_campaigns_sponsor_id"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          article_count: number
          category_density: Json | null
          color_hex: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          icon_name: string | null
          icon_url: string | null
          id: string
          is_active: boolean
          is_kids_safe: boolean
          is_premium: boolean
          metadata: Json
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          article_count?: number
          category_density?: Json | null
          color_hex?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon_name?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_kids_safe?: boolean
          is_premium?: boolean
          metadata?: Json
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          article_count?: number
          category_density?: Json | null
          color_hex?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          icon_name?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_kids_safe?: boolean
          is_premium?: boolean
          metadata?: Json
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_categories_parent_id"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_scores: {
        Row: {
          articles_read: number
          category_id: string
          created_at: string
          id: string
          kid_profile_id: string | null
          last_activity_at: string | null
          quizzes_correct: number
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          articles_read?: number
          category_id: string
          created_at?: string
          id?: string
          kid_profile_id?: string | null
          last_activity_at?: string | null
          quizzes_correct?: number
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          articles_read?: number
          category_id?: string
          created_at?: string
          id?: string
          kid_profile_id?: string | null
          last_activity_at?: string | null
          quizzes_correct?: number
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_category_scores_category_id"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_category_scores_kid_profile_id"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "kid_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_category_scores_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_category_scores_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_category_scores_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      category_supervisors: {
        Row: {
          category_id: string
          created_at: string
          flags_submitted: number
          id: string
          is_active: boolean
          opted_in_at: string
          opted_out_at: string | null
          reports_submitted: number
          updated_at: string
          user_id: string
          verity_score_at_grant: number
        }
        Insert: {
          category_id: string
          created_at?: string
          flags_submitted?: number
          id?: string
          is_active?: boolean
          opted_in_at?: string
          opted_out_at?: string | null
          reports_submitted?: number
          updated_at?: string
          user_id: string
          verity_score_at_grant: number
        }
        Update: {
          category_id?: string
          created_at?: string
          flags_submitted?: number
          id?: string
          is_active?: boolean
          opted_in_at?: string
          opted_out_at?: string | null
          reports_submitted?: number
          updated_at?: string
          user_id?: string
          verity_score_at_grant?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_category_supervisors_category_id"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_category_supervisors_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_category_supervisors_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_category_supervisors_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          created_at: string
          created_by: string | null
          criteria: Json
          description: string | null
          id: string
          is_active: boolean
          last_computed_at: string | null
          metadata: Json
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          last_computed_at?: string | null
          metadata?: Json
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          last_computed_at?: string | null
          metadata?: Json
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_cohorts_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cohorts_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cohorts_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_context_tags: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          tag_type: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          tag_type?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          tag_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_comment_context_tags_comment_id"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comment_context_tags_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comment_context_tags_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comment_context_tags_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_votes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
          vote_type: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_comment_votes_comment_id"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comment_votes_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comment_votes_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comment_votes_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          ai_sentiment: string | null
          ai_tag: string | null
          ai_tag_confidence: number | null
          ai_toxicity_score: number | null
          article_id: string
          body: string
          body_html: string | null
          context_pinned_at: string | null
          context_tag_count: number
          created_at: string
          deleted_at: string | null
          downvote_count: number
          edit_count: number
          edited_at: string | null
          expert_question_status: string | null
          expert_question_target_id: string | null
          expert_question_target_type: string | null
          id: string
          ip_address: string | null
          is_author_reply: boolean
          is_context_pinned: boolean
          is_edited: boolean
          is_expert_question: boolean
          is_expert_reply: boolean
          is_pinned: boolean
          mentions: Json
          metadata: Json
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          parent_id: string | null
          reply_count: number
          root_id: string | null
          status: string
          thread_depth: number
          updated_at: string
          upvote_count: number
          user_agent: string | null
          user_id: string
        }
        Insert: {
          ai_sentiment?: string | null
          ai_tag?: string | null
          ai_tag_confidence?: number | null
          ai_toxicity_score?: number | null
          article_id: string
          body: string
          body_html?: string | null
          context_pinned_at?: string | null
          context_tag_count?: number
          created_at?: string
          deleted_at?: string | null
          downvote_count?: number
          edit_count?: number
          edited_at?: string | null
          expert_question_status?: string | null
          expert_question_target_id?: string | null
          expert_question_target_type?: string | null
          id?: string
          ip_address?: string | null
          is_author_reply?: boolean
          is_context_pinned?: boolean
          is_edited?: boolean
          is_expert_question?: boolean
          is_expert_reply?: boolean
          is_pinned?: boolean
          mentions?: Json
          metadata?: Json
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          parent_id?: string | null
          reply_count?: number
          root_id?: string | null
          status?: string
          thread_depth?: number
          updated_at?: string
          upvote_count?: number
          user_agent?: string | null
          user_id: string
        }
        Update: {
          ai_sentiment?: string | null
          ai_tag?: string | null
          ai_tag_confidence?: number | null
          ai_toxicity_score?: number | null
          article_id?: string
          body?: string
          body_html?: string | null
          context_pinned_at?: string | null
          context_tag_count?: number
          created_at?: string
          deleted_at?: string | null
          downvote_count?: number
          edit_count?: number
          edited_at?: string | null
          expert_question_status?: string | null
          expert_question_target_id?: string | null
          expert_question_target_type?: string | null
          id?: string
          ip_address?: string | null
          is_author_reply?: boolean
          is_context_pinned?: boolean
          is_edited?: boolean
          is_expert_question?: boolean
          is_expert_reply?: boolean
          is_pinned?: boolean
          mentions?: Json
          metadata?: Json
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          parent_id?: string | null
          reply_count?: number
          root_id?: string | null
          status?: string
          thread_depth?: number
          updated_at?: string
          upvote_count?: number
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_comments_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comments_moderated_by"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comments_moderated_by"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comments_moderated_by"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comments_parent_id"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comments_root_id"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comments_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comments_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comments_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_versions: {
        Row: {
          effective_at: string
          is_current: boolean
          superseded_at: string | null
          text_md: string
          version: string
        }
        Insert: {
          effective_at?: string
          is_current?: boolean
          superseded_at?: string | null
          text_md: string
          version: string
        }
        Update: {
          effective_at?: string
          is_current?: boolean
          superseded_at?: string | null
          text_md?: string
          version?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          is_muted: boolean
          joined_at: string
          last_read_at: string | null
          left_at: string | null
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_conversation_participants_conversation_id"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conversation_participants_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conversation_participants_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conversation_participants_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          last_message_at: string | null
          last_message_id: string | null
          last_message_preview: string | null
          metadata: Json
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          last_message_at?: string | null
          last_message_id?: string | null
          last_message_preview?: string | null
          metadata?: Json
          title?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          last_message_at?: string | null
          last_message_id?: string | null
          last_message_preview?: string | null
          metadata?: Json
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_conversations_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conversations_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conversations_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_conversations_last_message_id"
            columns: ["last_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      data_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          deadline_at: string | null
          download_expires_at: string | null
          download_url: string | null
          file_size_bytes: number | null
          id: string
          identity_verified: boolean
          identity_verified_at: string | null
          identity_verified_by: string | null
          legal_hold: boolean
          metadata: Json
          notes: string | null
          processed_by: string | null
          processing_started_at: string | null
          reason: string | null
          regulation: string
          requested_data_types: string[] | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          download_expires_at?: string | null
          download_url?: string | null
          file_size_bytes?: number | null
          id?: string
          identity_verified?: boolean
          identity_verified_at?: string | null
          identity_verified_by?: string | null
          legal_hold?: boolean
          metadata?: Json
          notes?: string | null
          processed_by?: string | null
          processing_started_at?: string | null
          reason?: string | null
          regulation?: string
          requested_data_types?: string[] | null
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          download_expires_at?: string | null
          download_url?: string | null
          file_size_bytes?: number | null
          id?: string
          identity_verified?: boolean
          identity_verified_at?: string | null
          identity_verified_by?: string | null
          legal_hold?: boolean
          metadata?: Json
          notes?: string | null
          processed_by?: string | null
          processing_started_at?: string | null
          reason?: string | null
          regulation?: string
          requested_data_types?: string[] | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_data_requests_processed_by"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_data_requests_processed_by"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_data_requests_processed_by"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_data_requests_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_data_requests_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_data_requests_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_items: {
        Row: {
          article_id: string | null
          cluster_id: string | null
          created_at: string
          feed_id: string | null
          fetched_at: string
          id: string
          metadata: Json
          raw_body: string | null
          raw_published_at: string | null
          raw_title: string | null
          raw_url: string
          state: string
          updated_at: string
        }
        Insert: {
          article_id?: string | null
          cluster_id?: string | null
          created_at?: string
          feed_id?: string | null
          fetched_at?: string
          id?: string
          metadata?: Json
          raw_body?: string | null
          raw_published_at?: string | null
          raw_title?: string | null
          raw_url: string
          state?: string
          updated_at?: string
        }
        Update: {
          article_id?: string | null
          cluster_id?: string | null
          created_at?: string
          feed_id?: string | null
          fetched_at?: string
          id?: string
          metadata?: Json
          raw_body?: string | null
          raw_published_at?: string | null
          raw_title?: string | null
          raw_url?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_items_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_items_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "feed_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_items_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "v_cluster_lifecycle"
            referencedColumns: ["cluster_id"]
          },
          {
            foreignKeyName: "discovery_items_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "feeds"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string | null
          created_at: string
          created_by: string | null
          from_email: string | null
          from_name: string | null
          id: string
          is_active: boolean
          key: string
          language: string
          metadata: Json
          name: string
          reply_to: string | null
          subject: string
          updated_at: string
          updated_by: string | null
          variables: Json
          version: number
        }
        Insert: {
          body_html: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_active?: boolean
          key: string
          language?: string
          metadata?: Json
          name: string
          reply_to?: string | null
          subject: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
          version?: number
        }
        Update: {
          body_html?: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_active?: boolean
          key?: string
          language?: string
          metadata?: Json
          name?: string
          reply_to?: string | null
          subject?: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_email_templates_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_email_templates_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_email_templates_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_email_templates_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_email_templates_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_email_templates_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          message: string
          metadata: Json
          occurred_at: string
          route: string | null
          session_id: string | null
          severity: string
          source: string
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          message: string
          metadata?: Json
          occurred_at?: string
          route?: string | null
          session_id?: string | null
          severity?: string
          source: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          message?: string
          metadata?: Json
          occurred_at?: string
          route?: string | null
          session_id?: string | null
          severity?: string
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          article_id: string | null
          article_slug: string | null
          author_id: string | null
          category_slug: string | null
          consent_ads: boolean | null
          consent_analytics: boolean | null
          content_type: string | null
          country_iso2: string | null
          created_at: string
          device_id: string | null
          device_type: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket: string | null
          ip_hash: string | null
          is_bot: boolean
          occurred_at: string
          page: string | null
          payload: Json
          received_at: string
          referrer_domain: string | null
          region: string | null
          session_id: string
          subcategory_slug: string | null
          user_agent_hash: string | null
          user_id: string | null
          user_tenure_days: number | null
          user_tier: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          viewport_h: number | null
          viewport_w: number | null
        }
        Insert: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Update: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category?: string
          event_id?: string
          event_name?: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at?: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id?: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Relationships: []
      }
      events_20260421: {
        Row: {
          article_id: string | null
          article_slug: string | null
          author_id: string | null
          category_slug: string | null
          consent_ads: boolean | null
          consent_analytics: boolean | null
          content_type: string | null
          country_iso2: string | null
          created_at: string
          device_id: string | null
          device_type: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket: string | null
          ip_hash: string | null
          is_bot: boolean
          occurred_at: string
          page: string | null
          payload: Json
          received_at: string
          referrer_domain: string | null
          region: string | null
          session_id: string
          subcategory_slug: string | null
          user_agent_hash: string | null
          user_id: string | null
          user_tenure_days: number | null
          user_tier: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          viewport_h: number | null
          viewport_w: number | null
        }
        Insert: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Update: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category?: string
          event_id?: string
          event_name?: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at?: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id?: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Relationships: []
      }
      events_20260422: {
        Row: {
          article_id: string | null
          article_slug: string | null
          author_id: string | null
          category_slug: string | null
          consent_ads: boolean | null
          consent_analytics: boolean | null
          content_type: string | null
          country_iso2: string | null
          created_at: string
          device_id: string | null
          device_type: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket: string | null
          ip_hash: string | null
          is_bot: boolean
          occurred_at: string
          page: string | null
          payload: Json
          received_at: string
          referrer_domain: string | null
          region: string | null
          session_id: string
          subcategory_slug: string | null
          user_agent_hash: string | null
          user_id: string | null
          user_tenure_days: number | null
          user_tier: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          viewport_h: number | null
          viewport_w: number | null
        }
        Insert: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Update: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category?: string
          event_id?: string
          event_name?: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at?: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id?: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Relationships: []
      }
      events_20260423: {
        Row: {
          article_id: string | null
          article_slug: string | null
          author_id: string | null
          category_slug: string | null
          consent_ads: boolean | null
          consent_analytics: boolean | null
          content_type: string | null
          country_iso2: string | null
          created_at: string
          device_id: string | null
          device_type: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket: string | null
          ip_hash: string | null
          is_bot: boolean
          occurred_at: string
          page: string | null
          payload: Json
          received_at: string
          referrer_domain: string | null
          region: string | null
          session_id: string
          subcategory_slug: string | null
          user_agent_hash: string | null
          user_id: string | null
          user_tenure_days: number | null
          user_tier: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          viewport_h: number | null
          viewport_w: number | null
        }
        Insert: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Update: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category?: string
          event_id?: string
          event_name?: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at?: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id?: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Relationships: []
      }
      events_20260424: {
        Row: {
          article_id: string | null
          article_slug: string | null
          author_id: string | null
          category_slug: string | null
          consent_ads: boolean | null
          consent_analytics: boolean | null
          content_type: string | null
          country_iso2: string | null
          created_at: string
          device_id: string | null
          device_type: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket: string | null
          ip_hash: string | null
          is_bot: boolean
          occurred_at: string
          page: string | null
          payload: Json
          received_at: string
          referrer_domain: string | null
          region: string | null
          session_id: string
          subcategory_slug: string | null
          user_agent_hash: string | null
          user_id: string | null
          user_tenure_days: number | null
          user_tier: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          viewport_h: number | null
          viewport_w: number | null
        }
        Insert: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Update: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category?: string
          event_id?: string
          event_name?: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at?: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id?: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Relationships: []
      }
      events_20260425: {
        Row: {
          article_id: string | null
          article_slug: string | null
          author_id: string | null
          category_slug: string | null
          consent_ads: boolean | null
          consent_analytics: boolean | null
          content_type: string | null
          country_iso2: string | null
          created_at: string
          device_id: string | null
          device_type: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket: string | null
          ip_hash: string | null
          is_bot: boolean
          occurred_at: string
          page: string | null
          payload: Json
          received_at: string
          referrer_domain: string | null
          region: string | null
          session_id: string
          subcategory_slug: string | null
          user_agent_hash: string | null
          user_id: string | null
          user_tenure_days: number | null
          user_tier: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          viewport_h: number | null
          viewport_w: number | null
        }
        Insert: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Update: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category?: string
          event_id?: string
          event_name?: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at?: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id?: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Relationships: []
      }
      events_20260426: {
        Row: {
          article_id: string | null
          article_slug: string | null
          author_id: string | null
          category_slug: string | null
          consent_ads: boolean | null
          consent_analytics: boolean | null
          content_type: string | null
          country_iso2: string | null
          created_at: string
          device_id: string | null
          device_type: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket: string | null
          ip_hash: string | null
          is_bot: boolean
          occurred_at: string
          page: string | null
          payload: Json
          received_at: string
          referrer_domain: string | null
          region: string | null
          session_id: string
          subcategory_slug: string | null
          user_agent_hash: string | null
          user_id: string | null
          user_tenure_days: number | null
          user_tier: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          viewport_h: number | null
          viewport_w: number | null
        }
        Insert: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Update: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category?: string
          event_id?: string
          event_name?: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at?: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id?: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Relationships: []
      }
      events_20260427: {
        Row: {
          article_id: string | null
          article_slug: string | null
          author_id: string | null
          category_slug: string | null
          consent_ads: boolean | null
          consent_analytics: boolean | null
          content_type: string | null
          country_iso2: string | null
          created_at: string
          device_id: string | null
          device_type: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket: string | null
          ip_hash: string | null
          is_bot: boolean
          occurred_at: string
          page: string | null
          payload: Json
          received_at: string
          referrer_domain: string | null
          region: string | null
          session_id: string
          subcategory_slug: string | null
          user_agent_hash: string | null
          user_id: string | null
          user_tenure_days: number | null
          user_tier: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          viewport_h: number | null
          viewport_w: number | null
        }
        Insert: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Update: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category?: string
          event_id?: string
          event_name?: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at?: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id?: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Relationships: []
      }
      events_20260428: {
        Row: {
          article_id: string | null
          article_slug: string | null
          author_id: string | null
          category_slug: string | null
          consent_ads: boolean | null
          consent_analytics: boolean | null
          content_type: string | null
          country_iso2: string | null
          created_at: string
          device_id: string | null
          device_type: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket: string | null
          ip_hash: string | null
          is_bot: boolean
          occurred_at: string
          page: string | null
          payload: Json
          received_at: string
          referrer_domain: string | null
          region: string | null
          session_id: string
          subcategory_slug: string | null
          user_agent_hash: string | null
          user_id: string | null
          user_tenure_days: number | null
          user_tier: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          viewport_h: number | null
          viewport_w: number | null
        }
        Insert: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Update: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category?: string
          event_id?: string
          event_name?: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at?: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id?: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Relationships: []
      }
      events_20260429: {
        Row: {
          article_id: string | null
          article_slug: string | null
          author_id: string | null
          category_slug: string | null
          consent_ads: boolean | null
          consent_analytics: boolean | null
          content_type: string | null
          country_iso2: string | null
          created_at: string
          device_id: string | null
          device_type: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket: string | null
          ip_hash: string | null
          is_bot: boolean
          occurred_at: string
          page: string | null
          payload: Json
          received_at: string
          referrer_domain: string | null
          region: string | null
          session_id: string
          subcategory_slug: string | null
          user_agent_hash: string | null
          user_id: string | null
          user_tenure_days: number | null
          user_tier: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          viewport_h: number | null
          viewport_w: number | null
        }
        Insert: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Update: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category?: string
          event_id?: string
          event_name?: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at?: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id?: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Relationships: []
      }
      events_default: {
        Row: {
          article_id: string | null
          article_slug: string | null
          author_id: string | null
          category_slug: string | null
          consent_ads: boolean | null
          consent_analytics: boolean | null
          content_type: string | null
          country_iso2: string | null
          created_at: string
          device_id: string | null
          device_type: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket: string | null
          ip_hash: string | null
          is_bot: boolean
          occurred_at: string
          page: string | null
          payload: Json
          received_at: string
          referrer_domain: string | null
          region: string | null
          session_id: string
          subcategory_slug: string | null
          user_agent_hash: string | null
          user_id: string | null
          user_tenure_days: number | null
          user_tier: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          viewport_h: number | null
          viewport_w: number | null
        }
        Insert: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category: string
          event_id: string
          event_name: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Update: {
          article_id?: string | null
          article_slug?: string | null
          author_id?: string | null
          category_slug?: string | null
          consent_ads?: boolean | null
          consent_analytics?: boolean | null
          content_type?: string | null
          country_iso2?: string | null
          created_at?: string
          device_id?: string | null
          device_type?: string | null
          event_category?: string
          event_id?: string
          event_name?: string
          experiment_bucket?: string | null
          ip_hash?: string | null
          is_bot?: boolean
          occurred_at?: string
          page?: string | null
          payload?: Json
          received_at?: string
          referrer_domain?: string | null
          region?: string | null
          session_id?: string
          subcategory_slug?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
          user_tenure_days?: number | null
          user_tier?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          viewport_h?: number | null
          viewport_w?: number | null
        }
        Relationships: []
      }
      expert_application_categories: {
        Row: {
          application_id: string
          category_id: string
          created_at: string
          id: string
        }
        Insert: {
          application_id: string
          category_id: string
          created_at?: string
          id?: string
        }
        Update: {
          application_id?: string
          category_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_expert_application_categories_application_id"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "expert_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_application_categories_category_id"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_applications: {
        Row: {
          application_type: string
          background_check_status: string | null
          bio: string | null
          created_at: string
          credential_expires_at: string | null
          credential_verified_at: string | null
          credentials: Json
          expertise_areas: string[] | null
          full_name: string
          government_id_provided: boolean
          id: string
          organization: string | null
          portfolio_urls: string[] | null
          probation_completed: boolean
          probation_ends_at: string | null
          probation_starts_at: string | null
          rejection_reason: string | null
          reverification_notified_at: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          revoked_reason: string | null
          sample_responses: Json
          social_links: Json
          status: string
          title: string | null
          updated_at: string
          user_id: string
          verification_documents: Json
          website_url: string | null
        }
        Insert: {
          application_type: string
          background_check_status?: string | null
          bio?: string | null
          created_at?: string
          credential_expires_at?: string | null
          credential_verified_at?: string | null
          credentials?: Json
          expertise_areas?: string[] | null
          full_name: string
          government_id_provided?: boolean
          id?: string
          organization?: string | null
          portfolio_urls?: string[] | null
          probation_completed?: boolean
          probation_ends_at?: string | null
          probation_starts_at?: string | null
          rejection_reason?: string | null
          reverification_notified_at?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revoked_reason?: string | null
          sample_responses?: Json
          social_links?: Json
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
          verification_documents?: Json
          website_url?: string | null
        }
        Update: {
          application_type?: string
          background_check_status?: string | null
          bio?: string | null
          created_at?: string
          credential_expires_at?: string | null
          credential_verified_at?: string | null
          credentials?: Json
          expertise_areas?: string[] | null
          full_name?: string
          government_id_provided?: boolean
          id?: string
          organization?: string | null
          portfolio_urls?: string[] | null
          probation_completed?: boolean
          probation_ends_at?: string | null
          probation_starts_at?: string | null
          rejection_reason?: string | null
          reverification_notified_at?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revoked_reason?: string | null
          sample_responses?: Json
          social_links?: Json
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          verification_documents?: Json
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_expert_applications_reviewed_by"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_applications_reviewed_by"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_applications_reviewed_by"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_applications_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_applications_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_applications_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_discussions: {
        Row: {
          article_id: string | null
          body: string
          body_html: string | null
          category_id: string
          context_pinned_at: string | null
          context_tag_count: number
          created_at: string
          discussion_type: string
          expert_question_status: string | null
          expert_question_target_id: string | null
          expert_question_target_type: string | null
          id: string
          is_context_pinned: boolean
          is_expert_question: boolean
          is_pinned: boolean
          metadata: Json
          parent_id: string | null
          reply_count: number
          source_comment_id: string | null
          status: string
          title: string | null
          updated_at: string
          upvote_count: number
          user_id: string
        }
        Insert: {
          article_id?: string | null
          body: string
          body_html?: string | null
          category_id: string
          context_pinned_at?: string | null
          context_tag_count?: number
          created_at?: string
          discussion_type?: string
          expert_question_status?: string | null
          expert_question_target_id?: string | null
          expert_question_target_type?: string | null
          id?: string
          is_context_pinned?: boolean
          is_expert_question?: boolean
          is_pinned?: boolean
          metadata?: Json
          parent_id?: string | null
          reply_count?: number
          source_comment_id?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          upvote_count?: number
          user_id: string
        }
        Update: {
          article_id?: string | null
          body?: string
          body_html?: string | null
          category_id?: string
          context_pinned_at?: string | null
          context_tag_count?: number
          created_at?: string
          discussion_type?: string
          expert_question_status?: string | null
          expert_question_target_id?: string | null
          expert_question_target_type?: string | null
          id?: string
          is_context_pinned?: boolean
          is_expert_question?: boolean
          is_pinned?: boolean
          metadata?: Json
          parent_id?: string | null
          reply_count?: number
          source_comment_id?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          upvote_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_expert_discussions_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_discussions_category_id"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_discussions_parent_id"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "expert_discussions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_discussions_source_comment_id"
            columns: ["source_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_discussions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_discussions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_discussions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_queue_items: {
        Row: {
          answer_comment_id: string | null
          answered_at: string | null
          article_id: string
          asking_user_id: string
          claimed_at: string | null
          claimed_by: string | null
          comment_id: string
          created_at: string
          declined_by: string[] | null
          id: string
          status: string
          target_category_id: string | null
          target_expert_id: string | null
          target_type: string
          updated_at: string
        }
        Insert: {
          answer_comment_id?: string | null
          answered_at?: string | null
          article_id: string
          asking_user_id: string
          claimed_at?: string | null
          claimed_by?: string | null
          comment_id: string
          created_at?: string
          declined_by?: string[] | null
          id?: string
          status?: string
          target_category_id?: string | null
          target_expert_id?: string | null
          target_type?: string
          updated_at?: string
        }
        Update: {
          answer_comment_id?: string | null
          answered_at?: string | null
          article_id?: string
          asking_user_id?: string
          claimed_at?: string | null
          claimed_by?: string | null
          comment_id?: string
          created_at?: string
          declined_by?: string[] | null
          id?: string
          status?: string
          target_category_id?: string | null
          target_expert_id?: string | null
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_expert_queue_items_answer_comment_id"
            columns: ["answer_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_queue_items_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_queue_items_asking_user_id"
            columns: ["asking_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_queue_items_asking_user_id"
            columns: ["asking_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_queue_items_asking_user_id"
            columns: ["asking_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_queue_items_claimed_by"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_queue_items_claimed_by"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_queue_items_claimed_by"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_queue_items_comment_id"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_queue_items_target_category_id"
            columns: ["target_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_queue_items_target_expert_id"
            columns: ["target_expert_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_queue_items_target_expert_id"
            columns: ["target_expert_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expert_queue_items_target_expert_id"
            columns: ["target_expert_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      family_achievement_progress: {
        Row: {
          created_at: string
          earned_at: string | null
          family_achievement_id: string
          family_owner_id: string
          id: string
          progress: Json
          seen_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          earned_at?: string | null
          family_achievement_id: string
          family_owner_id: string
          id?: string
          progress?: Json
          seen_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          earned_at?: string | null
          family_achievement_id?: string
          family_owner_id?: string
          id?: string
          progress?: Json
          seen_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_family_achievement_progress_achievement"
            columns: ["family_achievement_id"]
            isOneToOne: false
            referencedRelation: "family_achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_family_achievement_progress_owner"
            columns: ["family_owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_family_achievement_progress_owner"
            columns: ["family_owner_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_family_achievement_progress_owner"
            columns: ["family_owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      family_achievements: {
        Row: {
          created_at: string
          criteria: Json
          description: string
          icon_name: string | null
          id: string
          is_active: boolean
          key: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria: Json
          description: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          key: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          description?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          display_name: string
          expires_at: string | null
          id: string
          is_enabled: boolean
          is_killswitch: boolean
          key: string
          metadata: Json
          rollout_percentage: number
          target_cohort_ids: string[] | null
          target_countries: string[] | null
          target_max_app_version: string | null
          target_min_app_version: string | null
          target_min_os_version: string | null
          target_plan_tiers: string[] | null
          target_platforms: string[] | null
          target_user_ids: string[] | null
          updated_at: string
          updated_by: string | null
          variant: Json | null
        }
        Insert: {
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name: string
          expires_at?: string | null
          id?: string
          is_enabled?: boolean
          is_killswitch?: boolean
          key: string
          metadata?: Json
          rollout_percentage?: number
          target_cohort_ids?: string[] | null
          target_countries?: string[] | null
          target_max_app_version?: string | null
          target_min_app_version?: string | null
          target_min_os_version?: string | null
          target_plan_tiers?: string[] | null
          target_platforms?: string[] | null
          target_user_ids?: string[] | null
          updated_at?: string
          updated_by?: string | null
          variant?: Json | null
        }
        Update: {
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name?: string
          expires_at?: string | null
          id?: string
          is_enabled?: boolean
          is_killswitch?: boolean
          key?: string
          metadata?: Json
          rollout_percentage?: number
          target_cohort_ids?: string[] | null
          target_countries?: string[] | null
          target_max_app_version?: string | null
          target_min_app_version?: string | null
          target_min_os_version?: string | null
          target_plan_tiers?: string[] | null
          target_platforms?: string[] | null
          target_user_ids?: string[] | null
          updated_at?: string
          updated_by?: string | null
          variant?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_feature_flags_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feature_flags_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feature_flags_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feature_flags_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feature_flags_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feature_flags_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_cluster_articles: {
        Row: {
          added_at: string
          article_id: string
          cluster_id: string
          id: string
        }
        Insert: {
          added_at?: string
          article_id: string
          cluster_id: string
          id?: string
        }
        Update: {
          added_at?: string
          article_id?: string
          cluster_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_feed_cluster_articles_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feed_cluster_articles_cluster_id"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "feed_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feed_cluster_articles_cluster_id"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "v_cluster_lifecycle"
            referencedColumns: ["cluster_id"]
          },
        ]
      }
      feed_cluster_audience_state: {
        Row: {
          article_id: string | null
          audience_band: string
          cluster_id: string
          generated_at: string | null
          skipped_at: string | null
          skipped_by: string | null
          state: string
          updated_at: string
        }
        Insert: {
          article_id?: string | null
          audience_band: string
          cluster_id: string
          generated_at?: string | null
          skipped_at?: string | null
          skipped_by?: string | null
          state: string
          updated_at?: string
        }
        Update: {
          article_id?: string | null
          audience_band?: string
          cluster_id?: string
          generated_at?: string | null
          skipped_at?: string | null
          skipped_by?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_cluster_audience_state_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_cluster_audience_state_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "feed_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_cluster_audience_state_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "v_cluster_lifecycle"
            referencedColumns: ["cluster_id"]
          },
          {
            foreignKeyName: "feed_cluster_audience_state_skipped_by_fkey"
            columns: ["skipped_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_cluster_audience_state_skipped_by_fkey"
            columns: ["skipped_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_cluster_audience_state_skipped_by_fkey"
            columns: ["skipped_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_cluster_locks: {
        Row: {
          audience_band: string
          cluster_id: string
          locked_at: string
          locked_by: string
        }
        Insert: {
          audience_band: string
          cluster_id: string
          locked_at?: string
          locked_by: string
        }
        Update: {
          audience_band?: string
          cluster_id?: string
          locked_at?: string
          locked_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_cluster_locks_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "feed_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_cluster_locks_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "v_cluster_lifecycle"
            referencedColumns: ["cluster_id"]
          },
        ]
      }
      feed_clusters: {
        Row: {
          archived_at: string | null
          archived_reason: string | null
          audience: string
          category_id: string | null
          created_at: string
          dismiss_reason: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          expires_at: string | null
          generation_state: string | null
          id: string
          is_active: boolean
          is_breaking: boolean
          keywords: string[] | null
          last_generation_run_id: string | null
          locked_at: string | null
          locked_by: string | null
          primary_article_id: string | null
          primary_kid_article_id: string | null
          primary_tween_article_id: string | null
          similarity_threshold: number | null
          summary: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_reason?: string | null
          audience?: string
          category_id?: string | null
          created_at?: string
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          expires_at?: string | null
          generation_state?: string | null
          id?: string
          is_active?: boolean
          is_breaking?: boolean
          keywords?: string[] | null
          last_generation_run_id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          primary_article_id?: string | null
          primary_kid_article_id?: string | null
          primary_tween_article_id?: string | null
          similarity_threshold?: number | null
          summary?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_reason?: string | null
          audience?: string
          category_id?: string | null
          created_at?: string
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          expires_at?: string | null
          generation_state?: string | null
          id?: string
          is_active?: boolean
          is_breaking?: boolean
          keywords?: string[] | null
          last_generation_run_id?: string | null
          locked_at?: string | null
          locked_by?: string | null
          primary_article_id?: string | null
          primary_kid_article_id?: string | null
          primary_tween_article_id?: string | null
          similarity_threshold?: number | null
          summary?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_clusters_last_gen_run_fkey"
            columns: ["last_generation_run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_clusters_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_clusters_primary_kid_article_id_fkey"
            columns: ["primary_kid_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_clusters_primary_tween_article_id_fkey"
            columns: ["primary_tween_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feed_clusters_category_id"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feed_clusters_primary_article_id"
            columns: ["primary_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      feeds: {
        Row: {
          articles_imported_count: number
          audience: string
          category_id: string | null
          created_at: string
          created_by: string | null
          default_visibility: string
          error_count: number
          feed_type: string
          id: string
          is_active: boolean
          is_ai_rewrite: boolean
          is_auto_publish: boolean
          language: string | null
          last_error: string | null
          last_error_at: string | null
          last_etag: string | null
          last_modified: string | null
          last_polled_at: string | null
          metadata: Json
          name: string
          poll_interval_minutes: number
          source_icon_url: string | null
          source_name: string | null
          transform_rules: Json
          updated_at: string
          url: string
        }
        Insert: {
          articles_imported_count?: number
          audience: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          default_visibility?: string
          error_count?: number
          feed_type?: string
          id?: string
          is_active?: boolean
          is_ai_rewrite?: boolean
          is_auto_publish?: boolean
          language?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_etag?: string | null
          last_modified?: string | null
          last_polled_at?: string | null
          metadata?: Json
          name: string
          poll_interval_minutes?: number
          source_icon_url?: string | null
          source_name?: string | null
          transform_rules?: Json
          updated_at?: string
          url: string
        }
        Update: {
          articles_imported_count?: number
          audience?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          default_visibility?: string
          error_count?: number
          feed_type?: string
          id?: string
          is_active?: boolean
          is_ai_rewrite?: boolean
          is_auto_publish?: boolean
          language?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_etag?: string | null
          last_modified?: string | null
          last_polled_at?: string | null
          metadata?: Json
          name?: string
          poll_interval_minutes?: number
          source_icon_url?: string | null
          source_name?: string | null
          transform_rules?: Json
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_feeds_category_id"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feeds_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feeds_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feeds_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
          notify: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
          notify?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
          notify?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_follows_follower_id"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_follows_follower_id"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_follows_follower_id"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_follows_following_id"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_follows_following_id"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_follows_following_id"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      graduation_tokens: {
        Row: {
          consumed_at: string | null
          consumed_by_user_id: string | null
          created_at: string
          expires_at: string
          intended_email: string
          kid_profile_id: string
          metadata: Json
          parent_user_id: string
          token: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_by_user_id?: string | null
          created_at?: string
          expires_at: string
          intended_email: string
          kid_profile_id: string
          metadata?: Json
          parent_user_id: string
          token: string
        }
        Update: {
          consumed_at?: string | null
          consumed_by_user_id?: string | null
          created_at?: string
          expires_at?: string
          intended_email?: string
          kid_profile_id?: string
          metadata?: Json
          parent_user_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "graduation_tokens_consumed_by_user_id_fkey"
            columns: ["consumed_by_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_tokens_consumed_by_user_id_fkey"
            columns: ["consumed_by_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_tokens_consumed_by_user_id_fkey"
            columns: ["consumed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_tokens_kid_profile_id_fkey"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "kid_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_tokens_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_tokens_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graduation_tokens_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          billing_address: Json | null
          created_at: string
          currency: string
          description: string | null
          discount_cents: number
          due_date: string | null
          id: string
          invoice_pdf_url: string | null
          invoice_url: string | null
          line_items: Json
          metadata: Json
          paid_at: string | null
          payment_method: string | null
          status: string
          stripe_invoice_id: string | null
          subscription_id: string | null
          subtotal_cents: number
          tax_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          billing_address?: Json | null
          created_at?: string
          currency?: string
          description?: string | null
          discount_cents?: number
          due_date?: string | null
          id?: string
          invoice_pdf_url?: string | null
          invoice_url?: string | null
          line_items?: Json
          metadata?: Json
          paid_at?: string | null
          payment_method?: string | null
          status: string
          stripe_invoice_id?: string | null
          subscription_id?: string | null
          subtotal_cents: number
          tax_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          billing_address?: Json | null
          created_at?: string
          currency?: string
          description?: string | null
          discount_cents?: number
          due_date?: string | null
          id?: string
          invoice_pdf_url?: string | null
          invoice_url?: string | null
          line_items?: Json
          metadata?: Json
          paid_at?: string | null
          payment_method?: string | null
          status?: string
          stripe_invoice_id?: string | null
          subscription_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_invoices_subscription_id"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_invoices_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_invoices_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_invoices_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_dob_correction_requests: {
        Row: {
          cooldown_ends_at: string | null
          created_at: string
          current_band: string
          current_dob: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          direction: string
          documentation_url: string | null
          id: string
          ip_address: unknown
          kid_profile_id: string
          parent_user_id: string
          reason: string
          requested_dob: string
          resulting_band: string
          status: string
        }
        Insert: {
          cooldown_ends_at?: string | null
          created_at?: string
          current_band: string
          current_dob: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          direction: string
          documentation_url?: string | null
          id?: string
          ip_address?: unknown
          kid_profile_id: string
          parent_user_id: string
          reason: string
          requested_dob: string
          resulting_band: string
          status?: string
        }
        Update: {
          cooldown_ends_at?: string | null
          created_at?: string
          current_band?: string
          current_dob?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          direction?: string
          documentation_url?: string | null
          id?: string
          ip_address?: unknown
          kid_profile_id?: string
          parent_user_id?: string
          reason?: string
          requested_dob?: string
          resulting_band?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kid_dob_correction_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_dob_correction_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_dob_correction_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_dob_correction_requests_kid_profile_id_fkey"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "kid_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_dob_correction_requests_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_dob_correction_requests_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_dob_correction_requests_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_dob_history: {
        Row: {
          actor_user_id: string | null
          change_source: string
          created_at: string
          decision_reason: string | null
          id: string
          ip_address: unknown
          kid_profile_id: string
          new_dob: string
          old_dob: string | null
        }
        Insert: {
          actor_user_id?: string | null
          change_source: string
          created_at?: string
          decision_reason?: string | null
          id?: string
          ip_address?: unknown
          kid_profile_id: string
          new_dob: string
          old_dob?: string | null
        }
        Update: {
          actor_user_id?: string | null
          change_source?: string
          created_at?: string
          decision_reason?: string | null
          id?: string
          ip_address?: unknown
          kid_profile_id?: string
          new_dob?: string
          old_dob?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kid_dob_history_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_dob_history_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_dob_history_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_dob_history_kid_profile_id_fkey"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "kid_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_expert_questions: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          created_at: string
          id: string
          is_approved: boolean
          kid_profile_id: string
          question_text: string
          session_id: string
          sort_order: number
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          kid_profile_id: string
          question_text: string
          session_id: string
          sort_order?: number
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          kid_profile_id?: string
          question_text?: string
          session_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_kid_expert_questions_kid_profile_id"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "kid_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_kid_expert_questions_session_id"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "kid_expert_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_expert_sessions: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          duration_minutes: number
          expert_id: string
          id: string
          is_active: boolean
          max_questions: number | null
          scheduled_at: string
          session_type: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          expert_id: string
          id?: string
          is_active?: boolean
          max_questions?: number | null
          scheduled_at: string
          session_type?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          expert_id?: string
          id?: string
          is_active?: boolean
          max_questions?: number | null
          scheduled_at?: string
          session_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_kid_expert_sessions_category_id"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_kid_expert_sessions_expert_id"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_kid_expert_sessions_expert_id"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_kid_expert_sessions_expert_id"
            columns: ["expert_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_pair_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          kid_profile_id: string
          parent_user_id: string
          used_at: string | null
          used_by_device: string | null
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          kid_profile_id: string
          parent_user_id: string
          used_at?: string | null
          used_by_device?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          kid_profile_id?: string
          parent_user_id?: string
          used_at?: string | null
          used_by_device?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kid_pair_codes_kid_profile_id_fkey"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "kid_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_pair_codes_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_pair_codes_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_pair_codes_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_profiles: {
        Row: {
          articles_read_count: number
          avatar_color: string | null
          avatar_preset: string | null
          avatar_url: string | null
          band_changed_at: string
          band_history: Json
          birthday_prompt_at: string | null
          coppa_consent_at: string | null
          coppa_consent_given: boolean
          created_at: string
          date_of_birth: string | null
          display_name: string
          global_leaderboard_opt_in: boolean
          id: string
          is_active: boolean
          last_active_at: string | null
          max_daily_minutes: number | null
          metadata: Json
          parent_user_id: string
          paused_at: string | null
          pin_attempts: number
          pin_hash: string | null
          pin_hash_algo: string
          pin_locked_until: string | null
          pin_salt: string | null
          quizzes_completed_count: number
          reading_band: string
          reading_level: string | null
          reconsent_required_at: string | null
          reconsented_at: string | null
          streak_best: number
          streak_current: number
          streak_freeze_remaining: number
          streak_freeze_week_start: string | null
          streak_last_active_date: string | null
          updated_at: string
          verity_score: number
        }
        Insert: {
          articles_read_count?: number
          avatar_color?: string | null
          avatar_preset?: string | null
          avatar_url?: string | null
          band_changed_at?: string
          band_history?: Json
          birthday_prompt_at?: string | null
          coppa_consent_at?: string | null
          coppa_consent_given?: boolean
          created_at?: string
          date_of_birth?: string | null
          display_name: string
          global_leaderboard_opt_in?: boolean
          id?: string
          is_active?: boolean
          last_active_at?: string | null
          max_daily_minutes?: number | null
          metadata?: Json
          parent_user_id: string
          paused_at?: string | null
          pin_attempts?: number
          pin_hash?: string | null
          pin_hash_algo?: string
          pin_locked_until?: string | null
          pin_salt?: string | null
          quizzes_completed_count?: number
          reading_band?: string
          reading_level?: string | null
          reconsent_required_at?: string | null
          reconsented_at?: string | null
          streak_best?: number
          streak_current?: number
          streak_freeze_remaining?: number
          streak_freeze_week_start?: string | null
          streak_last_active_date?: string | null
          updated_at?: string
          verity_score?: number
        }
        Update: {
          articles_read_count?: number
          avatar_color?: string | null
          avatar_preset?: string | null
          avatar_url?: string | null
          band_changed_at?: string
          band_history?: Json
          birthday_prompt_at?: string | null
          coppa_consent_at?: string | null
          coppa_consent_given?: boolean
          created_at?: string
          date_of_birth?: string | null
          display_name?: string
          global_leaderboard_opt_in?: boolean
          id?: string
          is_active?: boolean
          last_active_at?: string | null
          max_daily_minutes?: number | null
          metadata?: Json
          parent_user_id?: string
          paused_at?: string | null
          pin_attempts?: number
          pin_hash?: string | null
          pin_hash_algo?: string
          pin_locked_until?: string | null
          pin_salt?: string | null
          quizzes_completed_count?: number
          reading_band?: string
          reading_level?: string | null
          reconsent_required_at?: string | null
          reconsented_at?: string | null
          streak_best?: number
          streak_current?: number
          streak_freeze_remaining?: number
          streak_freeze_week_start?: string | null
          streak_last_active_date?: string | null
          updated_at?: string
          verity_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_kid_profiles_parent_user_id"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_kid_profiles_parent_user_id"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_kid_profiles_parent_user_id"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_sessions: {
        Row: {
          device_id: string
          expires_at: string
          id: string
          kid_profile_id: string
          parent_user_id: string
          revoked_at: string | null
          started_at: string
          token: string
        }
        Insert: {
          device_id: string
          expires_at?: string
          id?: string
          kid_profile_id: string
          parent_user_id: string
          revoked_at?: string | null
          started_at?: string
          token: string
        }
        Update: {
          device_id?: string
          expires_at?: string
          id?: string
          kid_profile_id?: string
          parent_user_id?: string
          revoked_at?: string | null
          started_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "kid_sessions_kid_profile_id_fkey"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "kid_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_sessions_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_sessions_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_sessions_parent_user_id_fkey"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          ip_prefix: string | null
          source: string | null
          unsubscribed_at: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip_prefix?: string | null
          source?: string | null
          unsubscribed_at?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip_prefix?: string | null
          source?: string | null
          unsubscribed_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      message_receipts: {
        Row: {
          delivered_at: string | null
          id: string
          message_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          delivered_at?: string | null
          id?: string
          message_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          delivered_at?: string | null
          id?: string
          message_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_message_receipts_message_id"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_message_receipts_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_message_receipts_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_message_receipts_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_metadata: Json | null
          attachment_type: string | null
          attachment_url: string | null
          body: string
          body_html: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_edited: boolean
          is_system: boolean
          moderation_status: string
          reply_to_id: string | null
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attachment_metadata?: Json | null
          attachment_type?: string | null
          attachment_url?: string | null
          body: string
          body_html?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_edited?: boolean
          is_system?: boolean
          moderation_status?: string
          reply_to_id?: string | null
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attachment_metadata?: Json | null
          attachment_type?: string | null
          attachment_url?: string | null
          body?: string
          body_html?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_edited?: boolean
          is_system?: boolean
          moderation_status?: string
          reply_to_id?: string | null
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_messages_conversation_id"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_messages_reply_to_id"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_messages_sender_id"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_messages_sender_id"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_messages_sender_id"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_id: string | null
          action_type: string | null
          action_url: string | null
          body: string | null
          campaign_id: string | null
          channel: string
          created_at: string
          email_claimed_at: string | null
          email_sent: boolean
          email_sent_at: string | null
          expires_at: string | null
          id: string
          image_url: string | null
          is_read: boolean
          is_seen: boolean
          metadata: Json
          priority: string
          push_claimed_at: string | null
          push_receipt: string | null
          push_sent: boolean
          push_sent_at: string | null
          read_at: string | null
          seen_at: string | null
          sender_id: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_id?: string | null
          action_type?: string | null
          action_url?: string | null
          body?: string | null
          campaign_id?: string | null
          channel?: string
          created_at?: string
          email_claimed_at?: string | null
          email_sent?: boolean
          email_sent_at?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_read?: boolean
          is_seen?: boolean
          metadata?: Json
          priority?: string
          push_claimed_at?: string | null
          push_receipt?: string | null
          push_sent?: boolean
          push_sent_at?: string | null
          read_at?: string | null
          seen_at?: string | null
          sender_id?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_id?: string | null
          action_type?: string | null
          action_url?: string | null
          body?: string | null
          campaign_id?: string | null
          channel?: string
          created_at?: string
          email_claimed_at?: string | null
          email_sent?: boolean
          email_sent_at?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_read?: boolean
          is_seen?: boolean
          metadata?: Json
          priority?: string
          push_claimed_at?: string | null
          push_receipt?: string | null
          push_sent?: boolean
          push_sent_at?: string | null
          read_at?: string | null
          seen_at?: string | null
          sender_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_notifications_campaign_id"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_notifications_sender_id"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_notifications_sender_id"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_notifications_sender_id"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_notifications_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_notifications_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_notifications_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      parental_consents: {
        Row: {
          consent_ip: string | null
          consent_method: string
          consent_user_agent: string | null
          consent_version: string
          consented_at: string
          id: string
          kid_profile_id: string
          metadata: Json
          parent_name: string | null
          parent_user_id: string
        }
        Insert: {
          consent_ip?: string | null
          consent_method: string
          consent_user_agent?: string | null
          consent_version?: string
          consented_at?: string
          id?: string
          kid_profile_id: string
          metadata?: Json
          parent_name?: string | null
          parent_user_id: string
        }
        Update: {
          consent_ip?: string | null
          consent_method?: string
          consent_user_agent?: string | null
          consent_version?: string
          consented_at?: string
          id?: string
          kid_profile_id?: string
          metadata?: Json
          parent_name?: string | null
          parent_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_parental_consents_consent_version"
            columns: ["consent_version"]
            isOneToOne: false
            referencedRelation: "consent_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "fk_parental_consents_kid"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "kid_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_parental_consents_parent"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_parental_consents_parent"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_parental_consents_parent"
            columns: ["parent_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_key_aliases: {
        Row: {
          new_key: string
          old_key: string
        }
        Insert: {
          new_key: string
          old_key: string
        }
        Update: {
          new_key?: string
          old_key?: string
        }
        Relationships: []
      }
      permission_scope_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          override_action: string
          override_value: string | null
          permission_key: string
          reason: string | null
          scope_id: string
          scope_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          override_action: string
          override_value?: string | null
          permission_key: string
          reason?: string | null
          scope_id: string
          scope_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          override_action?: string
          override_value?: string | null
          permission_key?: string
          reason?: string | null
          scope_id?: string
          scope_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_scope_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_scope_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_scope_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_scope_overrides_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      permission_set_perms: {
        Row: {
          permission_id: string
          permission_set_id: string
        }
        Insert: {
          permission_id: string
          permission_set_id: string
        }
        Update: {
          permission_id?: string
          permission_set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_set_perms_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_set_perms_permission_set_id_fkey"
            columns: ["permission_set_id"]
            isOneToOne: false
            referencedRelation: "permission_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_sets: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          is_kids_set: boolean
          is_system: boolean
          key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          is_kids_set?: boolean
          is_system?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          is_kids_set?: boolean
          is_system?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string
          created_at: string
          cta_config: Json
          deny_mode: string
          description: string | null
          display_name: string
          feature_flag_key: string | null
          id: string
          is_active: boolean
          is_public: boolean
          key: string
          lock_message: string | null
          requires_verified: boolean
          sort_order: number
          ui_element: string | null
          ui_section: string | null
        }
        Insert: {
          category: string
          created_at?: string
          cta_config?: Json
          deny_mode?: string
          description?: string | null
          display_name: string
          feature_flag_key?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          key: string
          lock_message?: string | null
          requires_verified?: boolean
          sort_order?: number
          ui_element?: string | null
          ui_section?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          cta_config?: Json
          deny_mode?: string
          description?: string | null
          display_name?: string
          feature_flag_key?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          key?: string
          lock_message?: string | null
          requires_verified?: boolean
          sort_order?: number
          ui_element?: string | null
          ui_section?: string | null
        }
        Relationships: []
      }
      perms_global_version: {
        Row: {
          bumped_at: string
          id: number
          version: number
        }
        Insert: {
          bumped_at?: string
          id?: number
          version?: number
        }
        Update: {
          bumped_at?: string
          id?: number
          version?: number
        }
        Relationships: []
      }
      pipeline_cost_reservations: {
        Row: {
          created_at: string
          id: string
          pipeline_run_id: string
          reserved_usd: number
          settled_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          pipeline_run_id: string
          reserved_usd: number
          settled_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          pipeline_run_id?: string
          reserved_usd?: number
          settled_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_cost_reservations_pipeline_run_id_fkey"
            columns: ["pipeline_run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_costs: {
        Row: {
          article_id: string | null
          audience: string
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          cluster_id: string | null
          cost_usd: number
          created_at: string
          error_message: string | null
          error_type: string | null
          id: string
          input_tokens: number
          latency_ms: number | null
          metadata: Json | null
          model: string
          output_tokens: number
          pipeline_run_id: string
          prompt_fingerprint: string | null
          provider: string
          retry_count: number
          step: string
          success: boolean
          total_tokens: number
        }
        Insert: {
          article_id?: string | null
          audience?: string
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          cluster_id?: string | null
          cost_usd: number
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          metadata?: Json | null
          model: string
          output_tokens?: number
          pipeline_run_id: string
          prompt_fingerprint?: string | null
          provider: string
          retry_count?: number
          step: string
          success?: boolean
          total_tokens?: number
        }
        Update: {
          article_id?: string | null
          audience?: string
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          cluster_id?: string | null
          cost_usd?: number
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          metadata?: Json | null
          model?: string
          output_tokens?: number
          pipeline_run_id?: string
          prompt_fingerprint?: string | null
          provider?: string
          retry_count?: number
          step?: string
          success?: boolean
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_pipeline_costs_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pipeline_costs_pipeline_run_id"
            columns: ["pipeline_run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_costs_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "feed_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_costs_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "v_cluster_lifecycle"
            referencedColumns: ["cluster_id"]
          },
        ]
      }
      pipeline_runs: {
        Row: {
          audience: string | null
          cluster_id: string | null
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          error_stack: string | null
          error_type: string | null
          feed_id: string | null
          freeform_instructions: string | null
          id: string
          input_params: Json
          items_created: number
          items_failed: number
          items_processed: number
          model: string | null
          output_summary: Json
          pipeline_type: string
          prompt_fingerprint: string | null
          provider: string | null
          started_at: string
          status: string
          step_timings_ms: Json
          total_cost_usd: number
          triggered_by: string | null
          triggered_by_user: string | null
        }
        Insert: {
          audience?: string | null
          cluster_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          error_stack?: string | null
          error_type?: string | null
          feed_id?: string | null
          freeform_instructions?: string | null
          id?: string
          input_params?: Json
          items_created?: number
          items_failed?: number
          items_processed?: number
          model?: string | null
          output_summary?: Json
          pipeline_type: string
          prompt_fingerprint?: string | null
          provider?: string | null
          started_at?: string
          status?: string
          step_timings_ms?: Json
          total_cost_usd?: number
          triggered_by?: string | null
          triggered_by_user?: string | null
        }
        Update: {
          audience?: string | null
          cluster_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          error_stack?: string | null
          error_type?: string | null
          feed_id?: string | null
          freeform_instructions?: string | null
          id?: string
          input_params?: Json
          items_created?: number
          items_failed?: number
          items_processed?: number
          model?: string | null
          output_summary?: Json
          pipeline_type?: string
          prompt_fingerprint?: string | null
          provider?: string | null
          started_at?: string
          status?: string
          step_timings_ms?: Json
          total_cost_usd?: number
          triggered_by?: string | null
          triggered_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_pipeline_runs_feed_id"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "feeds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pipeline_runs_triggered_by_user"
            columns: ["triggered_by_user"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pipeline_runs_triggered_by_user"
            columns: ["triggered_by_user"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pipeline_runs_triggered_by_user"
            columns: ["triggered_by_user"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "feed_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "v_cluster_lifecycle"
            referencedColumns: ["cluster_id"]
          },
        ]
      }
      plan_features: {
        Row: {
          created_at: string
          feature_key: string
          feature_name: string
          id: string
          is_enabled: boolean
          limit_type: string | null
          limit_value: number | null
          metadata: Json
          plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_key: string
          feature_name: string
          id?: string
          is_enabled?: boolean
          limit_type?: string | null
          limit_value?: number | null
          metadata?: Json
          plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_key?: string
          feature_name?: string
          id?: string
          is_enabled?: boolean
          limit_type?: string | null
          limit_value?: number | null
          metadata?: Json
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_plan_features_plan_id"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_permission_sets: {
        Row: {
          permission_set_id: string
          plan_id: string
        }
        Insert: {
          permission_set_id: string
          plan_id: string
        }
        Update: {
          permission_set_id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_permission_sets_permission_set_id_fkey"
            columns: ["permission_set_id"]
            isOneToOne: false
            referencedRelation: "permission_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_permission_sets_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          apple_product_id: string | null
          billing_period: string | null
          created_at: string
          currency: string
          description: string | null
          display_name: string
          google_product_id: string | null
          id: string
          is_active: boolean
          is_visible: boolean
          max_family_members: number | null
          metadata: Json
          name: string
          price_cents: number
          sort_order: number
          stripe_price_id: string | null
          tier: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          apple_product_id?: string | null
          billing_period?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          display_name: string
          google_product_id?: string | null
          id?: string
          is_active?: boolean
          is_visible?: boolean
          max_family_members?: number | null
          metadata?: Json
          name: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          tier: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          apple_product_id?: string | null
          billing_period?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          display_name?: string
          google_product_id?: string | null
          id?: string
          is_active?: boolean
          is_visible?: boolean
          max_family_members?: number | null
          metadata?: Json
          name?: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          tier?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          applies_to_plans: string[] | null
          campaign_id: string | null
          code: string
          created_at: string
          created_by: string | null
          current_uses: number
          description: string | null
          discount_type: string
          discount_value: number
          duration: string
          duration_months: number | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          max_uses_per_user: number
          metadata: Json
          minimum_amount_cents: number | null
          starts_at: string | null
          stripe_coupon_id: string | null
          updated_at: string
        }
        Insert: {
          applies_to_plans?: string[] | null
          campaign_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          discount_type: string
          discount_value: number
          duration?: string
          duration_months?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_user?: number
          metadata?: Json
          minimum_amount_cents?: number | null
          starts_at?: string | null
          stripe_coupon_id?: string | null
          updated_at?: string
        }
        Update: {
          applies_to_plans?: string[] | null
          campaign_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          discount_type?: string
          discount_value?: number
          duration?: string
          duration_months?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_user?: number
          metadata?: Json
          minimum_amount_cents?: number | null
          starts_at?: string | null
          stripe_coupon_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_promo_codes_campaign_id"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_promo_codes_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_promo_codes_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_promo_codes_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_uses: {
        Row: {
          created_at: string
          discount_applied_cents: number
          id: string
          promo_code_id: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          discount_applied_cents: number
          id?: string
          promo_code_id: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          discount_applied_cents?: number
          id?: string
          promo_code_id?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_promo_uses_promo_code_id"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_promo_uses_subscription_id"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_promo_uses_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_promo_uses_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_promo_uses_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_receipts: {
        Row: {
          created_at: string
          delivered_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          notification_id: string | null
          opened_at: string | null
          provider: string
          provider_message_id: string | null
          push_token: string
          sent_at: string
          session_id: string | null
          status: string
          token_invalidated: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          notification_id?: string | null
          opened_at?: string | null
          provider: string
          provider_message_id?: string | null
          push_token: string
          sent_at: string
          session_id?: string | null
          status: string
          token_invalidated?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          notification_id?: string | null
          opened_at?: string | null
          provider?: string
          provider_message_id?: string | null
          push_token?: string
          sent_at?: string
          session_id?: string | null
          status?: string
          token_invalidated?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_push_receipts_notification_id"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_push_receipts_session_id"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_push_receipts_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_push_receipts_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_push_receipts_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          article_id: string | null
          attempt_number: number
          created_at: string
          id: string
          is_correct: boolean
          kid_profile_id: string | null
          points_earned: number
          questions_served: string[] | null
          quiz_id: string
          selected_answer: string
          time_taken_seconds: number | null
          user_id: string
        }
        Insert: {
          article_id?: string | null
          attempt_number?: number
          created_at?: string
          id?: string
          is_correct: boolean
          kid_profile_id?: string | null
          points_earned?: number
          questions_served?: string[] | null
          quiz_id: string
          selected_answer: string
          time_taken_seconds?: number | null
          user_id: string
        }
        Update: {
          article_id?: string | null
          attempt_number?: number
          created_at?: string
          id?: string
          is_correct?: boolean
          kid_profile_id?: string | null
          points_earned?: number
          questions_served?: string[] | null
          quiz_id?: string
          selected_answer?: string
          time_taken_seconds?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_quiz_attempts_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_quiz_attempts_kid_profile_id"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "kid_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_quiz_attempts_quiz_id"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_quiz_attempts_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_quiz_attempts_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_quiz_attempts_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          article_id: string
          attempt_count: number
          correct_count: number
          created_at: string
          deleted_at: string | null
          description: string | null
          difficulty: string | null
          explanation: string | null
          id: string
          is_active: boolean
          metadata: Json
          options: Json
          points: number
          pool_group: number
          question_text: string
          question_type: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          article_id: string
          attempt_count?: number
          correct_count?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          difficulty?: string | null
          explanation?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          options?: Json
          points?: number
          pool_group?: number
          question_text: string
          question_type?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          article_id?: string
          attempt_count?: number
          correct_count?: number
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          difficulty?: string | null
          explanation?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          options?: Json
          points?: number
          pool_group?: number
          question_text?: string
          question_type?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_quizzes_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_events: {
        Row: {
          action: string | null
          created_at: string
          endpoint: string | null
          id: string
          ip_address: string | null
          key: string | null
          metadata: Json | null
          request_count: number | null
          rule_id: string | null
          user_agent: string | null
          user_id: string | null
          window_start: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string
          endpoint?: string | null
          id?: string
          ip_address?: string | null
          key?: string | null
          metadata?: Json | null
          request_count?: number | null
          rule_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          window_start?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string
          endpoint?: string | null
          id?: string
          ip_address?: string | null
          key?: string | null
          metadata?: Json | null
          request_count?: number | null
          rule_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_rate_limit_events_rule_id"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rate_limits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_rate_limit_events_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_rate_limit_events_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_rate_limit_events_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          applies_to_plans: string[] | null
          burst_max: number | null
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          key: string
          max_requests: number
          penalty_seconds: number | null
          scope: string
          updated_at: string
          window_seconds: number
        }
        Insert: {
          applies_to_plans?: string[] | null
          burst_max?: number | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          key: string
          max_requests: number
          penalty_seconds?: number | null
          scope?: string
          updated_at?: string
          window_seconds: number
        }
        Update: {
          applies_to_plans?: string[] | null
          burst_max?: number | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          key?: string
          max_requests?: number
          penalty_seconds?: number | null
          scope?: string
          updated_at?: string
          window_seconds?: number
        }
        Relationships: []
      }
      reading_log: {
        Row: {
          article_id: string
          completed: boolean
          created_at: string
          device_type: string | null
          id: string
          kid_profile_id: string | null
          points_earned: number
          read_percentage: number
          referrer_url: string | null
          session_id: string | null
          source: string | null
          time_spent_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          article_id: string
          completed?: boolean
          created_at?: string
          device_type?: string | null
          id?: string
          kid_profile_id?: string | null
          points_earned?: number
          read_percentage?: number
          referrer_url?: string | null
          session_id?: string | null
          source?: string | null
          time_spent_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          article_id?: string
          completed?: boolean
          created_at?: string
          device_type?: string | null
          id?: string
          kid_profile_id?: string | null
          points_earned?: number
          read_percentage?: number
          referrer_url?: string | null
          session_id?: string | null
          source?: string | null
          time_spent_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_reading_log_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reading_log_kid_profile_id"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "kid_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reading_log_session_id"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "user_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reading_log_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reading_log_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reading_log_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          description: string | null
          duplicate_of: string | null
          escalated_to: string | null
          id: string
          ip_address: string | null
          is_escalated: boolean
          is_supervisor_flag: boolean
          metadata: Json
          reason: string
          reporter_id: string
          resolution: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          screenshot_urls: string[] | null
          status: string
          supervisor_category_id: string | null
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duplicate_of?: string | null
          escalated_to?: string | null
          id?: string
          ip_address?: string | null
          is_escalated?: boolean
          is_supervisor_flag?: boolean
          metadata?: Json
          reason: string
          reporter_id: string
          resolution?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_urls?: string[] | null
          status?: string
          supervisor_category_id?: string | null
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duplicate_of?: string | null
          escalated_to?: string | null
          id?: string
          ip_address?: string | null
          is_escalated?: boolean
          is_supervisor_flag?: boolean
          metadata?: Json
          reason?: string
          reporter_id?: string
          resolution?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_urls?: string[] | null
          status?: string
          supervisor_category_id?: string | null
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_reports_duplicate_of"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reports_escalated_to"
            columns: ["escalated_to"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reports_escalated_to"
            columns: ["escalated_to"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reports_escalated_to"
            columns: ["escalated_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reports_reporter_id"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reports_reporter_id"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reports_reporter_id"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reports_resolved_by"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reports_resolved_by"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reports_resolved_by"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reports_supervisor_category_id"
            columns: ["supervisor_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      reserved_usernames: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          reason: string | null
          reserved_for: string | null
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          reason?: string | null
          reserved_for?: string | null
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          reason?: string | null
          reserved_for?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_reserved_usernames_reserved_for"
            columns: ["reserved_for"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reserved_usernames_reserved_for"
            columns: ["reserved_for"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_reserved_usernames_reserved_for"
            columns: ["reserved_for"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permission_sets: {
        Row: {
          permission_set_id: string
          role_id: string
        }
        Insert: {
          permission_set_id: string
          role_id: string
        }
        Update: {
          permission_set_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permission_sets_permission_set_id_fkey"
            columns: ["permission_set_id"]
            isOneToOne: false
            referencedRelation: "permission_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permission_sets_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          color_hex: string | null
          created_at: string
          description: string | null
          display_name: string
          hierarchy_level: number
          icon_name: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          color_hex?: string | null
          created_at?: string
          description?: string | null
          display_name: string
          hierarchy_level?: number
          icon_name?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          color_hex?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          hierarchy_level?: number
          icon_name?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      score_events: {
        Row: {
          action: string
          article_id: string | null
          category_id: string | null
          created_at: string
          id: string
          kid_profile_id: string | null
          metadata: Json
          occurred_on: string
          points: number
          source_id: string | null
          source_type: string
          user_id: string | null
        }
        Insert: {
          action: string
          article_id?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          kid_profile_id?: string | null
          metadata?: Json
          occurred_on: string
          points: number
          source_id?: string | null
          source_type: string
          user_id?: string | null
        }
        Update: {
          action?: string
          article_id?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          kid_profile_id?: string | null
          metadata?: Json
          occurred_on?: string
          points?: number
          source_id?: string | null
          source_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_score_events_action"
            columns: ["action"]
            isOneToOne: false
            referencedRelation: "score_rules"
            referencedColumns: ["action"]
          },
        ]
      }
      score_rules: {
        Row: {
          action: string
          applies_to_kids: boolean
          category_multiplier: boolean
          cooldown_seconds: number | null
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          max_per_article: number | null
          max_per_day: number | null
          metadata: Json
          points: number
          updated_at: string
        }
        Insert: {
          action: string
          applies_to_kids?: boolean
          category_multiplier?: boolean
          cooldown_seconds?: number | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          max_per_article?: number | null
          max_per_day?: number | null
          metadata?: Json
          points: number
          updated_at?: string
        }
        Update: {
          action?: string
          applies_to_kids?: boolean
          category_multiplier?: boolean
          cooldown_seconds?: number | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          max_per_article?: number | null
          max_per_day?: number | null
          metadata?: Json
          points?: number
          updated_at?: string
        }
        Relationships: []
      }
      score_tiers: {
        Row: {
          color_hex: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          display_name: string
          icon_name: string | null
          id: string
          is_active: boolean
          max_score: number | null
          min_score: number
          name: string
          perks: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          color_hex?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_name: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          max_score?: number | null
          min_score: number
          name: string
          perks?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color_hex?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_name?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          max_score?: number | null
          min_score?: number
          name?: string
          perks?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      search_history: {
        Row: {
          created_at: string
          device_type: string | null
          filters_applied: Json | null
          id: string
          query: string
          query_normalized: string | null
          result_count: number | null
          result_type: string | null
          search_duration_ms: number | null
          selected_position: number | null
          selected_result_id: string | null
          selected_result_type: string | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          filters_applied?: Json | null
          id?: string
          query: string
          query_normalized?: string | null
          result_count?: number | null
          result_type?: string | null
          search_duration_ms?: number | null
          selected_position?: number | null
          selected_result_id?: string | null
          selected_result_type?: string | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_type?: string | null
          filters_applied?: Json | null
          id?: string
          query?: string
          query_normalized?: string | null
          result_count?: number | null
          result_type?: string | null
          search_duration_ms?: number | null
          selected_position?: number | null
          selected_result_id?: string | null
          selected_result_type?: string | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_search_history_session_id"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "user_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_search_history_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_search_history_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_search_history_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          app_build: string | null
          app_version: string | null
          auth_provider: string | null
          browser_name: string | null
          browser_version: string | null
          created_at: string
          device_id: string | null
          device_model: string | null
          device_name: string | null
          expires_at: string
          id: string
          ip_address: string | null
          is_active: boolean
          is_current: boolean
          last_active_at: string | null
          location_city: string | null
          location_country: string | null
          os_name: string | null
          os_version: string | null
          push_token: string | null
          push_token_type: string | null
          push_token_updated_at: string | null
          refresh_token_hash: string | null
          revoke_reason: string | null
          revoked_at: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          app_build?: string | null
          app_version?: string | null
          auth_provider?: string | null
          browser_name?: string | null
          browser_version?: string | null
          created_at?: string
          device_id?: string | null
          device_model?: string | null
          device_name?: string | null
          expires_at: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          is_current?: boolean
          last_active_at?: string | null
          location_city?: string | null
          location_country?: string | null
          os_name?: string | null
          os_version?: string | null
          push_token?: string | null
          push_token_type?: string | null
          push_token_updated_at?: string | null
          refresh_token_hash?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          app_build?: string | null
          app_version?: string | null
          auth_provider?: string | null
          browser_name?: string | null
          browser_version?: string | null
          created_at?: string
          device_id?: string | null
          device_model?: string | null
          device_name?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean
          is_current?: boolean
          last_active_at?: string | null
          location_city?: string | null
          location_country?: string | null
          os_name?: string | null
          os_version?: string | null
          push_token?: string | null
          push_token_type?: string | null
          push_token_updated_at?: string | null
          refresh_token_hash?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_sessions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sessions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sessions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          display_name: string | null
          id: string
          is_public: boolean
          is_sensitive: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: string
          value_type: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          is_public?: boolean
          is_sensitive?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
          value_type?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          is_public?: boolean
          is_sensitive?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_settings_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_settings_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_settings_updated_by"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          article_id: string
          author_name: string | null
          created_at: string
          id: string
          metadata: Json
          published_date: string | null
          publisher: string | null
          quote: string | null
          sort_order: number
          source_type: string | null
          title: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          article_id: string
          author_name?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          published_date?: string | null
          publisher?: string | null
          quote?: string | null
          sort_order?: number
          source_type?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          article_id?: string
          author_name?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          published_date?: string | null
          publisher?: string | null
          quote?: string | null
          sort_order?: number
          source_type?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_sources_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          billing_email: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_end: string | null
          contract_start: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          metadata: Json
          name: string
          slug: string
          total_spend_cents: number
          updated_at: string
          website_url: string | null
        }
        Insert: {
          billing_email?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          metadata?: Json
          name: string
          slug: string
          total_spend_cents?: number
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          billing_email?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          metadata?: Json
          name?: string
          slug?: string
          total_spend_cents?: number
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string
          event_type: string
          from_plan: string | null
          id: string
          metadata: Json | null
          provider: string
          provider_event_id: string | null
          reason: string | null
          subscription_id: string
          to_plan: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string
          event_type: string
          from_plan?: string | null
          id?: string
          metadata?: Json | null
          provider: string
          provider_event_id?: string | null
          reason?: string | null
          subscription_id: string
          to_plan?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string
          event_type?: string
          from_plan?: string | null
          id?: string
          metadata?: Json | null
          provider?: string
          provider_event_id?: string | null
          reason?: string | null
          subscription_id?: string
          to_plan?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_subscription_events_subscription_id"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_subscription_events_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_subscription_events_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_subscription_events_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_topics: {
        Row: {
          category_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_topics_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_topics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_topics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_topics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          apple_original_transaction_id: string | null
          auto_renew: boolean
          billing_retry_count: number
          cancel_at: string | null
          cancel_feedback: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          discount_percent: number | null
          downgraded_at: string | null
          downgraded_from_plan_id: string | null
          family_owner_id: string | null
          google_purchase_token: string | null
          grace_period_ends_at: string | null
          grace_period_started_at: string | null
          id: string
          is_family_member: boolean
          kid_seats_paid: number
          metadata: Json
          next_renewal_at: string | null
          pause_end: string | null
          pause_start: string | null
          plan_id: string
          platform: string
          promo_code_id: string | null
          source: string
          status: string
          stripe_payment_method_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string
          win_back_eligible_at: string | null
          win_back_sent_at: string | null
        }
        Insert: {
          apple_original_transaction_id?: string | null
          auto_renew?: boolean
          billing_retry_count?: number
          cancel_at?: string | null
          cancel_feedback?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end: string
          current_period_start: string
          discount_percent?: number | null
          downgraded_at?: string | null
          downgraded_from_plan_id?: string | null
          family_owner_id?: string | null
          google_purchase_token?: string | null
          grace_period_ends_at?: string | null
          grace_period_started_at?: string | null
          id?: string
          is_family_member?: boolean
          kid_seats_paid?: number
          metadata?: Json
          next_renewal_at?: string | null
          pause_end?: string | null
          pause_start?: string | null
          plan_id: string
          platform?: string
          promo_code_id?: string | null
          source: string
          status?: string
          stripe_payment_method_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id: string
          win_back_eligible_at?: string | null
          win_back_sent_at?: string | null
        }
        Update: {
          apple_original_transaction_id?: string | null
          auto_renew?: boolean
          billing_retry_count?: number
          cancel_at?: string | null
          cancel_feedback?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          discount_percent?: number | null
          downgraded_at?: string | null
          downgraded_from_plan_id?: string | null
          family_owner_id?: string | null
          google_purchase_token?: string | null
          grace_period_ends_at?: string | null
          grace_period_started_at?: string | null
          id?: string
          is_family_member?: boolean
          kid_seats_paid?: number
          metadata?: Json
          next_renewal_at?: string | null
          pause_end?: string | null
          pause_start?: string | null
          plan_id?: string
          platform?: string
          promo_code_id?: string | null
          source?: string
          status?: string
          stripe_payment_method_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string
          win_back_eligible_at?: string | null
          win_back_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_subscriptions_downgraded_from_plan_id"
            columns: ["downgraded_from_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_subscriptions_family_owner_id"
            columns: ["family_owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_subscriptions_family_owner_id"
            columns: ["family_owner_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_subscriptions_family_owner_id"
            columns: ["family_owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_subscriptions_plan_id"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_subscriptions_promo_code_id"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_subscriptions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_subscriptions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_subscriptions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          app_version: string | null
          assigned_to: string | null
          category: string
          closed_at: string | null
          created_at: string
          device_model: string | null
          email: string | null
          first_response_at: string | null
          id: string
          is_public: boolean
          metadata: Json | null
          os_version: string | null
          page_url: string | null
          platform: string | null
          priority: string
          related_article_id: string | null
          related_comment_id: string | null
          reopened_count: number
          resolved_at: string | null
          satisfaction_comment: string | null
          satisfaction_rating: number | null
          screenshot_urls: Json | null
          source: string
          status: string
          subject: string
          tags: Json | null
          ticket_number: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          assigned_to?: string | null
          category: string
          closed_at?: string | null
          created_at?: string
          device_model?: string | null
          email?: string | null
          first_response_at?: string | null
          id?: string
          is_public?: boolean
          metadata?: Json | null
          os_version?: string | null
          page_url?: string | null
          platform?: string | null
          priority?: string
          related_article_id?: string | null
          related_comment_id?: string | null
          reopened_count?: number
          resolved_at?: string | null
          satisfaction_comment?: string | null
          satisfaction_rating?: number | null
          screenshot_urls?: Json | null
          source?: string
          status?: string
          subject: string
          tags?: Json | null
          ticket_number: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          device_model?: string | null
          email?: string | null
          first_response_at?: string | null
          id?: string
          is_public?: boolean
          metadata?: Json | null
          os_version?: string | null
          page_url?: string | null
          platform?: string | null
          priority?: string
          related_article_id?: string | null
          related_comment_id?: string | null
          reopened_count?: number
          resolved_at?: string | null
          satisfaction_comment?: string | null
          satisfaction_rating?: number | null
          screenshot_urls?: Json | null
          source?: string
          status?: string
          subject?: string
          tags?: Json | null
          ticket_number?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_support_tickets_assigned_to"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_support_tickets_assigned_to"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_support_tickets_assigned_to"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_support_tickets_related_article_id"
            columns: ["related_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_support_tickets_related_comment_id"
            columns: ["related_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_support_tickets_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_support_tickets_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_support_tickets_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          attachment_urls: Json | null
          body: string
          created_at: string
          id: string
          is_automated: boolean
          is_internal_note: boolean
          is_staff: boolean
          sender_id: string | null
          ticket_id: string
        }
        Insert: {
          attachment_urls?: Json | null
          body: string
          created_at?: string
          id?: string
          is_automated?: boolean
          is_internal_note?: boolean
          is_staff?: boolean
          sender_id?: string | null
          ticket_id: string
        }
        Update: {
          attachment_urls?: Json | null
          body?: string
          created_at?: string
          id?: string
          is_automated?: boolean
          is_internal_note?: boolean
          is_staff?: boolean
          sender_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_ticket_messages_sender_id"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ticket_messages_sender_id"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ticket_messages_sender_id"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ticket_messages_ticket_id"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      timelines: {
        Row: {
          article_id: string
          created_at: string
          description: string | null
          event_body: string | null
          event_date: string
          event_image_url: string | null
          event_label: string
          id: string
          metadata: Json
          sort_order: number
          source_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          article_id: string
          created_at?: string
          description?: string | null
          event_body?: string | null
          event_date: string
          event_image_url?: string | null
          event_label: string
          id?: string
          metadata?: Json
          sort_order?: number
          source_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          article_id?: string
          created_at?: string
          description?: string | null
          event_body?: string | null
          event_date?: string
          event_image_url?: string | null
          event_label?: string
          id?: string
          metadata?: Json
          sort_order?: number
          source_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_timelines_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          created_at: string
          earned_at: string
          id: string
          kid_profile_id: string | null
          metadata: Json
          points_awarded: number
          seen_at: string | null
          user_id: string
        }
        Insert: {
          achievement_id: string
          created_at?: string
          earned_at?: string
          id?: string
          kid_profile_id?: string | null
          metadata?: Json
          points_awarded?: number
          seen_at?: string | null
          user_id: string
        }
        Update: {
          achievement_id?: string
          created_at?: string
          earned_at?: string
          id?: string
          kid_profile_id?: string | null
          metadata?: Json
          points_awarded?: number
          seen_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_achievements_achievement_id"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_achievements_kid_profile_id"
            columns: ["kid_profile_id"]
            isOneToOne: false
            referencedRelation: "kid_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_achievements_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_achievements_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_achievements_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_sets: {
        Row: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          permission_set_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          permission_set_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          permission_set_id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_sets_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_sets_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_sets_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_sets_permission_set_id_fkey"
            columns: ["permission_set_id"]
            isOneToOne: false
            referencedRelation: "permission_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferred_categories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          sort_order: number
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          sort_order?: number
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_preferred_categories_category_id"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_preferred_categories_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_preferred_categories_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_preferred_categories_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          device_name: string | null
          environment: string | null
          id: string
          invalidated_at: string | null
          last_registered_at: string
          os_version: string | null
          platform: string | null
          provider: string
          push_token: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_name?: string | null
          environment?: string | null
          id?: string
          invalidated_at?: string | null
          last_registered_at?: string
          os_version?: string | null
          platform?: string | null
          provider: string
          push_token: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_name?: string | null
          environment?: string | null
          id?: string
          invalidated_at?: string | null
          last_registered_at?: string
          os_version?: string | null
          platform?: string | null
          provider?: string
          push_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          role_id: string
          scope: string | null
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          role_id: string
          scope?: string | null
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          role_id?: string
          scope?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_roles_assigned_by"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_roles_assigned_by"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_roles_assigned_by"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_roles_role_id"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_roles_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_roles_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_roles_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          anonymous_id: string | null
          app_version: string | null
          articles_read: number
          browser_name: string | null
          browser_version: string | null
          city: string | null
          country_code: string | null
          created_at: string
          device_model: string | null
          device_session_id: string | null
          device_type: string | null
          duration_seconds: number | null
          ended_at: string | null
          entry_point: string | null
          events_count: number
          exit_point: string | null
          id: string
          ip_address: string | null
          is_active: boolean
          is_bounce: boolean
          metadata: Json
          os_name: string | null
          os_version: string | null
          referrer: string | null
          screen_height: number | null
          screen_width: number | null
          screens_viewed: number
          started_at: string
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          anonymous_id?: string | null
          app_version?: string | null
          articles_read?: number
          browser_name?: string | null
          browser_version?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          device_model?: string | null
          device_session_id?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          entry_point?: string | null
          events_count?: number
          exit_point?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean
          is_bounce?: boolean
          metadata?: Json
          os_name?: string | null
          os_version?: string | null
          referrer?: string | null
          screen_height?: number | null
          screen_width?: number | null
          screens_viewed?: number
          started_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          anonymous_id?: string | null
          app_version?: string | null
          articles_read?: number
          browser_name?: string | null
          browser_version?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          device_model?: string | null
          device_session_id?: string | null
          device_type?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          entry_point?: string | null
          events_count?: number
          exit_point?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean
          is_bounce?: boolean
          metadata?: Json
          os_name?: string | null
          os_version?: string | null
          referrer?: string | null
          screen_height?: number | null
          screen_width?: number | null
          screens_viewed?: number
          started_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_sessions_device_session_id"
            columns: ["device_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_sessions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_sessions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_sessions_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_warnings: {
        Row: {
          action_taken: string
          appeal_resolved_at: string | null
          appeal_resolved_by: string | null
          appeal_status: string | null
          appeal_text: string | null
          created_at: string
          id: string
          issued_by: string | null
          mute_until: string | null
          reason: string
          user_id: string
          warning_level: number
        }
        Insert: {
          action_taken: string
          appeal_resolved_at?: string | null
          appeal_resolved_by?: string | null
          appeal_status?: string | null
          appeal_text?: string | null
          created_at?: string
          id?: string
          issued_by?: string | null
          mute_until?: string | null
          reason: string
          user_id: string
          warning_level: number
        }
        Update: {
          action_taken?: string
          appeal_resolved_at?: string | null
          appeal_resolved_by?: string | null
          appeal_status?: string | null
          appeal_text?: string | null
          created_at?: string
          id?: string
          issued_by?: string | null
          mute_until?: string | null
          reason?: string
          user_id?: string
          warning_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_warnings_issued_by"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_warnings_issued_by"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_warnings_issued_by"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_warnings_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_warnings_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_warnings_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          allow_messages: boolean
          articles_read_count: number
          att_prompted_at: string | null
          att_status: string | null
          avatar_color: string | null
          avatar_url: string | null
          ban_reason: string | null
          banned_at: string | null
          banned_by: string | null
          banner_url: string | null
          bio: string | null
          cohort: string | null
          cohort_joined_at: string | null
          comment_count: number
          comped_until: string | null
          country_code: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          deletion_completed_at: string | null
          deletion_reason: string | null
          deletion_requested_at: string | null
          deletion_scheduled_for: string | null
          display_name: string | null
          dm_read_receipts_enabled: boolean
          email: string | null
          email_verified: boolean
          email_verified_at: string | null
          expert_organization: string | null
          expert_title: string | null
          failed_login_count: number
          first_name: string | null
          followers_count: number
          following_count: number
          frozen_at: string | null
          frozen_verity_score: number | null
          gender: string | null
          has_kids_profiles: boolean
          id: string
          is_active: boolean
          is_banned: boolean
          is_expert: boolean
          is_kids_mode_enabled: boolean
          is_muted: boolean
          is_shadow_banned: boolean
          is_verified_public_figure: boolean
          kid_trial_ends_at: string | null
          kid_trial_started_at: string | null
          kid_trial_used: boolean
          kids_pin_hash: string | null
          last_active_at: string | null
          last_login_at: string | null
          last_login_device: string | null
          last_login_ip: string | null
          last_name: string | null
          last_warning_at: string | null
          locale: string
          locked_until: string | null
          login_count: number
          metadata: Json
          mute_level: number
          muted_until: string | null
          notification_email: boolean
          notification_push: boolean
          onboarding_completed_at: string | null
          parent_pin_hash: string | null
          password_hash: string | null
          perms_version: number
          perms_version_bumped_at: string | null
          phone: string | null
          phone_verified: boolean
          phone_verified_at: string | null
          pin_attempts: number
          pin_locked_until: string | null
          plan_grace_period_ends_at: string | null
          plan_id: string | null
          plan_status: string
          primary_auth_provider: string | null
          profile_visibility: string
          quizzes_completed_count: number
          referral_code: string | null
          referred_by: string | null
          show_activity: boolean
          show_on_leaderboard: boolean
          streak_best: number
          streak_current: number
          streak_freeze_remaining: number
          streak_freeze_week_start: string | null
          streak_frozen_today: boolean
          streak_last_active_date: string | null
          stripe_customer_id: string | null
          supervisor_opted_in: boolean
          timezone: string | null
          updated_at: string
          user_state: Database["public"]["Enums"]["user_state_t"]
          username: string | null
          verify_locked_at: string | null
          verity_score: number
          warning_count: number
        }
        Insert: {
          allow_messages?: boolean
          articles_read_count?: number
          att_prompted_at?: string | null
          att_status?: string | null
          avatar_color?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: string | null
          banner_url?: string | null
          bio?: string | null
          cohort?: string | null
          cohort_joined_at?: string | null
          comment_count?: number
          comped_until?: string | null
          country_code?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          deletion_completed_at?: string | null
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          deletion_scheduled_for?: string | null
          display_name?: string | null
          dm_read_receipts_enabled?: boolean
          email?: string | null
          email_verified?: boolean
          email_verified_at?: string | null
          expert_organization?: string | null
          expert_title?: string | null
          failed_login_count?: number
          first_name?: string | null
          followers_count?: number
          following_count?: number
          frozen_at?: string | null
          frozen_verity_score?: number | null
          gender?: string | null
          has_kids_profiles?: boolean
          id?: string
          is_active?: boolean
          is_banned?: boolean
          is_expert?: boolean
          is_kids_mode_enabled?: boolean
          is_muted?: boolean
          is_shadow_banned?: boolean
          is_verified_public_figure?: boolean
          kid_trial_ends_at?: string | null
          kid_trial_started_at?: string | null
          kid_trial_used?: boolean
          kids_pin_hash?: string | null
          last_active_at?: string | null
          last_login_at?: string | null
          last_login_device?: string | null
          last_login_ip?: string | null
          last_name?: string | null
          last_warning_at?: string | null
          locale?: string
          locked_until?: string | null
          login_count?: number
          metadata?: Json
          mute_level?: number
          muted_until?: string | null
          notification_email?: boolean
          notification_push?: boolean
          onboarding_completed_at?: string | null
          parent_pin_hash?: string | null
          password_hash?: string | null
          perms_version?: number
          perms_version_bumped_at?: string | null
          phone?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          pin_attempts?: number
          pin_locked_until?: string | null
          plan_grace_period_ends_at?: string | null
          plan_id?: string | null
          plan_status?: string
          primary_auth_provider?: string | null
          profile_visibility?: string
          quizzes_completed_count?: number
          referral_code?: string | null
          referred_by?: string | null
          show_activity?: boolean
          show_on_leaderboard?: boolean
          streak_best?: number
          streak_current?: number
          streak_freeze_remaining?: number
          streak_freeze_week_start?: string | null
          streak_frozen_today?: boolean
          streak_last_active_date?: string | null
          stripe_customer_id?: string | null
          supervisor_opted_in?: boolean
          timezone?: string | null
          updated_at?: string
          user_state?: Database["public"]["Enums"]["user_state_t"]
          username?: string | null
          verify_locked_at?: string | null
          verity_score?: number
          warning_count?: number
        }
        Update: {
          allow_messages?: boolean
          articles_read_count?: number
          att_prompted_at?: string | null
          att_status?: string | null
          avatar_color?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          banned_by?: string | null
          banner_url?: string | null
          bio?: string | null
          cohort?: string | null
          cohort_joined_at?: string | null
          comment_count?: number
          comped_until?: string | null
          country_code?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          deletion_completed_at?: string | null
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          deletion_scheduled_for?: string | null
          display_name?: string | null
          dm_read_receipts_enabled?: boolean
          email?: string | null
          email_verified?: boolean
          email_verified_at?: string | null
          expert_organization?: string | null
          expert_title?: string | null
          failed_login_count?: number
          first_name?: string | null
          followers_count?: number
          following_count?: number
          frozen_at?: string | null
          frozen_verity_score?: number | null
          gender?: string | null
          has_kids_profiles?: boolean
          id?: string
          is_active?: boolean
          is_banned?: boolean
          is_expert?: boolean
          is_kids_mode_enabled?: boolean
          is_muted?: boolean
          is_shadow_banned?: boolean
          is_verified_public_figure?: boolean
          kid_trial_ends_at?: string | null
          kid_trial_started_at?: string | null
          kid_trial_used?: boolean
          kids_pin_hash?: string | null
          last_active_at?: string | null
          last_login_at?: string | null
          last_login_device?: string | null
          last_login_ip?: string | null
          last_name?: string | null
          last_warning_at?: string | null
          locale?: string
          locked_until?: string | null
          login_count?: number
          metadata?: Json
          mute_level?: number
          muted_until?: string | null
          notification_email?: boolean
          notification_push?: boolean
          onboarding_completed_at?: string | null
          parent_pin_hash?: string | null
          password_hash?: string | null
          perms_version?: number
          perms_version_bumped_at?: string | null
          phone?: string | null
          phone_verified?: boolean
          phone_verified_at?: string | null
          pin_attempts?: number
          pin_locked_until?: string | null
          plan_grace_period_ends_at?: string | null
          plan_id?: string | null
          plan_status?: string
          primary_auth_provider?: string | null
          profile_visibility?: string
          quizzes_completed_count?: number
          referral_code?: string | null
          referred_by?: string | null
          show_activity?: boolean
          show_on_leaderboard?: boolean
          streak_best?: number
          streak_current?: number
          streak_freeze_remaining?: number
          streak_freeze_week_start?: string | null
          streak_frozen_today?: boolean
          streak_last_active_date?: string | null
          stripe_customer_id?: string | null
          supervisor_opted_in?: boolean
          timezone?: string | null
          updated_at?: string
          user_state?: Database["public"]["Enums"]["user_state_t"]
          username?: string | null
          verify_locked_at?: string | null
          verity_score?: number
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_users_banned_by"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_users_banned_by"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_users_banned_by"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_users_plan_id"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_users_referred_by"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_users_referred_by"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_users_referred_by"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_log: {
        Row: {
          created_at: string
          endpoint: string | null
          event_id: string | null
          event_type: string
          headers: Json | null
          id: string
          ip_address: string | null
          max_retries: number
          method: string
          next_retry_at: string | null
          payload: Json
          processed_at: string | null
          processing_duration_ms: number | null
          processing_error: string | null
          processing_status: string
          response_body: string | null
          response_status: number | null
          retry_count: number
          signature_valid: boolean | null
          source: string
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          event_id?: string | null
          event_type: string
          headers?: Json | null
          id?: string
          ip_address?: string | null
          max_retries?: number
          method?: string
          next_retry_at?: string | null
          payload: Json
          processed_at?: string | null
          processing_duration_ms?: number | null
          processing_error?: string | null
          processing_status?: string
          response_body?: string | null
          response_status?: number | null
          retry_count?: number
          signature_valid?: boolean | null
          source: string
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          event_id?: string | null
          event_type?: string
          headers?: Json | null
          id?: string
          ip_address?: string | null
          max_retries?: number
          method?: string
          next_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          processing_duration_ms?: number | null
          processing_error?: string | null
          processing_status?: string
          response_body?: string | null
          response_status?: number | null
          retry_count?: number
          signature_valid?: boolean | null
          source?: string
        }
        Relationships: []
      }
      weekly_recap_attempts: {
        Row: {
          answers: Json
          articles_missed: string[] | null
          completed_at: string | null
          created_at: string
          id: string
          recap_quiz_id: string
          score: number
          total_questions: number
          user_id: string
        }
        Insert: {
          answers?: Json
          articles_missed?: string[] | null
          completed_at?: string | null
          created_at?: string
          id?: string
          recap_quiz_id: string
          score?: number
          total_questions: number
          user_id: string
        }
        Update: {
          answers?: Json
          articles_missed?: string[] | null
          completed_at?: string | null
          created_at?: string
          id?: string
          recap_quiz_id?: string
          score?: number
          total_questions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_weekly_recap_attempts_recap_quiz_id"
            columns: ["recap_quiz_id"]
            isOneToOne: false
            referencedRelation: "weekly_recap_quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_weekly_recap_attempts_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_weekly_recap_attempts_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_weekly_recap_attempts_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_recap_questions: {
        Row: {
          article_id: string | null
          created_at: string
          explanation: string | null
          id: string
          options: Json
          question_text: string
          recap_quiz_id: string
          sort_order: number
        }
        Insert: {
          article_id?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          options?: Json
          question_text: string
          recap_quiz_id: string
          sort_order?: number
        }
        Update: {
          article_id?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          options?: Json
          question_text?: string
          recap_quiz_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_weekly_recap_questions_article_id"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_weekly_recap_questions_recap_quiz_id"
            columns: ["recap_quiz_id"]
            isOneToOne: false
            referencedRelation: "weekly_recap_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_recap_quizzes: {
        Row: {
          article_ids: string[]
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
          week_end: string
          week_start: string
        }
        Insert: {
          article_ids?: string[]
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
          week_end: string
          week_start: string
        }
        Update: {
          article_ids?: string[]
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_weekly_recap_quizzes_category_id"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      events_24h_summary: {
        Row: {
          bot_events: number | null
          distinct_sessions: number | null
          distinct_users: number | null
          event_category: string | null
          event_name: string | null
          first_seen: string | null
          last_seen: string | null
          total: number | null
        }
        Relationships: []
      }
      public_profiles_v: {
        Row: {
          articles_read_count: number | null
          avatar_color: string | null
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          comment_count: number | null
          created_at: string | null
          display_name: string | null
          email_verified: boolean | null
          expert_organization: string | null
          expert_title: string | null
          followers_count: number | null
          following_count: number | null
          id: string | null
          is_expert: boolean | null
          is_frozen: boolean | null
          is_pro: boolean | null
          is_verified_public_figure: boolean | null
          profile_visibility: string | null
          quizzes_completed_count: number | null
          show_activity: boolean | null
          show_on_leaderboard: boolean | null
          streak_current: number | null
          username: string | null
          verity_score: number | null
        }
        Insert: {
          articles_read_count?: number | null
          avatar_color?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          comment_count?: number | null
          created_at?: string | null
          display_name?: string | null
          email_verified?: boolean | null
          expert_organization?: string | null
          expert_title?: string | null
          followers_count?: number | null
          following_count?: number | null
          id?: string | null
          is_expert?: boolean | null
          is_frozen?: never
          is_pro?: never
          is_verified_public_figure?: boolean | null
          profile_visibility?: string | null
          quizzes_completed_count?: number | null
          show_activity?: boolean | null
          show_on_leaderboard?: boolean | null
          streak_current?: number | null
          username?: string | null
          verity_score?: number | null
        }
        Update: {
          articles_read_count?: number | null
          avatar_color?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          comment_count?: number | null
          created_at?: string | null
          display_name?: string | null
          email_verified?: boolean | null
          expert_organization?: string | null
          expert_title?: string | null
          followers_count?: number | null
          following_count?: number | null
          id?: string | null
          is_expert?: boolean | null
          is_frozen?: never
          is_pro?: never
          is_verified_public_figure?: boolean | null
          profile_visibility?: string | null
          quizzes_completed_count?: number | null
          show_activity?: boolean | null
          show_on_leaderboard?: boolean | null
          streak_current?: number | null
          username?: string | null
          verity_score?: number | null
        }
        Relationships: []
      }
      public_user_profiles: {
        Row: {
          avatar_color: string | null
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          expert_organization: string | null
          expert_title: string | null
          id: string | null
          is_expert: boolean | null
          is_verified_public_figure: boolean | null
          profile_visibility: string | null
          streak_current: number | null
          username: string | null
          verity_score: number | null
        }
        Insert: {
          avatar_color?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          expert_organization?: string | null
          expert_title?: string | null
          id?: string | null
          is_expert?: boolean | null
          is_verified_public_figure?: boolean | null
          profile_visibility?: string | null
          streak_current?: number | null
          username?: string | null
          verity_score?: number | null
        }
        Update: {
          avatar_color?: string | null
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          expert_organization?: string | null
          expert_title?: string | null
          id?: string | null
          is_expert?: boolean | null
          is_verified_public_figure?: boolean | null
          profile_visibility?: string | null
          streak_current?: number | null
          username?: string | null
          verity_score?: number | null
        }
        Relationships: []
      }
      v_cluster_lifecycle: {
        Row: {
          cluster_id: string | null
          completed: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      _is_in_quiet_hours: {
        Args: { p_at: string; p_end: string; p_start: string }
        Returns: boolean
      }
      _setting_int: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      _subject_local_today: {
        Args: { p_kid_profile_id?: string; p_user_id: string }
        Returns: string
      }
      _user_freeze_allowance: {
        Args: { p_kid_profile_id?: string; p_user_id: string }
        Returns: number
      }
      _user_is_comment_blocked: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      _user_is_dm_blocked: { Args: { p_user_id: string }; Returns: boolean }
      _user_is_moderator: { Args: { p_user_id: string }; Returns: boolean }
      _user_is_paid: { Args: { p_user_id: string }; Returns: boolean }
      _user_tier_or_anon: { Args: { p_user_id: string }; Returns: string }
      ack_email_batch: { Args: { p_rows: Json }; Returns: undefined }
      ack_push_batch: { Args: { p_rows: Json }; Returns: undefined }
      admin_apply_dob_correction: {
        Args: {
          p_decision: string
          p_decision_reason: string
          p_request_id: string
        }
        Returns: undefined
      }
      admin_restore_article: {
        Args: { p_admin_id: string; p_article_id: string }
        Returns: undefined
      }
      admin_soft_delete_article: {
        Args: { p_admin_id: string; p_article_id: string; p_reason?: string }
        Returns: undefined
      }
      advance_streak: {
        Args: { p_kid_profile_id?: string; p_user_id?: string }
        Returns: Json
      }
      anonymize_audit_log_pii: { Args: never; Returns: number }
      anonymize_user: { Args: { p_user_id: string }; Returns: undefined }
      apply_penalty: {
        Args: {
          p_level: number
          p_mod_id: string
          p_reason: string
          p_target_id: string
        }
        Returns: string
      }
      apply_signup_cohort: {
        Args: { p_user_id: string; p_via_owner_link?: boolean }
        Returns: string
      }
      approve_expert_answer: {
        Args: { p_comment_id: string; p_editor_id: string }
        Returns: undefined
      }
      approve_expert_application: {
        Args: {
          p_application_id: string
          p_review_notes?: string
          p_reviewer_id: string
        }
        Returns: undefined
      }
      archive_cluster: {
        Args: { p_cluster_id: string; p_reason?: string }
        Returns: Json
      }
      article_quiz_pool_size: {
        Args: { p_article_id: string }
        Returns: number
      }
      ask_expert: {
        Args: {
          p_article_id: string
          p_body: string
          p_target_id: string
          p_target_type: string
          p_user_id: string
        }
        Returns: Json
      }
      award_points: {
        Args: {
          p_action: string
          p_article_id?: string
          p_category_id?: string
          p_kid_profile_id?: string
          p_source_id?: string
          p_source_type?: string
          p_synthetic_key?: string
          p_user_id?: string
        }
        Returns: Json
      }
      award_reading_points: { Args: { p_article_id: string }; Returns: Json }
      billing_cancel_subscription: {
        Args: { p_reason?: string; p_user_id: string }
        Returns: Json
      }
      billing_change_plan: {
        Args: { p_new_plan_id: string; p_user_id: string }
        Returns: Json
      }
      billing_freeze_expired_grace: { Args: never; Returns: number }
      billing_freeze_profile: { Args: { p_user_id: string }; Returns: Json }
      billing_resubscribe: {
        Args: { p_new_plan_id: string; p_user_id: string }
        Returns: Json
      }
      billing_uncancel_subscription: {
        Args: { p_user_id: string }
        Returns: Json
      }
      billing_unfreeze: { Args: { p_user_id: string }; Returns: Json }
      breaking_news_quota_check: { Args: { p_user_id: string }; Returns: Json }
      bump_perms_global_version: { Args: never; Returns: undefined }
      bump_user_perms_version: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      caller_can_assign_role: {
        Args: { p_role_name: string }
        Returns: boolean
      }
      can_user_see_discussion: {
        Args: { p_article_id: string; p_user_id: string }
        Returns: boolean
      }
      cancel_account_deletion: { Args: { p_user_id: string }; Returns: boolean }
      check_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_sec: number }
        Returns: Json
      }
      check_user_achievements: {
        Args: { p_user_id: string }
        Returns: {
          achievement_id: string
          created_at: string
          earned_at: string
          id: string
          kid_profile_id: string | null
          metadata: Json
          points_awarded: number
          seen_at: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "user_achievements"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_cluster_lock: {
        Args: { p_cluster_id: string; p_locked_by: string; p_ttl_sec?: number }
        Returns: {
          acquired: boolean
          locked_at: string
          locked_by: string
        }[]
      }
      claim_cluster_lock_v2: {
        Args: {
          p_audience_band: string
          p_cluster_id: string
          p_locked_by: string
          p_ttl_sec?: number
        }
        Returns: {
          acquired: boolean
          locked_at: string
          locked_by: string
        }[]
      }
      claim_email_batch: {
        Args: { p_limit: number }
        Returns: {
          action_url: string
          body: string
          id: string
          metadata: Json
          title: string
          type: string
          user_id: string
        }[]
      }
      claim_graduation_token: {
        Args: { p_new_user_id: string; p_token: string }
        Returns: {
          display_name: string
          kid_profile_id: string
          parent_user_id: string
        }[]
      }
      claim_next_export_request: {
        Args: never
        Returns: {
          completed_at: string | null
          created_at: string
          deadline_at: string | null
          download_expires_at: string | null
          download_url: string | null
          file_size_bytes: number | null
          id: string
          identity_verified: boolean
          identity_verified_at: string | null
          identity_verified_by: string | null
          legal_hold: boolean
          metadata: Json
          notes: string | null
          processed_by: string | null
          processing_started_at: string | null
          reason: string | null
          regulation: string
          requested_data_types: string[] | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "data_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_push_batch: {
        Args: { p_limit: number }
        Returns: {
          action_url: string
          body: string
          id: string
          metadata: Json
          title: string
          type: string
          user_id: string
        }[]
      }
      claim_queue_item: {
        Args: { p_queue_item_id: string; p_user_id: string }
        Returns: undefined
      }
      cleanup_rate_limit_events: {
        Args: { p_retention_days?: number }
        Returns: number
      }
      clear_failed_login: { Args: { p_user_id: string }; Returns: undefined }
      clear_kid_lockout: {
        Args: { p_kid_profile_id: string; p_parent_pin: string }
        Returns: boolean
      }
      complete_email_verification: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      compute_band_from_dob: { Args: { p_dob: string }; Returns: string }
      compute_effective_perms: {
        Args: { p_user_id: string }
        Returns: {
          deny_mode: string
          granted: boolean
          granted_via: string
          lock_message: string
          permission_display_name: string
          permission_id: string
          permission_key: string
          requires_verified: boolean
          source_detail: Json
          surface: string
        }[]
      }
      convert_kid_trial: { Args: { p_user_id: string }; Returns: number }
      create_bookmark_collection: {
        Args: { p_description?: string; p_name: string; p_user_id: string }
        Returns: string
      }
      create_events_partition_for: {
        Args: { target_date: string }
        Returns: undefined
      }
      create_notification: {
        Args: {
          p_action_id?: string
          p_action_type?: string
          p_action_url?: string
          p_body?: string
          p_metadata?: Json
          p_priority?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_support_ticket: {
        Args: { p_body: string; p_category: string; p_subject: string }
        Returns: Json
      }
      current_kid_profile_id: { Args: never; Returns: string }
      decline_queue_item: {
        Args: { p_queue_item_id: string; p_user_id: string }
        Returns: undefined
      }
      delete_bookmark_collection: {
        Args: { p_collection_id: string; p_user_id: string }
        Returns: undefined
      }
      dismiss_cluster: {
        Args: { p_cluster_id: string; p_reason?: string }
        Returns: Json
      }
      drop_old_events_partitions: {
        Args: { retention_days?: number }
        Returns: number
      }
      edit_comment: {
        Args: { p_body: string; p_comment_id: string; p_user_id: string }
        Returns: undefined
      }
      expert_can_see_back_channel: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      export_user_data: { Args: { p_user_id: string }; Returns: Json }
      family_members: {
        Args: { p_owner_id: string }
        Returns: {
          display: string
          id: string
          kind: string
          score: number
          streak: number
        }[]
      }
      family_weekly_report: { Args: { p_owner_id: string }; Returns: Json }
      feature_flag_enabled_for: {
        Args: {
          p_app_version?: string
          p_key: string
          p_os_version?: string
          p_platform?: string
        }
        Returns: boolean
      }
      flag_expert_reverifications_due: {
        Args: { p_warning_days?: number }
        Returns: number
      }
      freeze_kid_trial: { Args: { p_user_id: string }; Returns: undefined }
      generate_kid_pair_code: {
        Args: { p_kid_profile_id: string }
        Returns: Json
      }
      generate_referral_slug: { Args: never; Returns: string }
      get_kid_category_rank: {
        Args: { p_category_id: string }
        Returns: {
          rank: number
          score: number
          total: number
        }[]
      }
      get_kid_quiz_verdict: {
        Args: { p_article_id: string; p_kid_profile_id: string }
        Returns: Json
      }
      get_my_capabilities: {
        Args: { p_as_kid?: string; p_kid_token?: string; p_section: string }
        Returns: {
          deny_mode: string
          granted: boolean
          label: string
          lock_message: string
          lock_reason: string
          permission_key: string
          sort_order: number
          ui_element: string
        }[]
      }
      get_own_login_activity: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          created_at: string
          id: string
          metadata: Json
        }[]
      }
      get_unread_counts: {
        Args: never
        Returns: {
          conversation_id: string
          unread: number
        }[]
      }
      get_user_category_metrics: {
        Args: { p_category_id?: string; p_user_id: string }
        Returns: {
          category_id: string
          comments: number
          name: string
          quizzes_passed: number
          reads: number
          score: number
          subcategory_id: string
          upvotes_received: number
        }[]
      }
      get_user_lockout_by_email: { Args: { p_email: string }; Returns: string }
      graduate_kid_profile: {
        Args: { p_intended_email: string; p_kid_profile_id: string }
        Returns: {
          expires_at: string
          token: string
        }[]
      }
      grant_pro_to_cohort: {
        Args: { p_cohort: string; p_months: number }
        Returns: number
      }
      grant_role: {
        Args: { p_admin_id: string; p_role_name: string; p_user_id: string }
        Returns: undefined
      }
      has_permission: {
        Args: { p_as_kid?: string; p_key: string; p_kid_token?: string }
        Returns: boolean
      }
      has_permission_for: {
        Args: {
          p_as_kid?: string
          p_key: string
          p_kid_token?: string
          p_scope_id: string
          p_scope_type: string
        }
        Returns: boolean
      }
      has_verified_email: { Args: never; Returns: boolean }
      hide_comment: {
        Args: { p_comment_id: string; p_mod_id: string; p_reason: string }
        Returns: undefined
      }
      increment_bookmark_count: {
        Args: { amount?: number; article_id: string }
        Returns: undefined
      }
      increment_comment_count: {
        Args: { amount?: number; article_id: string }
        Returns: undefined
      }
      increment_comment_vote: {
        Args: { amount?: number; comment_id: string; vote_type: string }
        Returns: undefined
      }
      increment_field: {
        Args: {
          amount?: number
          field_name: string
          row_id: string
          table_name: string
        }
        Returns: undefined
      }
      increment_share_count: {
        Args: { article_id: string }
        Returns: undefined
      }
      increment_view_count: { Args: { article_id: string }; Returns: undefined }
      invalidate_push_token: { Args: { p_token: string }; Returns: boolean }
      invalidate_user_push_token: {
        Args: { p_token: string }
        Returns: boolean
      }
      is_admin_or_above: { Args: never; Returns: boolean }
      is_banned: { Args: never; Returns: boolean }
      is_category_supervisor: {
        Args: { p_category_id: string; p_user_id: string }
        Returns: boolean
      }
      is_editor_or_above: { Args: never; Returns: boolean }
      is_email_registered: { Args: { p_email: string }; Returns: boolean }
      is_expert_in_probation: { Args: { p_user_id: string }; Returns: boolean }
      is_expert_or_above: { Args: never; Returns: boolean }
      is_family_owner: { Args: { p_user_id: string }; Returns: boolean }
      is_kid_delegated: { Args: never; Returns: boolean }
      is_mod_or_above: { Args: never; Returns: boolean }
      is_paid_user: { Args: never; Returns: boolean }
      is_premium: { Args: never; Returns: boolean }
      is_user_expert: { Args: { p_user_id: string }; Returns: boolean }
      kid_family_leaderboard: {
        Args: { p_kid_profile_id: string }
        Returns: {
          display_name: string
          id: string
          is_self: boolean
          verity_score: number
        }[]
      }
      kid_session_valid: {
        Args: { p_kid_profile_id: string; p_token: string }
        Returns: boolean
      }
      kid_visible_bands: { Args: { p_profile_id: string }; Returns: string[] }
      lockdown_self: { Args: { p_user_id: string }; Returns: Json }
      log_ad_click: { Args: { p_impression_id: string }; Returns: undefined }
      log_ad_impression: {
        Args: {
          p_ad_unit_id: string
          p_article_id?: string
          p_campaign_id?: string
          p_page?: string
          p_placement_id: string
          p_position?: string
          p_session_id?: string
          p_user_id?: string
        }
        Returns: string
      }
      mark_probation_complete: {
        Args: { p_admin_id: string; p_application_id: string }
        Returns: undefined
      }
      merge_clusters: {
        Args: { p_source_id: string; p_target_id: string }
        Returns: Json
      }
      mint_owner_referral_link: {
        Args: {
          p_actor_user_id?: string
          p_description?: string
          p_expires_at?: string
          p_max_uses?: number
        }
        Returns: {
          code: string
          id: string
        }[]
      }
      mint_referral_codes: {
        Args: { p_user_id: string }
        Returns: {
          code: string
          id: string
          slot: number
        }[]
      }
      my_permission_keys: {
        Args: { p_as_kid?: string; p_kid_token?: string }
        Returns: {
          permission_key: string
        }[]
      }
      my_perms_version: { Args: never; Returns: Json }
      owns_kid_profile: { Args: { profile_id: string }; Returns: boolean }
      persist_generated_article: {
        Args: { p_payload: Json }
        Returns: {
          article_id: string
          audience: string
          slug: string
        }[]
      }
      pipeline_today_cost_usd: { Args: never; Returns: number }
      post_back_channel_message: {
        Args: {
          p_body: string
          p_category_id: string
          p_parent_id?: string
          p_source_comment_id?: string
          p_title?: string
          p_user_id: string
        }
        Returns: string
      }
      post_comment: {
        Args: {
          p_article_id: string
          p_body: string
          p_mentions?: Json
          p_parent_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      post_expert_answer: {
        Args: { p_body: string; p_queue_item_id: string; p_user_id: string }
        Returns: Json
      }
      post_message: {
        Args: { p_body: string; p_conversation_id: string; p_user_id: string }
        Returns: Json
      }
      preview_capabilities_as: {
        Args: { p_section: string; p_user_id: string }
        Returns: {
          deny_mode: string
          granted: boolean
          label: string
          lock_message: string
          lock_reason: string
          permission_key: string
          sort_order: number
          ui_element: string
        }[]
      }
      purge_audit_log: { Args: never; Returns: number }
      purge_rate_limit_events: {
        Args: { older_than?: string }
        Returns: number
      }
      purge_soft_deleted_articles: { Args: never; Returns: number }
      purge_webhook_log: { Args: never; Returns: number }
      reassign_cluster_items: {
        Args: {
          p_audience: string
          p_item_id: string
          p_target_cluster_id: string
        }
        Returns: Json
      }
      recompute_family_achievements: { Args: never; Returns: Json }
      recompute_verity_score: {
        Args: { p_kid_profile_id?: string; p_user_id?: string }
        Returns: Json
      }
      reconcile_cost_reservation: {
        Args: { p_run_id: string }
        Returns: undefined
      }
      reconcile_verity_scores: {
        Args: never
        Returns: {
          current_score: number
          drift: number
          ledger_sum: number
          user_id: string
        }[]
      }
      record_admin_action: {
        Args: {
          p_action: string
          p_ip?: unknown
          p_new_value?: Json
          p_old_value?: Json
          p_reason?: string
          p_target_id?: string
          p_target_table?: string
          p_user_agent?: string
        }
        Returns: string
      }
      record_failed_login: { Args: { p_user_id: string }; Returns: undefined }
      record_failed_login_by_email: {
        Args: { p_email: string }
        Returns: string
      }
      redeem_kid_pair_code: {
        Args: { p_code: string; p_device?: string }
        Returns: Json
      }
      redeem_referral: {
        Args: {
          p_code_id: string
          p_provenance?: Json
          p_used_by_user_id: string
        }
        Returns: {
          code_tier: string
          redemption_id: string
          referrer_user_id: string
          was_recorded: boolean
        }[]
      }
      register_push_token: {
        Args: {
          p_app_version?: string
          p_device_id?: string
          p_os_name?: string
          p_os_version?: string
          p_platform?: string
          p_provider: string
          p_session_id: string
          p_token: string
        }
        Returns: boolean
      }
      reject_expert_application: {
        Args: {
          p_application_id: string
          p_rejection_reason: string
          p_reviewer_id: string
        }
        Returns: undefined
      }
      release_cluster_lock: {
        Args: { p_cluster_id: string; p_locked_by: string }
        Returns: boolean
      }
      release_cluster_lock_v2: {
        Args: {
          p_audience_band: string
          p_cluster_id: string
          p_locked_by: string
        }
        Returns: undefined
      }
      release_stale_expert_claims: {
        Args: { p_max_age_hours?: number }
        Returns: number
      }
      rename_bookmark_collection: {
        Args: {
          p_collection_id: string
          p_description?: string
          p_name: string
          p_user_id: string
        }
        Returns: undefined
      }
      require_outranks: { Args: { target_user_id: string }; Returns: boolean }
      reserve_cost_or_fail: {
        Args: { p_estimated_usd: number; p_run_id: string }
        Returns: {
          accepted: boolean
          cap_usd: number
          reservation_id: string
          today_usd: number
        }[]
      }
      resolve_appeal: {
        Args: {
          p_mod_id: string
          p_notes?: string
          p_outcome: string
          p_warning_id: string
        }
        Returns: undefined
      }
      resolve_report: {
        Args: {
          p_mod_id: string
          p_notes: string
          p_report_id: string
          p_resolution: string
        }
        Returns: undefined
      }
      resolve_username_to_email: {
        Args: { p_username: string }
        Returns: string
      }
      revoke_all_other_sessions: {
        Args: { p_current_session_id: string }
        Returns: number
      }
      revoke_role: {
        Args: { p_admin_id: string; p_role_name: string; p_user_id: string }
        Returns: undefined
      }
      revoke_session: { Args: { p_session_id: string }; Returns: boolean }
      schedule_account_deletion: {
        Args: { p_reason?: string; p_user_id: string }
        Returns: Json
      }
      score_on_comment_post: {
        Args: { p_comment_id: string; p_user_id: string }
        Returns: Json
      }
      score_on_quiz_submit: {
        Args: {
          p_article_id: string
          p_attempt_number: number
          p_kid_profile_id: string
          p_user_id: string
        }
        Returns: Json
      }
      score_on_reading_complete: {
        Args: {
          p_article_id: string
          p_kid_profile_id: string
          p_reading_log_id: string
          p_user_id: string
        }
        Returns: Json
      }
      send_breaking_news: {
        Args: { p_article_id: string; p_body: string; p_title: string }
        Returns: number
      }
      serve_ad: {
        Args: {
          p_article_id?: string
          p_placement_name: string
          p_session_id?: string
          p_user_id?: string
        }
        Returns: Json
      }
      session_heartbeat: {
        Args: {
          p_app_version?: string
          p_os_version?: string
          p_session_id: string
        }
        Returns: boolean
      }
      soft_delete_comment: {
        Args: { p_comment_id: string; p_user_id: string }
        Returns: undefined
      }
      split_cluster: {
        Args: {
          p_item_ids: string[]
          p_new_summary?: string
          p_new_title?: string
          p_source_id: string
        }
        Returns: Json
      }
      start_conversation: {
        Args: { p_other_user_id: string; p_user_id: string }
        Returns: Json
      }
      start_kid_trial: {
        Args: {
          p_avatar_color?: string
          p_date_of_birth?: string
          p_display_name: string
          p_pin_hash?: string
          p_user_id: string
        }
        Returns: string
      }
      start_quiz_attempt: {
        Args: {
          p_article_id: string
          p_kid_profile_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      submit_appeal: {
        Args: { p_text: string; p_user_id: string; p_warning_id: string }
        Returns: undefined
      }
      submit_expert_application: {
        Args: {
          p_application_type: string
          p_bio: string
          p_category_ids: string[]
          p_credentials: Json
          p_expertise_areas: string[]
          p_full_name: string
          p_organization: string
          p_portfolio_urls: string[]
          p_sample_responses: Json
          p_social_links: Json
          p_title: string
          p_user_id: string
          p_website_url: string
        }
        Returns: string
      }
      submit_quiz_attempt: {
        Args: {
          p_answers: Json
          p_article_id: string
          p_kid_profile_id?: string
          p_time_taken_seconds?: number
          p_user_id: string
        }
        Returns: Json
      }
      submit_recap_attempt: {
        Args: { p_answers: Json; p_recap_quiz_id: string; p_user_id: string }
        Returns: Json
      }
      supervisor_flag_comment: {
        Args: {
          p_category_id: string
          p_comment_id: string
          p_description?: string
          p_reason: string
          p_user_id: string
        }
        Returns: string
      }
      supervisor_opt_in: {
        Args: { p_category_id: string; p_user_id: string }
        Returns: undefined
      }
      supervisor_opt_out: {
        Args: { p_category_id: string; p_user_id: string }
        Returns: undefined
      }
      sweep_beta_expirations: { Args: never; Returns: Json }
      sweep_expired_deletions: { Args: never; Returns: number }
      sweep_kid_trial_expiries: { Args: never; Returns: number }
      system_apply_dob_correction: {
        Args: { p_decision_reason?: string; p_request_id: string }
        Returns: undefined
      }
      toggle_context_tag: {
        Args: { p_comment_id: string; p_user_id: string }
        Returns: Json
      }
      toggle_follow: {
        Args: { p_follower_id: string; p_target_id: string }
        Returns: Json
      }
      toggle_vote: {
        Args: { p_comment_id: string; p_user_id: string; p_vote_type: string }
        Returns: Json
      }
      undismiss_cluster: { Args: { p_cluster_id: string }; Returns: Json }
      unhide_comment: {
        Args: { p_comment_id: string; p_mod_id: string }
        Returns: undefined
      }
      update_follow_counts: {
        Args: { amount?: number; follower: string; following: string }
        Returns: undefined
      }
      update_metadata: {
        Args: { p_keys: Json; p_user_id: string }
        Returns: undefined
      }
      update_own_profile: { Args: { p_fields: Json }; Returns: Json }
      upsert_user_push_token: {
        Args: {
          p_app_version?: string
          p_device_name?: string
          p_environment?: string
          p_os_version?: string
          p_platform?: string
          p_provider: string
          p_token: string
        }
        Returns: string
      }
      use_kid_streak_freeze: {
        Args: { p_kid_profile_id: string; p_parent_id: string }
        Returns: Json
      }
      use_streak_freeze: { Args: { p_user_id: string }; Returns: Json }
      user_article_attempts: {
        Args: {
          p_article_id: string
          p_kid_profile_id?: string
          p_user_id: string
        }
        Returns: number
      }
      user_has_dm_access: { Args: { p_user_id: string }; Returns: boolean }
      user_has_role: { Args: { required_role: string }; Returns: boolean }
      user_is_supervisor_in: {
        Args: { p_category_id: string; p_user_id: string }
        Returns: boolean
      }
      user_passed_article_quiz: {
        Args: { p_article_id: string; p_user_id: string }
        Returns: boolean
      }
      user_passed_quiz: {
        Args: { p_article_id: string; p_user_id: string }
        Returns: boolean
      }
      user_supervisor_eligible_for: {
        Args: { p_category_id: string; p_user_id: string }
        Returns: boolean
      }
      weekly_reading_report: { Args: { p_user_id: string }; Returns: Json }
    }
    Enums: {
      user_state_t:
        | "active"
        | "banned"
        | "locked"
        | "muted"
        | "frozen"
        | "deletion_scheduled"
        | "beta_locked"
        | "comped"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      user_state_t: [
        "active",
        "banned",
        "locked",
        "muted",
        "frozen",
        "deletion_scheduled",
        "beta_locked",
        "comped",
      ],
    },
  },
} as const
