// Normalize emails for self-referral / sybil detection + reject homoglyph
// bypass attempts.
//
// Gmail treats `foo.bar@gmail.com` and `foo+anything@gmail.com` as the same
// inbox. To prevent the obvious wash-trade — sign up A, then "refer"
// A.alias@gmail.com — we compare normalized forms.
//
// T299 — homoglyph guard. Cyrillic 'а' (U+0430) and Latin 'a' (U+0061) are
// distinct codepoints under both NFC and NFKC, so Unicode normalization
// alone doesn't fold them. The cheap-and-correct gate for an English-only
// product is "reject any email whose codepoints aren't all ASCII." Verity
// Post doesn't currently support IDN signups, so this loses no real users
// while defeating ban-evasion-by-homoglyph at every email-write surface
// that goes through this helper.

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/// True iff every codepoint in `email` is < 128 (ASCII-only) AND the email
/// has the basic shape `local@domain` with non-empty parts. Use at every
/// public/admin/auth surface that accepts an email from user input before
/// the value is stored or compared. Catches homoglyph bypass attempts
/// (Cyrillic 'а' vs Latin 'a' etc.).
export function isAsciiEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 254) return false;
  // Spread iterator yields codepoints (handles surrogates correctly).
  for (const ch of trimmed) {
    if (ch.codePointAt(0)! >= 128) return false;
  }
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return false;
  return true;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  // Reject non-ASCII before alias-folding. Belt-and-suspenders for the
  // signup-time gate at API surfaces — any caller that bypasses the
  // surface gate (e.g., a future `auth.admin.createUser` call site) still
  // gets a null back here, which surfaces as "no match" in comparisons.
  if (!isAsciiEmail(email)) return null;
  const trimmed = (email as string).trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
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
