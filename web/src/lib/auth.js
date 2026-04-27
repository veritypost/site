async function resolveClient(client) {
  if (client) return client;
  const mod = await import('./supabase/server');
  return mod.createClient();
}

// Round 6 iOS-GATES — Option A bearer-fallback.
// @supabase/ssr's createServerClient does NOT read the Authorization
// header; its storage adapter is wired to cookies only. iOS clients
// authenticate with `Authorization: Bearer <access_token>`, so every
// permission-gated route (/api/messages, /api/follows, and transparently
// /api/bookmarks + /api/stories/read) returned 401 from pure-iOS sessions
// because no cookie was present. This helper keeps the existing
// cookie-scoped client path and adds a bearer branch in front of it,
// so both auth styles resolve through the same requireAuth / requirePermission
// pipeline.
// T203 — defense-in-depth JWT signature pre-check on the bearer token before
// it's handed to a Supabase client. The Supabase client itself calls
// `auth.getUser()` against the GoTrue REST API, which performs server-side
// signature verification — but that round-trip happens later in the flow,
// after the client has already been instantiated and (in some paths) used to
// add the bearer to outbound headers. Verifying locally with the project's
// JWT secret rejects forged / expired tokens at the boundary, gives us a
// crisp throw → 401 in `requireAuth`, and avoids one network round-trip on
// hostile traffic. NOT a replacement for the GoTrue verification — it runs
// in addition to it.
//
// Validates: signature (HS256 against SUPABASE_JWT_SECRET), `aud=authenticated`
// when claim present, `iss` is the Supabase auth URL when claim present,
// and the standard `exp`/`nbf` time bounds (jsonwebtoken handles these).
function verifyBearerToken(token) {
  // Lazy-require so missing env / module never breaks unrelated paths.
  // jsonwebtoken is already in package.json deps.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
  const jwt = require('jsonwebtoken');
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    // No secret configured — surface as auth failure so we never silently
    // accept an unverified bearer. Throw cleanly so requireAuth -> 401.
    const err = new Error('UNAUTHENTICATED');
    err.status = 401;
    err.detail = 'SUPABASE_JWT_SECRET not configured';
    throw err;
  }
  let decoded;
  try {
    decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch (e) {
    const err = new Error('UNAUTHENTICATED');
    err.status = 401;
    err.detail = e?.message || 'jwt verify failed';
    throw err;
  }
  if (decoded && typeof decoded === 'object') {
    if (decoded.aud && decoded.aud !== 'authenticated') {
      const err = new Error('UNAUTHENTICATED');
      err.status = 401;
      err.detail = `unexpected aud=${decoded.aud}`;
      throw err;
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    if (decoded.iss && supabaseUrl) {
      const expectedIss = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
      if (decoded.iss !== expectedIss) {
        const err = new Error('UNAUTHENTICATED');
        err.status = 401;
        err.detail = `unexpected iss=${decoded.iss}`;
        throw err;
      }
    }
  }
}

async function resolveAuthedClient(client) {
  if (client) return client;
  try {
    const { headers } = await import('next/headers');
    // `headers()` is async in Next 15 (rateLimit.js awaits it). `await`
    // is a no-op against a non-promise, so this works in Next 14 too.
    const h = await headers();
    const authHeader = h.get('authorization') || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token) {
        // T203 — verify signature/aud/iss BEFORE passing the bearer to the
        // Supabase client. Throws on invalid → propagates to requireAuth's
        // catch path → clean 401.
        verifyBearerToken(token);
        const mod = await import('./supabase/server');
        return mod.createClientFromToken(token);
      }
    }
  } catch (err) {
    // Re-throw signature failures so requireAuth surfaces a 401. Any other
    // resolution error (missing next/headers, etc.) falls through to the
    // cookie-scoped client.
    if (err && err.status === 401) throw err;
  }
  const mod = await import('./supabase/server');
  return mod.createClient();
}

export async function getUser(client) {
  const supabase = await resolveAuthedClient(client);
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('*, plans(id, name)')
    .eq('id', authUser.id)
    .maybeSingle();

  if (!profile) return null;

  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('roles(name, hierarchy_level)')
    .eq('user_id', authUser.id);

  const roles = (roleRows || []).map((r) => r.roles?.name).filter(Boolean);

  return { ...profile, email: authUser.email, roles };
}

export async function requireAuth(client) {
  const user = await getUser(client);
  if (!user) {
    const err = new Error('UNAUTHENTICATED');
    err.status = 401;
    throw err;
  }
  return user;
}

