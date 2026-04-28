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

// S3-Q3b — kid-vs-user identity is signaled by the JWT's
// `is_kid_delegated=true` claim. Today's kid JWTs are signed by the
// custom issuer `verity-post-kids-pair` and carry the claim at the
// top level; once S10 flips the issuer to Supabase, custom claims
// propagate via `app_metadata` on the GoTrue user object as well as
// on the raw JWT payload. Read both so behaviour is correct in both
// regimes — the function only flips identity when at least one
// surface explicitly carries `is_kid_delegated === true`. A bare
// `kid_profile_id` without the boolean is treated as a malformed
// token and conservatively rejected as kid to keep adult routes
// hermetic.
function readKidClaims(authUser) {
  if (!authUser || typeof authUser !== 'object') {
    return { isKid: false, kidProfileId: null, parentUserId: null };
  }
  const meta = authUser.app_metadata || {};
  const isKidDelegated =
    authUser.is_kid_delegated === true || meta.is_kid_delegated === true;
  const kidProfileId =
    authUser.kid_profile_id || meta.kid_profile_id || null;
  const parentUserId =
    authUser.parent_user_id || meta.parent_user_id || null;
  // A token that names a kid_profile_id without is_kid_delegated is
  // structurally invalid — refuse to promote it to "user" identity.
  const isKid = isKidDelegated || !!kidProfileId;
  return { isKid, kidProfileId, parentUserId };
}

