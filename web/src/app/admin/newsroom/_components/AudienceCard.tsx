'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/admin/Button';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import { MODEL_OPTIONS } from '@/lib/newsroomModels';
import {
  type AudienceBand,
  humanizeError,
  humanizeStep,
  stepIndex,
  totalSteps,
} from './PipelineStepLabels';

export type AudienceCardState = 'idle' | 'generating' | 'generated' | 'failed';

export type AudienceCardProps = {
  clusterId: string;
  audienceBand: AudienceBand;
  initialState: AudienceCardState;
  initialArticleId: string | null;
  initialArticleSlug: string | null;
  initialArticleTitle: string | null;
  initialRunId: string | null;
  initialErrorType: string | null;
  initialErrorStep: string | null;
  workingHeadline: string;
  selectedModelIdx?: number;
};

type RunRow = {
  id: string;
  status: string | null;
  audience: string | null;
  error_type: string | null;
  error_message: string | null;
};

type StepRow = {
  id: string;
  step: string;
  success: boolean;
  error_type: string | null;
  article_id: string | null;
  created_at: string;
};

type RunDetailResponse = {
  ok: boolean;
  run: RunRow;
  steps: StepRow[];
};

const POLL_MS = 2000;

const BAND_LABEL: Record<AudienceBand, string> = {
  adult: 'Adults',
  tweens: 'Tweens',
  kids: 'Kids',
};

function audienceForApi(band: AudienceBand): { audience: 'adult' | 'kid'; age_band?: 'kids' | 'tweens' } {
  if (band === 'adult') return { audience: 'adult' };
  return { audience: 'kid', age_band: band };
}

