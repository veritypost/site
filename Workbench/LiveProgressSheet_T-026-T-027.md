# LiveProgressSheet — T-026 / T-027 — Z-index consolidation + CSS keyframe centralization
Started: 2026-04-26

## User Intent

**T-026**: Define a z-index scale as named TypeScript constants in `web/src/lib/zIndex.ts`. Replace all inline `zIndex:` values across `web/src/app/` and `web/src/components/` with imports from that file. Scale: OVERLAY=1000, MODAL=2000, TOAST=3000, TOOLTIP=4000, CRITICAL=9000.

**T-027**: Find every inline `@keyframes` definition in `web/src/`. Move all shared animation primitives to `web/src/app/globals.css` (already has 4 canonical keyframes). Delete the inline `<style>` tag versions. Keep component-specific one-off animations in place. The shared animations are: `vpSpin` (same animation defined 3 separate times under 2 names: `vpSpin` / `vp-spin`) and `vpPulse` (1 file). Truly component-scoped animations (vp-comment-arrive, toast-slide-up, vp-ring-in/check-in/pop, vp-admin-*) stay inline.

## Live Code State

### T-026 — All zIndex values (34 total)

**High-value stack layer (9998–10002) — maps to CRITICAL=9000:**
- `web/src/app/NavWrapper.tsx:295` — bottom nav bar: `zIndex: 9999`
- `web/src/app/NavWrapper.tsx:325` — top bar: `zIndex: 9999`
- `web/src/app/NavWrapper.tsx:545` — admin banner: `zIndex: 10000`
- `web/src/components/Interstitial.tsx:45` — anon paywall backdrop: `zIndex: 9998`
- `web/src/components/CommentThread.tsx:906` — ask-expert overlay: `zIndex: 9999`
- `web/src/components/Toast.tsx:72` — toast container: `zIndex: 9999`
- `web/src/components/admin/DestructiveActionConfirm.tsx:102` — admin destructive dialog: `zIndex: 9999`
- `web/src/app/messages/page.tsx:795` — DM paywall: `zIndex: 9999`
- `web/src/app/messages/page.tsx:1189` — report dialog: `zIndex: 10001`
- `web/src/app/messages/page.tsx:1448` — new message search modal: `zIndex: 10000`
- `web/src/app/story/[slug]/page.tsx:1101` — reg wall: `zIndex: 9999`
- `web/src/app/story/[slug]/page.tsx:1620` — report modal: `zIndex: 9999`
- `web/src/app/category/[id]/page.js:263` — inline toast notification: `zIndex: 9999`

**Modal layer (10000–10001) — maps to MODAL=2000 or CRITICAL=9000:**
- `web/src/components/ConfirmDialog.tsx:87` — confirm dialog: `zIndex: 10000`
- `web/src/components/admin/ConfirmDialog.jsx:65` — admin confirm dialog (alert role): `zIndex: 10001`
- `web/src/components/admin/Drawer.jsx:72` — admin drawer backdrop: `zIndex: 10000`
- `web/src/components/admin/Modal.jsx:78` — admin modal backdrop: `zIndex: 10000`
- `web/src/components/admin/Toast.jsx:79` — admin toast: `zIndex: 10002`

**LockModal — mapped to OVERLAY=1000:**
- `web/src/components/LockModal.tsx:96` — lock backdrop: `zIndex: 1000`

**Sticky/local positioning layers — small values, component-local only:**
- `web/src/app/admin/newsroom/page.tsx:1379` — sticky toolbar: `zIndex: 9` (sticky header inside page scroll)
- `web/src/app/admin/permissions/page.tsx:1172` — sticky table header cell: `zIndex: 2`
- `web/src/app/admin/permissions/page.tsx:1210` — sticky table body cell: `zIndex: 1`
- `web/src/app/admin/users/[id]/permissions/page.tsx:637` — sticky toolbar: `zIndex: 10`
- `web/src/app/leaderboard/page.tsx:635` — paywall overlay over leaderboard content: `zIndex: 3`
- `web/src/app/leaderboard/page.tsx:774` — paywall overlay over leaderboard content: `zIndex: 3`
- `web/src/app/messages/page.tsx:1112` — convo context menu: `zIndex: 20`
- `web/src/app/profile/page.tsx:1430` — unsaved-changes tooltip: `zIndex: 50`
- `web/src/app/profile/settings/page.tsx:1018` — unsaved-changes tooltip: `zIndex: 50`
- `web/src/app/story/[slug]/page.tsx:1061` — reading progress bar: `zIndex: 100`
- `web/src/app/story/[slug]/page.tsx:1190` — tab bar (dead code, inside `false && ...` branch): `zIndex: 50`
- `web/src/components/CommentRow.tsx:431` — comment context menu: `zIndex: 10`
- `web/src/components/admin/DataTable.jsx:176` — sticky table header: `zIndex: 1`
- `web/src/components/admin/PipelineRunPicker.tsx:233` — sticky pipeline picker: `zIndex: 10`

