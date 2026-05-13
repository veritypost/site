// PickRow — renders a single Editor's Edge pick row (server-side
// content) with a small client-only Remove button. Splitting the row
// itself keeps server-rendered category / article links cheap and only
// hydrates the destructive control on the client.

import RemoveButton from './RemoveButton';

type Pick = {
  id: string;
  slot: number;
  valid_from: string;
  valid_to: string;
  curator_note: string | null;
  article: { id: string; title: string | null; slug: string | null } | null;
  category: { id: string; name: string | null; slug: string | null } | null;
  subcategory: { id: string; name: string | null; slug: string | null } | null;
};

function formatRange(from: string, to: string): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  return `${fmt(from)} → ${fmt(to)}`;
}

export default function PickRow({ pick }: { pick: Pick }) {
  const now = Date.now();
  const fromMs = new Date(pick.valid_from).getTime();
  const toMs = new Date(pick.valid_to).getTime();
  const isLive = fromMs <= now && toMs > now;
  const isUpcoming = fromMs > now;

  return (
    <li
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 999,
              background: isLive ? '#dcfce7' : isUpcoming ? '#dbeafe' : '#f1f5f9',
              color: isLive ? '#166534' : isUpcoming ? '#1e40af' : '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {isLive ? 'Live' : isUpcoming ? 'Upcoming' : 'Past'}
          </span>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {pick.category?.name ?? 'Unknown category'}
            {pick.subcategory?.name ? ` › ${pick.subcategory.name}` : ''}
          </span>
        </div>

        <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', lineHeight: 1.35 }}>
          {pick.article?.title ?? <em style={{ color: '#94a3b8' }}>Untitled article</em>}
        </div>

        <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
          {formatRange(pick.valid_from, pick.valid_to)}
        </div>

        {pick.curator_note && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderLeft: '3px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              fontSize: 13,
              fontStyle: 'italic',
              borderRadius: '0 4px 4px 0',
            }}
          >
            “{pick.curator_note}”
          </div>
        )}
      </div>

      <RemoveButton id={pick.id} />
    </li>
  );
}
