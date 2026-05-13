'use client';

// Debounced search-as-you-type picker. Calls the existing /api/search
// endpoint (anon-allowed title search) so we don't need a dedicated
// admin lookup. Returns selection back to the parent form via onChange.

import { useEffect, useState } from 'react';

export type PickerArticle = {
  id: string;
  title: string | null;
};

type Props = {
  value: PickerArticle | null;
  onChange: (a: PickerArticle | null) => void;
  disabled?: boolean;
};

type SearchHit = { id?: unknown; title?: unknown };

export default function ArticlePicker({ value, onChange, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickerArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value) return; // when a selection is locked we don't re-search
    if (query.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/search?q=${encodeURIComponent(query.trim())}`;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) {
          setError(`Search failed (${res.status})`);
          setResults([]);
          return;
        }
        const json = (await res.json()) as { articles?: SearchHit[] };
        const articles = Array.isArray(json.articles) ? json.articles : [];
        setResults(
          articles
            .map((a) => ({
              id: typeof a.id === 'string' ? a.id : '',
              title: typeof a.title === 'string' ? a.title : null,
            }))
            .filter((a) => a.id.length > 0)
            .slice(0, 10)
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error';
        setError(msg);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, value]);

  if (value) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          border: '1px solid #cbd5e1',
          borderRadius: 6,
          background: '#f8fafc',
        }}
      >
        <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value.title || value.id}
        </span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery('');
            setResults([]);
          }}
          disabled={disabled}
          style={{
            fontSize: 12,
            border: 'none',
            background: 'transparent',
            color: '#475569',
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: '2px 6px',
          }}
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search published articles by title…"
        disabled={disabled}
        style={{
          width: '100%',
          padding: '8px 10px',
          border: '1px solid #cbd5e1',
          borderRadius: 6,
          fontSize: 13,
          fontFamily: 'inherit',
          background: '#ffffff',
          color: '#0f172a',
          boxSizing: 'border-box',
        }}
      />
      {loading && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>Searching…</div>
      )}
      {error && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>{error}</div>
      )}
      {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>No results.</div>
      )}
      {results.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: '6px 0 0',
            padding: 0,
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            background: '#ffffff',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
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
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 'none',
                  borderBottom: '1px solid #f1f5f9',
                  background: 'transparent',
                  fontSize: 13,
                  color: '#0f172a',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {r.title || r.id}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
