/**
 * Shared date formatting helpers.
 *
 * All helpers accept an ISO 8601 string (or null/undefined) and return a
 * human-readable string. The explicit 'en-US' locale ensures consistent
 * output regardless of the browser or server locale — bare toLocaleDateString()
 * calls without a locale argument are locale-dependent and were producing
 * inconsistent output for non-en-US readers.
 *
 * Usage:
 *   import { formatDate, formatDateTime, timeAgo } from '@/lib/dates';
 */

/**
 * formatDate — "April 26, 2026"
 * Use for calendar dates where time is not relevant.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso));
}

/**
 * formatDateTime — "Apr 26, 2026, 2:34 PM"
 * Use for timestamps where time context matters (activity feeds, audit logs).
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * timeAgo — "just now", "5m", "3h", "2d"
 * Extracted from CommentRow.tsx. Use for relative timestamps in comment threads
 * and message feeds.
 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(ms / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  return `${d}d`;
}
