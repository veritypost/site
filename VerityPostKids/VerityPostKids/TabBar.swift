import SwiftUI

// Kids app bottom tab bar. Four tabs: Home, Leaderboard, Expert, Profile.
// Ported from adult KidTabBar, simplified to be kids-only (no "exit" tab).

enum KidTab: String, CaseIterable, Identifiable {
    case home, leaderboard, expert, profile

    var id: String { rawValue }

    var label: String {
        switch self {
        case .home:        return "Home"
        case .leaderboard: return "Ranks"
        case .expert:      return "Experts"
        case .profile:     return "Me"
        }
    }

    var icon: String {
        switch self {
        case .home:        return "house.fill"
        case .leaderboard: return "trophy.fill"
        case .expert:      return "person.2.fill"
        case .profile:     return "person.crop.circle.fill"
        }
    }
}

struct KidTabBar: View {
    @Binding var selected: KidTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(KidTab.allCases) { tab in
                tabButton(tab)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 10)
        .padding(.bottom, 28)
        .background(
            K.card
                .overlay(
                    Rectangle()
                        .fill(K.border)
                        .frame(height: 1),
                    alignment: .top
                )
        )
    }

    private func tabButton(_ tab: KidTab) -> some View {
        let isActive = tab == selected
        return Button {
            withAnimation(K.springSnap) {
                selected = tab
            }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: tab.icon)
                    .font(.scaledSystem(size: 22, weight: isActive ? .heavy : .semibold))
                    .foregroundStyle(isActive ? K.teal : K.dim)
                Text(tab.label)
                    .font(.scaledSystem(size: 10, weight: isActive ? .bold : .semibold, design: .rounded))
                    .foregroundStyle(isActive ? K.teal : K.dim)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}

#Preview("Tab bar") {
    @Previewable @State var selected: KidTab = .home
    VStack {
        Spacer()
        KidTabBar(selected: $selected)
    }
    .background(K.bg)
}
