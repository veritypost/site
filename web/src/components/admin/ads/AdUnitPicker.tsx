// web/src/components/admin/ads/AdUnitPicker.tsx
//
// Wave 3 (admin/home redesign): typeahead picker over public.ad_units for
// the home /admin pin-tab popover. 250 ms debounce (matches the in-popover
// ArticlePicker idiom in /admin/home/page.tsx ArticlePickerPanel).
//
// Filters to approved + active units only — pinning an unapproved unit
// would bypass the programmatic approval gate in serve_ad's pin branch.
//
// Plan v4 deltas over Plan v1:
// - 2-char min-length trim (`query.trim().length < 2` short-circuits the
//   search; no `pg_trgm` index needed at this scale).
// - "Recent picks" row fetched once on mount via
//   `GET /api/admin/ads/pins/recent`; surfaces before any typing.
// - `placement_id` is read directly off PlacementOption.placement_id;
//   no `@ts-expect-error` directive anywhere.

'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import TextInput from '@/components/admin/TextInput';
import Button from '@/components/admin/Button';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

export type AdUnitPick = {
  id: string;
  name: string;
  advertiser_name: string | null;
  ad_format: string | null;
  placement_id: string;
};

type ApiUnit = {
  id?: unknown;
  name?: unknown;
  advertiser_name?: unknown;
  ad_format?: unknown;
  placement_id?: unknown;
};

export default function AdUnitPicker({
  value,
  onChange,
  disabled,
  placementId,
}: {
  value: AdUnitPick | null;
  onChange: (next: AdUnitPick | null) => void;
  disabled?: boolean;
  // Optional pre-filter on placement_id. When provided, the typeahead
  // narrows to units already attached to the same placement, which is
  // the 95% case (operator pins the unit that's already serving on
  // that slot). Empty / null = no placement filter.
  placementId?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdUnitPick[]>([]);
  const [recent, setRecent] = useState<AdUnitPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch recent picks once on mount when no value set.
  useEffect(() => {
    if (value) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/ads/pins/recent', {
          credentials: 'include',
        });
        if (!res.ok) return; // silent; recents are a nice-to-have
        const json = (await res.json()) as { units?: ApiUnit[] };
        if (cancelled) return;
        const list = Array.isArray(json.units) ? json.units : [];
        setRecent(
          list
            .map(coerceUnit)
            .filter((u): u is AdUnitPick => u != null)
            .slice(0, 5),
        );
      } catch {
        // ignore; recents are best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  // 2-char min trim: don't fire ILIKE for 1-char queries.
  useEffect(() => {
    if (value) return;
    const trimmed = query.trim();
    if (trimmed.length < 2 && !placementId) {
      setResults([]);
      setError(null);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set('approved', '1');
        params.set('active', '1');
        params.set('limit', '10');
        if (trimmed.length >= 2) params.set('q', trimmed);
        if (placementId) params.set('placement_id', placementId);
        const res = await fetch(`/api/admin/ad-units?${params.toString()}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          setError(`Search failed (${res.status})`);
          setResults([]);
          return;
        }
        const json = (await res.json()) as { units?: ApiUnit[] };
        const units = Array.isArray(json.units) ? json.units : [];
        setResults(
          units
            .map(coerceUnit)
            .filter((u): u is AdUnitPick => u != null)
            .slice(0, 10),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, value, placementId]);

  if (value) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: S[2],
          padding: `${S[2]}px ${S[3]}px`,
          border: `1px solid ${C.divider}`,
          borderRadius: 4,
          background: C.hover,
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: F.sm,
            color: C.ink,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={
            value.advertiser_name
              ? `${value.name} · ${value.advertiser_name}`
              : value.name
          }
        >
          {value.name}
          {value.advertiser_name ? ` · ${value.advertiser_name}` : ''}
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            onChange(null);
            setQuery('');
            setResults([]);
          }}
          disabled={disabled}
        >
          Change
        </Button>
      </div>
    );
  }

  const trimmed = query.trim();
  const showRecent = recent.length > 0 && trimmed.length < 2;

  return (
    <div>
      <TextInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search approved + active ad units…"
        disabled={disabled}
        autoFocus
      />
      {showRecent && (
        <div style={{ marginTop: S[2] }}>
          <div
            style={{
              fontSize: 11,
              color: C.dim,
              marginBottom: S[1],
              textTransform: 'uppercase',
              letterSpacing: '.04em',
            }}
          >
            Recent picks
          </div>
          <ul style={pickerListStyle()}>
            {recent.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onChange(r)}
                  disabled={disabled}
                  style={pickerItemStyle(disabled)}
                >
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  {r.advertiser_name && (
                    <div
                      style={{ color: C.dim, marginTop: 2, fontSize: 11 }}
                    >
                      {r.advertiser_name}
                      {r.ad_format ? ` · ${r.ad_format}` : ''}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {loading && trimmed.length >= 2 && (
        <div style={{ marginTop: S[1], fontSize: F.sm, color: C.dim }}>
          Searching…
        </div>
      )}
      {error && (
        <div style={{ marginTop: S[1], fontSize: F.sm, color: '#b91c1c' }}>
          {error}
        </div>
      )}
      {!loading &&
        !error &&
        trimmed.length >= 2 &&
        results.length === 0 && (
          <div style={{ marginTop: S[1], fontSize: F.sm, color: C.dim }}>
            No results.
          </div>
        )}
      {trimmed.length === 1 && (
        <div style={{ marginTop: S[1], fontSize: 11, color: C.dim }}>
          Type at least 2 characters…
        </div>
      )}
      {results.length > 0 && (
        <ul style={pickerListStyle()}>
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(r);
                  setQuery('');
                  setResults([]);
                }}
                disabled={disabled}
                style={pickerItemStyle(disabled)}
              >
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                {r.advertiser_name && (
                  <div
                    style={{ color: C.dim, marginTop: 2, fontSize: 11 }}
                  >
                    {r.advertiser_name}
                    {r.ad_format ? ` · ${r.ad_format}` : ''}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function coerceUnit(u: ApiUnit): AdUnitPick | null {
  const id = typeof u.id === 'string' ? u.id : '';
  const placement_id =
    typeof u.placement_id === 'string' ? u.placement_id : '';
  if (!id || !placement_id) return null;
  return {
    id,
    name: typeof u.name === 'string' ? u.name : id,
    advertiser_name:
      typeof u.advertiser_name === 'string' ? u.advertiser_name : null,
    ad_format: typeof u.ad_format === 'string' ? u.ad_format : null,
    placement_id,
  };
}

function pickerListStyle(): CSSProperties {
  return {
    listStyle: 'none',
    margin: `${S[1]}px 0 0`,
    padding: 0,
    border: `1px solid ${C.divider}`,
    borderRadius: 4,
    background: C.bg,
    maxHeight: 220,
    overflowY: 'auto',
  };
}

function pickerItemStyle(disabled?: boolean): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: `${S[2]}px ${S[3]}px`,
    border: 'none',
    borderBottom: `1px solid ${C.divider}`,
    background: 'transparent',
    fontSize: F.sm,
    color: C.ink,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
  };
}
