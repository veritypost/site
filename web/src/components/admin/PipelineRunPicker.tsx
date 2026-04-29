/**
 * F7 Phase 4 (post-Task-22 gap-fill) — Pipeline run picker
 *
 * Sticky page header that owns the per-run provider + model selection +
 * Layer 2 freeform-instructions textarea for /admin/newsroom AND
 * /admin/newsroom/clusters/:id. Per F7-DECISIONS-LOCKED §3.1 + §3.4.
 *
 * Behavior contract (Decision 3.1 "fresh pick every click"):
 *   - Provider dropdown sourced from distinct ai_models.provider where
 *     is_active=true; loaded once on mount + cached for the page lifetime.
 *   - Model dropdown empty until provider is picked; when populated, lists
 *     only models for that provider.
 *   - Freeform textarea is collapsible; resets to empty after a Generate
 *     click (host page calls reset()).
 *   - Both dropdowns + freeform reset to blank after each Generate click.
 *     Reset is host-driven via the imperative `reset()` ref method.
 *   - Selection state lives here, but lifted up via onChange so host pages
 *     can disable the per-cluster Generate button until both are picked.
 *
 * Cost-preview helper exported alongside: estimateClusterCostUsd reads the
 * picked model's pricing + a typical-token-count constant per step. Returns
 * null when no model is picked. Audience-conservative: uses kid-path step
 * count (audience_safety_check + kid_url_sanitizer add ~2k tokens vs adult)
 * so the preview slightly over-estimates. Owner trust > tight estimate.
 *
 * Two call sites only — under the CLAUDE.md "abstract at 3+" threshold —
 * but the picker is non-trivial (header layout + DB load + reset semantics)
 * and the two sites need byte-identical behavior. Worth the shared file.
 */

'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

import Field from '@/components/admin/Field';
import Select from '@/components/admin/Select';
import Textarea from '@/components/admin/Textarea';

// ----------------------------------------------------------------------------
// Cost-estimate constants (Decision 3.1 "est. $0.12")
// ----------------------------------------------------------------------------
//
// Per-step typical token counts. Conservative — kid-path totals are used so
// the preview slightly OVER-estimates the adult path. Numbers come from
// reading generate/route.ts step bodies + the editorial-guide prompt sizes.
// If the orchestrator is later re-tuned, update here.
//
// Steps with no LLM call (source_fetch, plagiarism_check, kid_url_sanitizer,
// persist) contribute zero.

type StepTokenCounts = { input: number; output: number };

const STEP_TOKEN_COUNTS: Record<string, StepTokenCounts> = {
  audience_safety_check: { input: 2_000, output: 200 }, // kid-path Haiku
  headline: { input: 2_000, output: 300 },
  summary: { input: 3_000, output: 300 },
  categorization: { input: 2_000, output: 100 },
  body: { input: 8_000, output: 3_000 },
  source_grounding: { input: 10_000, output: 1_000 },
  timeline: { input: 3_000, output: 1_000 },
  quiz: { input: 5_000, output: 1_000 },
  quiz_verification: { input: 6_000, output: 500 },
};

const TOTAL_INPUT_TOKENS = Object.values(STEP_TOKEN_COUNTS).reduce((sum, s) => sum + s.input, 0);
const TOTAL_OUTPUT_TOKENS = Object.values(STEP_TOKEN_COUNTS).reduce((sum, s) => sum + s.output, 0);

/**
 * Returns a USD estimate for a single Generate run, or null if pricing is
 * not yet known (no model picked or the row has missing prices).
 */
export function estimateClusterCostUsd(
  inputPricePer1m: number | null | undefined,
  outputPricePer1m: number | null | undefined
): number | null {
  if (
    inputPricePer1m === null ||
    inputPricePer1m === undefined ||
    outputPricePer1m === null ||
    outputPricePer1m === undefined
  ) {
    return null;
  }
  const inCost = (TOTAL_INPUT_TOKENS / 1_000_000) * inputPricePer1m;
  const outCost = (TOTAL_OUTPUT_TOKENS / 1_000_000) * outputPricePer1m;
  return inCost + outCost;
}

export function formatEstimatedCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return '';
  if (usd < 0.01) return `est. $${usd.toFixed(4)}`;
  return `est. $${usd.toFixed(2)}`;
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

type ModelRow = {
  provider: string;
  model: string;
  display_name: string;
  input_price_per_1m_tokens: number;
  output_price_per_1m_tokens: number;
};

export type PickerSelection = {
  provider: string;
  model: string;
  freeformInstructions: string;
  /** Picked model's input price per 1M tokens; null when no model picked. */
  inputPricePer1m: number | null;
  /** Picked model's output price per 1M tokens; null when no model picked. */
  outputPricePer1m: number | null;
};

export type PipelineRunPickerHandle = {
  /** Clears provider, model, and freeform back to defaults. Called by host
   * after a Generate click fires (Decision 3.1 "fresh pick every click"). */
  reset: () => void;
};

