import SwiftUI
import UIKit

enum VP {
    // === Legacy tokens ===
    // Mirror site/src/app/globals.css. Used by ~24 Swift files that have
    // not been migrated to the redesign palette. New views should reach
    // for the redesign tokens below (VP.brand, VP.ink, VP.surfaceRaised,
    // etc.) and only fall back to these where a v1.1 sweep hasn't landed.
    static let bg = Color(UIColor.systemBackground)
    static let card = Color(UIColor.secondarySystemBackground)
    static let border = Color(UIColor.separator)
    static let rule = Color(UIColor.separator)
    static let strong = Color(UIColor.label)
    static let text = Color(UIColor.label)
    static let soft = Color(UIColor.secondaryLabel)
    static let dim = Color(UIColor.secondaryLabel)
    static let muted = Color(UIColor.tertiaryLabel)
    static let accent = Color(UIColor.label)
    // Q-D4 (2026-05-12) — semantic colors are DYNAMIC. Light mode uses the
    // deeper hexes that clear WCAG AA on tinted `*Soft` backgrounds; dark
    // mode flips to the brighter web-dark counterparts (mirroring
    // globals.css `--p-success`/`warn`/`danger`/`info` dark-block values)
    // so text on near-black system surfaces also clears AA. Without this
    // closure form, the deeper light hexes drop to ~3:1 in dark mode and
    // fail AA on every callsite that puts success/warn/info text directly
    // on `VP.bg` / `systemBackground`. Aliases `right`/`amber`/`wrong`
    // track their semantic parent (lazy reference to the same Color).
    //
    // Bright variants (`successBright`, `warnBright`) stay STATIC and are
    // for decoration-only fills (dots, accent bars) — already luminous
    // enough on either background, no contrast burden.
    static let success = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 0x22/255.0, green: 0xc5/255.0, blue: 0x5e/255.0, alpha: 1)  // #22c55e
            : UIColor(red: 0x15/255.0, green: 0x80/255.0, blue: 0x3d/255.0, alpha: 1)  // #15803d
    })
    static let right = success
    // Warn light hex deepened to #92400e (amber-800) — `#b45309` came in at
    // 4.34:1 on `#fef3c7`, falling 0.16 short of AA normal. `#92400e`
    // clears 6.35:1.
    static let warn = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 0xfb/255.0, green: 0xbf/255.0, blue: 0x24/255.0, alpha: 1)  // #fbbf24
            : UIColor(red: 0x92/255.0, green: 0x40/255.0, blue: 0x0e/255.0, alpha: 1)  // #92400e
    })
    static let amber = warn
    // C10 / DA-055 — `#b91c1c` light pushes danger-on-tint above 7:1;
    // `#f87171` dark mirrors web's dark-block `--p-danger`. Saturated
    // alert-red lives on `breaking` for home banner / "breaking news".
    static let danger = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 0xf8/255.0, green: 0x71/255.0, blue: 0x71/255.0, alpha: 1)  // #f87171
            : UIColor(red: 0xb9/255.0, green: 0x1c/255.0, blue: 0x1c/255.0, alpha: 1)  // #b91c1c
    })
    static let wrong = danger
    static let info = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 0x60/255.0, green: 0xa5/255.0, blue: 0xfa/255.0, alpha: 1)  // #60a5fa
            : UIColor(red: 0x1d/255.0, green: 0x4e/255.0, blue: 0xd8/255.0, alpha: 1)  // #1d4ed8
    })
    static let breaking = Color(hex: "ef4444")
    // Bright variants for decoration-only fills (no text overlay). Static
    // because they're already AA on either background as a fill, and they
    // need to stay punchy across both modes.
    static let successBright = Color(hex: "22c55e")
    static let warnBright    = Color(hex: "f59e0b")
    static let tlLine = Color(UIColor.separator)
    static let tlDot = Color(UIColor.separator)

    // Quiz badge backgrounds
    static let passBg = Color(hex: "f0fdf4")
    static let passBorder = Color(hex: "bbf7d0")
    static let failBg = Color(hex: "fef2f2")
    static let failBorder = Color(hex: "fecaca")

    // Activity type colors
    static let readBg = Color(hex: "eff6ff")
    static let readColor = Color(hex: "3b82f6")
    static let readBorder = Color(hex: "bfdbfe")

    static let quizBg = Color(hex: "f5f3ff")
    static let quizColor = Color(hex: "8b5cf6")
    static let quizBorder = Color(hex: "ddd6fe")

    static let commentBg = Color(hex: "f0fdf4")
    static let commentColor = Color(hex: "22c55e")
    static let commentBorder = Color(hex: "bbf7d0")

    // Kids color options
    static let kidColors: [String] = [
        "#10b981", "#f59e0b", "#3b82f6", "#f43f5e",
        "#8b5cf6", "#ec4899", "#6366f1", "#14b8a6"
    ]

    // Milestone tiers
    static let tiers = [1, 5, 10, 25, 50, 100]

    static func nextTier(for count: Int) -> Int {
        tiers.first(where: { count < $0 }) ?? tiers.last ?? 100
    }

    // === Redesign tokens (mirrors web/src/app/profile/_lib/palette.ts) ===
    // Role-based naming. Used by ProfileView hero, SettingsView hub +
    // chrome + drill-ins, and InviteFriendsView. Other surfaces stay on
    // the legacy tokens above until a wider sweep migrates them.

    // Brand (replaces black `accent` for redesigned surfaces only)
    static let brand     = Color(hex: "0b5cff")
    static let brandSoft = Color(hex: "e6efff")
    static let brandInk  = Color(hex: "ffffff")
    /// Focus-ring tint — 30% brand. Use via .vpShadowRing() on focused controls.
    static let ring      = Color(red: 11.0 / 255, green: 92.0 / 255, blue: 255.0 / 255, opacity: 0.30)

    // Ink ramp (5 levels of neutral text emphasis)
    static let ink       = Color(UIColor.label)
    static let inkSoft = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 0xe4/255.0, green: 0xe4/255.0, blue: 0xe7/255.0, alpha: 1)
            : UIColor(red: 0x27/255.0, green: 0x27/255.0, blue: 0x2a/255.0, alpha: 1)
    })
    static let inkMuted  = Color(UIColor.secondaryLabel)
    static let inkDim = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 0xa1/255.0, green: 0xa1/255.0, blue: 0xaa/255.0, alpha: 1)
            : UIColor(red: 0x71/255.0, green: 0x71/255.0, blue: 0x7a/255.0, alpha: 1)
    })
    static let inkFaint  = Color(UIColor.tertiaryLabel)

    // Surface ramp (depth via lightness, not shadow)
    static let surface = Color(UIColor { tc in
        tc.userInterfaceStyle == .dark
            ? UIColor(red: 0x11/255.0, green: 0x11/255.0, blue: 0x13/255.0, alpha: 1)
            : UIColor(red: 0xfa/255.0, green: 0xfa/255.0, blue: 0xfa/255.0, alpha: 1)
    })
    static let surfaceRaised = Color(UIColor.systemBackground)
    static let surfaceSunken = Color(UIColor.secondarySystemBackground)

    // Lines (3 grades — soft for cards, strong for outlined controls, divider for inter-row)
    static let borderSoft   = Color(UIColor.separator)
    static let borderStrong = Color(UIColor.separator)
    static let divider      = Color(UIColor.separator)

    // Soft semantic backgrounds (use with full-tone text from existing semantics)
    static let successSoft = Color(hex: "dcfce7")
    static let warnSoft    = Color(hex: "fef3c7")
    static let dangerSoft  = Color(hex: "fee2e2")
    static let infoSoft    = Color(hex: "e6efff")

    // Verified / expert badges
    static let verified    = Color(hex: "0b5cff")
    // Green is the expert identity across surfaces (comment filter pill,
    // megaphone glyph, web parity). Flipped from purple #7c3aed to match
    // the long-standing inline comments — owner-decision 2026-05-14.
    static let expertColor = Color(hex: "16a34a")

    // v2 burgundy editorial palette — mirrors the --vp-* CSS tokens in
    // web/src/app/globals.css. Locked-light: stays burgundy in both light
    // and dark UIInterfaceStyle (same call the article + home web
    // migrations made). Add new v2 iOS surfaces by reaching for these,
    // not by re-hardcoding hex literals.
    static let burgundy       = Color(hex: "8b0f16")
    static let burgundyDark   = Color(hex: "64090e")
    static let burgundySoft   = Color(hex: "f4e6e2")
    static let burgundyBorder = Color(hex: "ded8ce")
    static let burgundyBorderSoft = Color(hex: "eee8df")
    static let burgundyBg = Color(hex: "f7f4ef")
    static let burgundySurfaceSoft = Color(hex: "fbf7ef")
    static let burgundyQuizBorder = Color(hex: "e4cdb8")
    static let burgundyTextMuted = Color(hex: "66615a")
    static let burgundyTextSoft = Color(hex: "8a8379")

    // Section A — comment-tag chip colors. Mirror the hex literals on
    // the web side (CommentRow.tsx → TAG_META). 'context' reuses
    // VP.accent on purpose (no rainbow per the no-color-per-tier rule —
    // tags are utility, not status).
    static let tagCiteNeeded = Color(hex: "ea580c")
    static let tagOffTopic   = Color(hex: "6b7280")

    /// Spacing scale (px). 4-base, 8-grid. Verbose paths (VP.Spacing.s4)
    /// over single-letter top-levels to avoid collision with Swift generic
    /// parameter conventions (e.g. `func foo<S: View>`).
    enum Spacing {
        static let s0: CGFloat = 0
        static let s1: CGFloat = 4
        static let s2: CGFloat = 8
        static let s3: CGFloat = 12
        static let s4: CGFloat = 16
        static let s5: CGFloat = 20
        static let s6: CGFloat = 24
        static let s7: CGFloat = 32
        static let s8: CGFloat = 40
        static let s9: CGFloat = 56
        static let s10: CGFloat = 72
    }

    /// Type scale. Hero uses serif via Font.system(_, design: .serif).
    enum Size {
        static let xs: CGFloat = 11
        static let sm: CGFloat = 13
        static let base: CGFloat = 15
        static let md: CGFloat = 16
        static let lg: CGFloat = 18
        static let xl: CGFloat = 22
        static let xxl: CGFloat = 28
        static let display: CGFloat = 36
    }

    /// Corner radii.
    enum Radius {
        static let sm: CGFloat = 6
        static let md: CGFloat = 10
        static let lg: CGFloat = 14
        static let xl: CGFloat = 20
        static let pill: CGFloat = 999
    }

    // Legacy radius scale — Q-D2 (2026-05-12) aliased the legacy ramp onto
    // the canonical `Radius.*` enum. 268 callsites still reference these;
    // a dedicated sweep wave will migrate them post-launch, at which point
    // these constants get deleted. Do not add new callers — reach for
    // `VP.Radius.sm`/`md`/`lg`/`xl`/`pill` directly on new views.
    static let radiusXS:   CGFloat = Radius.sm   // 4 → 6
    static let radiusSM:   CGFloat = Radius.sm   // 8 → 6
    static let radiusMD:   CGFloat = Radius.md   // 12 → 10
    static let radiusLG:   CGFloat = Radius.lg   // 16 → 14
    static let radiusFull: CGFloat = Radius.pill // 99 → 999 (visually identical)

    // Kid-specific radii
    static let kidRadius:     CGFloat = 22  // kid category tiles
    static let kidCardRadius: CGFloat = 18  // kid cards
}

