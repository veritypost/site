import SwiftUI
import Supabase

// Upcoming expert sessions for kids. Read-only list of scheduled sessions.
// Uses existing kid_expert_sessions_select_public policy which allows any
// authenticated session (including kid JWT) to see active scheduled sessions.

struct ExpertSessionsView: View {
    @State private var sessions: [KidExpertSession] = []
    @State private var loading: Bool = true
    @State private var loadError: String? = nil

    private var client: SupabaseClient { SupabaseKidsClient.shared.client }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if loading && sessions.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if sessions.isEmpty {
                    emptyState
                } else {
                    VStack(spacing: 10) {
                        ForEach(sessions) { s in
                            card(s)
                        }
                    }
                }
                if let loadError {
                    Text(loadError)
                        .font(.system(size: 12, design: .rounded))
                        .foregroundStyle(K.coralDark)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .background(K.bg.ignoresSafeArea())
        .task { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Upcoming sessions")
                .font(.system(size: 26, weight: .black, design: .rounded))
                .foregroundStyle(K.text)
            Text("Live conversations with experts on topics you care about.")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(K.dim)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "person.2")
                .font(.system(size: 36, weight: .bold))
                .foregroundStyle(K.dim)
            Text("No sessions scheduled right now. Check back soon.")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func card(_ s: KidExpertSession) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "dot.radiowaves.left.and.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(statusColor(s.status))
                Text((s.status ?? "").uppercased())
                    .font(.system(size: 10, weight: .black, design: .rounded))
                    .kerning(1)
                    .foregroundStyle(statusColor(s.status))
            }

            Text(s.title ?? "Session")
                .font(.system(size: 18, weight: .heavy, design: .rounded))
                .foregroundStyle(K.text)

            if let desc = s.description, !desc.isEmpty {
                Text(desc)
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(K.dim)
                    .lineLimit(3)
            }

            HStack(spacing: 14) {
                if let scheduled = s.scheduledAt {
                    metaLabel(icon: "calendar", text: formatted(scheduled))
                }
                if let mins = s.durationMinutes {
                    metaLabel(icon: "clock", text: "\(mins) min")
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(K.border, lineWidth: 1)
        )
    }

    private func metaLabel(icon: String, text: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .bold))
            Text(text)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
        }
        .foregroundStyle(K.dim)
    }

    private func statusColor(_ status: String?) -> Color {
        switch status?.lowercased() {
        case "live": return K.coral
        case "scheduled": return K.teal
        default: return K.dim
        }
    }

    private func formatted(_ date: Date) -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "MMM d, h:mm a"
        return fmt.string(from: date)
    }

    private func load() async {
        loading = true
        defer { loading = false }

        do {
            let rows: [KidExpertSession] = try await client
                .from("kid_expert_sessions")
                .select("id, title, description, session_type, scheduled_at, duration_minutes, status, category_id")
                .eq("is_active", value: true)
                .in("status", values: ["scheduled", "live"])
                .order("scheduled_at", ascending: true)
                .limit(20)
                .execute()
                .value
            self.sessions = rows
            self.loadError = nil
        } catch {
            self.sessions = []
            self.loadError = "Couldn't load expert sessions"
        }
    }
}
