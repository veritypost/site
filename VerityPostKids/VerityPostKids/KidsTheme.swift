import SwiftUI

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

// MARK: Color(hex:) helper — kids-local copy so this target doesn't
// depend on adult theme utilities.
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
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
