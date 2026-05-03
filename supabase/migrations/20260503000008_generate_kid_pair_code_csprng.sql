-- Replace random()-based char selection in generate_kid_pair_code with
-- CSPRNG (gen_random_bytes) + rejection sampling to avoid modulo bias.

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
