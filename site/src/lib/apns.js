// APNs HTTP/2 delivery. No external npm deps.
//
// Env:
//   APNS_KEY_ID         — 10-char key identifier from Apple Developer
//   APNS_TEAM_ID        — 10-char Apple team id
//   APNS_AUTH_KEY       — .p8 PEM contents (BEGIN/END PRIVATE KEY block).
//                         Vercel may escape newlines as "\n"; we normalise.
//   APNS_ENV            — 'production' (default) | 'sandbox'. Fallback only —
//                         per-token dispatch uses user_push_tokens.environment
//                         first and falls back to APNS_ENV when a token has no
//                         environment recorded.
//   APNS_TOPIC          — defaults to 'com.veritypost.app'
//
// Apple caps provider JWTs at 1h; we cache for 50m per process.
// One HTTP/2 session per invocation is reused via `withApnsSession`.

import crypto from 'node:crypto';
import http2 from 'node:http2';

const APNS_TOPIC_DEFAULT = 'com.veritypost.app';
const JWT_MAX_AGE_SECONDS = 50 * 60;

let jwtCache = { token: null, expiresAt: 0 };

function apnsAuthority(environment) {
  const env = (environment || process.env.APNS_ENV || 'production').toLowerCase();
  return env === 'sandbox'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com';
}

// Normalise any input (column value, option, env var) to one of the two APNs
// environment strings. Defaults to production for safety.
export function resolveApnsEnv(environment) {
  const e = (environment || process.env.APNS_ENV || 'production').toLowerCase();
  return e === 'sandbox' ? 'sandbox' : 'production';
}

function apnsTopic() {
  return process.env.APNS_TOPIC || APNS_TOPIC_DEFAULT;
}

function loadAuthKey() {
  const pem = process.env.APNS_AUTH_KEY;
  if (!pem) throw new Error('APNS_AUTH_KEY missing');
  // Env vars often come through with literal \n sequences.
  return pem.includes('\n') ? pem : pem.replace(/\\n/g, '\n');
}

function signAppleJwt() {
  const now = Math.floor(Date.now() / 1000);
  if (jwtCache.token && jwtCache.expiresAt > now + 60) return jwtCache.token;

  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!keyId) throw new Error('APNS_KEY_ID missing');
  if (!teamId) throw new Error('APNS_TEAM_ID missing');

  const header = { alg: 'ES256', kid: keyId };
  const payload = { iss: teamId, iat: now };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = crypto.createPrivateKey(loadAuthKey());
  const sig = crypto.sign(
    'SHA256',
    Buffer.from(signingInput, 'utf8'),
    { key, dsaEncoding: 'ieee-p1363' }
  );
  const token = `${signingInput}.${sig.toString('base64url')}`;

  jwtCache = { token, expiresAt: now + JWT_MAX_AGE_SECONDS };
  return token;
}

// Map APNs rejection reasons to "is this token dead?" — caller should mark
// invalidated in the DB so we stop dispatching to it.
const DEAD_TOKEN_REASONS = new Set([
  'BadDeviceToken',
  'Unregistered',
  'DeviceTokenNotForTopic',
  'TopicDisallowed',
]);

function buildAlertPayload({ title, body, url, badge, category, threadId, metadata }) {
  const aps = {
    alert: { title: title || '' },
    sound: 'default',
  };
  if (body) aps.alert.body = body;
  if (typeof badge === 'number') aps.badge = badge;
  if (category) aps.category = category;
  if (threadId) aps['thread-id'] = threadId;

  const payload = { aps };
  if (url) payload.action_url = url;
  if (metadata && typeof metadata === 'object') {
    for (const [k, v] of Object.entries(metadata)) {
      if (k !== 'aps') payload[k] = v;
    }
  }
  return payload;
}

