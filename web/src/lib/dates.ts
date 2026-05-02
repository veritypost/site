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
 * formatTimelineDate — "05/02/2026"
 * Use for timeline event dates. Owner-locked format MM/DD/YYYY.
 *
 * Parses the YYYY-MM-DD prefix directly — `new Date('2024-06-15')` would
 * parse as UTC midnight and shift west of UTC, which is wrong for a
 * date-only field. Falls back to the raw string on non-canonical shapes
 * (e.g. literal strings written by older import paths) so the operator
 * sees what the DB actually has rather than "Invalid Date".
 */
export function formatTimelineDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]}`;
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
