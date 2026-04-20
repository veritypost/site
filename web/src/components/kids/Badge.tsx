// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
'use client';

// Palette inlined from the now-removed lib/kidTheme.js. Badge is the only
// surviving kid component in the adult web app (used by /profile/kids/[id]
// to render a child's achievement badges), so a shared token file was
// retired with the rest of /kids/* and the handful of constants it reads
// live here directly.
const CARD = '#FFFFFF';
const CARD_ALT = '#F5EED9';
const BORDER = '#E8DDC3';
const TEXT = '#1F1A15';
const DIM = '#7A6A5A';
const ACHIEVEMENT = '#CA8A04';
const RADIUS_CARD = 14;
const FONT_SUB = 14;
const WEIGHT_BOLD = 700;
const LEADING_HEADING = 1.2;

interface BadgeProps {
  name: string;
  subdued?: boolean;
}

export default function Badge({ name, subdued = false }: BadgeProps) {
  const ringColor = subdued ? BORDER : ACHIEVEMENT;
  const ringFill = subdued ? CARD_ALT : CARD;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      padding: '14px 10px',
      background: CARD,
      border: `2px solid ${ringColor}`,
      borderRadius: RADIUS_CARD,
      textAlign: 'center',
      minHeight: 120,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 28,
        background: ringFill,
        border: `3px solid ${ringColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: subdued ? DIM : ACHIEVEMENT,
        flex: '0 0 auto',
      }}>
        <StarIcon />
      </div>
      <div style={{
        fontSize: FONT_SUB, fontWeight: WEIGHT_BOLD,
        color: TEXT, lineHeight: LEADING_HEADING,
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
