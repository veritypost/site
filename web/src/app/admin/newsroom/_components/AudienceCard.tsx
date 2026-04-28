'use client';

/**
 * Single audience card on a Story (Adult / Tweens / Kids).
 *
 * Lifecycle states:
 *   idle       — show working headline + [Generate] [Skip]
 *   generating — show humanized step + 'X of N' + progress bar + [Cancel]
 *   generated  — show final headline + [View article] [Skip]
 *   failed     — show humanized error + [Retry] [View run] [Skip]
 *   skipped    — greyed out + [Un-skip]
 *
 * Polling: every 2s while in `generating`. Each card owns its interval;
 * unmount/state-change cleans it up. The per-Story progress bar reads
 * the last entry in pipeline_runs/<id>'s `steps` array (RunDetailResponse)
 * and maps it through PipelineStepLabels.
 *
 * Working headline pre-generation = the first source's title (server passes
 * the joined sources list through props). Falls back to the cluster title
 * if no sources are available, then to a placeholder.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/admin/Button';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import {
  type AudienceBand,
  humanizeError,
  humanizeStep,
  stepIndex,
  totalSteps,
} from './PipelineStepLabels';

export type AudienceCardState = 'idle' | 'generating' | 'generated' | 'failed' | 'skipped';

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
};

type RunRow = {
  id: string;
  status: string | null;
  audience: string | null;
  article_id: string | null;
  error_type: string | null;
  error_message: string | null;
};

type StepRow = {
  id: string;
  step: string;
  success: boolean;
  error_type: string | null;
  created_at: string;
};

type RunDetailResponse = {
  ok: boolean;
  run: RunRow;
  steps: StepRow[];
};

const POLL_MS = 2000;

const BAND_LABEL: Record<AudienceBand, string> = {
  adult: 'Adult',
  tweens: 'Tweens',
  kids: 'Kids',
};

function audienceForApi(band: AudienceBand): { audience: 'adult' | 'kid'; age_band?: 'kids' | 'tweens' } {
  if (band === 'adult') return { audience: 'adult' };
  return { audience: 'kid', age_band: band };
}

export default function AudienceCard(props: AudienceCardProps) {
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
  } = props;

  const [state, setState] = useState<AudienceCardState>(initialState);
  const [runId, setRunId] = useState<string | null>(initialRunId);
  const [articleId, setArticleId] = useState<string | null>(initialArticleId);
  const [articleSlug] = useState<string | null>(initialArticleSlug);
  const [articleTitle] = useState<string | null>(initialArticleTitle);
  const [errorType, setErrorType] = useState<string | null>(initialErrorType);
  const [errorStep, setErrorStep] = useState<string | null>(initialErrorStep);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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
      // Only apply if we still care about this run id.
      if (pollRunId.current !== runIdToPoll) return;

      const lastStep = json.steps && json.steps.length > 0 ? json.steps[json.steps.length - 1] : null;
      if (lastStep?.step) setCurrentStep(lastStep.step);

      const status = json.run.status;
      if (status === 'completed' || status === 'success') {
        setState('generated');
        setArticleId(json.run.article_id);
        // The detail endpoint doesn't include slug/title; keep what we
        // have. Session C's article-page resolves from article_id anyway,
        // so the View article link below stays correct.
        stopPolling();
      } else if (status === 'failed' || status === 'error') {
        setState('failed');
        setErrorType(json.run.error_type ?? null);
        setErrorStep(lastStep?.step ?? null);
        stopPolling();
      } else if (status === 'cancelled' || status === 'aborted') {
        setState('idle');
        setRunId(null);
        stopPolling();
      }
    } catch {
      // Transient network failure — next tick retries.
    }
  }, [stopPolling]);

  // Lifecycle: while state==='generating' and we have a runId, poll.
  useEffect(() => {
    if (state !== 'generating' || !runId) {
      stopPolling();
      return;
    }
    pollRunId.current = runId;
    // Fire one immediate read so the UI doesn't stall for 2s.
    void pollOnce(runId);
    pollHandle.current = setInterval(() => { void pollOnce(runId); }, POLL_MS);
    return () => { stopPolling(); };
  }, [state, runId, pollOnce, stopPolling]);

  // Cleanup on unmount.
  useEffect(() => () => { stopPolling(); }, [stopPolling]);

  async function handleGenerate() {
    setBusy(true);
    setActionError(null);
    try {
      const apiAudience = audienceForApi(audienceBand);
      const res = await fetch('/api/admin/pipeline/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cluster_id: clusterId,
          ...apiAudience,
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
  }

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
      // Polling tick will move us to idle when status=cancelled lands.
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry() {
    if (!runId) return;
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

  async function handleSkip() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/${clusterId}/skip`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audience_band: audienceBand }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(body.error ?? `Skip returned ${res.status}`);
        return;
      }
      setState('skipped');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnskip() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/newsroom/clusters/${clusterId}/skip`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audience_band: audienceBand }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(body.error ?? `Un-skip returned ${res.status}`);
        return;
      }
      setState('idle');
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

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        border: `1px solid ${state === 'skipped' ? C.divider : C.border}`,
        borderRadius: 8,
        background: state === 'skipped' ? C.card : C.bg,
        opacity: state === 'skipped' ? 0.55 : 1,
        padding: `${S[3]}px ${S[4]}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: S[2],
        minHeight: 130,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: F.xs, fontWeight: 700, letterSpacing: 0.5, color: C.soft }}>
          {BAND_LABEL[audienceBand].toUpperCase()}
        </span>
        <span style={{ fontSize: F.xs, color: C.muted }}>
          {state === 'idle' ? 'Pending' : state === 'skipped' ? 'Skipped' : state === 'generating' ? 'Working' : state === 'failed' ? 'Failed' : 'Generated'}
        </span>
      </div>

      <div style={{ fontSize: F.base, lineHeight: 1.35, color: C.white, fontWeight: 500 }}>
        {headline}
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
        <div style={{ fontSize: F.sm, color: C.danger }}>
          {humanizeStep(errorStep) ? `Failed at: ${humanizeStep(errorStep)}.` : 'Failed.'}{' '}
          {humanizeError(errorType)}
        </div>
      )}

      {actionError && (
        <div style={{ fontSize: F.sm, color: C.danger }}>{actionError}</div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[2], marginTop: 'auto' }}>
        {state === 'idle' && (
          <>
            <Button onClick={handleGenerate} disabled={busy} variant="primary" size="sm">
              {busy ? 'Starting…' : 'Generate'}
            </Button>
            <Button onClick={handleSkip} disabled={busy} variant="ghost" size="sm">
              Skip
            </Button>
          </>
        )}
        {state === 'generating' && (
          <Button onClick={handleCancel} disabled={busy} variant="ghost" size="sm">
            {busy ? 'Cancelling…' : 'Cancel'}
          </Button>
        )}
        {state === 'generated' && (
          <>
            {articleSlug ? (
              <Link
                href={`/story/${articleSlug}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: `${S[1]}px ${S[3]}px`,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: C.white,
                  fontSize: F.sm,
                  fontWeight: 500,
                }}
              >
                View article
              </Link>
            ) : articleId ? (
              <Link
                href={`/admin/story-manager?id=${articleId}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: `${S[1]}px ${S[3]}px`,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: C.white,
                  fontSize: F.sm,
                  fontWeight: 500,
                }}
              >
                View article
              </Link>
            ) : null}
            <Button onClick={handleSkip} disabled={busy} variant="ghost" size="sm">
              Skip
            </Button>
          </>
        )}
        {state === 'failed' && (
          <>
            <Button onClick={handleRetry} disabled={busy} variant="primary" size="sm">
              {busy ? 'Retrying…' : 'Retry'}
            </Button>
            {runId && (
              <Link
                href={`/admin/pipeline/runs/${runId}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: `${S[1]}px ${S[3]}px`,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: C.white,
                  fontSize: F.sm,
                  fontWeight: 500,
                }}
              >
                View run
              </Link>
            )}
            <Button onClick={handleSkip} disabled={busy} variant="ghost" size="sm">
              Skip
            </Button>
          </>
        )}
        {state === 'skipped' && (
          <Button onClick={handleUnskip} disabled={busy} variant="ghost" size="sm">
            {busy ? 'Restoring…' : 'Un-skip'}
          </Button>
        )}
      </div>
    </div>
  );
}