type Props = {
  /** Fired on any change so parent can gate Generate buttons. */
  onChange: (sel: PickerSelection) => void;
};

const PipelineRunPicker = forwardRef<PipelineRunPickerHandle, Props>(function PipelineRunPicker(
  { onChange },
  ref
) {
  const supabase = useMemo(() => createClient(), []);

  const [models, setModels] = useState<ModelRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [freeform, setFreeform] = useState('');
  const [freeformOpen, setFreeformOpen] = useState(false);

  // Notify parent on every mutation. Wrapped so the effect deps stay
  // stable.
  const notifyParent = useCallback(
    (next: { provider: string; model: string; freeform: string }) => {
      const picked = models.find((m) => m.provider === next.provider && m.model === next.model);
      onChange({
        provider: next.provider,
        model: next.model,
        freeformInstructions: next.freeform,
        inputPricePer1m: picked?.input_price_per_1m_tokens ?? null,
        outputPricePer1m: picked?.output_price_per_1m_tokens ?? null,
      });
    },
    [models, onChange]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('ai_models')
        .select(
          'provider, model, display_name, input_price_per_1m_tokens, output_price_per_1m_tokens'
        )
        .eq('is_active', true)
        .order('provider', { ascending: true })
        .order('display_name', { ascending: true });
      if (cancelled) return;
      if (error || !data) {
        setLoadError(true);
        return;
      }
      setModels(data as ModelRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        setProvider('');
        setModel('');
        setFreeform('');
        setFreeformOpen(false);
        notifyParent({ provider: '', model: '', freeform: '' });
      },
    }),
    [notifyParent]
  );

  const providers = useMemo(() => {
    const uniq = new Set<string>();
    for (const m of models) uniq.add(m.provider);
    return Array.from(uniq).sort();
  }, [models]);

  const modelsForProvider = useMemo(
    () => models.filter((m) => m.provider === provider),
    [models, provider]
  );

  function onProviderChange(next: string) {
    setProvider(next);
    setModel('');
    notifyParent({ provider: next, model: '', freeform });
  }

  function onModelChange(next: string) {
    setModel(next);
    notifyParent({ provider, model: next, freeform });
  }

  function onFreeformChange(next: string) {
    setFreeform(next);
    notifyParent({ provider, model, freeform: next });
  }

  const freeformOverLimit = freeform.length > 2000;

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: ADMIN_C.bg,
        borderBottom: `1px solid ${ADMIN_C.divider}`,
        padding: `${S[3]}px 0`,
        marginBottom: S[4],
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: S[3],
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 200, flex: '0 1 220px' }}>
          <Field id="picker-provider" label="Provider">
            <Select
              id="picker-provider"
              value={provider}
              placeholder={loadError ? 'Could not load' : 'Choose provider'}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                onProviderChange(e.target.value)
              }
              options={providers.map((p) => ({ value: p, label: p }))}
            />
          </Field>
        </div>

        <div style={{ minWidth: 240, flex: '0 1 280px' }}>
          <Field id="picker-model" label="Model">
            <Select
              id="picker-model"
              value={model}
              placeholder={
                !provider
                  ? 'Pick a provider first'
                  : modelsForProvider.length === 0
                    ? 'No models'
                    : 'Choose model'
              }
              disabled={!provider}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onModelChange(e.target.value)}
              options={modelsForProvider.map((m) => ({
                value: m.model,
                label: m.display_name,
              }))}
            />
          </Field>
        </div>

        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <button
            type="button"
            onClick={() => setFreeformOpen((v) => !v)}
            style={{
              background: 'transparent',
              border: `1px solid ${ADMIN_C.border}`,
              borderRadius: 6,
              padding: `6px 10px`,
              fontSize: F.sm,
              color: ADMIN_C.soft,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            aria-expanded={freeformOpen}
            aria-controls="picker-freeform"
          >
            {freeformOpen ? 'Hide extra instructions' : 'Add extra instructions'}
            {freeform.trim() && !freeformOpen ? (
              <span style={{ color: ADMIN_C.accent, marginLeft: S[1] }}>
                ({freeform.length} chars)
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {freeformOpen && (
        <div style={{ marginTop: S[3] }}>
          <Field
            id="picker-freeform"
            label="Extra instructions (this run only)"
            hint={
              freeformOverLimit
                ? `Too long: ${freeform.length} / 2000`
                : `Optional. Resets after each Generate click. ${freeform.length} / 2000.`
            }
            error={freeformOverLimit ? 'Must be 2000 characters or fewer.' : undefined}
          >
            <Textarea
              id="picker-freeform"
              rows={3}
              value={freeform}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                onFreeformChange(e.target.value)
              }
              placeholder="e.g. emphasize the legal angle; keep it under 600 words."
              error={freeformOverLimit}
            />
          </Field>
        </div>
      )}
    </div>
  );
});

export default PipelineRunPicker;