function AudienceCard(props: AudienceCardProps) {
  const {
    clusterId,
    audienceBand,
    initialState,
    initialArticleId,
    initialArticleSlug,
    initialArticleTitle,
    initialRunId,
    initialErrorType,
    initialErrorStep,
    workingHeadline,
    selectedModelIdx = 0,
  } = props;

  const [state, setState] = useState<AudienceCardState>(initialState);
  const [runId, setRunId] = useState<string | null>(initialRunId);
  const [articleId, setArticleId] = useState<string | null>(initialArticleId);
  const [articleSlug] = useState<string | null>(initialArticleSlug);
  const [articleTitle] = useState<string | null>(initialArticleTitle);
  const [articleStatus, setArticleStatus] = useState<'draft' | 'published' | 'archived' | null>(null);
  const [plagiarismStatus, setPlagiarismStatus] = useState<string | null>(null);
  const [needsManualReview, setNeedsManualReview] = useState<boolean>(false);
  const [errorType, setErrorType] = useState<string | null>(initialErrorType);
  const [errorStep, setErrorStep] = useState<string | null>(initialErrorStep);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Two-step retry confirm: retry creates a fresh `articles` row, so any
  // hand-edits the operator made to the prior article are stranded on the
  // old row. First click arms the confirm; second click fires the retry.
  const [confirmingRetry, setConfirmingRetry] = useState(false);
  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRunId = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollHandle.current) {
      clearInterval(pollHandle.current);
      pollHandle.current = null;
    }
    pollRunId.current = null;
  }, []);

  const pollOnce = useCallback(async (runIdToPoll: string) => {
    try {
      const res = await fetch(`/api/admin/pipeline/runs/${runIdToPoll}`);
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as RunDetailResponse | null;
      if (!json?.run) return;
      if (pollRunId.current !== runIdToPoll) return;

      const lastStep = json.steps && json.steps.length > 0 ? json.steps[json.steps.length - 1] : null;
      if (lastStep?.step) setCurrentStep(lastStep.step);

      const status = json.run.status;
      if (status === 'completed' || status === 'success') {
        setState('generated');
        const articleStep = json.steps?.findLast((s) => s.success && s.article_id) ?? null;
        setArticleId(articleStep?.article_id ?? null);
        stopPolling();
      } else if (status === 'failed' || status === 'error') {
        setState('failed');
        setErrorType(json.run.error_type ?? null);
        setErrorStep(lastStep?.step ?? null);
        stopPolling();
      } else if (status === 'cancelled') {
        setState('idle');
        setRunId(null);
        stopPolling();
      }
    } catch {
      // Transient network failure — next tick retries.
    }
  }, [stopPolling]);

  useEffect(() => {
    if (state !== 'generating' || !runId) {
      stopPolling();
      return;
    }
    pollRunId.current = runId;
    void pollOnce(runId);
    pollHandle.current = setInterval(() => { void pollOnce(runId); }, POLL_MS);
    return () => { stopPolling(); };
  }, [state, runId, pollOnce, stopPolling]);

  useEffect(() => () => { stopPolling(); }, [stopPolling]);

  const fetchArticleStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/articles/${id}`);
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as
        | { article?: { status?: string; plagiarism_status?: string | null; needs_manual_review?: boolean } }
        | null;
      const next = json?.article?.status;
      if (next === 'draft' || next === 'published' || next === 'archived') {
        setArticleStatus(next);
      }
      // Trust signals — set by the article-gen pipeline at completion.
      // plagiarism_status takes 'ok' | 'rewritten' | 'rewrite_kept_original'
      // | 'rewrite_failed'; needs_manual_review goes true on soft-degrade
      // or sanitizer failure. Surfacing both inline so the operator sees
      // quality status without opening the article.
      setPlagiarismStatus(json?.article?.plagiarism_status ?? null);
      setNeedsManualReview(!!json?.article?.needs_manual_review);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (state !== 'generated' || !articleId) return;
    void fetchArticleStatus(articleId);
  }, [state, articleId, fetchArticleStatus]);

  useEffect(() => {
    if (state !== 'generated' || !articleId) return;
    const refetch = () => { void fetchArticleStatus(articleId); };
    window.addEventListener('focus', refetch);
    window.addEventListener('pageshow', refetch);
    return () => {
      window.removeEventListener('focus', refetch);
      window.removeEventListener('pageshow', refetch);
    };
  }, [state, articleId, fetchArticleStatus]);

  const handleGenerate = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      const apiAudience = audienceForApi(audienceBand);
      const { provider, model } = MODEL_OPTIONS[selectedModelIdx];
      const res = await fetch('/api/admin/pipeline/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cluster_id: clusterId,
          ...apiAudience,
          provider,
          model,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        run_id?: string;
        error?: string;
      };
      if (!res.ok || !body.run_id) {
        setActionError(body.error ?? `Generate returned ${res.status}`);
        return;
      }
      setRunId(body.run_id);
      setCurrentStep(null);
      setErrorType(null);
      setErrorStep(null);
      setState('generating');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }, [clusterId, audienceBand, selectedModelIdx]);

  async function handleCancel() {
    if (!runId) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/pipeline/runs/${runId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(body.error ?? `Cancel returned ${res.status}`);
        return;
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry() {
    if (!runId) return;
    setConfirmingRetry(false);
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/pipeline/runs/${runId}/retry`, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { run_id?: string; error?: string };
      if (!res.ok) {
        setActionError(body.error ?? `Retry returned ${res.status}`);
        return;
      }
      if (body.run_id && body.run_id !== runId) setRunId(body.run_id);
      setCurrentStep(null);
      setErrorType(null);
      setErrorStep(null);
      setState('generating');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  const total = totalSteps(audienceBand);
  const stepIdx = stepIndex(currentStep, audienceBand);
  const progressPct = stepIdx ? Math.min(100, Math.round((stepIdx / total) * 100)) : 0;
  const headline =
    state === 'generated'
      ? articleTitle || workingHeadline || 'Generated article'
      : workingHeadline || 'No working headline yet';

  let pillLabel: string;
  let pillColor: string;
  if (state === 'idle') {
    pillLabel = 'Pending';
    pillColor = C.muted;
  } else if (state === 'generating') {
    pillLabel = 'Working';
    pillColor = C.ink;
  } else if (state === 'failed') {
    pillLabel = 'Failed';
    pillColor = C.danger;
  } else if (articleStatus === 'published') {
    pillLabel = 'Published';
    pillColor = C.success;
  } else if (articleStatus === 'archived') {
    pillLabel = 'Archived';
    pillColor = C.muted;
  } else {
    pillLabel = 'Generated';
    pillColor = C.ink;
  }

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        background: C.bg,
        padding: `${S[2]}px ${S[3]}px`,
        display: 'inline-flex',
        flexDirection: 'column',
        gap: S[1],
        minWidth: 90,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: F.xs, fontWeight: 700, letterSpacing: 0.5, color: C.soft }}>
          {BAND_LABEL[audienceBand].toUpperCase()}
        </span>
        <span style={{ fontSize: F.xs, fontWeight: 700, letterSpacing: 0.5, color: pillColor }}>
          {pillLabel.toUpperCase()}
        </span>
      </div>

      {state === 'generating' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: F.xs, color: C.dim }}>
            <span>{humanizeStep(currentStep) || 'Starting…'}</span>
            <span>{stepIdx ? `${stepIdx} of ${total}` : `0 of ${total}`}</span>
          </div>
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: C.divider,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                background: C.accent,
                transition: 'width 240ms ease',
              }}
            />
          </div>
        </div>
      )}

      {state === 'failed' && (
        <div style={{ fontSize: F.xs, color: C.danger }}>
          {humanizeStep(errorStep) ? `Failed at: ${humanizeStep(errorStep)}.` : 'Failed.'}{' '}
          {humanizeError(errorType)}
        </div>
      )}

      {actionError && (
        <div style={{ fontSize: F.xs, color: C.danger }}>{actionError}</div>
      )}

      {/* Trust signals — only render when there's something to flag. The
          pipeline writes plagiarism_status ('ok' | 'rewritten' |
          'rewrite_kept_original' | 'rewrite_failed') and
          needs_manual_review on every generated article; surfacing them
          inline so the operator sees quality status without opening the
          article. Editorial meta family (11/600/0.1em uppercase) — text
          only, no icons / emojis. Empty-good = render nothing.        */}
      {state === 'generated' && (needsManualReview || (plagiarismStatus && plagiarismStatus !== 'ok')) && (
        <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
          {needsManualReview && (
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: C.warn ?? C.danger,
            }}>
              Needs review
            </span>
          )}
          {plagiarismStatus === 'rewritten' && (
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: C.dim,
            }}>
              Rewritten
            </span>
          )}
          {plagiarismStatus === 'rewrite_kept_original' && (
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: C.danger,
            }}>
              Original kept · review
            </span>
          )}
          {plagiarismStatus === 'rewrite_failed' && (
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: C.danger,
            }}>
              Rewrite failed
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[1], marginTop: 'auto' }}>
        {state === 'idle' && (
          <Button onClick={() => void handleGenerate()} disabled={busy} variant="primary" size="sm">
            {busy ? 'Starting…' : 'Generate'}
          </Button>
        )}
        {state === 'generating' && (
          <Button onClick={handleCancel} disabled={busy} variant="ghost" size="sm">
            {busy ? 'Cancelling…' : 'Cancel'}
          </Button>
        )}
        {state === 'generated' && (
          <>
            {articleSlug && (
              <Link
                href={`/${articleSlug}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: `${S[1]}px ${S[2]}px`,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: C.ink,
                  fontSize: F.xs,
                  fontWeight: 500,
                }}
              >
                View article
              </Link>
            )}
            {articleId && (
              <Link
                href={
                  audienceBand === 'adult'
                    ? `/admin/story-manager?article=${articleId}`
                    : `/admin/kids-story-manager?article=${articleId}`
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: `${S[1]}px ${S[2]}px`,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: C.ink,
                  fontSize: F.xs,
                  fontWeight: 500,
                }}
              >
                Edit
              </Link>
            )}
          </>
        )}
        {state === 'failed' && !confirmingRetry && (
          <>
            <Button
              onClick={() => { setActionError(null); setConfirmingRetry(true); }}
              disabled={busy}
              variant="primary"
              size="sm"
            >
              {busy ? 'Retrying…' : 'Retry'}
            </Button>
            {runId && (
              <Link
                href={`/admin/pipeline/runs/${runId}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: `${S[1]}px ${S[2]}px`,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: C.ink,
                  fontSize: F.xs,
                  fontWeight: 500,
                }}
              >
                View run
              </Link>
            )}
          </>
        )}
        {state === 'failed' && confirmingRetry && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[1], width: '100%' }}>
            <span style={{ fontSize: F.xs, color: C.dim, lineHeight: 1.4 }}>
              Retry creates a new article row. Any hand-edits to the previous one will be stranded.
            </span>
            <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
              <Button onClick={() => void handleRetry()} disabled={busy} variant="primary" size="sm">
                {busy ? 'Retrying…' : 'Yes, regenerate'}
              </Button>
              <Button onClick={() => setConfirmingRetry(false)} disabled={busy} variant="ghost" size="sm">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AudienceCard;
