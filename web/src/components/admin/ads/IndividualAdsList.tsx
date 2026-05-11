// "Individual ads" panel. Renders one row per (placement, ad_unit) pair
// returned by GET /api/admin/ads/overview (or GET /api/admin/home).
// Orphan placements (no ad_unit attached) render an amber hint instead
// of a toggle. Status synthesis: master OFF beats everything; otherwise
// campaign-paused vs ad-paused take priority. Extracted verbatim from
// the inline version that used to live in /admin/home/page.tsx so the
// new /admin/ads page can mount it directly.

'use client';

import type { ReactElement } from 'react';
import Button from '@/components/admin/Button';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

// Per-ad-unit row for the "Individual ads" panel. One row per
// (placement, ad_unit) pair. The locked shape requires non-null
// ad_unit / placement fields — orphan placements (no attached
// ad_unit) are filtered out by the caller and surfaced via the
// `counts.orphan` channel on /api/admin/ads/overview instead.
export type AdUnitRow = {
  ad_unit_id: string;
  ad_unit_name: string;
  placement_name: string;
  placement_display_name: string;
  is_active: boolean;
  campaign_status: string | null;
  creative_html?: string | null;
};

// Synthesized status shown under each per-ad row. Derived from
// (master ads toggle, campaign_status, is_active). NO_AD and
// UNKNOWN are reserved for callers that hand in a per-placement
// serve_ad probe; this component renders them when supplied via
// future props but never synthesizes them itself.
export type IndividualAdStatus =
  | 'LIVE'
  | 'PAUSED_AD'
  | 'PAUSED_CAMPAIGN'
  | 'MASTER_OFF'
  | 'NO_AD'
  | 'UNKNOWN';

type Props = {
  adUnits: AdUnitRow[];
  adsEnabled: boolean;
  togglingAdId: string | null;
  onToggleAdUnit: (adUnitId: string, newIsActive: boolean) => Promise<void>;
};

export default function IndividualAdsList({
  adUnits,
  adsEnabled,
  togglingAdId,
  onToggleAdUnit,
}: Props): ReactElement {
  if (adUnits.length === 0) {
    return (
      <div style={{ fontSize: F.sm, color: C.dim, padding: `${S[2]}px 0` }}>
        No ad placements detected in the current homepage layout.
      </div>
    );
  }

  const synthesize = (row: AdUnitRow): IndividualAdStatus => {
    if (!adsEnabled) return 'MASTER_OFF';
    if (row.is_active === false) return 'PAUSED_AD';
    if (row.campaign_status && row.campaign_status !== 'active') {
      return 'PAUSED_CAMPAIGN';
    }
    return 'LIVE';
  };

  const statusChip = (s: IndividualAdStatus) => {
    if (s === 'LIVE') {
      return { dot: '#22c55e', label: 'LIVE', tone: '#15803d' };
    }
    if (s === 'NO_AD') {
      return { dot: '#f59e0b', label: 'NO AD', tone: '#b45309' };
    }
    if (s === 'PAUSED_AD') {
      return { dot: '#f59e0b', label: 'PAUSED (this ad)', tone: '#92400e' };
    }
    if (s === 'PAUSED_CAMPAIGN') {
      return { dot: '#f59e0b', label: 'PAUSED (campaign)', tone: '#92400e' };
    }
    if (s === 'UNKNOWN') {
      return { dot: C.muted, label: 'UNKNOWN', tone: C.dim };
    }
    return { dot: C.muted, label: 'OFF (master)', tone: C.dim };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {adUnits.map((row, idx) => {
        const key = `${row.placement_name}:${row.ad_unit_id}`;
        const synth = synthesize(row);
        const chip = statusChip(synth);
        const active = row.is_active === true;
        const isToggling = togglingAdId === row.ad_unit_id;
        // Master OFF disables the per-row toggle — explicit per the spec.
        const buttonDisabled =
          !adsEnabled || isToggling || togglingAdId !== null;
        return (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: S[3],
              padding: `${S[3]}px 0`,
              borderTop: idx === 0 ? 'none' : `1px solid ${C.divider}`,
              opacity: adsEnabled ? 1 : 0.6,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: F.base,
                  fontWeight: 600,
                  color: C.ink,
                  lineHeight: 1.3,
                }}
              >
                {row.placement_display_name}
              </div>
              <div style={{ fontSize: F.sm, color: C.dim, marginTop: 2 }}>
                {row.placement_name}
              </div>
              {chip && (
                <div
                  style={{
                    fontSize: F.sm,
                    color: chip.tone,
                    marginTop: S[1],
                    display: 'flex',
                    alignItems: 'center',
                    gap: S[1],
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: chip.dot,
                    }}
                  />
                  <span>{chip.label}</span>
                </div>
              )}
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: F.sm,
                color: C.ink,
              }}
            >
              <span>{row.ad_unit_name}</span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: S[2],
                flexShrink: 0,
              }}
            >
              <span
                aria-hidden
                title={active ? 'is_active=true' : 'is_active=false'}
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: active ? '#16a34a' : C.muted,
                }}
              />
              <Button
                size="sm"
                variant={active ? 'secondary' : 'primary'}
                onClick={() => {
                  void onToggleAdUnit(row.ad_unit_id, !active);
                }}
                disabled={buttonDisabled}
              >
                {isToggling ? '…' : active ? 'Turn off' : 'Turn on'}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
