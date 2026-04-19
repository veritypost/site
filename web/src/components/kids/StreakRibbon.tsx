// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
'use client';
import { KID } from '@/lib/kidTheme';

interface StreakRibbonProps {
  days: number;
  name?: string | null;
}

export default function StreakRibbon({ days, name }: StreakRibbonProps) {
  if (!days || days <= 0) return null;
  const hot = days >= 3;
  const bg = hot ? KID.streak : KID.warnSoft;
  const fg = hot ? KID.onWarm : KID.warnInk;
  const label = hot
    ? `${days}-day streak — keep it going!`
    : `${days}-day streak`;
  return (
    <div
      className="kid-celebrate-rise"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
        background: bg, color: fg,
        border: `1px solid ${hot ? KID.streak : KID.warn}`,
        borderRadius: KID.radius.card,
        marginBottom: KID.space.sectionGap,
      }}
    >
      <span className={hot ? 'kid-streak-pulse' : undefined}>
        <FlameIcon />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: KID.font.sub, fontWeight: KID.weight.bold,
          color: hot ? fg : KID.warn,
          textTransform: 'uppercase', letterSpacing: KID.tracking.loose,
          lineHeight: 1,
        }}>
          {name ? `Nice work, ${name}` : 'Nice work'}
        </div>
        <div style={{
          fontSize: KID.font.h3, fontWeight: KID.weight.extra,
          lineHeight: KID.leading.heading, marginTop: 2,
        }}>{label}</div>
      </div>
    </div>
  );
}

function FlameIcon() {
  return (
    <svg
      width="32" height="32" viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16 3c1.2 3.2 0.4 5.8-1.4 7.8-2 2-4 3.6-4 7 0 4.8 4 9.2 9.4 9.2 5.4 0 9-4.2 9-9 0-4.6-3-7-4.2-9.6-0.8 2-2 3.6-3.2 4.4 0.4-3.8-0.6-7.2-5.6-9.8Z" />
    </svg>
  );
}