export async function requireVerifiedEmail(client) {
  const user = await requireAuth(client);
  if (!user.email_verified) {
    // T-076 — prior code threw without a `.status`, breaking the
    // idiomatic `if (err.status) return NextResponse.json(...)` branch
    // that `requireAuth` callers rely on. 403 matches the semantics.
    const err = new Error('EMAIL_NOT_VERIFIED');
    err.status = 403;
    throw err;
  }
  return user;
}

export async function requireNotBanned(client) {
  const user = await requireAuth(client);
  if (user.is_banned) {
    const err = new Error('BANNED');
    err.status = 403;
    throw err;
  }
  if (user.is_muted && user.muted_until && new Date(user.muted_until) > new Date()) {
    const err = new Error('MUTED');
    err.status = 403;
    throw err;
  }
  return user;
}

export async function getUserRoles(client, userId) {
  const supabase = await resolveClient(client);
  let id = userId;
  if (!id) {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    id = authUser?.id;
  }
  if (!id) return [];
  const { data } = await supabase
    .from('user_roles')
    .select('roles(name, hierarchy_level)')
    .eq('user_id', id);
  return (data || []).map((r) => r.roles).filter(Boolean);
}

export async function hasRole(client, roleName) {
  const roles = await getUserRoles(client);
  return roles.some((r) => r.name === roleName);
}

// requireRole removed 2026-04-18 (Phase 5 / Track P). All 54 call-sites
// migrated to requirePermission — see 05-Working/PERMISSION_MIGRATION.md
// "Phase 5 — requireRole migration (Track M)".

export async function assertPlanFeature(featureKey, client) {
  const supabase = await resolveClient(client);
  const user = await requireAuth(supabase);
  const { data } = await supabase
    .from('plan_features')
    .select('is_enabled, limit_value, limit_type')
    .eq('plan_id', user.plan_id)
    .eq('feature_key', featureKey)
    .maybeSingle();
  if (!data || !data.is_enabled) throw new Error('PLAN_FEATURE_DISABLED');
  return true;
}

export async function getPlanFeatureLimit(featureKey, client) {
  const supabase = await resolveClient(client);
  const user = await getUser(supabase);
  if (!user) return { is_enabled: false, limit_value: 0, limit_type: 'none' };
  const { data } = await supabase
    .from('plan_features')
    .select('is_enabled, limit_value, limit_type')
    .eq('plan_id', user.plan_id)
    .eq('feature_key', featureKey)
    .maybeSingle();
  return data || { is_enabled: false, limit_value: 0, limit_type: 'none' };
}

// ============================================================
// Wave 1 — permission-driven access helpers.
// These sit alongside requireAuth; do NOT retrofit those (known
// .status omission is tracked separately — out of scope for this
// migration).
//
// Both helpers call the DB resolver `public.compute_effective_perms`
// via the caller-scoped Supabase client so RLS and session context
// (cookies / service key) are preserved exactly as the caller set
// them up.
// ============================================================

async function loadEffectivePerms(supabase, userId) {
  const { data, error } = await supabase.rpc('compute_effective_perms', { p_user_id: userId });
  if (error) return { rows: null, error };
  return { rows: Array.isArray(data) ? data : [], error: null };
}

export async function requirePermission(permissionKey, client) {
  const supabase = await resolveAuthedClient(client);
  const user = await requireAuth(supabase);

  const { rows, error } = await loadEffectivePerms(supabase, user.id);
  if (error || rows == null) {
    const err = new Error('PERM_RESOLVE_FAILED');
    err.status = 500;
    err.cause = error || undefined;
    throw err;
  }

  const row = rows.find((r) => r && r.permission_key === permissionKey);
  if (row && row.granted === true) return user;

  const err = new Error(`PERMISSION_DENIED:${permissionKey}`);
  err.status = 403;
  // attach resolver detail so callers (or error reporters) can log why
  err.detail = row
    ? {
        granted_via: row.granted_via,
        source_detail: row.source_detail,
        deny_mode: row.deny_mode,
        lock_message: row.lock_message,
      }
    : { granted_via: null, reason: 'NOT_IN_RESOLVED_SET' };
  throw err;
}

// Non-throwing variant for conditional logic inside handlers.
// Returns false on any failure (auth, RPC error, missing row).
export async function hasPermissionServer(permissionKey, client) {
  try {
    const supabase = await resolveAuthedClient(client);
    const user = await getUser(supabase);
    if (!user) return false;
    const { rows, error } = await loadEffectivePerms(supabase, user.id);
    if (error || rows == null) return false;
    const row = rows.find((r) => r && r.permission_key === permissionKey);
    return !!(row && row.granted === true);
  } catch {
    return false;
  }
}

// assertKidOwnership moved to ./kids — import from '@/lib/kids' instead.
