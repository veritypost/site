import SwiftUI

// Small reusable display primitives used across ProfileView, LeaderboardView,
// etc. Ported from adult KidViews.swift.

// MARK: - StatBubble (stat card)

struct StatBubble: View {
    let value: Int
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.scaledSystem(size: 32, weight: .black, design: .rounded))
                .foregroundStyle(color)
            Text(label)
                .font(.scaledSystem(size: 11, weight: .semibold, design: .rounded))
                .foregroundStyle(K.dim)
                .textCase(.uppercase)
                .kerning(0.5)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(K.border, lineWidth: 1)
        )
    }
}

// MARK: - BadgeTile (earned achievement)

struct BadgeTile: View {
    let achievement: UserAchievement
    let color: Color

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.15))
                    .frame(width: 56, height: 56)
                    .overlay(
                        Circle().strokeBorder(color.opacity(0.3), lineWidth: 1.5)
                    )

                Image(systemName: iconFor(achievement.achievements?.iconName))
                    .font(.scaledSystem(size: 24, weight: .bold))
                    .foregroundStyle(color)
            }

            Text(achievement.achievements?.name ?? "Badge")
                .font(.scaledSystem(size: 11, weight: .bold, design: .rounded))
                .foregroundStyle(K.text)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .padding(.horizontal, 8)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(K.border, lineWidth: 1)
        )
    }

    private func iconFor(_ name: String?) -> String {
        guard let name, !name.isEmpty else { return "star.fill" }
        // Map common stored names to SF Symbols; fall back to star.fill
        switch name.lowercased() {
        case "star", "star.fill":        return "star.fill"
        case "flame", "flame.fill":      return "flame.fill"
        case "bolt", "bolt.fill":        return "bolt.fill"
        case "crown", "crown.fill":      return "crown.fill"
        case "trophy", "trophy.fill":    return "trophy.fill"
        case "medal":                     return "medal.fill"
        case "book", "book.fill":        return "book.fill"
        case "shield", "shield.fill":    return "shield.fill"
        case "heart", "heart.fill":      return "heart.fill"
        default:                          return "star.fill"
        }
    }
}

// MARK: - LeaderRow (single leaderboard entry)

struct LeaderRow: View {
    let rank: Int
    let entry: LeaderboardEntry
    let accent: Color
    let isSelf: Bool

    var body: some View {
        HStack(spacing: 12) {
            // Rank badge
            ZStack {
                Circle()
                    .fill(rankBackground)
                    .frame(width: 32, height: 32)
                Text("\(rank)")
                    .font(.scaledSystem(size: 14, weight: .black, design: .rounded))
                    .foregroundStyle(rankForeground)
            }

            // Name
            Text(entry.name)
                .font(.scaledSystem(size: 15, weight: isSelf ? .heavy : .semibold, design: .rounded))
                .foregroundStyle(K.text)
                .lineLimit(1)

            Spacer()

            // Score
            Text("\(entry.score)")
                .font(.scaledSystem(size: 15, weight: .black, design: .rounded))
                .foregroundStyle(accent)
                .monospacedDigit()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(isSelf ? accent.opacity(0.08) : K.card)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(isSelf ? accent.opacity(0.4) : K.border, lineWidth: 1)
        )
    }

    private var rankBackground: Color {
        switch rank {
        case 1: return K.gold
        case 2: return Color(hex: "C0C0C0") // silver
        case 3: return Color(hex: "CD7F32") // bronze
        default: return K.card
        }
    }

    private var rankForeground: Color {
        rank <= 3 ? .white : K.dim
    }
}
