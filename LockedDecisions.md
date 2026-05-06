# Locked Decisions

Read this before making any change. Nothing here changes without explicit owner say-so.

---

1. **/login** — Email-only single door, no H1, no visible label, placeholder is "Email Address", T&C consent line below submit. Only two exit paths: valid OTP → in, or "Request access →" /request-access. No "having trouble" link, no contact link, no recovery flow.

2. **/request-access** — Canonical URL for Early Access signup. Single email field only, no name field, no reason textarea. H1: "request early access" (lowercase), submit: "send it →". Footer: "already have an account? sign in" → /login.

3. **Email placeholder** — Every email input on web and iOS uses the literal placeholder "Email Address". No alternatives.

4. **CSP / nonce** — Nonce flow lives at the root layout level. RootLayout is async and reads x-nonce. Per-page force-dynamic wrappers are forbidden (4/4 panel verdict). tpc.googlesyndication.com excluded until non-personalized AdSense gate exists. AdSense origins deferred until publisher ID is approved.

5. **NavWrapper** — loggedIn flag flips on auth presence, not after profile fetch completes. setLoggedIn(true) stays hoisted above the users SELECT and refreshAllPermissions awaits. Reverting brings back the 1-2s lag.

6. **Beta gate allowlist** — Only /terms and /privacy are reachable by anon during Early Access. Adding any other surface requires owner approval.

7. **iOS consent** — LoginView.swift mirrors web: link to /terms + /privacy below submit. SignupView.swift already has the COPPA-gated checkbox — do NOT add a second consent line there.

8. **Owner-mode (/profile)** — Any admin.owner_mode holder has full edit access to every section of /profile on web and iOS. The permissions.js short-circuits (4 sites), ProfileApp.tsx predicates, AppShell.tsx "Admin view" pill, and PermissionService.swift short-circuit are one coherent contract — do not weaken any part.

9. **No color-per-tier** — Tiers are labels, not a visual identity.

10. **No "Generate All" buttons** — Generation is per-AudienceCard only.

11. **Single model picker** — One dropdown at top of Discovery tab. AudienceCards have no model UI.

12. **No keyboard shortcuts in admin** — Click-driven only.

13. **No user-facing timelines** — No "coming soon" or "in the next pass" anywhere shippable.

14. **Email notifications are security-only** — Password reset, email verify, billing receipts, deletion notices only.

15. **Kids product is iOS only** — Kids web is redirect/promo only, no active dev.

16. **Launch-phase hides stay in code** — Unhide is a one-line flip, never delete.

17. **Production domain is veritypost.com** — Never veritypost**s**.com.

18. **Every change covers all platforms** — Any fix or feature must be applied to web (desktop + mobile), iOS, and iOS Kids when applicable. Explicitly state "not applicable" for any platform that's exempt. A change is not done until all applicable platforms are addressed in the same pass.
