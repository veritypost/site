// @admin-verified 2026-04-18
'use client';

import { forwardRef } from 'react';
import TextInput from './TextInput';

/**
 * Numeric input. Thin wrapper over TextInput that sets
 * `type="number"` and inputMode. Use for integers or decimals.
 *
 * @param {object} props
 * @param {number|string} [props.value]
 * @param {number} [props.min]
 * @param {number} [props.max]
 * @param {number} [props.step]
 * @param {boolean} [props.error]
 * @param {'sm'|'md'} [props.size]
 * @param {boolean} [props.block]
 * @param {object} [props.style]
 */
const NumberInput = forwardRef(function NumberInput({ step = 1, ...rest }, ref) {
  return <TextInput ref={ref} type="number" step={step} inputMode="decimal" {...rest} />;
});

export default NumberInput;

/**
 * @example
 * import NumberInput from '@/components/admin/NumberInput';
 * <NumberInput min={0} max={100} value={n} onChange={e=>setN(Number(e.target.value))} />
 */
