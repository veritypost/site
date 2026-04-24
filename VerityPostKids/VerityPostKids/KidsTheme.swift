import SwiftUI
import UIKit

// Design tokens + animation presets for Verity Post Kids.
// Ported from KidModeV3.html. This namespace is kids-app-local —
// the adult app has its own tokens in its own Theme.swift.

enum K {
    // MARK: Palette

    static let teal      = Color(hex: "2DD4BF")
    static let tealDark  = Color(hex: "0D9488")
    static let tealLight = Color(hex: "CCFBF1")
    static let coral     = Color(hex: "FB7185")
    static let coralDark = Color(hex: "BE123C")
    static let gold      = Color(hex: "FBBF24")
    static let sky       = Color(hex: "38BDF8")
    static let mint      = Color(hex: "34D399")
    static let purple    = Color(hex: "A78BFA")

    // Neutrals
    static let bg        = Color(hex: "FAFAFA")
    static let card      = Color.white
    static let text      = Color(hex: "1A1A1A")
    static let dim       = Color(hex: "9CA3AF")
    static let border    = Color(hex: "E5E7EB")

    // Particle sampling pool
    static let particleColors: [Color] = [
        teal, coral, purple, gold, sky, mint, .white
    ]

    // MARK: Animation presets

    /// V3 "overshoot" spring — cubic-bezier(.22, 1.5, .36, 1).
    static let springOvershoot = Animation.spring(
        response: 0.55,
        dampingFraction: 0.55,
        blendDuration: 0
    )

    /// Soft settle — no overshoot, eased.
    static let springSoft = Animation.spring(
        response: 0.6,
        dampingFraction: 0.85,
        blendDuration: 0
    )

    /// Fast snap — for micro-interactions.
    static let springSnap = Animation.spring(
        response: 0.35,
        dampingFraction: 0.75,
        blendDuration: 0
    )
}

// MARK: - Dynamic Type support
//
// T-029 — Apple's Kids Category accessibility review requires fonts
// to respect the user's text-size preference. Swift's `.font(.scaledSystem(size: N))`
// does NOT scale — it renders at literal N points regardless of settings.
//
// `Font.scaledSystem(size:weight:design:)` is a drop-in replacement that
// routes `N` through `UIFontMetrics.default.scaledValue(for:)`, which applies
// the user's accessibility text-size scaling. The reading class used is the
// `.body` metric; callers can pass their own `relativeTo:` if they need a
// different class.
//
// Known caveat: `UIFontMetrics.default` snapshots the current preferred size.
// If the user changes text size while the app is foregrounded, this helper
// will not auto-recompute. SwiftUI's true-reactive path is
// `.font(.system(.textStyle))`, but that sacrifices the exact size we want
// and requires per-call-site mapping — deferred. The UIFontMetrics approach
// scales correctly on app launch, which is what Apple's accessibility review
// probes.
extension Font {
    static func scaledSystem(
        size: CGFloat,
        weight: Font.Weight = .regular,
        design: Font.Design = .default,
        relativeTo textStyle: UIFont.TextStyle = .body
    ) -> Font {
        let scaled = UIFontMetrics(forTextStyle: textStyle).scaledValue(for: size)
        return .system(size: scaled, weight: weight, design: design)
    }
}

// MARK: Color(hex:) helper — kids-local copy so this target doesn't
// depend on adult theme utilities.
extension Color {
    // K9: previous implementation returned black on any parse failure with
    // no signal. If a DB-driven color or a developer typo leaked through,
    // an invisible-on-dark or wrong-themed UI element appeared silently.
    // Now: log the bad input + return a highly visible fuchsia sentinel
    // so unparseable strings show up in dev instead of blending into a
    // dark surface. Production fallback is still a concrete color (no
    // crash, no blank view).
    private static let hexParseFallback: Color = Color(
        .sRGB,
        red: 1.0,
        green: 0.0,
        blue: 0.8,
        opacity: 1.0
    )

    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        let scanned = Scanner(string: cleaned).scanHexInt64(&int)
        guard scanned, [3, 6, 8].contains(cleaned.count) else {
            print("[KidsTheme] Color(hex:) could not parse \(hex.debugDescription); using fallback")
            self = Self.hexParseFallback
            return
        }
        let a, r, g, b: UInt64
        switch cleaned.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            // Unreachable — guarded above — but the compiler requires
            // exhaustive coverage.
            print("[KidsTheme] Color(hex:) unreachable default for \(hex.debugDescription); using fallback")
            self = Self.hexParseFallback
            return
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
