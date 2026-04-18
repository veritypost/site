-- ============================================================
-- 058_kid_pin_salt.sql
-- Chunk 5 of the post-audit repair pass.
--
-- Closes:
--   - DA-109 / F-085: kid PIN stored as unsalted SHA-256. PIN space is
--     10,000 (4 digits). A pre-computed table of all 10k SHA-256 hashes
--     fits in ~200 KB, so any DB dump instantly recovers every kid's
--     PIN. Lockout (3/60s) deters online brute force but not offline
--     rainbow attacks.
--
-- Remediation strategy
-- --------------------
-- Add two columns to `kid_profiles`:
--
--   - `pin_salt` text (nullable, hex-encoded random)
--   - `pin_hash_algo` text NOT NULL DEFAULT 'sha256'
--
-- Existing rows retain `pin_hash_algo = 'sha256'` and no salt. The
-- verify-pin route dispatches on `pin_hash_algo` and transparently
-- rehashes to PBKDF2 on the first successful entry after this migration
-- lands — each family drifts to salted storage naturally, without a
-- mandatory PIN reset flow. PIN sets issued after this migration write
-- `pbkdf2` with a fresh per-row salt.
--
-- PBKDF2 was chosen over bcrypt/argon2 because Web Crypto
-- (`crypto.subtle.deriveBits`) is available in the Next.js Node runtime
-- today without any npm dependency. Iteration count (100_000) is tuned
-- for ~50-80ms verify time on serverless cold starts — expensive enough
-- to kill offline brute force, fast enough to not matter in the
-- interactive kid-exit flow.
--
-- Dependencies: apply after 057_rpc_lockdown.sql. Idempotent.
-- ============================================================

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS pin_salt text;

ALTER TABLE public.kid_profiles
  ADD COLUMN IF NOT EXISTS pin_hash_algo text NOT NULL DEFAULT 'sha256';

-- Back-fill the algo marker explicitly on existing rows with a PIN —
-- the DEFAULT handles new rows automatically but older rows that have
-- a pin_hash may have been created before this migration with a NULL
-- in the new column (if ADD COLUMN without the DEFAULT had been run).
-- Idempotent.
UPDATE public.kid_profiles
SET pin_hash_algo = 'sha256'
WHERE pin_hash IS NOT NULL AND pin_hash_algo IS NULL;

COMMENT ON COLUMN public.kid_profiles.pin_salt IS
  'Hex-encoded random salt for PBKDF2-SHA256 kid PIN hashes. NULL for '
  'legacy pin_hash_algo=''sha256'' rows — transparently rehashed to '
  'pbkdf2 on the first successful verify after migration 058.';

COMMENT ON COLUMN public.kid_profiles.pin_hash_algo IS
  'Hash algorithm for pin_hash. ''sha256'' = legacy unsalted; '
  '''pbkdf2'' = salted PBKDF2-SHA256 100_000 iter. See lib/kidPin.js.';
