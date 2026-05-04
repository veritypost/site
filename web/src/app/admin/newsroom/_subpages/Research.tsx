'use client';

/**
 * Wave 4 — Stream D Run Feed UI
 * Wave 7 — Stream 2 result screen rebuild (StoryCardsList)
 *
 * Research panel mounted at the top of the /admin/newsroom Discovery tab.
 *
 * State machine (URL-driven):
 *   idle    — controls visible (lookback, source scope, mode, run)
 *   running — inline progress view with phase label + cancel
 *             (?job=<id> set, polls every 2s)
 *   done    — result screen: counters + StoryCardsList (one card per story
 *             produced by the run, with per-band Generate buttons)
 *             (?job=<id> stays; surfaced jobId resolved status)
 *
 * URL params:
 *   ?lb=15m|1h|6h|24h|3d|7d|30d (default 24h)
 *   ?fid=uuid,uuid,...           (source-scope custom feed ids)
 *   ?mode=general|topic          (default general)
 *   ?q=...                       (topic mode free text)
 *   ?qid=uuid                    (topic mode — saved query id)
 *   ?job=uuid                    (active job id; presence drives the
 *                                 running/done screens)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import Select from '@/components/admin/Select';
import TextInput from '@/components/admin/TextInput';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import { MODEL_OPTIONS } from '@/lib/newsroomModels';

type Mode = 'general' | 'topic';
type LookbackKey = '15m' | '1h' | '6h' | '24h' | '3d' | '7d' | '30d';
type AgeBand = 'adult' | 'tweens' | 'kids';

const LOOKBACK_OPTIONS: Array<{ key: LookbackKey; label: string; ms: number }> = [
  { key: '15m', label: 'Last 15 minutes', ms: 15 * 60 * 1000 },
  { key: '1h', label: 'Last 1 hour', ms: 60 * 60 * 1000 },
  { key: '6h', label: 'Last 6 hours', ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
  { key: '3d', label: 'Last 3 days', ms: 3 * 24 * 60 * 60 * 1000 },
  { key: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000 },
];

function parseLb(raw: string | null): LookbackKey {
  const found = LOOKBACK_OPTIONS.find((o) => o.key === raw);
  return found ? found.key : '24h';
}
function parseMode(raw: string | null): Mode {
  return raw === 'topic' ? 'topic' : 'general';
}
function parseFids(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const PHASE_LABELS: Record<string, string> = {
  planning: 'Planning…',
  fetching: 'Fetching feeds…',
  matching: 'Forming stories…',
  finalizing: 'Finalizing…',
};

type SavedQuery = {
  id: string;
  name: string | null;
  query_text: string;
  created_at: string;
};

type FeedLite = {
  id: string;
  name: string | null;
  source_name: string | null;
  feed_type: string | null;
};

type JobRow = {
  id: string;
  status: string;
  phase: string | null;
  request_body: { lookbackMs?: number } | null;
  started_at: string | null;
  finished_at: string | null;
  items_fetched: number;
  items_kept: number;
  stories_formed: number;
  stories_extended: number;
  error: string | null;
};

type RunStorySource = {
  observation_id: string;
  url: string;
  title: string | null;
  excerpt: string | null;
  outlet: string | null;
  source_class: string | null;
  observed_at: string;
};

type RunStoryBand = {
  band: AgeBand;
  state: 'pending' | 'draft' | 'published' | 'archived';
  article_id: string | null;
  title: string | null;
};

type RunStory = {
  id: string;
  slug: string;
  title: string;
  keywords: string[];
  first_seen_at: string | null;
  last_observed_at: string | null;
  is_locked: boolean;
  formed_in_this_run: boolean;
  ai_category: { id: string; slug: string; name: string } | null;
  ai_subcategory: { id: string; slug: string; name: string } | null;
  sources_in_run: RunStorySource[];
  articles_by_band: RunStoryBand[];
};

export default function Research({
  onJobComplete,
  selectedModelIdx = 0,
}: {
  onJobComplete?: () => void;
  selectedModelIdx?: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();

  const lb = parseLb(sp.get('lb'));
  const mode = parseMode(sp.get('mode'));
  const fids = useMemo(() => parseFids(sp.get('fid')), [sp]);
  const qText = sp.get('q') ?? '';
  const qId = sp.get('qid') ?? '';
  const jobId = sp.get('job') ?? '';

  const [topicInput, setTopicInput] = useState(qText);
  const [busy, setBusy] = useState(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [feeds, setFeeds] = useState<FeedLite[]>([]);
  const [feedsLoaded, setFeedsLoaded] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);

  // saved-query inline edit state
  const [editingQid, setEditingQid] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingText, setEditingText] = useState('');

  const writeUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(sp.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value === '') params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, sp],
  );

  const loadQueries = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/newsroom/research/queries');
      if (!res.ok) return;
      const json = (await res.json()) as { queries?: SavedQuery[] };
      setSavedQueries(json.queries ?? []);
    } catch {
      /* best-effort */
    }
  }, []);

  const loadFeeds = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/newsroom/research/feeds');
      if (!res.ok) return;
      const json = (await res.json()) as { feeds?: FeedLite[] };
      setFeeds(json.feeds ?? []);
      setFeedsLoaded(true);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    void loadQueries();
  }, [loadQueries]);

  // Sync local topicInput when URL changes externally (back/forward).
  useEffect(() => {
    setTopicInput(qText);
  }, [qText]);

  const lookbackMs = useMemo(
    () => LOOKBACK_OPTIONS.find((o) => o.key === lb)?.ms ?? 24 * 60 * 60 * 1000,
    [lb],
  );

  async function runFeed() {
    if (busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { lookbackMs };
      if (fids.length > 0) body.feedIds = fids;
      if (mode === 'topic') {
        if (qId) {
          body.queryId = qId;
        } else {
          const t = topicInput.trim();
          if (t.length === 0) {
            toast.push({ message: 'Type a topic or pick a saved query.', variant: 'warn' });
            setBusy(false);
            return;
          }
          body.query = { text: t };
        }
      }
      const res = await fetch('/api/newsroom/ingest/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        runningRunId?: string;
        error?: string;
      };
      if (res.status === 503) {
        toast.push({
          message: 'Feed ingestion is disabled. Flip ai.ingest_enabled in Pipeline Settings to re-enable.',
          variant: 'warn',
        });
        return;
      }
      if (res.status === 429) {
        toast.push({ message: 'Refreshing too fast. Try again in a moment.', variant: 'warn' });
        return;
      }
      if (res.status === 409) {
        toast.push({
          message: 'Another ingest run is already in progress. Wait for it to finish, then try again.',
          variant: 'warn',
        });
        return;
      }
      if (!res.ok || !json.jobId) {
        toast.push({ message: json.error ?? 'Could not start run.', variant: 'danger' });
        return;
      }
      writeUrl({ job: json.jobId });
      toast.push({ message: 'Run started.', variant: 'success' });
      onJobComplete?.();
      await loadQueries();
    } finally {
      setBusy(false);
    }
  }

  function clearJob() {
    writeUrl({ job: null });
  }

  // Saved-query inline edit / delete
  async function saveTopicAsQuery() {
    const t = topicInput.trim();
    if (!t) return;
    try {
      const res = await fetch('/api/admin/newsroom/research/queries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query_text: t }),
      });
      const json = (await res.json().catch(() => ({}))) as { query?: SavedQuery; error?: string };
      if (!res.ok || !json.query) {
        toast.push({ message: json.error ?? 'Could not save query.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Query saved.', variant: 'success' });
      writeUrl({ qid: json.query.id, q: null });
      await loadQueries();
    } catch (err) {
      toast.push({ message: err instanceof Error ? err.message : 'Network error', variant: 'danger' });
    }
  }

  function startEdit(q: SavedQuery) {
    setEditingQid(q.id);
    setEditingName(q.name ?? '');
    setEditingText(q.query_text);
  }

  async function commitEdit() {
    if (!editingQid) return;
    try {
      const res = await fetch(`/api/admin/newsroom/research/queries/${editingQid}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: editingName.trim() === '' ? null : editingName.trim(),
          query_text: editingText.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.push({ message: json.error ?? 'Could not save edit.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Query updated.', variant: 'success' });
      setEditingQid(null);
      await loadQueries();
    } catch (err) {
      toast.push({ message: err instanceof Error ? err.message : 'Network error', variant: 'danger' });
    }
  }

  async function deleteQuery(q: SavedQuery) {
    if (!confirm(`Delete saved query "${q.name ?? q.query_text.slice(0, 40)}"?`)) return;
    try {
      const res = await fetch(`/api/admin/newsroom/research/queries/${q.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.push({ message: json.error ?? 'Could not delete.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Query deleted.', variant: 'success' });
      if (qId === q.id) writeUrl({ qid: null });
      await loadQueries();
    } catch (err) {
      toast.push({ message: err instanceof Error ? err.message : 'Network error', variant: 'danger' });
    }
  }

  // Active-job UI takes over when ?job= is set.
  if (jobId) {
    return (
      <ActiveJobView
        jobId={jobId}
        onLeave={clearJob}
        onJobComplete={onJobComplete}
        selectedModelIdx={selectedModelIdx}
      />
    );
  }

  // Idle state — controls.
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.divider}`,
        borderRadius: 8,
        padding: S[4],
        marginBottom: S[4],
        display: 'flex',
        flexDirection: 'column',
        gap: S[3],
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
        <span style={{ fontSize: F.lg, fontWeight: 600, color: C.ink }}>Research</span>
        <span style={{ fontSize: F.sm, color: C.dim }}>
          Pull articles from feeds and form stories.
        </span>
      </div>

      {/* Row 1 — lookback + scope + mode toggle */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[3], alignItems: 'center' }}>
        <Field label="Lookback">
          <Select
            value={lb}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => writeUrl({ lb: e.target.value })}
            block={false}
            style={{ minWidth: 180, minHeight: 40 }}
          >
            {LOOKBACK_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Source scope">
          <div style={{ display: 'flex', gap: S[2], alignItems: 'center' }}>
            <Select
              value={fids.length === 0 ? 'all' : 'custom'}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                if (e.target.value === 'all') {
                  writeUrl({ fid: null });
                  setScopeOpen(false);
                } else {
                  if (!feedsLoaded) void loadFeeds();
                  setScopeOpen(true);
                }
              }}
              block={false}
              style={{ minWidth: 160, minHeight: 40 }}
            >
              <option value="all">All active feeds</option>
              <option value="custom">Custom…</option>
            </Select>
            {fids.length > 0 && (
              <span style={{ fontSize: F.sm, color: C.dim }}>
                {fids.length} feed{fids.length === 1 ? '' : 's'} selected
              </span>
            )}
            {fids.length > 0 && (
              <Button
                onClick={() => {
                  if (!feedsLoaded) void loadFeeds();
                  setScopeOpen(true);
                }}
                variant="ghost"
                size="sm"
              >
                Edit
              </Button>
            )}
          </div>
        </Field>

        <Field label="Mode">
          <ModeToggle
            value={mode}
            onChange={(m) => writeUrl({ mode: m === 'general' ? null : m })}
          />
        </Field>
      </div>

      {/* Row 2 — Topic mode controls */}
      {mode === 'topic' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: S[2],
            paddingTop: S[2],
            borderTop: `1px solid ${C.divider}`,
          }}
        >
          {savedQueries.length > 0 && (
            <Field label="Saved queries">
              <Select
                value={qId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const id = e.target.value;
                  if (id) {
                    const q = savedQueries.find((s) => s.id === id);
                    writeUrl({ qid: id, q: null });
                    if (q) setTopicInput(q.query_text);
                  } else {
                    writeUrl({ qid: null });
                  }
                }}
                block={false}
                style={{ minWidth: 320, minHeight: 40 }}
              >
                <option value="">— New query —</option>
                {savedQueries.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name ?? q.query_text.slice(0, 80)}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {qId && (
            <SavedQueryRow
              query={savedQueries.find((s) => s.id === qId) ?? null}
              isEditing={editingQid === qId}
              editingName={editingName}
              editingText={editingText}
              onEditingNameChange={setEditingName}
              onEditingTextChange={setEditingText}
              onStartEdit={(q) => startEdit(q)}
              onCommitEdit={commitEdit}
              onCancelEdit={() => setEditingQid(null)}
              onDelete={(q) => deleteQuery(q)}
            />
          )}

          <Field label={qId ? 'Query text (locked — edit via pencil)' : 'Topic'}>
            <TextInput
              value={topicInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setTopicInput(e.target.value);
                writeUrl({ q: e.target.value, qid: null });
              }}
              disabled={!!qId}
              placeholder="e.g. tigers, WW2 history, Amelia Earhart"
              style={{ minHeight: 40 }}
            />
          </Field>

          {!qId && topicInput.trim().length > 0 && (
            <div>
              <Button onClick={saveTopicAsQuery} variant="ghost" size="sm">
                Save as query
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Source scope custom drawer */}
      {scopeOpen && (
        <FeedPicker
          feeds={feeds}
          selectedIds={fids}
          loading={!feedsLoaded}
          onChange={(ids) =>
            writeUrl({ fid: ids.length > 0 ? ids.join(',') : null })
          }
          onClose={() => setScopeOpen(false)}
        />
      )}

      {/* Run row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: S[2] }}>
        <Button onClick={runFeed} disabled={busy} variant="primary" size="md">
          {busy ? 'Starting…' : 'Run Feed'}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: F.xs, color: C.dim, fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

function ModeToggle({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        border: `1px solid ${C.divider}`,
        borderRadius: 6,
        minHeight: 40,
        overflow: 'hidden',
      }}
    >
      {(['general', 'topic'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          style={{
            padding: `0 ${S[3]}px`,
            background: value === m ? C.accent : 'transparent',
            color: value === m ? C.bg : C.ink,
            border: 'none',
            cursor: 'pointer',
            fontSize: F.sm,
            fontFamily: 'inherit',
            minWidth: 80,
          }}
        >
          {m === 'general' ? 'General' : 'Topic'}
        </button>
      ))}
    </div>
  );
}

function SavedQueryRow({
  query,
  isEditing,
  editingName,
  editingText,
  onEditingNameChange,
  onEditingTextChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onDelete,
}: {
  query: SavedQuery | null;
  isEditing: boolean;
  editingName: string;
  editingText: string;
  onEditingNameChange: (v: string) => void;
  onEditingTextChange: (v: string) => void;
  onStartEdit: (q: SavedQuery) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (q: SavedQuery) => void;
}) {
  if (!query) return null;
  if (isEditing) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: S[2],
          padding: S[2],
          background: C.bg,
          border: `1px solid ${C.divider}`,
          borderRadius: 6,
        }}
      >
        <TextInput
          value={editingName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onEditingNameChange(e.target.value)}
          placeholder="Query name (optional)"
        />
        <TextInput
          value={editingText}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onEditingTextChange(e.target.value)}
          placeholder="Query text"
        />
        <div style={{ display: 'flex', gap: S[2], justifyContent: 'flex-end' }}>
          <Button onClick={onCancelEdit} variant="ghost" size="sm">Cancel</Button>
          <Button onClick={onCommitEdit} variant="primary" size="sm">Save</Button>
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S[2],
        padding: `${S[1]}px 0`,
        fontSize: F.sm,
        color: C.dim,
      }}
    >
      <span style={{ flex: 1 }}>
        {query.name ? <strong style={{ color: C.ink, marginRight: S[1] }}>{query.name}</strong> : null}
        <span>{query.query_text}</span>
      </span>
      <Button onClick={() => onStartEdit(query)} variant="ghost" size="sm">Edit</Button>
      <Button onClick={() => onDelete(query)} variant="ghost" size="sm">Delete</Button>
    </div>
  );
}

function FeedPicker({
  feeds,
  selectedIds,
  loading,
  onChange,
  onClose,
}: {
  feeds: FeedLite[];
  selectedIds: string[];
  loading: boolean;
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState('');
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return feeds;
    return feeds.filter((feed) => {
      const haystack = `${feed.source_name ?? ''} ${feed.name ?? ''}`.toLowerCase();
      return haystack.includes(f);
    });
  }, [feeds, filter]);

  function toggle(id: string) {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }
  function selectAll() {
    onChange(filtered.map((f) => f.id));
  }
  function clearAll() {
    onChange([]);
  }

  return (
    <div
      style={{
        background: C.bg,
        border: `1px solid ${C.divider}`,
        borderRadius: 6,
        padding: S[3],
        display: 'flex',
        flexDirection: 'column',
        gap: S[2],
      }}
    >
      <div style={{ display: 'flex', gap: S[2], alignItems: 'center' }}>
        <TextInput
          value={filter}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
          placeholder="Filter feeds…"
          style={{ flex: 1, minHeight: 36 }}
        />
        <Button onClick={selectAll} variant="ghost" size="sm">Select filtered</Button>
        <Button onClick={clearAll} variant="ghost" size="sm">Clear</Button>
        <Button onClick={onClose} variant="ghost" size="sm">Done</Button>
      </div>
      {loading ? (
        <div style={{ padding: S[4], display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: S[1],
            maxHeight: 320,
            overflowY: 'auto',
            paddingRight: S[1],
          }}
        >
          {filtered.map((f) => (
            <label
              key={f.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: S[1],
                padding: `${S[1]}px ${S[2]}px`,
                fontSize: F.sm,
                color: C.ink,
                background: selectedSet.has(f.id) ? C.card : 'transparent',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={selectedSet.has(f.id)}
                onChange={() => toggle(f.id)}
              />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.source_name ?? f.name ?? 'Unknown feed'}
              </span>
              <span style={{ fontSize: F.xs, color: C.dim }}>{f.feed_type ?? ''}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <div style={{ color: C.dim, fontSize: F.sm, padding: S[3] }}>
              No feeds match the filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveJobView({
  jobId,
  onLeave,
  onJobComplete,
  selectedModelIdx,
}: {
  jobId: string;
  onLeave: () => void;
  onJobComplete?: () => void;
  selectedModelIdx: number;
}) {
  const toast = useToast();
  const [job, setJob] = useState<JobRow | null>(null);
  const [pollErr, setPollErr] = useState<string | null>(null);
  const [stories, setStories] = useState<RunStory[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Per-(story_id, band) loading tracker so parallel clicks don't disable each other.
  const [generatingKeys, setGeneratingKeys] = useState<Set<string>>(new Set());
  const completionFiredRef = useRef(false);

  const isTerminal =
    job !== null &&
    (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled');

  // Poll the job row every 2s until terminal.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function tick() {
      try {
        const res = await fetch(`/api/admin/newsroom/research/jobs/${jobId}`);
        if (!alive) return;
        if (!res.ok) {
          if (res.status === 404) {
            setPollErr('Job not found.');
            return;
          }
          setPollErr(`Poll failed (${res.status})`);
          timer = setTimeout(tick, 4000);
          return;
        }
        const json = (await res.json()) as { job: JobRow };
        setJob(json.job);
        setPollErr(null);
        const done =
          json.job.status === 'done' ||
          json.job.status === 'failed' ||
          json.job.status === 'cancelled';
        if (!done) {
          timer = setTimeout(tick, 2000);
        }
      } catch {
        if (alive) timer = setTimeout(tick, 4000);
      }
    }
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  // Once terminal, load the stories for this run. Fire onJobComplete once.
  const loadStories = useCallback(async () => {
    setStoriesLoading(true);
    try {
      const res = await fetch(`/api/admin/newsroom/research/jobs/${jobId}/stories`);
      if (!res.ok) {
        setStories([]);
        return;
      }
      const json = (await res.json()) as { stories?: RunStory[] };
      setStories(json.stories ?? []);
    } catch {
      setStories([]);
    } finally {
      setStoriesLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!isTerminal) return;
    void loadStories();
    if (!completionFiredRef.current) {
      completionFiredRef.current = true;
      onJobComplete?.();
    }
  }, [isTerminal, loadStories, onJobComplete]);

  async function cancel() {
    if (cancelling) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/newsroom/research/jobs/${jobId}/cancel`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.push({ message: json.error ?? 'Could not cancel.', variant: 'danger' });
        return;
      }
      toast.push({
        message: 'Cancel requested. Run will stop at the next checkpoint.',
        variant: 'success',
      });
    } finally {
      setCancelling(false);
    }
  }

  async function generateBand(storyId: string, band: AgeBand) {
    const key = `${storyId}:${band}`;
    if (generatingKeys.has(key)) return;
    setGeneratingKeys((prev) => new Set([...prev, key]));
    try {
      const { provider, model } = MODEL_OPTIONS[selectedModelIdx] ?? MODEL_OPTIONS[0];
      const res = await fetch('/api/admin/pipeline/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ story_id: storyId, age_band: band, provider, model }),
      });
      const json = (await res.json().catch(() => ({}))) as { run_id?: string; error?: string };
      if (!res.ok || !json.run_id) {
        toast.push({ message: json.error ?? `Generate failed (${res.status})`, variant: 'danger' });
        return;
      }
      toast.push({ message: `Generating ${band} article…`, variant: 'success' });
      await loadStories();
    } catch (err) {
      toast.push({ message: err instanceof Error ? err.message : 'Network error', variant: 'danger' });
    } finally {
      setGeneratingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.divider}`,
        borderRadius: 8,
        padding: S[4],
        marginBottom: S[4],
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: S[3],
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
          <span style={{ fontSize: F.lg, fontWeight: 600, color: C.ink }}>
            {isTerminal ? 'Result' : 'Running…'}
          </span>
          {job && (
            <span
              style={{
                fontSize: F.xs,
                padding: `2px 8px`,
                borderRadius: 12,
                background: C.bg,
                border: `1px solid ${C.divider}`,
                color: C.dim,
              }}
            >
              {job.status}
            </span>
          )}
        </div>
        <Button onClick={onLeave} variant="ghost" size="sm">Close</Button>
      </div>

      {pollErr && (
        <div style={{ color: C.danger, fontSize: F.sm, marginBottom: S[2] }}>{pollErr}</div>
      )}

      {!isTerminal && job && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: S[3],
            padding: S[3],
            background: C.bg,
            border: `1px solid ${C.divider}`,
            borderRadius: 6,
          }}
        >
          <Spinner />
          <span style={{ flex: 1, color: C.ink, fontSize: F.md }}>
            {PHASE_LABELS[job.phase ?? ''] ?? 'Working…'}
          </span>
          <Button
            onClick={cancel}
            disabled={cancelling || job.status !== 'running'}
            variant="secondary"
            size="sm"
          >
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </Button>
        </div>
      )}

      {!isTerminal && !job && !pollErr && (
        <div style={{ padding: S[4], display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      )}

      {isTerminal && job && (
        <ResultBody
          job={job}
          stories={stories}
          storiesLoading={storiesLoading}
          generatingKeys={generatingKeys}
          onGenerate={generateBand}
        />
      )}
    </div>
  );
}

function ResultBody({
  job,
  stories,
  storiesLoading,
  generatingKeys,
  onGenerate,
}: {
  job: JobRow;
  stories: RunStory[];
  storiesLoading: boolean;
  generatingKeys: Set<string>;
  onGenerate: (storyId: string, band: AgeBand) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[3] }}>
        <Counter label="Items fetched" value={job.items_fetched} />
        <Counter label="Items kept" value={job.items_kept} />
        <Counter label="Stories formed" value={job.stories_formed} />
        <Counter label="Stories extended" value={job.stories_extended} />
      </div>

      {job.error && (
        <div
          style={{
            padding: S[2],
            border: `1px solid ${C.danger}`,
            background: C.bg,
            borderRadius: 6,
            color: C.danger,
            fontSize: F.sm,
          }}
        >
          {job.error}
        </div>
      )}

      <StoryCardsList
        stories={stories}
        loading={storiesLoading}
        generatingKeys={generatingKeys}
        onGenerate={onGenerate}
      />
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: C.bg,
        border: `1px solid ${C.divider}`,
        borderRadius: 6,
        padding: `${S[2]}px ${S[3]}px`,
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: F.xs, color: C.dim }}>{label}</div>
      <div style={{ fontSize: F.lg, fontWeight: 600, color: C.ink }}>{value}</div>
    </div>
  );
}

function StoryCardsList({
  stories,
  loading,
  generatingKeys,
  onGenerate,
}: {
  stories: RunStory[];
  loading: boolean;
  generatingKeys: Set<string>;
  onGenerate: (storyId: string, band: AgeBand) => void;
}) {
  if (loading) {
    return (
      <div style={{ padding: S[4], display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }
  if (stories.length === 0) {
    return (
      <div style={{ padding: S[4], color: C.dim, fontSize: F.sm, textAlign: 'center' }}>
        Run produced no stories.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
      {stories.map((story) => (
        <StoryCard
          key={story.id}
          story={story}
          generatingKeys={generatingKeys}
          onGenerate={onGenerate}
        />
      ))}
    </div>
  );
}

function StoryCard({
  story,
  generatingKeys,
  onGenerate,
}: {
  story: RunStory;
  generatingKeys: Set<string>;
  onGenerate: (storyId: string, band: AgeBand) => void;
}) {
  const bandLabel = (b: AgeBand) =>
    b === 'adult' ? 'Generate Adult' : b === 'tweens' ? 'Generate Tweens' : 'Generate Kids';

  const editorHref = (band: AgeBand, articleId: string) =>
    band === 'kids'
      ? `/admin/kids-story-manager?article=${articleId}`
      : `/admin/story-manager?article=${articleId}`;

  return (
    <div
      style={{
        background: C.bg,
        border: `1px solid ${C.divider}`,
        borderRadius: 8,
        padding: S[4],
        display: 'flex',
        flexDirection: 'column',
        gap: S[2],
      }}
    >
      {/* Header: category > subcategory chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: S[1], flexWrap: 'wrap' }}>
        {story.ai_category ? (
          <>
            <Badge variant="neutral" size="xs">{story.ai_category.name}</Badge>
            {story.ai_subcategory && (
              <>
                <span style={{ fontSize: F.xs, color: C.dim }}>›</span>
                <Badge variant="neutral" size="xs">{story.ai_subcategory.name}</Badge>
              </>
            )}
          </>
        ) : (
          <Badge variant="neutral" size="xs">Uncategorized</Badge>
        )}
      </div>

      {/* Story title */}
      <div style={{ fontSize: F.md, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>
        {story.title}
      </div>

      {/* Slug + badges row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
        <code style={{ fontSize: F.xs, color: C.dim, fontFamily: 'monospace' }}>
          /{story.slug}
        </code>
        {story.formed_in_this_run && (
          <Badge variant="info" size="xs">New this run</Badge>
        )}
        {!story.formed_in_this_run && (
          <Badge variant="neutral" size="xs">Extended</Badge>
        )}
        {story.is_locked && (
          <Badge variant="warn" size="xs">Locked</Badge>
        )}
      </div>

      {/* Sources from this run */}
      <div>
        <div style={{ fontSize: F.xs, color: C.dim, marginBottom: S[1] }}>
          Sources from this run ({story.sources_in_run.length})
        </div>
        {story.sources_in_run.length === 0 ? (
          <div style={{ fontSize: F.xs, color: C.dim, fontStyle: 'italic' }}>No sources.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
            {story.sources_in_run.map((src) => (
              <div key={src.observation_id}>
                {src.outlet && (
                  <span style={{ fontSize: F.xs, fontWeight: 600, color: C.ink, marginRight: 4 }}>
                    {src.outlet}
                  </span>
                )}
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: F.xs, color: C.accent, textDecoration: 'none' }}
                >
                  {src.title ?? src.url}
                </a>
                {src.excerpt && (
                  <div style={{ fontSize: F.xs, color: C.dim, marginTop: 2, lineHeight: 1.4 }}>
                    {src.excerpt}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate row — three buttons, one per band. Disabled when the
          story has zero sources in this run (orphan story) since the
          generate handler has nothing to feed into the editorial chain. */}
      <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap', marginTop: S[1] }}>
        {story.articles_by_band.map((b) => {
          const key = `${story.id}:${b.band}`;
          const isGenerating = generatingKeys.has(key);
          const noSources = story.sources_in_run.length === 0;
          if (b.state !== 'pending') {
            return (
              <a
                key={b.band}
                href={editorHref(b.band, b.article_id!)}
                style={{
                  fontSize: F.xs,
                  color: C.accent,
                  textDecoration: 'none',
                  padding: `${S[1]}px ${S[2]}px`,
                  border: `1px solid ${C.divider}`,
                  borderRadius: 6,
                  background: C.card,
                }}
              >
                {b.band === 'adult' ? 'Adult' : b.band === 'tweens' ? 'Tweens' : 'Kids'} — Edit →
              </a>
            );
          }
          return (
            <Button
              key={b.band}
              variant="secondary"
              size="sm"
              disabled={isGenerating || noSources}
              title={noSources ? 'No sources to generate from' : undefined}
              onClick={() => onGenerate(story.id, b.band)}
            >
              {isGenerating ? 'Generating…' : bandLabel(b.band)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
