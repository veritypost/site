-- Seed ai_models pricing rows for all models used by call-model.ts.
-- Idempotent: ON CONFLICT (provider, model) DO UPDATE SET refreshes prices in place.
-- No cache_read / cache_creation columns exist in this schema; only input + output prices are stored.

INSERT INTO public.ai_models (id, provider, model, display_name, input_price_per_1m_tokens, output_price_per_1m_tokens, is_active, created_at, updated_at)
VALUES
  -- Anthropic models
  (gen_random_uuid(), 'anthropic', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5',  1.00,  5.00, true, now(), now()),
  (gen_random_uuid(), 'anthropic', 'claude-sonnet-4-6',         'Claude Sonnet 4.6', 3.00, 15.00, true, now(), now()),
  (gen_random_uuid(), 'anthropic', 'claude-opus-4-7',           'Claude Opus 4.7',  15.00, 75.00, true, now(), now()),
  -- OpenAI models (no cache_creation column; cache_read baked into input price per schema)
  (gen_random_uuid(), 'openai',    'gpt-4o',                    'GPT-4o',            2.50, 10.00, true, now(), now()),
  (gen_random_uuid(), 'openai',    'gpt-4o-mini',               'GPT-4o Mini',       0.15,  0.60, true, now(), now())
ON CONFLICT (provider, model) DO UPDATE SET
  display_name                = EXCLUDED.display_name,
  input_price_per_1m_tokens   = EXCLUDED.input_price_per_1m_tokens,
  output_price_per_1m_tokens  = EXCLUDED.output_price_per_1m_tokens,
  is_active                   = EXCLUDED.is_active,
  updated_at                  = now();
