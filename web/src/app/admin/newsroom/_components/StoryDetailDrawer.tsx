'use client';

/**
 * Wave 5 — Stream E Stories list rebuild
 *
 * Drawer for a single story. Shows:
 *   - title, slug, keywords, dates, generation_state
 *   - read-only observation timeline (descending observed_at)
 *   - per-band article rollup
 *   - Reject + Archive controls (flip generation_state)
 *
 * Source: GET /api/admin/newsroom/research/stories/:id
 * Mutate: POST /api/admin/newsroom/research/stories/:id/state
 */

import { useCallback, useEffect, useState } from 'react';
import Drawer from '@/components/admin/Drawer';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import { MODEL_OPTIONS } from '@/lib/newsroomModels';

type Band = 'adult' | 'tweens' | 'kids';

type Story = {
  id: string;
  slug: string;
  title: string;
  keywords: string[];
  first_seen_at: string | null;
  last_observed_at: string | null;
  generation_state: string | null;
  lifecycle_status: string;
  research_query_id: string | null;
  is_locked: boolean;
  observation_count: number;
  source_count: number;
  detached_count: number;
  default_cluster_id: string | null;
};

type Observation = {
  id: string;
  observed_at: string;
  match_score: number | null;
  url: string;
  title: string | null;
  excerpt: string | null;
  outlet: string | null;
  source_class: string | null;
  feed_id: string | null;
  discovery_item_id: string | null;
};

type ArticleRollup = {
  band: Band;
  state: 'pending' | 'draft' | 'published' | 'archived';
  article_id: string | null;
  title: string | null;
  cluster_id: string | null;
};

type ResearchQueryStub = { id: string; name: string | null; query_text: string };