// Send one alert push on an existing HTTP/2 session. Resolves with a result
// shape; never throws for APNs-level errors (those are reported on the
// result object). It does throw for local crypto / config errors.
function sendOnSession(session, deviceToken, notification, opts = {}) {
  const jwt = signAppleJwt();
  const topic = apnsTopic();
  const body = Buffer.from(JSON.stringify(buildAlertPayload(notification)), 'utf8');

  const headers = {
    ':method': 'POST',
    ':path': `/3/device/${deviceToken}`,
    'authorization': `bearer ${jwt}`,
    'apns-topic': topic,
    'apns-push-type': 'alert',
    'apns-priority': String(opts.priority ?? 10),
    'apns-expiration': String(opts.expiration ?? 0),
    'content-type': 'application/json',
    'content-length': String(body.length),
  };
  if (opts.collapseId) headers['apns-collapse-id'] = String(opts.collapseId);

  return new Promise((resolve) => {
    let responseHeaders = null;
    let responseBody = '';

    const req = session.request(headers);
    req.setEncoding('utf8');
    req.setTimeout(15000, () => {
      req.close();
      resolve({
        ok: false,
        status: 0,
        reason: 'Timeout',
        retryable: true,
        invalidated: false,
      });
    });
    req.on('response', (h) => { responseHeaders = h; });
    req.on('data', (chunk) => { responseBody += chunk; });
    req.on('error', (err) => {
      resolve({
        ok: false,
        status: 0,
        reason: err.message,
        retryable: true,
        invalidated: false,
      });
    });
    req.on('end', () => {
      const status = responseHeaders?.[':status'] ?? 0;
      const apnsId = responseHeaders?.['apns-id'] || null;
      let reason = null;
      if (responseBody) {
        try { reason = JSON.parse(responseBody)?.reason || null; } catch { /* body not JSON */ }
      }
      if (status === 200) {
        resolve({ ok: true, status, apnsId, reason: null, retryable: false, invalidated: false });
        return;
      }
      const invalidated = (status === 410) || (reason && DEAD_TOKEN_REASONS.has(reason));
      const retryable = status >= 500 || status === 429;
      resolve({ ok: false, status, apnsId, reason, retryable, invalidated });
    });
    req.end(body);
  });
}

// Opens one HTTP/2 session against the resolved APNs host, runs fn with a
// `send` helper, closes. Use this when dispatching many pushes to tokens that
// share an environment. Pass `environment: 'sandbox' | 'production'` to pick
// the host; omit to fall back to APNS_ENV.
export async function withApnsSession(fn, { environment } = {}) {
  const session = http2.connect(apnsAuthority(environment));
  // Swallow idle errors (Apple occasionally closes long-lived sessions).
  session.on('error', () => {});
  try {
    return await fn({
      send: (token, payload, opts) => sendOnSession(session, token, payload, opts),
    });
  } finally {
    try { session.close(); } catch { /* already closed */ }
  }
}

// Convenience for one-off sends. Prefer withApnsSession for batches. Pass
// `{ environment }` when the caller knows which host to hit.
export async function sendApnsAlert(deviceToken, notification, opts = {}, { environment } = {}) {
  return withApnsSession(({ send }) => send(deviceToken, notification, opts), { environment });
}

// Load an authenticated user's active APNs tokens (any environment).
// service: the service-role Supabase client.
async function loadUserTokens(service, userId, { environment } = {}) {
  let q = service
    .from('user_push_tokens')
    .select('id, push_token, environment')
    .eq('user_id', userId)
    .eq('provider', 'apns')
    .is('invalidated_at', null);
  if (environment) q = q.eq('environment', environment);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Fan out a push to every active APNs token a user has. Writes one
// push_receipts row per device. Marks dead tokens invalidated. Groups
// tokens by environment so a user with one TestFlight-sandbox device and
// one App Store-production device reaches both over the correct APNs host.
export async function sendPushToUser(service, userId, notification, { notificationId, opts } = {}) {
  const tokens = await loadUserTokens(service, userId);
  if (!tokens.length) return { delivered: 0, failed: 0, invalidated: 0, attempted: 0 };

  const byEnv = {};
  for (const t of tokens) {
    const env = resolveApnsEnv(t.environment);
    (byEnv[env] ||= []).push(t);
  }

  let delivered = 0, failed = 0, invalidated = 0;

  for (const [env, envTokens] of Object.entries(byEnv)) {
    await withApnsSession(async ({ send }) => {
      await Promise.all(envTokens.map(async (t) => {
        const r = await send(t.push_token, notification, opts);
        await service.from('push_receipts').insert({
          notification_id: notificationId || null,
          user_id: userId,
          provider: 'apns',
          push_token: t.push_token,
          status: r.ok ? 'delivered' : 'failed',
          provider_message_id: r.apnsId || null,
          error_code: r.reason || null,
          error_message: r.ok ? null : (r.reason || `http ${r.status}`),
          token_invalidated: !!r.invalidated,
          sent_at: new Date().toISOString(),
        });
        if (r.ok) delivered += 1;
        else failed += 1;
        if (r.invalidated) {
          invalidated += 1;
          await service.rpc('invalidate_user_push_token', { p_token: t.push_token });
        }
      }));
    }, { environment: env });
  }

  return { delivered, failed, invalidated, attempted: tokens.length };
}
