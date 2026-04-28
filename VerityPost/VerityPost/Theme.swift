import SwiftUI

enum VP {
    // Palette — mirrors site/src/app/globals.css exactly.
    // Accent is BLACK, not indigo. The site uses --accent: #111111 for all
    // primary actions and active states; the indigo shade was wrong.
    static let bg = Color.white
    static let card = Color(hex: "f7f7f7")
    static let border = Color(hex: "e5e5e5")
    static let rule = Color(hex: "e5e5e5")
    static let strong = Color(hex: "222222")
    static let text = Color(hex: "111111")
    static let soft = Color(hex: "444444")
    static let dim = Color(hex: "666666")
    static let muted = Color(hex: "999999")
    static let accent = Color(hex: "111111")
    static let success = Color(hex: "22c55e")
    static let right = Color(hex: "22c55e")
    static let warn = Color(hex: "f59e0b")
    static let amber = Color(hex: "f59e0b")
    // C10 / DA-055 — canonical `--danger` matches web globals.css. `#ef4444`
    // fails AA on the pale-red backgrounds used for error copy (`#fef2f2`);
    // `#b91c1c` pushes the ratio above 7:1. The saturated alert-red now
    // lives on `breaking` for the home banner and other "breaking news"
    // signals that want the punchier hue.
    static let danger = Color(hex: "b91c1c")
    static let wrong = Color(hex: "b91c1c")
    static let breaking = Color(hex: "ef4444")
    static let purple = Color(hex: "111111")
    static let tlLine = Color(hex: "e5e5e5")
    static let tlDot = Color(hex: "d4d4d4")

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

    // Streak heatmap cells. Track = empty day; Muted = missed read day; Active = read day.
    // Added with the ProfileView rebuild (2026-04-22) so the 30-day grid reads as
    // a first-class visual rather than reusing the form-border color.
    static let streakTrack = Color(hex: "f0f0f0")
    static let streakMissed = Color(hex: "e5e5e5")
    static let streakActive = Color(hex: "22c55e")

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
            Log.d("[Color(hex:)] malformed input — falling back to VP.muted:", raw)
            self = Color(red: 0x99 / 255, green: 0x99 / 255, blue: 0x99 / 255)
            return
        }
        let r = Double((rgb >> 16) & 0xFF) / 255
        let g = Double((rgb >> 8) & 0xFF) / 255
        let b = Double(rgb & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
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
    var color: Color = VP.accent

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
                .background(isActive ? VP.accent : Color.white)
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