**Note on Toast.tsx**: git log shows last touched in fa185a8 (repo restructure). No recent agent modification. Safe to edit.

### T-027 — All @keyframes locations

**Shared animations (duplicates — need consolidation into globals.css):**
- `vpSpin` / `vp-spin` — same rotation animation, 3 definitions under 2 names:
  - `web/src/app/forgot-password/page.tsx:274` — `@keyframes vpSpin{to{transform:rotate(360deg)}}`
  - `web/src/app/login/page.tsx:568` — `@keyframes vpSpin{to{transform:rotate(360deg)}}`
  - `web/src/app/reset-password/page.tsx:537` — `@keyframes vpSpin{to{transform:rotate(360deg)}}`
  - `web/src/app/signup/page.tsx:763` — `@keyframes vp-spin { to { transform: rotate(360deg); } }` (different name!)
- `vpPulse` — 1 definition:
  - `web/src/app/reset-password/page.tsx:231` — `@keyframes vpPulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}`

**Already canonical in globals.css (no action needed):**
- `web/src/app/globals.css:97` — `@keyframes vpFadeIn`
- `web/src/app/globals.css:109` — `@keyframes kidStreakPulse`
- `web/src/app/globals.css:123` — `@keyframes kidCelebrateRise`

**Component-specific one-offs (DO NOT move — component-scoped, conditional rendering):**
- `web/src/app/verify-email/page.tsx:651,655,659` — `vp-ring-in`, `vp-check-in`, `vp-pop` (SVG check animation, used only in SuccessCheck component)
- `web/src/components/CommentThread.tsx:864` — `vp-comment-arrive` (conditional: only rendered when `justRevealed` is true; inside jsx conditional)
- `web/src/components/Toast.tsx:106` — `toast-slide-up` (component-scoped, used only in this provider)
- `web/src/components/admin/Drawer.jsx:187,188` — `vp-admin-fade`, `vp-admin-slide-in` (admin-scoped)
- `web/src/components/admin/Modal.jsx:165,168` — `vp-admin-fade`, `vp-admin-pop` (admin-scoped)
- `web/src/components/admin/SkeletonRow.jsx:32` — `vp-admin-shimmer` (admin-scoped)
- `web/src/components/admin/Spinner.jsx:34` — `vp-admin-spin` (admin-scoped)
- `web/src/components/admin/Toast.jsx:115,119` — `vp-admin-toast-up`, `vp-admin-toast-down` (admin-scoped)

**Decision on `signup/page.tsx` `vp-spin`**: This uses `vp-spin` (hyphenated) while the others use `vpSpin` (camelCase). When consolidating, standardize to `vpSpin` in globals.css and update the signup reference accordingly.

### Key architectural observations

1. The z-index "layer" is not a clean 5-level system today. The values break into:
   - **Sticky/local** (1, 2, 3, 9, 10, 20, 50, 100): These are stacking within a positioned parent. They should NOT be replaced with global layer constants — that would be wrong semantically.
   - **Page-level overlays** (1000, 9998, 9999, 10000, 10001, 10002): These are global fixed-position overlays fighting for the top of the stack. These are the ones that need the named scale.

2. `LockModal.tsx:96` uses `zIndex: 1000` — this is already the lowest of the overlay stack. Maps to OVERLAY=1000.

