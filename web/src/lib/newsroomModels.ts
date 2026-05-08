// Ordered cheapest-first so the default selection (index 0) is Haiku.
// `costPerArticle` is the rough all-in spend on a single 12-step
// editorial chain at that model — surfaced in the model picker so an
// operator sees the 100x delta between Haiku and Opus before they
// click Generate, not after $300/day in surprise charges.
export const MODEL_OPTIONS = [
  { label: 'Claude Haiku 4.5',  provider: 'anthropic', model: 'claude-haiku-4-5-20251001', costPerArticle: '~$0.10' },
  { label: 'GPT-4o Mini',       provider: 'openai',    model: 'gpt-4o-mini',                costPerArticle: '~$0.05' },
  { label: 'Claude Sonnet 4.6', provider: 'anthropic', model: 'claude-sonnet-4-6',          costPerArticle: '~$2'    },
  { label: 'GPT-4o',            provider: 'openai',    model: 'gpt-4o',                     costPerArticle: '~$1'    },
  { label: 'Claude Opus 4.7',   provider: 'anthropic', model: 'claude-opus-4-7',            costPerArticle: '~$10'   },
] as const;

export type ModelOption = (typeof MODEL_OPTIONS)[number];
