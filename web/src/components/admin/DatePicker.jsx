// @admin-verified 2026-04-23
'use client';

import { forwardRef } from 'react';
import TextInput from './TextInput';

/**
 * Date picker. Thin wrapper over TextInput with `type="date"`. Pass
 * `includeTime` to switch to `datetime-local`. Values are ISO-ish
 * strings — admins using this should already know the Date contract.
 *
 * Native pickers are intentional: they're keyboard-accessible, locale-
 * aware, and admins on macOS/Linux get fast typing. A custom calendar
 * popover is a future enhancement, not a launch concern.
 *
 * @param {object} props
 * @param {boolean} [props.includeTime=false]
 * @param {string} [props.min] ISO min.
 * @param {string} [props.max] ISO max.
 * @param {boolean} [props.error]
 * @param {'sm'|'md'} [props.size]
 * @param {boolean} [props.block]
 * @param {object} [props.style]
 */
const DatePicker = forwardRef(function DatePicker({ includeTime = false, ...rest }, ref) {
  return <TextInput ref={ref} type={includeTime ? 'datetime-local' : 'date'} {...rest} />;
});

export default DatePicker;

/**
 * @example
 * import DatePicker from '@/components/admin/DatePicker';
 * <DatePicker value={d} onChange={e=>setD(e.target.value)} />
 * <DatePicker includeTime value={dt} onChange={e=>setDt(e.target.value)} />
 */
