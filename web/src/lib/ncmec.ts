// T278 — NCMEC CyberTipline integration scaffold.
//
// LEGAL CONTEXT
// -------------
// 18 U.S.C. § 2258A requires U.S.-based "electronic communication
// service" and "remote computing service" providers to report apparent
// child sexual abuse material (CSAM) to NCMEC's CyberTipline as soon as
// reasonably possible after obtaining actual knowledge. Failure to
// report is a federal offense (fines up to $300k for repeat failures).
//
// The reporting fields NCMEC expects (see CyberTipline schema docs):
//   - report type / incident type
//   - reporting ESP identity + designated agent
//   - URL(s) of the offending content
//   - content excerpts (for text) or hash + thumbnail (for media)
//   - suspect identity: user_id, username, email, IP address(es),
//     device info, account creation date
//   - victim identity if known (often unknown for third-party reports)
//   - time of upload + time of report
//   - reporter identity (the user who flagged it inside Verity Post,
//     if applicable)
//
// OPERATOR CHECKLIST BEFORE FLIPPING THE WIRE
// -------------------------------------------
//   1. Register Verity Post as an Electronic Service Provider with NCMEC
//      at https://report.cybertipline.org/registration. This requires a
//      designated reporting agent (a named human, often the head of
//      trust & safety or general counsel).
//   2. Receive ESP ID + production API credentials from NCMEC. Store
//      under `NCMEC_ESP_ID` and `NCMEC_API_TOKEN` in the platform secret
//      manager (Vercel env or Supabase Vault — NOT committed to repo).
//   3. Implement the body of `reportToNCMEC` below against NCMEC's
//      authenticated REST endpoint (currently posted to a queue and
//      acknowledged with a CyberTipline report number). Persist the
//      returned report number on the `reports` row in metadata.ncmec.
//   4. Add a daily backfill job that retries any urgent report whose
//      `metadata.ncmec.submitted_at` is null and `metadata.severity` is
//      'urgent'. Failures must escalate, not silently retry forever.
//   5. Document retention: CSAM payloads must NOT be retained on Verity
//      Post infrastructure beyond what § 2258A requires. The standard
//      pattern is "preserve for 90 days, then destroy after NCMEC
//      acknowledges receipt."
//
// Until step 2 is done, calling `reportToNCMEC` throws — the calling
// code (the comment-report route) should swallow and log the throw so
// in-app reporting still succeeds. The internal escalation path
// (is_escalated=true + observability page) is what triggers human
// triage in the meantime.

export interface NCMECReportPayload {
  // The Verity Post `reports.id` UUID — used as the idempotency key so
  // re-running the queue doesn't duplicate-submit.
  reportId: string;
  // 'comment' | 'article' | 'profile' | 'message' etc.
  targetType: string;
  // The Verity Post target row id.
  targetId: string;
  // Public URL where the offending content was visible (or "internal"
  // if it was private to the suspect — NCMEC accepts both).
  contentUrl: string;
  // The user_id of whoever posted the content. For unauth comments
  // (legacy) this can be null.
  suspectUserId: string | null;
  // IP address captured at content-upload time, if available. Many
  // legacy rows won't have this.
  suspectIp: string | null;
  // The actual offending text/media excerpt or content hash.
  contentExcerpt: string | null;
  // ISO-8601 timestamp of when the content was created on Verity Post.
  contentCreatedAt: string;
  // ISO-8601 timestamp of when the report was filed inside Verity Post.
  reportedAt: string;
  // The Verity Post user_id of whoever filed the report (so NCMEC can
  // route follow-ups). Null for system-generated reports.
  reporterUserId: string | null;
  // The structured reason value: 'csam' | 'child_exploitation' |
  // 'grooming'. NCMEC has a more granular incident-type taxonomy that
  // we map to in `reportToNCMEC`.
  reasonCode: 'csam' | 'child_exploitation' | 'grooming';
}

export interface NCMECReportResult {
  // The CyberTipline report number returned by NCMEC. Persist on
  // `reports.metadata.ncmec.report_number`.
  reportNumber: string;
  submittedAt: string;
}

// TODO: implement after NCMEC registration. See file header.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function reportToNCMEC(_payload: NCMECReportPayload): Promise<NCMECReportResult> {
  throw new Error('NCMEC reporting not yet wired — see web/src/lib/ncmec.ts header');
}

// Convenience flag for callers — lets the report route check
// "is the wire actually configured?" without try/catching the throw.
// Flips automatically once the ESP credentials env vars are set.
export function ncmecConfigured(): boolean {
  return Boolean(process.env.NCMEC_ESP_ID && process.env.NCMEC_API_TOKEN);
}
