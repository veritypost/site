// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
'use client';
import { KID } from '@/lib/kidTheme';

interface BadgeProps {
  name: string;
  subdued?: boolean;
}

export default function Badge({ name, subdued = false }: BadgeProps) {
  const ringColor = subdued ? KID.border : KID.achievement;
  const ringFill = subdued ? KID.cardAlt : KID.card;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      padding: '14px 10px',
      background: KID.card,
      border: `2px solid ${ringColor}`,
      borderRadius: KID.radius.card,
      textAlign: 'center',
      minHeight: 120,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 28,
        background: ringFill,
        border: `3px solid ${ringColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: subdued ? KID.dim : KID.achievement,
        flex: '0 0 auto',
      }}>
        <StarIcon />
      </div>
      <div style={{
        fontSize: KID.font.sub, fontWeight: KID.weight.bold,
        color: KID.text, lineHeight: KID.leading.heading,
      }}>{name}</div>
    </div>
  );
}

function StarIcon() {
  return (
    <svg
      width="28" height="28" viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
    >
      <polygon points="16,4 19.5,12.5 28.5,13.5 21.5,19.5 23.5,28.5 16,23.5 8.5,28.5 10.5,19.5 3.5,13.5 12.5,12.5" />
    </svg>
  );
}
