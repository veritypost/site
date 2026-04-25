// Shared password policy (Bug 9). One definition of the rules, reused by
// signup, reset-password, and profile/settings/password. If policy needs
// to change (add a special-character requirement, raise the length), edit
// this file — NOT the individual call sites.
//
// Matches web admin settings defaults: 8 chars + uppercase + number;
// special character is optional (opt-in via admin settings). iOS mirrors
// this subset via ResetPasswordView's local rules (no shared pipe yet).

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQS = [
  {
    id: 'len',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  { id: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'num', label: 'One number', test: (p) => /[0-9]/.test(p) },
];

// Optional special-character rule — opt-in. Front-end callers that want the
// strict policy can spread this onto PASSWORD_REQS. Server validation uses
// the base set only so we don't surface a rule the user's form doesn't show.
export const PASSWORD_SPECIAL_REQ = {
  id: 'special',
  label: 'One special character',
  test: (p) => /[^A-Za-z0-9]/.test(p),
};

// Server-side guard used by POST /api/auth/signup and similar routes.
// Returns `null` if valid, otherwise a human-readable error string suitable
// for the response body.
export function validatePasswordServer(pw) {
  if (typeof pw !== 'string') return 'Password is required';
  for (const r of PASSWORD_REQS) {
    if (!r.test(pw)) return passwordFailureMessage(r.id);
  }
  return null;
}

// Ext-M8 — DB-aware variant reading password.* settings rows (schema/173).
// Caller passes a service client; settings cache means this is effectively
// free on the hot path. Falls back to constants if settings unreachable.
export async function validatePasswordServerWithSettings(pw, supabase) {
  if (typeof pw !== 'string') return 'Password is required';
  try {
    const { getSettings, getNumber, isEnabled } = await import('./settings');
    const settings = await getSettings(supabase);
    const minLen = getNumber(settings, 'password.min_length', PASSWORD_MIN_LENGTH);
    const reqUpper = isEnabled(settings, 'password.require_upper', true);
    const reqNumber = isEnabled(settings, 'password.require_number', true);
    const reqSpecial = isEnabled(settings, 'password.require_special', false);
    if (pw.length < minLen) return `Password must be at least ${minLen} characters`;
    if (reqUpper && !/[A-Z]/.test(pw)) return 'Password must include an uppercase letter';
    if (reqNumber && !/[0-9]/.test(pw)) return 'Password must include a number';
    if (reqSpecial && !/[^A-Za-z0-9]/.test(pw)) {
      return 'Password must include a special character';
    }
    return null;
  } catch {
    return validatePasswordServer(pw);
  }
}

function passwordFailureMessage(id) {
  switch (id) {
    case 'len':
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    case 'upper':
      return 'Password must include an uppercase letter';
    case 'num':
      return 'Password must include a number';
    default:
      return 'Password does not meet requirements';
  }
}

// Simple 0–4 strength score used by the signup strength meter.
export function passwordStrength(pw) {
  let s = 0;
  if (pw.length >= PASSWORD_MIN_LENGTH) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { bars: 1, label: 'Weak', color: '#ef4444' };
  if (s === 2) return { bars: 2, label: 'Fair', color: '#f97316' };
  if (s === 3) return { bars: 3, label: 'Good', color: '#eab308' };
  return { bars: 4, label: 'Strong', color: '#22c55e' };
}