export async function getUser(client) {
  const supabase = await resolveAuthedClient(client);
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { isKid, kidProfileId, parentUserId } = readKidClaims(authUser);

  // S3-Q3b — kid identity must NEVER resolve through the adult
  // `public.users` row. Even if RLS or a future schema change let a
  // kid_profile_id query return a users row, the kind flag forces a
  // null-resolution here so requireAuth (default kindAllowed='user')
  // throws a clean 401. The middleware also rejects kid JWTs on
  // user routes, but this is the belt-and-suspenders backstop for
  // route handlers that bypass the middleware (API edge runtime,
  // server actions invoked outside the middleware path).
  if (isKid) {
    return {
      id: null,
      email: authUser.email || null,
      roles: [],
      kind: 'kid',
      kid_profile_id: kidProfileId,
      parent_user_id: parentUserId,
    };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*, plans(id, name)')
    .eq('id', authUser.id)
    .maybeSingle();

  if (!profile) return null;

  // T212 — belt-and-suspenders identity check. RLS on `users` already
  // restricts the row this query can return, but if RLS is ever
  // misconfigured, a service-key client is passed in, or a future bug
  // widens the policy, this assert turns "wrong row returned" into a
  // loud failure instead of a silent identity confusion. Cheap.
  if (authUser.id !== profile.id) {
    throw new Error('AUTH_PROFILE_ID_MISMATCH');
  }

  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('roles(name, hierarchy_level)')
    .eq('user_id', authUser.id);

  const roles = (roleRows || []).map((r) => r.roles?.name).filter(Boolean);

  return {
    ...profile,
    email: authUser.email,
    roles,
    kind: 'user',
    kid_profile_id: null,
    parent_user_id: null,
  };
}

// S3-Q3b — `kindAllowed` defaults to 'user' so every legacy caller
// implicitly rejects kid tokens (matches their pre-Q3b behaviour
// where kid JWTs failed the iss check or returned null on the users
// join). A small set of /api/kids/* routes pass `'kid'` explicitly;
// nothing today is `'either'`.
export async function requireAuth(client, options = {}) {
  const { kindAllowed = 'user' } = options;
  const user = await getUser(client);
  if (!user) {
    const err = new Error('UNAUTHENTICATED');
    err.status = 401;
    throw err;
  }
  if (kindAllowed !== 'either') {
    const isKid = user.kind === 'kid';
    if (kindAllowed === 'user' && isKid) {
      const err = new Error('UNAUTHENTICATED');
      err.status = 401;
      err.detail = 'kid token rejected on user-only route';
      throw err;
    }
    if (kindAllowed === 'kid' && !isKid) {
      const err = new Error('UNAUTHENTICATED');
      err.status = 401;
      err.detail = 'user token rejected on kid-only route';
      throw err;
    }
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
  // T348 — per-supabase-client memoization. Stash the resolver result on
  // the client instance so the same request that calls requirePermission
  // multiple times (or requirePermission + hasPermissionServer in the
  // same handler) only burns one compute_effective_perms RPC.
  //
  // This works WHEN the caller threads the same `client` argument through
  // both calls. Most code paths today don't (each requirePermission call
  // mints a fresh client via resolveAuthedClient(undefined)), so the
  // benefit is limited until route handlers start passing their client
  // through. Existing callers continue to behave identically; the cache
  // is a no-op on cache miss. Worth shipping now because future route
  // refactors that DO thread the client get the speedup automatically.
  if (supabase.__permsCache instanceof Map) {
    const cached = supabase.__permsCache.get(userId);
    if (cached) return cached;
  } else {
    try {
      Object.defineProperty(supabase, '__permsCache', {
        value: new Map(),
        writable: false,
        enumerable: false,
        configurable: false,
      });
    } catch {
      // Some proxy clients reject defineProperty; fall through to
      // un-memoized behaviour rather than crash.
    }
  }

  const { data, error } = await supabase.rpc('compute_effective_perms', { p_user_id: userId });
  const result = error
    ? { rows: null, error }
    : { rows: Array.isArray(data) ? data : [], error: null };

  if (supabase.__permsCache instanceof Map && !error) {
    supabase.__permsCache.set(userId, result);
  }
  return result;
}

// Session A — permission alias bridge.
// Single-string callers transparently dual-check via permission_key_aliases
// so a route still passing 'admin.pipeline.run_generate' is satisfied by a
// role granted only 'newsroom.generate' (and vice versa), without each call
// site having to know the bridge exists. Cached 60s; the table only changes
// via migration. Sessions B/C will pass arrays directly; Session E drops
// the bridge.
const ALIAS_TTL_MS = 60_000;
let _aliasCache = null;
async function loadAliasesFor(client, key) {
  const now = Date.now();
  if (_aliasCache && _aliasCache.expiresAt > now) {
    return _aliasCache.byKey.get(key) || [];
  }
  const { data, error } = await client
    .from('permission_key_aliases')
    .select('old_key, new_key');
  if (error || !data) {
    // Table absent (pre-migration) or RLS denies — treat as no aliases.
    _aliasCache = { byKey: new Map(), expiresAt: now + ALIAS_TTL_MS };
    return [];
  }
  const byKey = new Map();
  const push = (k, v) => {
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(v);
  };
  for (const row of data) {
    if (!row || !row.old_key || !row.new_key) continue;
    push(row.old_key, row.new_key);
    push(row.new_key, row.old_key);
  }
  _aliasCache = { byKey, expiresAt: now + ALIAS_TTL_MS };
  return byKey.get(key) || [];
}

export async function requirePermission(permissionKey, client, options = {}) {
  const { kindAllowed = 'user' } = options;
  const supabase = await resolveAuthedClient(client);
  const user = await requireAuth(supabase, { kindAllowed });

  const { rows, error } = await loadEffectivePerms(supabase, user.id);
  if (error || rows == null) {
    const err = new Error('PERM_RESOLVE_FAILED');
    err.status = 500;
    err.cause = error || undefined;
    throw err;
  }

  // Build the candidate key set: array → all entries; string → key plus its
  // alias siblings (looked up only when the direct check fails, to keep the
  // hot path one Map lookup).
  const keysIn = Array.isArray(permissionKey) ? permissionKey : [permissionKey];
  const grantedRow = (k) => rows.find((r) => r && r.permission_key === k && r.granted === true);

  for (const k of keysIn) {
    if (grantedRow(k)) return user;
  }
  if (!Array.isArray(permissionKey)) {
    const aliases = await loadAliasesFor(supabase, permissionKey);
    for (const k of aliases) {
      if (grantedRow(k)) return user;
    }
  }

  const denyKey = Array.isArray(permissionKey) ? permissionKey.join('|') : permissionKey;
  const probeKey = Array.isArray(permissionKey) ? permissionKey[0] : permissionKey;
  const row = rows.find((r) => r && r.permission_key === probeKey);
  const err = new Error(`PERMISSION_DENIED:${denyKey}`);
  err.status = 403;
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
// S3-Q3b — kid tokens never resolve to user perms; return false
// without burning an RPC. Kid-route handlers don't use this helper
// (they assert kid ownership directly via lib/kids); user routes
// that do use it must always see kids as "no perm".
export async function hasPermissionServer(permissionKey, client) {
  try {
    const supabase = await resolveAuthedClient(client);
    const user = await getUser(supabase);
    if (!user) return false;
    if (user.kind === 'kid') return false;
    const { rows, error } = await loadEffectivePerms(supabase, user.id);
    if (error || rows == null) return false;
    const row = rows.find((r) => r && r.permission_key === permissionKey);
    return !!(row && row.granted === true);
  } catch {
    return false;
  }
}

// assertKidOwnership moved to ./kids — import from '@/lib/kids' instead.
