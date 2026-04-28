'use client';

/**
 * One Story = the bundle of related discovery items + 3 audience cards
 * (Decision 8). Layout: 3 horizontal AudienceCard components on top,
 * SourcesBlock spanning the full width below. Wraps to a column at
 * narrow widths via flex-wrap.
 */

import AudienceCard, { type AudienceCardState } from './AudienceCard';
import SourcesBlock, { type SourceItem } from './SourcesBlock';
import { type AudienceBand } from './PipelineStepLabels';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

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
  // Optional pre-resolved articleSlug/articleTitle map for the
  // 'generated' state — list endpoint does not include slug/title.
  articleMeta?: Record<string, { slug: string | null; title: string | null }>;
};

const BANDS: AudienceBand[] = ['adult', 'tweens', 'kids'];

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
    case 'skipped':
      return 'skipped';
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
}: Props) {
  const workingHeadline =
    sources[0]?.title?.trim() || cluster.title?.trim() || 'No working headline yet';

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
      <header
        style={{
          padding: `${S[2]}px ${S[4]}px`,
          borderBottom: `1px solid ${C.divider}`,
          background: C.card,
          display: 'flex',
          gap: S[2],
          alignItems: 'baseline',
          justifyContent: 'space-between',
          fontSize: F.xs,
          color: C.muted,
        }}
      >
        <span>
          Story · {sources.length} {sources.length === 1 ? 'source' : 'sources'}
          {cluster.is_breaking && (
            <span style={{ marginLeft: S[2], color: C.danger, fontWeight: 700 }}>BREAKING</span>
          )}
        </span>
        <span>
          {cluster.updated_at
            ? `updated ${new Date(cluster.updated_at).toLocaleString()}`
            : ''}
        </span>
      </header>

      <div style={{ padding: S[3], display: 'flex', flexWrap: 'wrap', gap: S[3] }}>
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
            />
          );
        })}
      </div>

      <div style={{ borderTop: `1px solid ${C.divider}` }}>
        <SourcesBlock sources={sources} />
      </div>
    </article>
  );
}
