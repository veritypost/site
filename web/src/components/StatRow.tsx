// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
'use client';

interface StatRowProps {
  label: string;
  value: number | string;
  total?: number | string;
  color?: string;
}

export default function StatRow({ label, value, total, color = 'var(--white)' }: StatRowProps) {
  const v = Number(value) || 0;
  const t = Number(total) || 0;
  const pct = t > 0 ? Math.min(100, (v / t) * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--dim)', marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: v > 0 ? 'var(--white)' : 'var(--dim)', fontWeight: 500 }}>
          {t > 0 ? `${v}/${t}` : v}
        </span>
      </div>
      <div style={{
        height: 4, borderRadius: 2,
        background: '#ffffff',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          height: '100%',
          borderRadius: 2,
          background: color,
          width: `${pct}%`,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}