type DetailResponse = {
  story: Story;
  research_query: ResearchQueryStub | null;
  observations: Observation[];
  articles_by_band: ArticleRollup[];
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function fmtScore(s: number | null): string {
  if (s == null) return '—';
  return `${Math.round(s * 100)}%`;
}

function bandLabel(band: Band): string {
  if (band === 'adult') return 'Adult';
  if (band === 'tweens') return 'Tweens';
  return 'Kids';
}

function sourceClassLabel(c: string | null): string {
  switch (c) {
    case 'rss':
      return 'RSS';
    case 'scrape_html':
      return 'HTML';
    case 'scrape_json':
      return 'JSON';
    case 'search_api':
      return 'Search';
    default:
      return '—';
  }
}

function bandStateVariant(state: ArticleRollup['state']): 'success' | 'warn' | 'neutral' | 'danger' {
  switch (state) {
    case 'published':
      return 'success';
    case 'draft':
      return 'warn';
    case 'archived':
      return 'danger';
    default:
      return 'neutral';
  }
}

function generationVariant(state: string | null): 'success' | 'warn' | 'neutral' | 'danger' | 'info' {
  switch (state) {
    case 'published':
      return 'success';
    case 'generating':
    case 'ready':
      return 'info';
    case 'forming':
    case 'clustered':
      return 'warn';
    case 'rejected':
    case 'archived':
      return 'danger';
    default:
      return 'neutral';
  }
}

export default function StoryDetailDrawer({
  storyId,
  selectedModelIdx = 0,
  onClose,
  onMutated,
}: {
  storyId: string;
  selectedModelIdx?: number;
  onClose: () => void;
  onMutated: () => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generatingBand, setGeneratingBand] = useState<Band | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/newsroom/research/stories/${storyId}`);
      const json = (await res.json().catch(() => ({}))) as DetailResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Load failed (${res.status})`);
        return;
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [storyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generateBand(band: Band) {
    if (generatingBand || busy) return;
    if (!data?.story.default_cluster_id) {
      toast.push({
        message: 'No cluster available — story has no observations to generate from.',
        variant: 'warn',
      });
      return;
    }
    setGeneratingBand(band);
    try {
      const apiAudience: { audience: 'adult' | 'kid'; age_band?: 'kids' | 'tweens' } =
        band === 'adult' ? { audience: 'adult' } : { audience: 'kid', age_band: band };
      const { provider, model } = MODEL_OPTIONS[selectedModelIdx] ?? MODEL_OPTIONS[0];
      const res = await fetch('/api/admin/pipeline/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cluster_id: data.story.default_cluster_id,
          ...apiAudience,
          provider,
          model,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { run_id?: string; error?: string };
      if (!res.ok || !json.run_id) {
        toast.push({ message: json.error ?? `Generate failed (${res.status})`, variant: 'danger' });
        return;
      }
      toast.push({ message: `Generating ${band} article…`, variant: 'success' });
      await load();
      onMutated();
    } catch (err) {
      toast.push({ message: err instanceof Error ? err.message : 'Network error', variant: 'danger' });
    } finally {
      setGeneratingBand(null);
    }
  }

  async function flipState(next: 'rejected' | 'archived' | 'forming') {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/newsroom/research/stories/${storyId}/state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: next }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        toast.push({ message: json.error ?? `Update failed (${res.status})`, variant: 'danger' });
        return;
      }
      toast.push({
        message:
          next === 'rejected'
            ? 'Story rejected.'
            : next === 'archived'
              ? 'Story archived.'
              : 'Story restored.',
        variant: 'success',
      });
      await load();
      onMutated();
    } catch (err) {
      toast.push({ message: err instanceof Error ? err.message : 'Network error', variant: 'danger' });
    } finally {
      setBusy(false);
    }
  }

  const story = data?.story;
  const restorable = story?.generation_state === 'rejected' || story?.generation_state === 'archived';

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={loading ? 'Loading story…' : story?.title ?? 'Story'}
      description={
        story && data?.research_query ? (
          <span>
            Query: <strong>{data.research_query.name?.trim() || data.research_query.query_text.slice(0, 60)}</strong>
          </span>
        ) : undefined
      }
      footer={
        story ? (
          <>
            {restorable ? (
              <Button variant="secondary" size="sm" onClick={() => void flipState('forming')} disabled={busy}>
                Restore
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (typeof window !== 'undefined' && !window.confirm('Reject this story?')) return;
                    void flipState('rejected');
                  }}
                  disabled={busy}
                >
                  Reject
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (typeof window !== 'undefined' && !window.confirm('Archive this story?')) return;
                    void flipState('archived');
                  }}
                  disabled={busy}
                >
                  Archive
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              Close
            </Button>
          </>
        ) : null
      }
    >
      {loading ? (
        <div style={{ padding: S[6], display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : error ? (
        <div style={{ padding: S[3], color: C.danger, fontSize: F.sm }}>{error}</div>
      ) : !story || !data ? (
        <div style={{ padding: S[3], color: C.dim, fontSize: F.sm }}>Story not found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
          {/* Meta block */}
          <section>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2], alignItems: 'center', marginBottom: S[2] }}>
              <Badge variant={generationVariant(story.generation_state)} size="xs">
                {story.generation_state ?? 'unknown'}
              </Badge>
              {story.is_locked && (
                <Badge variant="warn" size="xs">
                  Locked
                </Badge>
              )}
              <span style={{ fontSize: F.xs, color: C.dim }}>
                /{story.slug}
              </span>
            </div>

            <div style={{ fontSize: F.sm, color: C.dim, lineHeight: 1.5 }}>
              <div>First seen: {fmtDate(story.first_seen_at)}</div>
              <div>Last observed: {fmtDate(story.last_observed_at)}</div>
              <div>
                {story.source_count} {story.source_count === 1 ? 'source' : 'sources'} ·{' '}
                {story.observation_count} {story.observation_count === 1 ? 'observation' : 'observations'}
                {story.detached_count > 0 ? ` · ${story.detached_count} detached` : ''}
              </div>
            </div>

            {story.keywords.length > 0 && (
              <div style={{ marginTop: S[3], display: 'flex', flexWrap: 'wrap', gap: S[1] }}>
                {story.keywords.map((kw) => (
                  <span
                    key={kw}
                    style={{
                      fontSize: F.xs,
                      color: C.muted,
                      padding: `2px ${S[2]}px`,
                      border: `1px solid ${C.divider}`,
                      borderRadius: 999,
                      background: C.card,
                    }}
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Per-band article rollup */}
          <section>
            <h3 style={{ margin: `0 0 ${S[2]}px`, fontSize: F.sm, color: C.muted, fontWeight: 600 }}>
              Articles by audience
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
              {data.articles_by_band.map((b) => (
                <div
                  key={b.band}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${S[2]}px ${S[3]}px`,
                    border: `1px solid ${C.divider}`,
                    borderRadius: 6,
                    background: C.card,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: F.sm, color: C.ink, fontWeight: 500 }}>{bandLabel(b.band)}</span>
                    {b.title && (
                      <span style={{ fontSize: F.xs, color: C.dim, lineHeight: 1.3 }}>{b.title}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                    <Badge variant={bandStateVariant(b.state)} size="xs">
                      {b.state}
                    </Badge>
                    {b.article_id ? (
                      <a
                        href={
                          b.band === 'adult'
                            ? `/admin/story-manager?article=${b.article_id}`
                            : `/admin/kids-story-manager?article=${b.article_id}`
                        }
                        style={{ fontSize: F.xs, color: C.accent }}
                      >
                        Edit →
                      </a>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void generateBand(b.band)}
                        disabled={generatingBand !== null || !story.default_cluster_id}
                      >
                        {generatingBand === b.band ? 'Generating…' : 'Generate'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!story.default_cluster_id && (
              <p style={{ margin: `${S[2]}px 0 0`, fontSize: F.xs, color: C.dim, lineHeight: 1.4 }}>
                No cluster attached — Generate is unavailable until the next ingest run links observations to a cluster.
              </p>
            )}
          </section>

          {/* Observation timeline */}
          <section>
            <h3 style={{ margin: `0 0 ${S[2]}px`, fontSize: F.sm, color: C.muted, fontWeight: 600 }}>
              Observation timeline
            </h3>
            {data.observations.length === 0 ? (
              <div style={{ padding: S[3], fontSize: F.sm, color: C.dim, fontStyle: 'italic' }}>
                No active observations.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                {data.observations.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      padding: S[3],
                      border: `1px solid ${C.divider}`,
                      borderRadius: 6,
                      background: C.bg,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: S[2],
                        marginBottom: S[1],
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: F.xs, color: C.muted, marginBottom: 2 }}>
                          {o.outlet ?? 'Unknown source'} · {fmtDate(o.observed_at)}
                          {o.source_class ? ` · ${sourceClassLabel(o.source_class)}` : ''}
                          {o.match_score != null ? ` · match ${fmtScore(o.match_score)}` : ''}
                        </div>
                        <a
                          href={o.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: F.sm, color: C.ink, textDecoration: 'none', fontWeight: 500 }}
                        >
                          {o.title ?? o.url}
                        </a>
                      </div>
                    </div>
                    {o.excerpt && (
                      <p style={{ margin: 0, fontSize: F.xs, color: C.dim, lineHeight: 1.5 }}>
                        {o.excerpt}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
