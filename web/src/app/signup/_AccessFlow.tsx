'use client';

const C = {
  bg: 'var(--bg)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
} as const;

const STEPS = [
  {
    n: '1',
    label: 'request access',
    sub: 'fill out a short form. takes 30 seconds.',
  },
  {
    n: '2',
    label: 'we take a look',
    sub: 'we usually respond within a day or two.',
  },
  {
    n: '3',
    label: 'get your invite',
    sub: 'a personal link arrives in your inbox.',
  },
  {
    n: '4',
    label: 'sign in',
    sub: '30 days of pro on us during beta.',
  },
] as const;

export default function AccessFlow() {
  return (
    <div>
      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 40 }}>
        {STEPS.map((s) => (
          <div key={s.n} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: `1.5px solid ${C.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: C.dim,
              }}
            >
              {s.n}
            </div>
            <div style={{ paddingTop: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 13, color: C.dim, marginTop: 3, lineHeight: 1.5 }}>
                {s.sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <a
          href="/login"
          style={{
            flex: '1 1 160px',
            padding: '13px 18px',
            borderRadius: 10,
            border: `1.5px solid ${C.border}`,
            fontSize: 14,
            fontWeight: 600,
            color: C.text,
            textAlign: 'center' as const,
            textDecoration: 'none',
            background: C.bg,
            boxSizing: 'border-box' as const,
          }}
        >
          i have an invite, sign in →
        </a>
        <a
          href="/login?mode=request"
          style={{
            flex: '1 1 160px',
            padding: '13px 18px',
            borderRadius: 10,
            border: 'none',
            background: C.accent,
            fontSize: 14,
            fontWeight: 600,
            color: '#fff',
            textAlign: 'center' as const,
            textDecoration: 'none',
            boxSizing: 'border-box' as const,
          }}
        >
          request access →
        </a>
      </div>
    </div>
  );
}
