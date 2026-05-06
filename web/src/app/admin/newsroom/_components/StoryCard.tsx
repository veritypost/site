'use client';

import { useState } from 'react';
import AudienceCard, { type AudienceCardState } from './AudienceCard';
import SourcesBlock, { type SourceItem } from './SourcesBlock';
import { type AudienceBand } from './PipelineStepLabels';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import { timeAgo } from '@/lib/dates';

type AudienceStateRow = {
  cluster_id: string;
  audience_band: AudienceBand;
  state: string;
  article_id: string | null;
  skipped_at: string | null;
  generated_at: string | null;
  updated_at: string | null;
};

type RecentRun = {
  audience_band: AudienceBand;
  id: string;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_type: string | null;
} | null;

export type StoryCardCluster = {
  id: string;
  title: string | null;
  summary: string | null;
  is_breaking: boolean;
  category_id: string | null;
  category_name?: string | null;
  subcategory_name?: string | null;
  keywords: string[];
  created_at: string | null;
  updated_at: string | null;
  completed: boolean;
};

type Props = {
  cluster: StoryCardCluster;
  audienceState: AudienceStateRow[];
  sources: SourceItem[];
  recentRunPerBand: RecentRun[];
  articleMeta?: Record<string, { slug: string | null; title: string | null }>;
  selectedModelIdx?: number;
};

const BANDS: AudienceBand[] = ['adult', 'tweens', 'kids'];

const STOP_WORDS = new Set([
  'a','an','the','and','but','or','nor','for','so','yet','in','on','at',
  'to','of','by','as','up','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should',
  'may','might','shall','its','it','this','that','with','from','into',
]);

export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !STOP_WORDS.has(w))
    .join(' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '');
}

function deriveCardState(state: string): AudienceCardState {
  switch (state) {
    case 'pending':
      return 'idle';
    case 'generating':
      return 'generating';
    case 'generated':
      return 'generated';
    case 'failed':
      return 'failed';
    default:
      return 'idle';
  }
}

export default function StoryCard({
  cluster,
  audienceState,
  sources,
  recentRunPerBand,
  articleMeta,
  selectedModelIdx = 0,
}: Props) {
  const [visibleSources] = useState<SourceItem[]>(sources);

  const workingHeadline =
    visibleSources[0]?.title?.trim() || cluster.title?.trim() || 'No working headline yet';

  const slug = toSlug(workingHeadline);

  return (
    <article
      style={{
        border: `1px solid ${C.divider}`,
        borderRadius: 10,
        background: C.bg,
        marginBottom: S[3],
        overflow: 'hidden',
      }}
    >
      {/* Header: headline + timestamp */}
      <header
        style={{
          padding: `${S[3]}px ${S[4]}px`,
          display: 'flex',
          gap: S[3],
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: F.md, fontWeight: 600, color: C.ink, lineHeight: 1.35, flex: 1 }}>
          {cluster.is_breaking && (
            <span style={{ marginRight: S[2], color: C.danger, fontWeight: 700, fontSize: F.xs }}>
              BREAKING
            </span>
          )}
          {workingHeadline}
        </div>
        <div style={{ fontSize: F.xs, color: C.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {cluster.updated_at ? timeAgo(cluster.updated_at) : ''}
        </div>
      </header>

      {/* Body: category / subcategory / slug + audience cards */}
      <div style={{ padding: `0 ${S[4]}px ${S[3]}px` }}>
        {cluster.category_name && (
          <div style={{ fontSize: F.xs, color: C.muted, marginBottom: 2 }}>
            {cluster.category_name}
          </div>
        )}
        {cluster.subcategory_name && (
          <div style={{ fontSize: F.xs, color: C.muted, marginBottom: 2 }}>
            {cluster.subcategory_name}
          </div>
        )}

        {/* Slug + audience cards row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: S[3],
            flexWrap: 'wrap',
            marginTop: S[1],
          }}
        >
          <code
            style={{
              fontSize: F.xs,
              color: C.dim,
              fontFamily: 'monospace',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {slug}
          </code>
          <div style={{ display: 'flex', gap: S[2], flexShrink: 0 }}>
            {BANDS.map((band) => {
              const state = audienceState.find((s) => s.audience_band === band);
              const cardState = deriveCardState(state?.state ?? 'pending');
              const run = recentRunPerBand.find((r) => r && r.audience_band === band) ?? null;
              const meta = state?.article_id ? articleMeta?.[state.article_id] : undefined;
              return (
                <AudienceCard
                  key={band}
                  clusterId={cluster.id}
                  audienceBand={band}
                  initialState={cardState}
                  initialArticleId={state?.article_id ?? null}
                  initialArticleSlug={meta?.slug ?? null}
                  initialArticleTitle={meta?.title ?? null}
                  initialRunId={run?.id ?? null}
                  initialErrorType={run?.error_type ?? null}
                  initialErrorStep={null}
                  workingHeadline={workingHeadline}
                  selectedModelIdx={selectedModelIdx}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${C.divider}` }} />

      {/* Sources */}
      <SourcesBlock sources={visibleSources} />
    </article>
  );
}