// MARK: - Redesign shadow modifiers
//
// Two-stack ambient shadow approximates the web `box-shadow:
// 0 1px 2px rgba(15,15,15,0.04), 0 1px 3px rgba(15,15,15,0.06)`.
// IMPORTANT: place .vpShadowAmbient AFTER .clipShape — a shadow before
// the clip gets clipped to invisibility.

extension View {
    /// Ambient card shadow. Single-pass — every `.shadow` is an off-screen
    /// render pass; stacked on every card in a ScrollView the cost compounds.
    /// One pass tuned for "subtle depth on white" reads ~95% the same as the
    /// two-stack web reference and keeps frame time honest on older devices.
    func vpShadowAmbient() -> some View {
        self.shadow(color: Color.black.opacity(0.06), radius: 2, x: 0, y: 1)
    }

    /// Elevated shadow for floating controls (sheets, popovers). Single-pass
    /// for the same reason as ambient — sheet/popover surfaces are smaller
    /// and fewer per screen, but the principle holds.
    func vpShadowElevated() -> some View {
        self.shadow(color: Color.black.opacity(0.10), radius: 8, x: 0, y: 3)
    }

    /// Focus ring overlay. Use as a strokeBorder on the *outside* of the
    /// element. SwiftUI shadow doesn't render a clean ring shape, so we
    /// stroke instead.
    func vpShadowRing() -> some View {
        self.overlay(
            RoundedRectangle(cornerRadius: VP.Radius.md, style: .continuous)
                .stroke(VP.ring, lineWidth: 3)
        )
    }
}

