// Version string stamped on every kid_profiles.metadata.coppa_consent
// entry. Bump this when the consent text or data-handling practices
// change. Auditors / regulators can then re-collect consent for any
// record whose recorded version is below a threshold.
export const COPPA_CONSENT_VERSION = '2026-04-15-v1';

export const COPPA_CONSENT_TEXT = `
I am the parent or legal guardian of the child whose profile I am creating.
I understand that Verity Post will collect and process personal information
about this child in accordance with the Children's Online Privacy Protection
Act (COPPA). I consent to the collection of their reading history, quiz
responses, and streak activity as described in the Privacy Policy, and I
understand I can review, delete, or revoke access to this data at any time
from my account settings.
`.trim();

// Shared validator used by both API routes and can be reused in the
// cron/data-export pipeline for replay safety.
export function validateConsentPayload(consent) {
  if (!consent || typeof consent !== 'object') return 'Parental consent required';
  if (typeof consent.parent_name !== 'string' || consent.parent_name.trim().length < 2) {
    return 'Parent or guardian full name required';
  }
  if (consent.ack !== true) return 'Consent acknowledgment required';
  if (consent.version !== COPPA_CONSENT_VERSION)
    return 'Consent version out of date — reload the page';
  return null;
}
