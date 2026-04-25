import SwiftUI
import Supabase

// Upcoming expert sessions for kids. Read-only list of scheduled sessions.
// Uses existing kid_expert_sessions_select_public policy which allows any
// authenticated session (including kid JWT) to see active scheduled sessions.

struct ExpertSessionsView: View {
    @State private var sessions: [KidExpertSession] = []
    @State private var loading: Bool = true
    @State private var loadError: String? = nil
    // C16 — expert sessions surface adult-contact discovery (live + scheduled
    // conversations with experts). Apple's Kids Category review requires a
    // parental gate before any such discovery. Session-sticky: pass the gate
    // once per app launch, then the tab works normally until next cold start.
    // Matches the ProfileView Unpair gate behavior.
    @State private var parentGatePassed: Bool = false
    @State private var showParentGate: Bool = false
    // Tap-to-expand sheet (regression fix for owner-reported "list I
    // can't click on"). Cards previously rendered as static VStacks with
    // no tap handler; tapping now opens a full-detail sheet.
    @State private var selectedSession: KidExpertSession? = nil

    private var client: SupabaseClient { SupabaseKidsClient.shared.client }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if !parentGatePassed {
                    parentGatePlaceholder
                } else if loading && sessions.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if sessions.isEmpty {
                    emptyState
                } else {
                    VStack(spacing: 10) {
                        ForEach(sessions) { s in
                            Button {
                                selectedSession = s
                            } label: {
                                card(s)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if parentGatePassed, let loadError {
                    VStack(spacing: 8) {
                        Text(loadError)
                            .font(.scaledSystem(size: 12, design: .rounded))
                            .foregroundStyle(K.coralDark)
                            .multilineTextAlignment(.center)
                        Button {
                            Task { await load() }
                        } label: {
                            Text("Retry")
                                .font(.scaledSystem(size: 13, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 18)
                                .padding(.vertical, 8)
                                .frame(minHeight: 36)
                                .background(K.teal)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .disabled(loading)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 4)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .background(K.bg.ignoresSafeArea())
        // C16 — gate sessions fetch behind the parental check so a kid
        // browsing the tab doesn't see any adult-contact content until a
        // parent verifies. Gate also suppresses the data egress (network
        // call) until gate passes.
        .parentalGate(isPresented: $showParentGate) {
            parentGatePassed = true
            Task { await load() }
        }
        .sheet(item: $selectedSession) { s in
            sessionDetailSheet(s)
        }
    }

    private func sessionDetailSheet(_ s: KidExpertSession) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 6) {
                    Image(systemName: "dot.radiowaves.left.and.right")
                        .font(.scaledSystem(size: 12, weight: .bold))
                        .foregroundStyle(statusColor(s.status))
                    Text((s.status ?? "").uppercased())
                        .font(.scaledSystem(size: 11, weight: .black, design: .rounded))
                        .kerning(1)
                        .foregroundStyle(statusColor(s.status))
                }
                Text(s.title ?? "Session")
                    .font(.scaledSystem(size: 24, weight: .heavy, design: .rounded))
                    .foregroundStyle(K.text)
                if let desc = s.description, !desc.isEmpty {
                    Text(desc)
                        .font(.scaledSystem(size: 15, weight: .medium, design: .rounded))
                        .foregroundStyle(K.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 14) {
                    if let scheduled = s.scheduledAt {
                        metaLabel(icon: "calendar", text: formatted(scheduled))
                    }
                    if let mins = s.durationMinutes {
                        metaLabel(icon: "clock", text: "\(mins) min")
                    }
                }
                Spacer(minLength: 12)
            }
            .padding(20)
        }
        .background(K.bg.ignoresSafeArea())
        .presentationDetents([.medium, .large])
    }

    private var parentGatePlaceholder: some View {
        VStack(spacing: 14) {
            Image(systemName: "person.2.badge.key")
                .font(.scaledSystem(size: 40, weight: .bold))
                .foregroundStyle(K.teal)
            Text("Parent check needed")
                .font(.scaledSystem(size: 18, weight: .black, design: .rounded))
                .foregroundStyle(K.text)
            Text("Expert sessions let you see and join live chats with grown-ups. A parent needs to unlock this.")
                .font(.scaledSystem(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)
            Button {
                showParentGate = true
            } label: {
                Text("Ask a grown-up")
                    .font(.scaledSystem(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .frame(minHeight: 44)
                    .background(K.teal)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, 20)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Upcoming sessions")
                .font(.scaledSystem(size: 26, weight: .black, design: .rounded))
                .foregroundStyle(K.text)
            Text("Live conversations with experts on topics you care about.")
                .font(.scaledSystem(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(K.dim)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "person.2")
                .font(.scaledSystem(size: 36, weight: .bold))
                .foregroundStyle(K.dim)
            Text("No sessions scheduled right now. Check back soon.")
                .font(.scaledSystem(size: 13, weight: .medium, design: .rounded))
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
                    .font(.scaledSystem(size: 11, weight: .bold))
                    .foregroundStyle(statusColor(s.status))
                Text((s.status ?? "").uppercased())
                    .font(.scaledSystem(size: 10, weight: .black, design: .rounded))
                    .kerning(1)
                    .foregroundStyle(statusColor(s.status))
            }

            Text(s.title ?? "Session")
                .font(.scaledSystem(size: 18, weight: .heavy, design: .rounded))
                .foregroundStyle(K.text)

            if let desc = s.description, !desc.isEmpty {
                Text(desc)
                    .font(.scaledSystem(size: 13, weight: .medium, design: .rounded))
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
                .font(.scaledSystem(size: 11, weight: .bold))
            Text(text)
                .font(.scaledSystem(size: 11, weight: .semibold, design: .rounded))
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
