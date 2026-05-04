// Ordered cheapest-first so the default selection (index 0) is Haiku.
// A typical 12-step editorial chain on Haiku runs ~$0.05–$0.20 per
// article; on Sonnet it's $1–$3, on Opus $5–$15. Defaulting to a
// cheap model prevents accidental 100x cost spikes when an operator
// clicks Generate without touching the dropdown.
export const MODEL_OPTIONS = [
  { label: 'Claude Haiku 4.5', provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  { label: 'GPT-4o Mini', provider: 'openai', model: 'gpt-4o-mini' },
  { label: 'Claude Sonnet 4.6', provider: 'anthropic', model: 'claude-sonnet-4-6' },
  { label: 'GPT-4o', provider: 'openai', model: 'gpt-4o' },
  { label: 'Claude Opus 4.7', provider: 'anthropic', model: 'claude-opus-4-7' },
] as const;

export type ModelOption = (typeof MODEL_OPTIONS)[number];
