'use client';

// Stream B — pane 1 search box. Filters category NAMES only (client-side
// ILIKE-equivalent today; pg_trgm server upgrade noted in BUILD.md for
// future). Calls back to the parent CategoryPane on every change.

interface CategoryFilterInputProps {
  value: string;
  onChange: (next: string) => void;
}

export default function CategoryFilterInput({ value, onChange }: CategoryFilterInputProps) {
  return (
    <div style={{ padding: '12px 24px 0' }}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter sections…"
        aria-label="Filter sections"
        autoComplete="off"
        spellCheck={false}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid var(--vp-border)',
          background: 'var(--vp-bg)',
          borderRadius: 8,
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          fontSize: 13,
          color: 'var(--vp-ink)',
          outline: 'none',
        }}
      />
    </div>
  );
}
