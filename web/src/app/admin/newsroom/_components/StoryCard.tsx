'use client';

/**
 * One Story = the bundle of related discovery items + 3 audience cards
 * (Decision 8). Layout: 3 horizontal AudienceCard components on top,
 * SourcesBlock spanning the full width below. Wraps to a column at
 * narrow widths via flex-wrap.
 */

import { useState, useRef, useCallback } from 'react';
import AudienceCard, { type AudienceCardHandle, type AudienceCardState } from './AudienceCard';
import SourcesBlock, { type SourceItem } from './SourcesBlock';
import { type AudienceBand } from './PipelineStepLabels';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import Button from '@/components/admin/Button';

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
  articleMeta?: Record<string, { slug: string | null; title: string | null }>;
  mergeMode?: boolean;
  mergeSelected?: boolean;
  onMergeToggle?: (clusterId: string) => void;
  onMuteOutlet?: (outletName: string) => void;
  selectedModelIdx?: number;
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
  mergeMode,
  mergeSelected,
  onMergeToggle,
  onMuteOutlet,
  selectedModelIdx = 0,
}: Props) {
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(
    () => new Set(sources.map((s) => s.url))
  );
  const [visibleSources, setVisibleSources] = useState<SourceItem[]>(sources);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Refs MUST be at top level — never inside loops or conditionals.
  const adultRef = useRef<AudienceCardHandle>(null);
  const tweensRef = useRef<AudienceCardHandle>(null);
  const kidsRef = useRef<AudienceCardHandle>(null);

  const handleRemoveSource = useCallback(async (itemId: string) => {
    setRemoveError(null);
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/${cluster.id}/move-item`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, target_cluster_id: null, audience: 'adult' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setRemoveError(body.error ?? 'Could not remove source');
        return;
      }
      setVisibleSources((prev) => {
        const item = prev.find((s) => s.id === itemId);
        if (item) {
          setSelectedUrls((sel) => {
            const next = new Set(sel);
            next.delete(item.url);
            return next;
          });
        }
        return prev.filter((s) => s.id !== itemId);
      });
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Network error');
    }
  }, [cluster.id]);

  const handleGenerateAll = useCallback(() => {
    adultRef.current?.triggerGenerate();
    tweensRef.current?.triggerGenerate();
    kidsRef.current?.triggerGenerate();
  }, []);

  const handleToggleUrl = useCallback((url: string, checked: boolean) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (checked) next.add(url);
      else next.delete(url);
      return next;
    });
  }, []);

  const anyIdle = audienceState.some((s) => deriveCardState(s.state) === 'idle');
  const selectedSourceUrlsArray = Array.from(selectedUrls);

  const workingHeadline =
    visibleSources[0]?.title?.trim() || cluster.title?.trim() || 'No working headline yet';

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
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: F.xs,
          color: C.muted,
        }}
      >
        <div style={{ display: 'flex', gap: S[2], alignItems: 'center' }}>
          {mergeMode && (
            <input
              type="checkbox"
              checked={mergeSelected ?? false}
              onChange={() => onMergeToggle?.(cluster.id)}
              style={{ flexShrink: 0 }}
            />
          )}
          <span>
            Story · {visibleSources.length} {visibleSources.length === 1 ? 'source' : 'sources'}
            {cluster.is_breaking && (
              <span style={{ marginLeft: S[2], color: C.danger, fontWeight: 700 }}>BREAKING</span>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: S[2], alignItems: 'center' }}>
          {anyIdle && (
            <Button onClick={handleGenerateAll} variant="secondary" size="sm">
              Generate All
            </Button>
          )}
          <span style={{ color: C.muted, fontSize: F.xs }}>
            {cluster.updated_at
              ? `updated ${new Date(cluster.updated_at).toLocaleString()}`
              : ''}
          </span>
        </div>
      </header>

      <div style={{ padding: S[3], display: 'flex', flexWrap: 'wrap', gap: S[3] }}>
        {BANDS.map((band) => {
          const state = audienceState.find((s) => s.audience_band === band);
          const cardState = deriveCardState(state?.state ?? 'pending');
          const run = recentRunPerBand.find((r) => r && r.audience_band === band) ?? null;
          const meta = state?.article_id ? articleMeta?.[state.article_id] : undefined;
          const bandRef = band === 'adult' ? adultRef : band === 'tweens' ? tweensRef : kidsRef;
          return (
            <AudienceCard
              key={band}
              ref={bandRef}
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
              selectedSourceUrls={selectedSourceUrlsArray}
              selectedModelIdx={selectedModelIdx}
            />
          );
        })}
      </div>

      <div style={{ borderTop: `1px solid ${C.divider}` }}>
        <SourcesBlock
          sources={visibleSources}
          selectedUrls={selectedUrls}
          onToggle={handleToggleUrl}
          onRemove={handleRemoveSource}
          onMuteOutlet={onMuteOutlet}
        />
        {removeError && (
          <div style={{ padding: `0 ${S[4]}px ${S[2]}px`, fontSize: F.sm, color: C.danger }}>
            {removeError}
          </div>
        )}
      </div>
    </article>
  );
}
