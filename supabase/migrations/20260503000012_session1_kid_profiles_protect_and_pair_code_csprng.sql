-- Session 1 PM-C: closes REVIEW_REPORT.md PM-11 P0 #8 and P0 #9.
--
-- P0 #8 — kid_profiles column-protection trigger.
--   Parent (with row-level access via RLS) could PATCH any column on their
--   kid's row directly through PostgREST. Of particular concern: COPPA
--   evidentiary fields (coppa_consent_given, coppa_consent_at), score/streak
--   counters, the band_history transcript, and the reconsent ceremony fields
--   were all parent-writable. We add a BEFORE UPDATE trigger that mirrors the
--   shape of users_protect_columns (allowlist of self-editable columns;
--   anything else raises 42501) and uses the Q02-locked gate
--   (current_user='postgres' OR jwt role='service_role') so server-side RPCs
--   and admin tooling continue to work.
--
-- P0 #9 — generate_kid_pair_code CSPRNG.
--   File 20260503000008 already shipped the CSPRNG body but its migration
--   row never landed in supabase_migrations.schema_migrations (Session 0 had
--   read-only MCP). The live function body is already correct, but we
--   re-issue the CREATE OR REPLACE here so the migration log matches reality
--   and a future db-reset / db-pull won't regress.
--
-- Both changes are idempotent.

------------------------------------------------------------------------------
-- Part 1 — kid_profiles column-protection trigger
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kid_profiles_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- Service role and superuser (postgres) bypass — server RPCs, admin
  -- tooling, dashboard SQL, and the migration runner all reach this trigger
  -- via one of those two paths. Matches the Q02-locked gate shape used by
  -- enforce_kid_dob_immutable / enforce_band_ratchet / users_protect_columns.
  IF current_user = 'postgres' OR v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Identifier / lineage — never user-editable.
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'kid_profiles.id is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.parent_user_id IS DISTINCT FROM OLD.parent_user_id THEN
    RAISE EXCEPTION 'kid_profiles.parent_user_id is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'kid_profiles.created_at is read-only' USING ERRCODE = '42501';
  END IF;

  -- COPPA evidentiary record — once set by the kid-creation RPC (paired with
  -- a parental_consents row carrying IP+UA+consent_method), the parent must
  -- not be able to forge or rewrite the timestamps. Hard-protected.
  IF NEW.coppa_consent_given IS DISTINCT FROM OLD.coppa_consent_given THEN
    RAISE EXCEPTION 'kid_profiles.coppa_consent_given is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.coppa_consent_at IS DISTINCT FROM OLD.coppa_consent_at THEN
    RAISE EXCEPTION 'kid_profiles.coppa_consent_at is read-only' USING ERRCODE = '42501';
  END IF;

  -- Reconsent ceremony — flips happen via the band-graduation flow only.
  IF NEW.reconsent_required_at IS DISTINCT FROM OLD.reconsent_required_at THEN
    RAISE EXCEPTION 'kid_profiles.reconsent_required_at is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.reconsented_at IS DISTINCT FROM OLD.reconsented_at THEN
    RAISE EXCEPTION 'kid_profiles.reconsented_at is read-only' USING ERRCODE = '42501';
  END IF;

  -- DOB — already covered by enforce_kid_dob_immutable, defense-in-depth here.
  IF NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth THEN
    RAISE EXCEPTION 'kid_profiles.date_of_birth is read-only' USING ERRCODE = '42501';
  END IF;

  -- Reading band — already covered by enforce_band_ratchet (which only
  -- guards regression). Hard-protect against any non-graduation-flow write.
  IF NEW.reading_band IS DISTINCT FROM OLD.reading_band THEN
    RAISE EXCEPTION 'kid_profiles.reading_band is read-only for self-update' USING ERRCODE = '42501';
  END IF;
  IF NEW.band_changed_at IS DISTINCT FROM OLD.band_changed_at THEN
    RAISE EXCEPTION 'kid_profiles.band_changed_at is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.band_history IS DISTINCT FROM OLD.band_history THEN
    RAISE EXCEPTION 'kid_profiles.band_history is read-only' USING ERRCODE = '42501';
  END IF;

  -- Score / progress counters — server-incremented only (kid_quiz_verdict
  -- advance_streak RPC, points-award RPCs, etc). Parent must not pump.
  IF NEW.verity_score IS DISTINCT FROM OLD.verity_score THEN
    RAISE EXCEPTION 'kid_profiles.verity_score is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.articles_read_count IS DISTINCT FROM OLD.articles_read_count THEN
    RAISE EXCEPTION 'kid_profiles.articles_read_count is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.quizzes_completed_count IS DISTINCT FROM OLD.quizzes_completed_count THEN
    RAISE EXCEPTION 'kid_profiles.quizzes_completed_count is read-only' USING ERRCODE = '42501';
  END IF;

  -- Streak counters — same rationale.
  IF NEW.streak_current IS DISTINCT FROM OLD.streak_current THEN
    RAISE EXCEPTION 'kid_profiles.streak_current is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_best IS DISTINCT FROM OLD.streak_best THEN
    RAISE EXCEPTION 'kid_profiles.streak_best is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_last_active_date IS DISTINCT FROM OLD.streak_last_active_date THEN
    RAISE EXCEPTION 'kid_profiles.streak_last_active_date is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_freeze_remaining IS DISTINCT FROM OLD.streak_freeze_remaining THEN
    RAISE EXCEPTION 'kid_profiles.streak_freeze_remaining is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.streak_freeze_week_start IS DISTINCT FROM OLD.streak_freeze_week_start THEN
    RAISE EXCEPTION 'kid_profiles.streak_freeze_week_start is read-only' USING ERRCODE = '42501';
  END IF;

  -- PIN lockout state — server-managed by PIN check RPCs. Parent rotates the
  -- PIN itself (pin_hash/pin_salt/pin_hash_algo) but lockout counters are
  -- not user-clearable.
  IF NEW.pin_attempts IS DISTINCT FROM OLD.pin_attempts THEN
    RAISE EXCEPTION 'kid_profiles.pin_attempts is read-only' USING ERRCODE = '42501';
  END IF;
  IF NEW.pin_locked_until IS DISTINCT FROM OLD.pin_locked_until THEN
    RAISE EXCEPTION 'kid_profiles.pin_locked_until is read-only' USING ERRCODE = '42501';
  END IF;

  -- System-driven prompts.
  IF NEW.birthday_prompt_at IS DISTINCT FROM OLD.birthday_prompt_at THEN
    RAISE EXCEPTION 'kid_profiles.birthday_prompt_at is read-only' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS kid_profiles_protect_columns_trg ON public.kid_profiles;
