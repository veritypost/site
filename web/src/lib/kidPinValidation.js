// T-025 — shared kid-PIN weakness check.
//
// Used by 4 sites:
//   - /api/kids/route.js         POST (create kid profile with PIN)
//   - /api/kids/set-pin/route.js POST (change kid PIN)
//   - /api/kids/trial/route.js   POST (trial kid profile with PIN)
//   - /profile/kids/page.tsx     client-side pre-submit hint
//
// Pure (no crypto). Safe to import from client and server.
//
// Before this helper, each site carried a 14-entry WEAK_PINS set that
// missed sequentials like 2345, 6789, doubled halves like 1212, mirrors
// like 1221, and birth years. PIN space is 10,000 — the augmented set
// eliminates roughly 5% of trivially-guessable combinations without
// pushing the bar so high that parents struggle to pick something.

const CURATED = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '0123', '9876',
]);

export function isPinWeak(pin) {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) return true;

  // 1. Curated list (legacy set + classics)
  if (CURATED.has(pin)) return true;

  const d = pin.split('').map(Number);

  // 2. All same digit (0000, 1111, etc.) — also caught by CURATED but cheap
  if (d[0] === d[1] && d[1] === d[2] && d[2] === d[3]) return true;

  // 3. Sequential ascending (0123, 1234, ..., 6789)
  if (d[1] === d[0] + 1 && d[2] === d[1] + 1 && d[3] === d[2] + 1) return true;

  // 4. Sequential descending (9876, ..., 3210)
  if (d[1] === d[0] - 1 && d[2] === d[1] - 1 && d[3] === d[2] - 1) return true;

  // 5. Doubled halves (1212, 3434, 9090)
  if (d[0] === d[2] && d[1] === d[3]) return true;

  // 6. Mirrored halves (1221, 3443, 8008)
  if (d[0] === d[3] && d[1] === d[2]) return true;

  // 7. Common year window (1900-2099). Birth year is the #1 weak-PIN
  // pattern worldwide. Not every year, but the plausible-human-DOB band.
  const year = parseInt(pin, 10);
  if (year >= 1900 && year <= 2099) return true;

  return false;
}

// Shape + weakness in one call. Returns null if OK, or an error string.
export function validatePin(pin) {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return 'PIN must be 4 digits';
  }
  if (isPinWeak(pin)) {
    return 'Choose a less guessable PIN (avoid birth years, sequences, and repeated digits)';
  }
  return null;
}