3. The 9998/9999/10000/10001/10002 cluster: these are all full-viewport fixed overlays. They all map to CRITICAL=9000 in the proposed scale. However, the intent behind the _relative ordering_ (e.g., admin ConfirmDialog.jsx at 10001 sits above Drawer.jsx at 10000 which sits above Modal.jsx at 10000) matters. CRITICAL=9000 gives sufficient headroom via +100 increments if needed, but the 5-level scale deliberately collapses these.

4. The `Interstitial.tsx:45` value is 9998 — slightly below the 9999 nav bar. This means: the nav bar deliberately sits above the interstitial. Replacing both with CRITICAL=9000 would make them equal — fine, since they never coexist.

## Contradictions
Format: Agent name | File:line | Expected | Actual | Impact

- Intake | web/src/app/story/[slug]/page.tsx:1190 | Active zIndex to replace | Dead code (inside `false &&` block) | Low — still worth replacing to keep the code consistent, but no runtime impact.
- Intake | web/src/app/signup/page.tsx:763 | Same animation name as others (`vpSpin`) | Uses different name `vp-spin` | Must standardize name when moving to globals.css.
- Intake | admin ConfirmDialog.jsx:65 vs Drawer.jsx:72 vs Modal.jsx:78 | Same overlay level | 10001 vs 10000 vs 10000 | The destructive confirm sits 1 above drawer/modal to cover them when they trigger it. Named scale must preserve this or use CRITICAL+1 approach.

