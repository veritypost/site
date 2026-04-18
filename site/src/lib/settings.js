let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 10_000;

export async function getSettings(supabase) {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;

  const { data, error } = await supabase
    .from('settings')
    .select('key, value, value_type');

  if (error || !data) return _cache || {};

  const settings = {};
  for (const row of data) {
    let val = row.value;
    if (row.value_type === 'boolean') val = val === 'true';
    else if (row.value_type === 'number') val = Number(val);
    else if (row.value_type === 'json') {
      try { val = JSON.parse(val); } catch { /* keep as string */ }
    } else if (row.value_type === 'string' && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    settings[row.key] = val;
  }

  _cache = settings;
  _cacheTime = Date.now();
  return settings;
}

export function clearSettingsCache() {
  _cache = null;
  _cacheTime = 0;
}

export function isEnabled(settings, key, fallback = false) {
  const val = settings[key];
  if (val === undefined) return fallback;
  if (typeof val === 'boolean') return val;
  return val === 'true' || val === true;
}

export function getNumber(settings, key, fallback = 0) {
  const val = settings[key];
  if (val === undefined) return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

export function getString(settings, key, fallback = '') {
  return settings[key] ?? fallback;
}
