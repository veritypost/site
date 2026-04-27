// Normalize emails for self-referral / sybil detection.
// Gmail treats `foo.bar@gmail.com` and `foo+anything@gmail.com` as the
// same inbox. To prevent the obvious wash-trade — sign up A, then
// "refer" A.alias@gmail.com — we compare normalized forms.

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (GMAIL_DOMAINS.has(domain)) {
    const plus = local.indexOf('+');
    const beforePlus = plus >= 0 ? local.slice(0, plus) : local;
    const noDots = beforePlus.replace(/\./g, '');
    return `${noDots}@gmail.com`;
  }
  // Strip plus-addressing for everyone (most providers honor it as alias).
  const plus = local.indexOf('+');
  const localFinal = plus >= 0 ? local.slice(0, plus) : local;
  return `${localFinal}@${domain}`;
}
