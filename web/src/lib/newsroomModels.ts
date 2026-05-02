export const MODEL_OPTIONS = [
  { label: 'Claude Sonnet 4.6', provider: 'anthropic', model: 'claude-sonnet-4-6' },
  { label: 'Claude Opus 4.7', provider: 'anthropic', model: 'claude-opus-4-7' },
  { label: 'Claude Haiku 4.5', provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  { label: 'GPT-4o', provider: 'openai', model: 'gpt-4o' },
  { label: 'GPT-4o Mini', provider: 'openai', model: 'gpt-4o-mini' },
] as const;

export type ModelOption = (typeof MODEL_OPTIONS)[number];
