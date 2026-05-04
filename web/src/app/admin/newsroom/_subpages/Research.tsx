'use client';

/**
 * Wave 4 — Stream D Run Feed UI
 *
 * Research panel mounted at the top of the /admin/newsroom Discovery tab.
 *
 * State machine (URL-driven):
 *   idle    — controls visible (lookback, source scope, mode, run)
 *   running — inline progress view with phase label + cancel
 *             (?job=<id> set, polls every 2s)
 *   done    — result screen: counters + flat sortable table +
 *             Promote/Discard per row + View Stories CTA
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
import Select from '@/components/admin/Select';
import TextInput from '@/components/admin/TextInput';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

type Mode = 'general' | 'topic';
type LookbackKey = '15m' | '1h' | '6h' | '24h' | '3d' | '7d' | '30d';

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

type ItemRow = {
  id: string;
  url: string;
  title: string | null;
  fetched_at: string;
  state: string;
  outlet: string | null;
  source_class: string | null;
  match_score: number | null;
  attached_story: { id: string; title: string | null; slug: string | null } | null;
};

type SortKey = 'fetched_desc' | 'fetched_asc' | 'outlet' | 'title' | 'score_desc';

export default function Research({ onJobComplete }: { onJobComplete?: () => void }) {
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
}: {
  jobId: string;
  onLeave: () => void;
  onJobComplete?: () => void;
}) {
  const toast = useToast();
  const [job, setJob] = useState<JobRow | null>(null);
  const [pollErr, setPollErr] = useState<string | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [sort, setSort] = useState<SortKey>('fetched_desc');
  const [cancelling, setCancelling] = useState(false);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
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

  // Once terminal, load items + fire onJobComplete (so the parent can
  // refresh the cluster list). Re-run on sort change.
  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const res = await fetch(`/api/admin/newsroom/research/jobs/${jobId}/items?sort=${sort}`);
      if (!res.ok) {
        setItems([]);
        return;
      }
      const json = (await res.json()) as { items?: ItemRow[] };
      setItems(json.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  }, [jobId, sort]);

  useEffect(() => {
    if (!isTerminal) return;
    void loadItems();
    if (!completionFiredRef.current) {
      completionFiredRef.current = true;
      onJobComplete?.();
    }
  }, [isTerminal, loadItems, onJobComplete]);

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

  async function promote(itemId: string) {
    setPendingActions((prev) => {
      const s = new Set(prev);
      s.add(itemId);
      return s;
    });
    try {
      const res = await fetch(`/api/admin/newsroom/research/items/${itemId}/promote`, {
        method: 'POST',
      });
      const json = (await res.json().catch(() => ({}))) as {
        attached?: boolean;
        formed?: boolean;
        already?: boolean;
        story?: { id: string; title: string | null; slug: string | null };
        match_score?: number | null;
        error?: string;
      };
      if (!res.ok || !json.attached) {
        toast.push({ message: json.error ?? 'Could not promote.', variant: 'danger' });
        return;
      }
      const title = json.story?.title ?? 'story';
      toast.push({
        message: json.formed
          ? `New story "${title}" formed.`
          : json.already
            ? `Already attached to "${title}".`
            : `Attached to "${title}".`,
        variant: 'success',
      });
      await loadItems();
    } catch (err) {
      toast.push({ message: err instanceof Error ? err.message : 'Network error', variant: 'danger' });
    } finally {
      setPendingActions((prev) => {
        const s = new Set(prev);
        s.delete(itemId);
        return s;
      });
    }
  }

  async function discard(itemId: string) {
    if (!confirm('Discard this item? This is a hard delete.')) return;
    setPendingActions((prev) => {
      const s = new Set(prev);
      s.add(itemId);
      return s;
    });
    try {
      const res = await fetch(`/api/admin/newsroom/research/items/${itemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.push({ message: json.error ?? 'Could not discard.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Item discarded.', variant: 'success' });
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } finally {
      setPendingActions((prev) => {
        const s = new Set(prev);
        s.delete(itemId);
        return s;
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
          items={items}
          itemsLoading={itemsLoading}
          sort={sort}
          onSortChange={setSort}
          onPromote={promote}
          onDiscard={discard}
          pendingActions={pendingActions}
        />
      )}
    </div>
  );
}

function ResultBody({
  job,
  items,
  itemsLoading,
  sort,
  onSortChange,
  onPromote,
  onDiscard,
  pendingActions,
}: {
  job: JobRow;
  items: ItemRow[];
  itemsLoading: boolean;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  onPromote: (itemId: string) => void;
  onDiscard: (itemId: string) => void;
  pendingActions: Set<string>;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function viewStories() {
    // Wave 5 — StoriesList honors ?job= to scope the stories list to
    // this run. Drop legacy cluster-list filter params on the way out.
    const params = new URLSearchParams(sp.toString());
    params.delete('panel');
    params.delete('view');
    params.delete('cat');
    params.delete('so');
    params.delete('dq');
    router.replace(`?${params.toString()}`, { scroll: false });
  }

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

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S[2],
        }}
      >
        <Button onClick={viewStories} variant="primary" size="sm">View stories</Button>
        <div style={{ display: 'flex', gap: S[2], alignItems: 'center' }}>
          <span style={{ fontSize: F.xs, color: C.dim }}>Sort</span>
          <Select
            value={sort}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSortChange(e.target.value as SortKey)}
            block={false}
            style={{ minHeight: 36 }}
          >
            <option value="fetched_desc">Newest first</option>
            <option value="fetched_asc">Oldest first</option>
            <option value="outlet">Outlet</option>
            <option value="title">Title</option>
            <option value="score_desc">Match score</option>
          </Select>
        </div>
      </div>

      <ItemsTable
        items={items}
        loading={itemsLoading}
        pendingActions={pendingActions}
        onPromote={onPromote}
        onDiscard={onDiscard}
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

function ItemsTable({
  items,
  loading,
  pendingActions,
  onPromote,
  onDiscard,
}: {
  items: ItemRow[];
  loading: boolean;
  pendingActions: Set<string>;
  onPromote: (itemId: string) => void;
  onDiscard: (itemId: string) => void;
}) {
  if (loading) {
    return (
      <div style={{ padding: S[4], display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div style={{ padding: S[4], color: C.dim, fontSize: F.sm, textAlign: 'center' }}>
        No items produced by this run.
      </div>
    );
  }

  return (
    <div
      style={{
        border: `1px solid ${C.divider}`,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '160px minmax(0, 2fr) 110px 90px 70px 200px',
          background: C.bg,
          padding: `${S[2]}px ${S[3]}px`,
          fontSize: F.xs,
          color: C.dim,
          fontWeight: 500,
          gap: S[2],
        }}
      >
        <span>Outlet</span>
        <span>Title</span>
        <span>Fetched</span>
        <span>Source</span>
        <span>Score</span>
        <span>Action</span>
      </div>
      {items.map((it) => (
        <ItemRowView
          key={it.id}
          item={it}
          pending={pendingActions.has(it.id)}
          onPromote={onPromote}
          onDiscard={onDiscard}
        />
      ))}
    </div>
  );
}

function ItemRowView({
  item,
  pending,
  onPromote,
  onDiscard,
}: {
  item: ItemRow;
  pending: boolean;
  onPromote: (itemId: string) => void;
  onDiscard: (itemId: string) => void;
}) {
  const fetchedDate = item.fetched_at ? item.fetched_at.slice(0, 10) : '';
  const scorePct =
    item.match_score !== null && item.match_score !== undefined
      ? `${Math.round(item.match_score * 100)}%`
      : '—';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '160px minmax(0, 2fr) 110px 90px 70px 200px',
        padding: `${S[2]}px ${S[3]}px`,
        fontSize: F.sm,
        color: C.ink,
        borderTop: `1px solid ${C.divider}`,
        gap: S[2],
        alignItems: 'center',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.dim }}>
        {item.outlet ?? '—'}
      </span>
      <span style={{ overflow: 'hidden' }}>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: C.ink,
            textDecoration: 'none',
            display: 'inline-block',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title ?? '(untitled)'}
        </a>
      </span>
      <span style={{ color: C.dim }}>{fetchedDate}</span>
      <span>
        {item.source_class ? (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 6px',
              borderRadius: 10,
              background: C.bg,
              border: `1px solid ${C.divider}`,
              fontSize: F.xs,
              color: C.dim,
            }}
          >
            {item.source_class}
          </span>
        ) : (
          <span style={{ color: C.dim }}>—</span>
        )}
      </span>
      <span style={{ color: C.dim }}>{scorePct}</span>
      <span style={{ display: 'flex', gap: S[1], justifyContent: 'flex-end' }}>
        {item.attached_story ? (
          <span style={{ fontSize: F.xs, color: C.dim }}>
            Attached to{' '}
            <strong style={{ color: C.ink }}>
              {item.attached_story.title ?? '(untitled)'}
            </strong>
          </span>
        ) : (
          <>
            <Button
              onClick={() => onPromote(item.id)}
              disabled={pending}
              variant="secondary"
              size="sm"
            >
              Promote
            </Button>
            <Button
              onClick={() => onDiscard(item.id)}
              disabled={pending}
              variant="ghost"
              size="sm"
            >
              Discard
            </Button>
          </>
        )}
      </span>
    </div>
  );
}
