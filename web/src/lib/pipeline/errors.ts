/**
 * Pipeline error classes — extracted from call-model.ts on 2026-04-22 (F7
 * Phase 1 Task 3) to break a runtime circular import between call-model.ts
 * and cost-tracker.ts. cost-tracker now imports CostCapExceededError from
 * here, and call-model re-exports all five classes for back-compat so
 * existing `import { CostCapExceededError } from './call-model'` call-sites
 * keep working.
 *
 * Constructors + public property shapes preserved verbatim.
 */

export type Provider = 'anthropic' | 'openai';

export class ModelNotSupportedError extends Error {
  constructor(provider: Provider, model: string) {
    super(`No active ai_models row for ${provider}/${model}`);
    this.name = 'ModelNotSupportedError';
  }
}

export class CostCapExceededError extends Error {
  constructor(
    msg: string,
    public estimated_usd: number,
    public cap_usd: number
  ) {
    super(msg);
    this.name = 'CostCapExceededError';
  }
}

export class ProviderAPIError extends Error {
  constructor(
    msg: string,
    public status?: number,
    public provider?: Provider
  ) {
    super(msg);
    this.name = 'ProviderAPIError';
  }
}

export class RetryExhaustedError extends Error {
  constructor(
    msg: string,
    public lastError: unknown
  ) {
    super(msg);
    this.name = 'RetryExhaustedError';
  }
}

export class AbortedError extends Error {
  constructor() {
    super('Aborted');
    this.name = 'AbortedError';
  }
}
