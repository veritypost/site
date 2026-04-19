// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
'use client';
import { useEffect } from 'react';
import { initObservability } from '../lib/observability';

export default function ObservabilityInit() {
  useEffect(() => { initObservability(); }, []);
  return null;
}
