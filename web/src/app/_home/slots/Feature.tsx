// Feature block — non-story editorial: By the Numbers, Quote of the Day,
// Pull Quote, Receipts. Wired to the live `daily_features` table. Adapts
// to slot width:
//   - wide (span >= 8): full-width "by the numbers" band — paper-2 bg,
//     2px black top+bottom rules, three figures in red.
//   - narrow (span <= 6): dark navy rail card — single figure in white.
// Left-aligned by editorial rule.

import { createServiceClient } from '@/lib/supabase/server';
import { C, serifStack } from './_shared';
import type { SlotRow } from '../types';

type ByNumbersItem = { figure: string; caption: string };
type ReceiptItem = { claim: string; verdict: string; source_line?: string };
type QuoteItem = { quote: string; speaker?: string; context?: string };
type PullQuoteItem = { quote: string; attribution?: string };

type FeatureRow = {
  feature_type: 'by_numbers' | 'receipts' | 'quote' | 'pull_quote';
  label: string;
  sub_label: string | null;
  items: unknown;
};

async function fetchTodayFeature(): Promise<FeatureRow | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('daily_features')
    .select('feature_type, label, sub_label, items')
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('feature_date', { ascending: false })
    .limit(1)
    .maybeSingle<FeatureRow>();
  if (error) {
    console.error('[home.feature.fetch]', error.message);
    return null;
  }
  return data;
}

export default async function Feature({ slot }: { slot?: SlotRow }) {
  const feature = await fetchTodayFeature();
  if (!feature) return null;
  const compact = (slot?.span ?? 12) <= 6;

  if (feature.feature_type === 'by_numbers') {
    const items = (Array.isArray(feature.items) ? feature.items : []) as ByNumbersItem[];
    if (items.length === 0) return null;

    if (compact) {
      const item = items[0];
      return (
        <aside className="vp-btn-rail">
          <div className="vp-btn-rail__label">{feature.label}</div>
          <div className="vp-btn-rail__fig">{item.figure}</div>
          <div className="vp-btn-rail__cap">{item.caption}</div>
          {feature.sub_label && (
            <div className="vp-btn-rail__sub">Source · {feature.sub_label}</div>
          )}
        </aside>
      );
    }

    return (
      <section className="vp-btn-band-wide">
        <div className="vp-btn-band-wide__label">{feature.label}</div>
        <div className="vp-btn-band-wide__grid">
          {items.slice(0, 3).map((item, idx) => (
            <div key={idx}>
              <div className="vp-btn-band-wide__fig">{item.figure}</div>
              <div className="vp-btn-band-wide__cap">{item.caption}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Non-by_numbers feature_types fall back to the prior simple chrome.
  const wrapStyle: React.CSSProperties = {
    borderTop: `1px solid ${C.rule}`,
    borderBottom: `1px solid ${C.rule}`,
    padding: compact ? '20px 0' : '32px 0',
  };

  return (
    <section style={wrapStyle}>
      <header style={{ marginBottom: compact ? 12 : 20 }}>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: C.dim,
          }}
        >
          {feature.label}
        </p>
        {!compact && feature.sub_label && (
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 13,
              fontStyle: 'italic',
              color: C.soft,
              fontFamily: serifStack,
            }}
          >
            {feature.sub_label}
          </p>
        )}
      </header>
      <FeatureBody feature={feature} compact={compact} />
    </section>
  );
}

function FeatureBody({
  feature,
  compact,
}: {
  feature: FeatureRow;
  compact: boolean;
}) {
  if (feature.feature_type === 'pull_quote' || feature.feature_type === 'quote') {
    const item = feature.items as PullQuoteItem | QuoteItem | null;
    if (!item || typeof item !== 'object' || !item.quote) return null;
    const attribution =
      'attribution' in item
        ? item.attribution
        : 'speaker' in item
          ? item.speaker
          : null;
    return (
      <blockquote
        style={{
          margin: 0,
          fontFamily: serifStack,
          fontSize: compact ? 18 : 26,
          fontWeight: 500,
          lineHeight: 1.35,
          letterSpacing: '-0.01em',
          color: C.text,
          maxWidth: 720,
        }}
      >
        “{item.quote}”
        {attribution && (
          <footer
            style={{
              fontSize: compact ? 12 : 13,
              fontStyle: 'italic',
              color: C.dim,
              marginTop: 12,
              fontWeight: 400,
              letterSpacing: 0,
            }}
          >
            — {attribution}
          </footer>
        )}
      </blockquote>
    );
  }

  if (feature.feature_type === 'receipts') {
    const items = (Array.isArray(feature.items) ? feature.items : []) as ReceiptItem[];
    if (items.length === 0) return null;
    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxWidth: 720 }}>
        {items.slice(0, 4).map((item, idx) => (
          <li
            key={idx}
            style={{
              padding: '12px 0',
              borderTop: idx === 0 ? 'none' : `1px solid ${C.rule}`,
            }}
          >
            <p
              style={{
                fontFamily: serifStack,
                fontSize: compact ? 14 : 16,
                lineHeight: 1.4,
                color: C.text,
                margin: 0,
              }}
            >
              {item.claim}
            </p>
            <p
              style={{
                fontSize: 12,
                color: C.dim,
                margin: '4px 0 0',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              {item.verdict}
              {item.source_line && (
                <span style={{ marginLeft: 8, letterSpacing: 0, textTransform: 'none', fontWeight: 400 }}>
                  · {item.source_line}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  return null;
}