CREATE TRIGGER kid_profiles_protect_columns_trg
  BEFORE UPDATE ON public.kid_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.kid_profiles_protect_columns();

------------------------------------------------------------------------------
-- Part 2 — generate_kid_pair_code CSPRNG (re-issue from 20260503000008 so the
-- migration log records it; live function body is already this exact body).
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_kid_pair_code(p_kid_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_parent_id  UUID := auth.uid();
    v_code       TEXT;
    v_expires    TIMESTAMPTZ := now() + interval '15 minutes';
    v_attempts   INT := 0;
    v_alphabet   TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    v_alpha_len  INT := length(v_alphabet);
    v_i          INT;
    v_byte       INT;
    v_max_byte   INT := 256 - (256 % length(v_alphabet));
BEGIN
    IF v_parent_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.kid_profiles
        WHERE id = p_kid_profile_id
          AND parent_user_id = v_parent_id
    ) THEN
        RAISE EXCEPTION 'Kid profile not owned by caller' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.kid_pair_codes
       SET used_at = now()
     WHERE kid_profile_id = p_kid_profile_id
       AND used_at IS NULL
       AND expires_at > now();

    LOOP
        v_code := '';
        FOR v_i IN 1..8 LOOP
            -- Rejection-sample a CSPRNG byte in [0, v_max_byte) to avoid
            -- modulo bias against the 31-char alphabet (256 % 31 = 8).
            LOOP
                v_byte := get_byte(gen_random_bytes(1), 0);
                EXIT WHEN v_byte < v_max_byte;
            END LOOP;
            v_code := v_code || substr(v_alphabet, 1 + (v_byte % v_alpha_len), 1);
        END LOOP;

        BEGIN
            INSERT INTO public.kid_pair_codes
                (code, parent_user_id, kid_profile_id, expires_at)
            VALUES
                (v_code, v_parent_id, p_kid_profile_id, v_expires);
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            v_attempts := v_attempts + 1;
            IF v_attempts >= 6 THEN
                RAISE EXCEPTION 'Could not generate unique code' USING ERRCODE = 'P0001';
            END IF;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'code', v_code,
        'expires_at', v_expires
    );
END;
$function$;
