'use client';

/**
 * Wave 6 — System Prompts editor.
 *
 * Lets an admin override the audience-level system prompts (body, headline,
 * quiz, timeline) without redeploying. Empty value = system-prompt-loader
 * falls back to the hardcoded constant in editorial-guide.ts.
 *
 * Save model: on textarea blur. A "Save" affordance also appears next to
 * any dirty textarea so an operator who closes the tab without first
 * blurring the field can still flush — onBlur does NOT fire on tab close.
 *
 * Sub-tab content is mounted only for the active audience so blur events
 * on hidden textareas can't fire spurious saves.
 *
 * Sits above the existing prompt-presets page (left untouched).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import PageSection from '@/components/admin/PageSection';
import Textarea from '@/components/admin/Textarea';
import Button from '@/components/admin/Button';
import Spinner from '@/components/admin/Spinner';

import PromptPresetsAdminPage from '@/app/admin/prompt-presets/page';

type Audience = 'adult' | 'tweens' | 'kids';
type PromptType = 'body' | 'headline' | 'quiz' | 'timeline';

const AUDIENCES: Audience[] = ['adult', 'tweens', 'kids'];
const TYPES: PromptType[] = ['body', 'headline', 'quiz', 'timeline'];

const AUDIENCE_LABEL: Record<Audience, string> = {
  adult: 'Adult',
  tweens: 'Tweens',
  kids: 'Kids',
};

const TYPE_LABEL: Record<PromptType, string> = {
  body: 'Body prompt',
  headline: 'Headline prompt',
  quiz: 'Quiz prompt',
  timeline: 'Timeline prompt',
};

const TYPE_HINT: Record<PromptType, string> = {
  body: 'System prompt for the article body generation step.',
  headline: 'System prompt for the headline + summary step.',
  quiz: 'System prompt for the quiz generation step.',
  timeline: 'System prompt for the timeline events step.',
};

// Cap mirrored client-side. The /api/admin/settings/upsert route does not
// length-cap; saving a 50 KB prompt would slow every generation.
const MAX_LENGTH = 10_000;

function settingKey(audience: Audience, type: PromptType): string {
  return `pipeline.prompt.${audience}.${type}`;
}

type SettingRow = {
  key: string;
  value: string;
  is_public?: boolean;
  // Other columns are present on the wire but unused here.
};

type FieldState = {
  saved: string;
  draft: string;
  savingState: 'idle' | 'saving' | 'saved' | 'error';
  savedAt: string | null;
  errorMessage: string | null;
  resetConfirm: boolean;
};

const EMPTY_FIELD: FieldState = {
  saved: '',
  draft: '',
  savingState: 'idle',
  savedAt: null,
  errorMessage: null,
  resetConfirm: false,
};

function formatHHMM(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export default function PromptsTab() {
  return (
    <>
      <SystemPromptsEditor />
      <div
        role="presentation"
        style={{
          height: 1,
          background: C.divider,
          margin: `${S[6]}px 0`,
        }}
      />
      <PromptPresetsAdminPage />
    </>
  );
}

function SystemPromptsEditor() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>('adult');

  // 12 keys × FieldState. Indexed as `${audience}.${type}`.
  const [fields, setFields] = useState<Record<string, FieldState>>(() => {
    const init: Record<string, FieldState> = {};
    for (const a of AUDIENCES) {
      for (const t of TYPES) init[`${a}.${t}`] = { ...EMPTY_FIELD };
    }
    return init;
  });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/settings', { method: 'GET' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json?.error || `Load failed (${res.status})`;
        setLoadError(msg);
        return;
      }
      const rows: SettingRow[] = Array.isArray(json?.settings) ? json.settings : [];
      const byKey = new Map<string, string>();
      for (const r of rows) {
        if (typeof r?.key === 'string' && r.key.startsWith('pipeline.prompt.')) {
          byKey.set(r.key, typeof r.value === 'string' ? r.value : String(r.value ?? ''));
        }
      }
      setFields((prev) => {
        const next = { ...prev };
        for (const a of AUDIENCES) {
          for (const t of TYPES) {
            const key = settingKey(a, t);
            const stored = byKey.get(key) ?? '';
            next[`${a}.${t}`] = {
              ...EMPTY_FIELD,
              saved: stored,
              draft: stored,
            };
          }
        }
        return next;
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Guard against silent loss when the operator closes the tab with an
  // unsaved textarea — blur does not fire on tab close.
  const dirtyCountRef = useMemo(() => ({ value: 0 }), []);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyCountRef.value > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyCountRef]);

  const persist = useCallback(
    async (a: Audience, t: PromptType, value: string): Promise<boolean> => {
      const id = `${a}.${t}`;
      setFields((prev) => ({
        ...prev,
        [id]: { ...prev[id], savingState: 'saving', errorMessage: null },
      }));
      try {
        const res = await fetch('/api/admin/settings/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: settingKey(a, t), value }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 429) {
          setFields((prev) => ({
            ...prev,
            [id]: {
              ...prev[id],
              savingState: 'error',
              errorMessage: 'Saving too fast. Try again shortly.',
            },
          }));
          return false;
        }
        if (!res.ok) {
          const msg = json?.error || `Save failed (${res.status})`;
          setFields((prev) => ({
            ...prev,
            [id]: { ...prev[id], savingState: 'error', errorMessage: msg },
          }));
          return false;
        }
        setFields((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            saved: value,
            draft: value,
            savingState: 'saved',
            savedAt: formatHHMM(new Date()),
            errorMessage: null,
            resetConfirm: false,
          },
        }));
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error';
        setFields((prev) => ({
          ...prev,
          [id]: { ...prev[id], savingState: 'error', errorMessage: msg },
        }));
        return false;
      }
    },
    []
  );

  const onChange = useCallback((a: Audience, t: PromptType, next: string) => {
    const id = `${a}.${t}`;
    // Hard-stop at MAX_LENGTH so a paste of a giant blob can't slip past.
    const clamped = next.length > MAX_LENGTH ? next.slice(0, MAX_LENGTH) : next;
    setFields((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        draft: clamped,
        // Clear stale "Saved at" / "error" once the operator types again.
        savingState: prev[id].savingState === 'saving' ? 'saving' : 'idle',
        savedAt: null,
        errorMessage: null,
        resetConfirm: false,
      },
    }));
  }, []);

  const onBlur = useCallback(
    (a: Audience, t: PromptType) => {
      const id = `${a}.${t}`;
      const f = fields[id];
      if (!f) return;
      if (f.draft === f.saved) return;
      void persist(a, t, f.draft);
    },
    [fields, persist]
  );

  const onManualSave = useCallback(
    (a: Audience, t: PromptType) => {
      const id = `${a}.${t}`;
      const f = fields[id];
      if (!f) return;
      if (f.draft === f.saved) return;
      void persist(a, t, f.draft);
    },
    [fields, persist]
  );

  const onResetClick = useCallback((a: Audience, t: PromptType) => {
    const id = `${a}.${t}`;
    setFields((prev) => ({
      ...prev,
      [id]: { ...prev[id], resetConfirm: true, errorMessage: null },
    }));
  }, []);

  const onResetConfirm = useCallback(
    async (a: Audience, t: PromptType) => {
      await persist(a, t, '');
    },
    [persist]
  );

  const onResetCancel = useCallback((a: Audience, t: PromptType) => {
    const id = `${a}.${t}`;
    setFields((prev) => ({
      ...prev,
      [id]: { ...prev[id], resetConfirm: false },
    }));
  }, []);

  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const a of AUDIENCES) {
      for (const t of TYPES) {
        const f = fields[`${a}.${t}`];
        if (f && f.draft !== f.saved) n += 1;
      }
    }
    return n;
  }, [fields]);

  // Mirror dirtyCount into the ref the beforeunload listener reads — listener
  // closes over the ref by identity, so we don't have to re-attach on every
  // dirtyCount tick.
  useEffect(() => {
    dirtyCountRef.value = dirtyCount;
  }, [dirtyCount, dirtyCountRef]);

  return (
    <PageSection
      title="System Prompts"
      description="Override the default generation instructions. Leave blank to use built-in defaults."
    >
      {/* Sub-tab strip */}
      <div
        role="tablist"
        aria-label="Audience"
        style={{
          display: 'inline-flex',
          border: `1px solid ${C.divider}`,
          borderRadius: 6,
          overflow: 'hidden',
          marginBottom: S[4],
        }}
      >
        {AUDIENCES.map((a) => {
          const active = audience === a;
          const dirty = TYPES.some((t) => {
            const f = fields[`${a}.${t}`];
            return f && f.draft !== f.saved;
          });
          return (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setAudience(a)}
              style={{
                border: 'none',
                padding: `${S[1] + 2}px ${S[3]}px`,
                fontSize: F.sm,
                fontWeight: active ? 600 : 500,
                background: active ? C.accent : C.bg,
                color: active ? '#ffffff' : C.soft,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {AUDIENCE_LABEL[a]}
              {dirty && (
                <span
                  aria-label="unsaved changes"
                  style={{
                    marginLeft: 6,
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: active ? '#ffffff' : C.warn,
                    verticalAlign: 'middle',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {dirtyCount > 0 && (
        <div
          style={{
            marginBottom: S[3],
            padding: `${S[2]}px ${S[3]}px`,
            border: `1px solid ${C.warn}`,
            borderRadius: 6,
            background: C.card,
            color: C.ink,
            fontSize: F.sm,
          }}
        >
          {dirtyCount} unsaved {dirtyCount === 1 ? 'change' : 'changes'}. Click outside the
          textarea or press Save to persist.
        </div>
      )}

      {loading ? (
        <div style={{ padding: S[8], textAlign: 'center', color: C.dim }}>
          <Spinner /> Loading prompts…
        </div>
      ) : loadError ? (
        <div
          style={{
            padding: S[4],
            border: `1px solid ${C.danger}`,
            borderRadius: 6,
            color: C.danger,
            fontSize: F.sm,
          }}
        >
          Could not load prompts: {loadError}
          <div style={{ marginTop: S[2] }}>
            <Button variant="secondary" size="sm" onClick={loadSettings}>
              Retry
            </Button>
          </div>
        </div>
      ) : (
        // Render only the active audience — keeps blur events from hidden
        // textareas from triggering background saves.
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[6] }}>
          {TYPES.map((t) => {
            const id = `${audience}.${t}`;
            const f = fields[id];
            if (!f) return null;
            const dirty = f.draft !== f.saved;
            const length = f.draft.length;
            return (
              <PromptField
                key={id}
                inputId={`prompt-${audience}-${t}`}
                label={TYPE_LABEL[t]}
                hint={TYPE_HINT[t]}
                draft={f.draft}
                length={length}
                maxLength={MAX_LENGTH}
                dirty={dirty}
                savingState={f.savingState}
                savedAt={f.savedAt}
                errorMessage={f.errorMessage}
                resetConfirm={f.resetConfirm}
                hasOverride={f.saved.trim().length > 0}
                onChange={(value) => onChange(audience, t, value)}
                onBlur={() => onBlur(audience, t)}
                onSave={() => onManualSave(audience, t)}
                onResetClick={() => onResetClick(audience, t)}
                onResetConfirm={() => onResetConfirm(audience, t)}
                onResetCancel={() => onResetCancel(audience, t)}
              />
            );
          })}
        </div>
      )}
    </PageSection>
  );
}

type PromptFieldProps = {
  inputId: string;
  label: string;
  hint: string;
  draft: string;
  length: number;
  maxLength: number;
  dirty: boolean;
  savingState: FieldState['savingState'];
  savedAt: string | null;
  errorMessage: string | null;
  resetConfirm: boolean;
  hasOverride: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
  onSave: () => void;
  onResetClick: () => void;
  onResetConfirm: () => void;
  onResetCancel: () => void;
};

function PromptField({
  inputId,
  label,
  hint,
  draft,
  length,
  maxLength,
  dirty,
  savingState,
  savedAt,
  errorMessage,
  resetConfirm,
  hasOverride,
  onChange,
  onBlur,
  onSave,
  onResetClick,
  onResetConfirm,
  onResetCancel,
}: PromptFieldProps) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: S[2],
          marginBottom: S[1],
        }}
      >
        <label
          htmlFor={inputId}
          style={{ fontSize: F.sm, fontWeight: 500, color: C.soft }}
        >
          {label}
        </label>
        <span style={{ fontSize: F.xs, color: C.dim }}>{hint}</span>
      </div>

      <Textarea
        id={inputId}
        value={draft}
        rows={8}
        maxLength={maxLength}
        placeholder="Leave blank to use the built-in default prompt."
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        onBlur={onBlur}
        error={!!errorMessage}
      />

      <div
        style={{
          marginTop: S[1],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S[2],
          flexWrap: 'wrap',
          fontSize: F.xs,
          color: C.dim,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
          <span>
            {length.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
          {dirty && (
            <span style={{ color: C.warn, fontWeight: 500 }}>(unsaved)</span>
          )}
          {savingState === 'saving' && (
            <span style={{ color: C.dim }}>Saving…</span>
          )}
          {savingState === 'saved' && savedAt && !dirty && (
            <span style={{ color: C.success }}>Saved at {savedAt}</span>
          )}
          {!hasOverride && !dirty && savingState !== 'saving' && (
            <span style={{ color: C.dim, fontStyle: 'italic' }}>
              using built-in default
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: S[2] }}>
          {dirty && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onSave}
              loading={savingState === 'saving'}
            >
              Save
            </Button>
          )}
          {resetConfirm ? (
            <>
              <Button variant="ghost" size="sm" onClick={onResetCancel}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={onResetConfirm}
                loading={savingState === 'saving'}
              >
                Use default
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetClick}
              disabled={!hasOverride && draft.length === 0}
            >
              Reset to default
            </Button>
          )}
        </div>
      </div>

      {resetConfirm && (
        <div
          style={{
            marginTop: S[1],
            fontSize: F.xs,
            color: C.dim,
            lineHeight: 1.4,
          }}
        >
          This will use the built-in default prompt.
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          style={{
            marginTop: S[1],
            fontSize: F.xs,
            color: C.danger,
            lineHeight: 1.4,
          }}
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}