// MARK: - Color hex init

extension Color {
    /// Parse `"#RRGGBB"` / `"RRGGBB"` into a `Color`. On a malformed input,
    /// emit a debug log and fall back to `VP.muted` (#999999) instead of
    /// silently producing pure black — black is also a valid palette tone
    /// (`VP.text`, `VP.accent`), so a parser failure used to be
    /// indistinguishable from an intentional dark color and any wrong
    /// color_hex coming back from the server (`null`, empty, four hex
    /// digits, "transparent") rendered as deliberate black.
    init(hex raw: String) {
        let trimmed = raw.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let scanner = Scanner(string: trimmed)
        var rgb: UInt64 = 0
        let scanned = scanner.scanHexInt64(&rgb)
        // 6-hex-digit RRGGBB only. Reject 3-digit / 8-digit / empty so the
        // muted fallback wins instead of an under-/over-shifted bit pattern.
        guard scanned, trimmed.count == 6, scanner.isAtEnd else {
            // Log only — never crash. User data (users.avatar_color,
            // kid colors, server-stored hex) flows through this parser
            // and historically has accepted 3-digit shorthands, nulls,
            // and other shapes. A crash on debug would abort-trap the
            // simulator on any profile with a non-canonical avatar hex.
            // Token typos are caught by visual audit + the muted-fallback
            // rendering in dev (clearly broken color = clearly typo).
            Log.d("[Color(hex:)] malformed input — falling back to VP.muted:", raw)
            self = Color(red: 0x99 / 255, green: 0x99 / 255, blue: 0x99 / 255)
            return
        }
        let r = Double((rgb >> 16) & 0xFF) / 255
        let g = Double((rgb >> 8) & 0xFF) / 255
        let b = Double(rgb & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }

    /// Dark-mode-aware peer of `Color(hex:)`. In dark trait, lifts the
    /// input's HSB brightness by +0.22 (clamped to 1.0) so deliberately
    /// dark band fills — `#1a1a2e` style navies, `#1b2a1b` style forest
    /// greens — gain edge against `systemBackground` (~B 0.06–0.11 on
    /// OLED dark). In light trait returns the input unchanged. Hue and
    /// saturation are preserved so the per-category color identity stays
    /// recognisable across modes; relative relationships (politics-cooler-
    /// than-markets, etc.) are intact.
    ///
    /// Picked over manual 16-hex-pick 2026-05-13 panel (2-1 majority).
    /// Owner-judgment trade-off: if a specific category lands muddy in
    /// dark mode (space / ai / near-pure-black hexes are the likeliest
    /// candidates), the fix is to inject a per-slug override in
    /// HomeView.categoryPalette, not to abandon the algorithmic lift.
    init(hex raw: String, adaptive: Bool) {
        guard adaptive else { self.init(hex: raw); return }
        let base = UIColor(Color(hex: raw))
        self = Color(uiColor: UIColor { tc in
            guard tc.userInterfaceStyle == .dark else { return base }
            var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            guard base.getHue(&h, saturation: &s, brightness: &b, alpha: &a) else { return base }
            return UIColor(hue: h,
                           saturation: s,
                           brightness: min(1, b + 0.22),
                           alpha: a)
        })
    }
}

// MARK: - Avatar (plain circle fill + up to 3 chars)
// Matches site's Avatar component. Plain circle filled with avatar_color (outer).
// No ring, no border, no score/tier-derived color. When users.avatar jsonb is
// populated it provides outer/initials; until then we fall back to avatar_color +
// first letter of username.

struct AvatarView: View {
    let outer: Color
    let inner: Color
    let initials: String
    let textColor: Color?
    let size: CGFloat

