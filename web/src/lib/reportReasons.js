// T278 — Single source of truth for content-report reason categories
// across the web app (and to be mirrored by VerityPost/BlockService.swift
// on iOS). Three of these reasons are flagged as URGENT because U.S.
// providers have a legal duty under 18 U.S.C. § 2258A to report
// apparent child sexual exploitation material to NCMEC's CyberTipline.
// Urgent reports bypass per-target rate limits, set is_escalated=true,
// stamp metadata.severity='urgent', and emit an observability signal so
// a human is paged.
//
// Keep the iOS enum at VerityPost/VerityPost/BlockService.swift in sync
// when this list changes. Server-side enum validation lives in
// `assertReportReason` below; both report routes call it.

export const URGENT_REPORT_REASONS = Object.freeze(['csam', 'child_exploitation', 'grooming']);

// Comment-level reasons. Includes the urgent trio at the top of the
// list so victims see the most actionable category first.
export const COMMENT_REPORT_REASONS = Object.freeze([
  { value: 'csam', label: 'Sexual content involving a minor', urgent: true },
  { value: 'child_exploitation', label: 'Suspected child exploitation', urgent: true },
  { value: 'grooming', label: 'Grooming / contact attempt by an adult', urgent: true },
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or hate' },
  { value: 'off_topic', label: 'Off-topic' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'other', label: 'Other' },
]);

// Article / story-level reasons. Article reports don't have an
// "off topic" category (the whole article is the topic), but the urgent
// trio appears here too — CSAM in an article body or attached media is
// just as much a 2258A trigger as a comment.
export const ARTICLE_REPORT_REASONS = Object.freeze([
  { value: 'csam', label: 'Sexual content involving a minor', urgent: true },
  { value: 'child_exploitation', label: 'Suspected child exploitation', urgent: true },
  { value: 'grooming', label: 'Grooming / contact attempt by an adult', urgent: true },
  { value: 'harassment', label: 'Harassment' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'spam', label: 'Spam' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'off_topic', label: 'Off topic' },
  { value: 'impersonation', label: 'Impersonation' },
]);

// Profile-level reasons (reporting another user). Same urgent trio at
// the top — a profile that exists to host CSAM or solicit minors is the
// reportable thing. The "other" tail lets the reporter add context.
export const PROFILE_REPORT_REASONS = Object.freeze([
  { value: 'csam', label: 'Sexual content involving a minor', urgent: true },
  { value: 'child_exploitation', label: 'Suspected child exploitation', urgent: true },
  { value: 'grooming', label: 'Grooming / contact attempt by an adult', urgent: true },
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'other', label: 'Other' },
]);

// Union of every accepted reason value across all surfaces. Server-side
// validators use this to reject free-text reasons that bypass the UI.
const ALL_REASON_VALUES = Object.freeze(
  Array.from(
    new Set([
      ...COMMENT_REPORT_REASONS.map((r) => r.value),
      ...ARTICLE_REPORT_REASONS.map((r) => r.value),
      ...PROFILE_REPORT_REASONS.map((r) => r.value),
    ])
  )
);

export function isUrgentReason(reason) {
  return URGENT_REPORT_REASONS.includes(reason);
}

// Returns the canonical reason string if accepted; throws otherwise.
// Use in API routes before insert. Free-text reasons are not allowed —
// every UI surface uses a dropdown with these exact values.
export function assertReportReason(reason) {
  if (typeof reason !== 'string' || !ALL_REASON_VALUES.includes(reason)) {
    const err = new Error('invalid_reason');
    err.status = 400;
    throw err;
  }
  return reason;
}
