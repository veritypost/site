'use client';
// Phase C — Reclassify wizard modal.
//
// Scans active, non-deleted feeds and surfaces rows whose URL shape
// disagrees with their current feed_type. Operator reviews the preview,
// hits "Apply N reclassifications", endpoint runs the same UPDATE under
// admin.feeds.manage with a per-row admin_audit_log entry.
//
// The URL-shape heuristic mirrors the server-side authoritative copy in
// /api/admin/feeds/reclassify. Server re-checks before applying so a bad
// client preview can't pivot a feed to a target the heuristic doesn't
// support.

import { useMemo, useState } from 'react';
import Modal from '@/components/admin/Modal';
import Button from '@/components/admin/Button';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type FeedRow = Tables<'feeds'>;

interface ReclassifyModalProps {
  open: boolean;
  onClose: () => void;
  feeds: FeedRow[];
  onApplied: () => Promise<void> | void;
}

const RSS_URL_PATTERNS = [
  /\/rss(\/|$|\?|\.xml)/i,
  /\/feed(\/|$|\?|\.xml)/i,
  /\.atom(\/|$|\?)/i,
  /atom\.xml/i,
  /\/rss\.xml/i,
];

function urlLooksRss(url: string | null | undefined): boolean {
  if (!url) return false;
  return RSS_URL_PATTERNS.some((re) => re.test(url));
}

interface PreviewRow {
  feed_id: string;
  outlet: string;
  url: string;
  current: string;
  proposed: 'rss' | 'scrape_html';
  reason: string;
}

function feedTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case 'feed':
    case 'rss':
      return 'RSS';
    case 'scrape_html':
      return 'Scrape HTML';
    case 'scrape_json':
      return 'Scrape JSON';
    default:
      return t || '—';
  }
}

export default function ReclassifyModal({ open, onClose, feeds, onApplied }: ReclassifyModalProps) {
  const toast = useToast();
  const [working, setWorking] = useState(false);

  const preview = useMemo<PreviewRow[]>(() => {
    const out: PreviewRow[] = [];
    for (const f of feeds) {
      if (f.deleted_at) continue;
      // Don't auto-suggest scrape_json reclassification — operator-set
      // explicitly per /admin/feeds drawer.
      if (f.feed_type === 'scrape_json') continue;

      const isRss = urlLooksRss(f.url);
      const current = f.feed_type ?? 'feed';
      let proposed: PreviewRow['proposed'] | null = null;
      let reason = '';

      if (isRss && current !== 'rss' && current !== 'feed') {
        proposed = 'rss';
        reason = `URL contains RSS / feed / atom marker but feed_type is ${feedTypeLabel(current)}`;
      } else if (!isRss && (current === 'rss' || current === 'feed')) {
        proposed = 'scrape_html';
        reason = `URL has no RSS / feed / atom marker but feed_type is ${feedTypeLabel(current)}`;
      }

      if (!proposed) continue;

      out.push({
        feed_id: f.id,
        outlet: f.source_name || f.name || '(unnamed)',
        url: f.url ?? '',
        current,
        proposed,
        reason,
      });
    }
    return out;
  }, [feeds]);

  const handleApply = async () => {
    if (preview.length === 0) return;
    setWorking(true);
    try {
      const res = await fetch('/api/admin/feeds/reclassify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: preview.map((r) => ({ feed_id: r.feed_id, target: r.proposed })),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        appliedCount?: number;
        skippedCount?: number;
        error?: string;
      };
      if (!res.ok) {
        toast.push({ message: json.error ?? 'Reclassify failed', variant: 'danger' });
        return;
      }
      const applied = json.appliedCount ?? 0;
      const skipped = json.skippedCount ?? 0;
      toast.push({
        message: `Reclassified ${applied} feed${applied === 1 ? '' : 's'}${
          skipped > 0 ? ` (${skipped} skipped)` : ''
        }`,
        variant: 'success',
      });
      await onApplied();
      onClose();
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reclassify feeds"
      description="Detect feeds whose URL shape disagrees with their current type. Apply to align them so the right consumer (RSS parser vs HTML scraper) picks them up on the next ingest."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleApply}
            disabled={preview.length === 0 || working}
            loading={working}
          >
            {preview.length === 0
              ? 'No reclassifications needed'
              : `Apply ${preview.length} reclassification${preview.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      {preview.length === 0 ? (
        <div style={{ fontSize: F.sm, color: ADMIN_C.dim, padding: `${S[3]}px 0` }}>
          Every active feed&apos;s URL shape agrees with its current feed_type. No changes needed.
        </div>
      ) : (
        <div style={{ maxHeight: 480, overflowY: 'auto', border: `1px solid ${ADMIN_C.divider}`, borderRadius: 6 }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: F.sm,
            }}
          >
            <thead style={{ position: 'sticky', top: 0, background: ADMIN_C.card }}>
              <tr>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>Current</th>
                <th style={thStyle}>Proposed</th>
                <th style={thStyle}>Why</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => (
                <tr key={r.feed_id} style={{ borderTop: `1px solid ${ADMIN_C.divider}` }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: ADMIN_C.ink }}>{r.outlet}</div>
                    <div style={{ fontSize: F.xs, color: ADMIN_C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                      {r.url}
                    </div>
                  </td>
                  <td style={tdStyle}>{feedTypeLabel(r.current)}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: ADMIN_C.ink }}>
                    {feedTypeLabel(r.proposed)}
                  </td>
                  <td style={{ ...tdStyle, color: ADMIN_C.dim, fontSize: F.xs }}>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: `${S[2]}px ${S[3]}px`,
  fontSize: F.xs,
  fontWeight: 600,
  color: ADMIN_C.dim,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tdStyle: React.CSSProperties = {
  padding: `${S[2]}px ${S[3]}px`,
  verticalAlign: 'top',
};