    init(outerHex: String? = nil, innerHex: String? = nil, initials: String, textHex: String? = nil, size: CGFloat = 32) {
        self.outer = Color(hex: outerHex ?? "777777")
        self.inner = innerHex.flatMap { Color(hex: $0) } ?? .clear
        self.initials = String(
            initials.filter { $0.isLetter || $0.isNumber }.prefix(3)
        )
        self.textColor = textHex.flatMap { Color(hex: $0) }
        self.size = size
    }

    // Convenience for a `VPUser`. Reads metadata.avatar (outer/inner/initials/
    // textColor) when set; falls back to legacy avatar_color + first letter of
    // username so existing accounts render cleanly until they customise.
    init(user: VPUser?, size: CGFloat = 32) {
        let avatar = user?.avatar
        let outer = avatar?.outer ?? user?.avatarColor
        let inner = avatar?.inner
        let fallbackLetter = user?.username?.prefix(1).description ?? user?.email?.prefix(1).description ?? "?"
        let initials = avatar?.initials ?? fallbackLetter
        self.init(
            outerHex: outer,
            innerHex: inner,
            initials: initials,
            textHex: avatar?.textColor,
            size: size
        )
    }

    private var resolvedTextColor: Color {
        if let t = textColor { return t }
        return .white
    }

