# iOS Kids — Reader

**File:** `VerityPostKids/VerityPostKids/KidReaderView.swift`
**Owner:** Ive (warmth of the read), Wroblewski (page UX), the kids editorial lead.
**Depends on:** `14_KIDS_CHOREOGRAPHY.md`, `10_SUMMARY_FORMAT.md`.

---

## Current state

Per recon: scroll-based reader. Logs `reading_log` at ≥80% scroll. Dismiss button (top-left). Quiz button at end. Single retry with fallback logging (per T-018 fix in history). Text-first, no progress bar, no scroll affordance. Serviceable but stripped-down.

## What changes

### Reading progress bar

2pt-tall bar at top of scroll view. Color: kid's theme color. Updates on scroll. Visible feedback that the kid is progressing.

### Scroll to 80% — the read-complete moment

At 80% scroll (where reading_log logs):
- 15-particle confetti burst above the progress bar (not full-screen — restrained).
- Soft haptic (.soft).
- No modal, no interruption. The kid keeps scrolling to article end.

### End-of-article "Take the quiz" button

Currently appears at end of scroll. Add springy arrival: when the kid reaches the end and the button enters view, it does a springOvershoot spring-in (from opacity 0 + scale 0.9 to full). Not flashy — a small confidence signal.

Button uses `KidPressStyle`.

### Three-beat summary at top

Per `10_SUMMARY_FORMAT.md`: kids articles also carry the three-beat structure. Render them at the top of the reader, styled with the kids' rounded typography.

Format adapted for kids:
- Beat 1 (Fact): "Scientists in Australia found a new way to recycle plastic."
- Beat 2 (Context): "They use special sunlight-activated powder that breaks plastic into small parts."
- Beat 3 (Stakes): "If it works on a big scale, beaches could have way less trash."

Shorter sentences. Simpler words. Same three-beat rhythm.

### Body text

Continue using `Font.scaledSystem` for Dynamic Type support. Rounded design. Generous line spacing.

### Images (if we have them)

Most kids articles don't have images (per the image-licensing constraint). When they do, full-width with rounded corners (radius.card).

### Text highlighting (deferred to Year 2)

Considered; skipped. Tools for "tap a word to hear it" or "highlight for later" are Year 2 polish.

## Files

- `VerityPostKids/VerityPostKids/KidReaderView.swift` — progress bar, 80% moment, spring-in quiz button.

## Acceptance criteria

- [ ] Progress bar at top, fills as kid scrolls.
- [ ] 80% scroll triggers confetti + haptic.
- [ ] reading_log logs correctly (existing behavior).
- [ ] Three-beat summary at top of reader.
- [ ] End-of-article quiz button uses KidPressStyle + spring-in.
- [ ] Reduce Motion path (no confetti, instant progress bar).
- [ ] Dynamic Type scales.
- [ ] VoiceOver reads the article with correct semantic landmarks.

## Dependencies

Ship after `14_KIDS_CHOREOGRAPHY.md`, `10_SUMMARY_FORMAT.md` (summary structure).
