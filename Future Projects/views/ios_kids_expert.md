# iOS Kids — Expert Sessions

**File:** `VerityPostKids/VerityPostKids/ExpertSessionsView.swift`
**Owner:** Ali (kids ops), Thompson (editorial on expert Q&A), Zhuo (kid UX).
**Depends on:** `07_KIDS_DECISION.md`, `14_KIDS_CHOREOGRAPHY.md`.

---

## Current state

Per recon: upcoming sessions list, reads from `kid_expert_sessions`. Read-only.

## What changes

Per `07_KIDS_DECISION.md` Year 1 MVP: expert Q&A is minimal.

### Flow

1. Kid reads an article.
2. Reader view includes an "Ask an expert" button (Year 1 MVP — could be a follow-up doc).
3. Tap opens a composer: "What do you want to know about this story?"
4. Kid types a question. Parent reviews (mechanism TBD — email notification → parent app approval?).
5. Parent-approved question routes to an expert.
6. Expert answers within 7 days.
7. Kid gets notified in `ExpertSessionsView`.

### This view displays

- Upcoming sessions (scheduled Q&A or office hours).
- Pending questions (ones the kid submitted, status indicator: awaiting parent / awaiting expert / answered).
- Answered questions (expert response + kid's original question + article context).

### Tokens + press style

Standard per `14_KIDS_CHOREOGRAPHY.md`.

### Empty state

"You haven't asked any questions yet. When you read an article, tap 'Ask an expert' to send a question to someone who knows."

Warm, non-demanding.

### Notification on answer

When an expert answers, `ExpertSessionsView` row shows a small pulsing dot. Tapping opens the answer with a gentle reveal animation.

## Files

- `VerityPostKids/VerityPostKids/ExpertSessionsView.swift` — pending/answered UX, token pass.

## Acceptance criteria

- [ ] Sessions list shows upcoming + pending + answered correctly.
- [ ] Empty state warm.
- [ ] Answered rows show pulsing indicator; tap reveals answer.
- [ ] Token pass.
- [ ] Reduce Motion path.

## Dependencies

Ship after `07_KIDS_DECISION.md` (Year 1 expert Q&A scope), `14_KIDS_CHOREOGRAPHY.md`.

## What this doesn't include

- The "Ask an expert" submit flow — add as a separate doc if prioritizing.
- Real-time expert chat — explicitly not Year 1.
- Moderation queue for expert Q&A (exists in admin).