    var body: some View {
        ZStack {
            Circle().fill(outer)
            Text(initials)
                // Avatar initials sized relative to the avatar frame (not Dynamic
                // Type) so the letter always fits inside the circle. Caller sizes
                // the avatar; the letter follows.
                .font(.system(size: max(9, size * 0.36), weight: .semibold))
                .foregroundColor(resolvedTextColor)
                .tracking(initials.count > 1 ? -0.3 : 0)
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Verification badge (expert / is_verified_public_figure)

struct VerifiedBadgeView: View {
    let isExpert: Bool?
    let isVerifiedPublicFigure: Bool?
    var size: CGFloat = 10

    init(isExpert: Bool?, isVerifiedPublicFigure: Bool?, size: CGFloat = 10) {
        self.isExpert = isExpert
        self.isVerifiedPublicFigure = isVerifiedPublicFigure
        self.size = size
    }

    init(user: VPUser?, size: CGFloat = 10) {
        self.isExpert = user?.isExpert
        self.isVerifiedPublicFigure = user?.isVerifiedPublicFigure
        self.size = size
    }

    var body: some View {
        let isExpert = self.isExpert == true
        let isVerified = isVerifiedPublicFigure == true
        if isExpert || isVerified {
            let color: Color = isExpert ? VP.accent : VP.right
            Text(isExpert ? "Expert" : "Verified")
                // Inline badge — caller controls the pixel size so the pill
                // scales with the surrounding layout rather than Dynamic Type.
                .font(.system(size: size, weight: .semibold))
                .foregroundColor(color)
                .padding(.horizontal, 5)
                .padding(.vertical, 1)
                .background(color.opacity(0.12))
                .cornerRadius(4)
        }
    }
}

// MARK: - Stat row (label + value/total + bar). Mirrors site's StatRow.

struct StatRowView: View {
    let label: String
    let value: Int
    let total: Int
    /// Default flipped to brand blue 2026-04-28: per-category progress
    /// (1-of-10-articles meters) is engagement, not tier identity, so brand
    /// expression is appropriate here. Callers can opt out via explicit
    /// `color:` param.
    var color: Color = VP.brand

    private var pct: CGFloat {
        total > 0 ? min(1, CGFloat(value) / CGFloat(total)) : 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label)
                    .font(.caption)
                    .foregroundColor(VP.dim)
                Spacer()
                Text(total > 0 ? "\(value)/\(total)" : "\(value)")
                    .font(.system(.caption, design: .default, weight: .medium))
                    .foregroundColor(value > 0 ? VP.text : VP.dim)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2).fill(VP.border).frame(height: 4)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(color)
                        .frame(width: geo.size.width * pct, height: 4)
                        .animation(.easeOut(duration: 0.3), value: pct)
                }
            }
            .frame(height: 4)
        }
        .padding(.bottom, 8)
    }
}

// MARK: - Reusable pill button style

struct PillButton: View {
    let label: String
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(.footnote, design: .default, weight: .semibold))
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .background(isActive ? VP.brand : Color(UIColor.systemBackground))
                .foregroundColor(isActive ? .white : VP.dim)
                .overlay(
                    RoundedRectangle(cornerRadius: 99)
                        .stroke(isActive ? VP.accent : VP.border, lineWidth: 1.5)
                )
                .clipShape(RoundedRectangle(cornerRadius: 99))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Skeleton loading bar

struct SkeletonBar: View {
    var width: CGFloat? = nil
    var height: CGFloat
    var radius: CGFloat = VP.radiusSM
    @State private var pulse = false

    var body: some View {
        RoundedRectangle(cornerRadius: radius)
            .fill(Color(UIColor.systemGray5))
            .frame(width: width, height: height)
            .opacity(pulse ? 0.45 : 1.0)
            .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: pulse)
            .onAppear { pulse = true }
    }
}

// MARK: - Time ago formatter

private let _timeAgoFmt: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "MMM d"
    return f
}()

func timeAgo(_ date: Date) -> String {
    let now = Date()
    let diff = now.timeIntervalSince(date)
    let mins = Int(diff / 60)
    let hours = Int(diff / 3600)
    let days = Int(diff / 86400)
    if mins < 60 { return mins <= 1 ? "just now" : "\(mins)m ago" }
    if hours < 24 { return "\(hours)h ago" }
    if days < 30 { return "\(days)d ago" }
    return _timeAgoFmt.string(from: date)
}