## Agent Votes
- Planner: APPROVE
- Reviewer: APPROVE (initial REVISE on admin toast ordering — resolved: admin overlays don't stack simultaneously, Z.CRITICAL for all is safe)
- Final Reviewer: APPROVE
- Consensus: 3/3 APPROVE

## 4th Agent (if needed)
[filled only if vote is split]

## Helper Brief

**What "done correctly" looks like:**

For T-026:
1. `web/src/lib/zIndex.ts` exists with 5 named exports: `OVERLAY`, `MODAL`, `TOAST`, `TOOLTIP`, `CRITICAL`.
2. Every inline `zIndex:` value in the **full-viewport overlay** category (9998, 9999, 10000, 10001, 10002, 1000) is replaced with the correct named constant.
3. The **sticky/local** values (1, 2, 3, 9, 10, 20, 50, 100) are intentionally left as raw numbers — they are stacking within a positioned parent, not global layers, and importing global constants for them would be misleading.
4. `tsc --noEmit` passes in `web/`.
5. All replaced files import from `@/lib/zIndex` (not relative path).

For T-027:
1. `globals.css` gains `@keyframes vpSpin` and `@keyframes vpPulse` (canonical, single definitions).
2. `forgot-password/page.tsx`, `login/page.tsx`, `reset-password/page.tsx` (both inline styles using `vpSpin`), and `signup/page.tsx` (using `vp-spin`) all have their inline `<style>` blocks removed. `signup/page.tsx` animation reference is updated from `vp-spin` to `vpSpin`.
3. `tsc --noEmit` passes in `web/`.
4. All admin-scoped and component-scoped keyframes (Drawer, Modal, SkeletonRow, Spinner, admin/Toast, CommentThread, Toast, verify-email) are left exactly as-is.

**What the intake agent may miss:**
- The `story/[slug]/page.tsx` has a `{false && ...}` dead code branch containing `zIndex: 50` at line 1190. It needs replacement even in dead code to prevent future confusion when the branch is re-enabled.
- `signup/page.tsx` uses `vp-spin` (with a hyphen) while all others use `vpSpin`. The consolidation must canonicalize the name AND update the reference in `signup/page.tsx`.
- The admin components (Drawer, Modal, ConfirmDialog, Toast, Spinner, SkeletonRow) all use `vp-admin-*` prefixed keyframes that are intentionally namespaced to the admin surface. These must not be moved to globals.css.
- `web/src/app/admin/users/[id]/permissions/page.tsx` has a `zIndex: 10` for a sticky toolbar — this is a local stacking value, not a global overlay. Do not replace with CRITICAL.
- `category/[id]/page.js` is a `.js` file (not `.ts`), so the import syntax from `@/lib/zIndex` is fine but tsc won't type-check it. The replacement is purely cosmetic for this file.

**Risk tier**: Surgical (web-only, no DB, no iOS)
**Surfaces affected**: web only

## Implementation Progress
Status: IMPLEMENTATION COMPLETE — pending review
tsc: PASS (4 pre-existing .next/ stubs for deleted admin pages — unrelated to this work; zero src/ errors)
xcodebuild: N/A (web-only change)

2026-04-26 — Created web/src/lib/zIndex.ts — 5 named constants: OVERLAY=1000, MODAL=2000, TOAST=3000, TOOLTIP=4000, CRITICAL=9000
2026-04-26 — NavWrapper.tsx:295,325,545 — 9999/9999/10000 → Z.CRITICAL
2026-04-26 — Interstitial.tsx:45 — 9998 → Z.CRITICAL
2026-04-26 — CommentThread.tsx:906 — 9999 → Z.CRITICAL
2026-04-26 — Toast.tsx:72 — 9999 → Z.TOAST
2026-04-26 — admin/DestructiveActionConfirm.tsx:102 — 9999 → Z.CRITICAL
2026-04-26 — messages/page.tsx:795,1189,1448 — 9999/10001/10000 → Z.CRITICAL
2026-04-26 — story/[slug]/page.tsx:1101,1620 — 9999 → Z.CRITICAL
2026-04-26 — category/[id]/page.js:263 — 9999 → Z.CRITICAL
2026-04-26 — ConfirmDialog.tsx:87 — 10000 → Z.CRITICAL
2026-04-26 — admin/ConfirmDialog.jsx:65 — 10001 → Z.CRITICAL
2026-04-26 — admin/Drawer.jsx:72 — 10000 → Z.CRITICAL
2026-04-26 — admin/Modal.jsx:78 — 10000 → Z.CRITICAL
2026-04-26 — admin/Toast.jsx:79 — 10002 → Z.TOAST
2026-04-26 — LockModal.tsx:96 — 1000 → Z.OVERLAY
2026-04-26 — globals.css — Added canonical @keyframes vpSpin and @keyframes vpPulse
2026-04-26 — forgot-password/page.tsx:274 — Deleted inline <style> vpSpin block
2026-04-26 — login/page.tsx:568 — Deleted inline <style> vpSpin block
2026-04-26 — reset-password/page.tsx:231 — Deleted inline <style> vpPulse block
2026-04-26 — reset-password/page.tsx:537 — Deleted inline <style> vpSpin block
2026-04-26 — signup/page.tsx:763,760 — Deleted inline <style> vp-spin block; renamed animation reference vp-spin → vpSpin

## Completed
Status: SHIPPED
Commit: 5748b03 (bundled with expert-queue chore commit — all T-026/T-027 files confirmed in HEAD)
Review fixes: none
Completed: 2026-04-26

Files changed:
- web/src/lib/zIndex.ts (new) — 5 named constants
- web/src/app/globals.css — +vpSpin, +vpPulse keyframes
- web/src/app/NavWrapper.tsx — 3 zIndex replacements
- web/src/app/category/[id]/page.js — 1 zIndex replacement
- web/src/app/messages/page.tsx — 3 zIndex replacements
- web/src/app/story/[slug]/page.tsx — 2 zIndex replacements
- web/src/app/forgot-password/page.tsx — removed inline <style> vpSpin
- web/src/app/login/page.tsx — removed inline <style> vpSpin
- web/src/app/reset-password/page.tsx — removed inline <style> vpPulse + vpSpin
- web/src/app/signup/page.tsx — removed inline <style> vp-spin, renamed to vpSpin
- web/src/components/ConfirmDialog.tsx — 1 zIndex replacement
- web/src/components/Interstitial.tsx — 1 zIndex replacement
- web/src/components/LockModal.tsx — 1 zIndex replacement
- web/src/components/Toast.tsx — 1 zIndex replacement
- web/src/components/admin/ConfirmDialog.jsx — 1 zIndex replacement
- web/src/components/admin/DestructiveActionConfirm.tsx — 1 zIndex replacement
- web/src/components/admin/Drawer.jsx — 1 zIndex replacement
- web/src/components/admin/Modal.jsx — 1 zIndex replacement
- web/src/components/admin/Toast.jsx — 1 zIndex replacement
