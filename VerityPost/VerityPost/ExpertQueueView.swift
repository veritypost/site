import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified expert_queue 2026-04-18

/// Expert-only inbox for Ask-an-Expert questions. Only rendered when the
/// signed-in user has the `expert.queue.view` permission (sourced from
/// `PermissionService` — server-side role/tier/flag logic is consolidated
/// there so admin toggles are reflected without client changes).
/// Reads the expert_discussions table directly; writes (claim, decline,
/// answer) go through the existing /api/expert/* routes so server-side
/// authorization and back-channel notifications stay in one place.
struct ExpertQueueView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client
    private static let iso8601Fmt = ISO8601DateFormatter()

    enum QueueTab: String, CaseIterable, Identifiable {
        case pending = "Pending"
        case claimed = "Claimed"
        case answered = "Answered"
        case backChannel = "Back-channel"
        var id: String { rawValue }
    }

    @State private var activeTab: QueueTab = .pending
    @State private var items: [ExpertQueueItem] = []
    @State private var loading = true
    @State private var loadError: String?
    @State private var answerTarget: ExpertQueueItem?

    // Expert authorization is async (RPC round-trip). `nil` = checking,
    // `true` = show queue, `false` = show not-an-expert state.
    @State private var isExpert: Bool? = nil

    var body: some View {
        VStack(spacing: 0) {
            switch isExpert {
            case .none:
                ProgressView().padding(.top, 40)
            case .some(false):
                notAnExpertState
            case .some(true):
                tabStrip
                Divider().background(VP.border)
                content
            }
        }
        .navigationTitle("Expert queue")
        .navigationBarTitleDisplayMode(.inline)
        .background(VP.bg)
        .task(id: auth.currentUser?.id) { await loadExpertStatus() }
        .task(id: perms.changeToken) { await loadExpertStatus() }
        .task(id: activeTab) { await load() }
        .sheet(item: $answerTarget) { item in
            AnswerComposerSheet(item: item) { body in
                Task { await submitAnswer(for: item, body: body) }
            }
        }
    }

    // D3/D33: authorization is now sourced from PermissionService
    // (key: `expert.queue.view`). The server-side compute_effective_perms
    // RPC consolidates the moderator-bypass + is_user_expert logic.
    private func loadExpertStatus() async {
        guard auth.currentUser?.id != nil else {
            await MainActor.run { isExpert = false }
            return
        }
        await PermissionService.shared.refreshIfStale()
        let allowed = await PermissionService.shared.has("expert.queue.view")
        await MainActor.run { isExpert = allowed }
    }

    // MARK: - Tabs

    private var tabStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(QueueTab.allCases) { tab in
                    Button {
                        activeTab = tab
                    } label: {
                        Text(tab.rawValue)
                            .font(.system(.footnote, design: .default, weight: activeTab == tab ? .semibold : .regular))
                            .foregroundColor(activeTab == tab ? VP.text : VP.dim)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .overlay(alignment: .bottom) {
                                Rectangle()
                                    .fill(activeTab == tab ? VP.text : Color.clear)
                                    .frame(height: 2)
                            }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            Spacer()
            ProgressView()
            Spacer()
        } else if let err = loadError {
            errorView(err)
        } else if activeTab == .backChannel {
            backChannelBody
        } else if items.isEmpty {
            emptyState
        } else {
            queueList
        }
    }

    private var queueList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(items) { item in
                    itemRow(item)
                    Divider().background(VP.border)
                }
            }
        }
    }

    private func itemRow(_ item: ExpertQueueItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let cat = item.category {
                Text(cat.uppercased())
                    .font(.system(.caption2, design: .default, weight: .bold))
                    .tracking(1)
                    .foregroundColor(VP.dim)
            }
            Text(item.question)
                .font(.subheadline)
                .foregroundColor(VP.text)
                .lineLimit(5)
            if let asker = item.askerUsername {
                Text("Asked by \(asker)")
                    .font(.caption)
                    .foregroundColor(VP.dim)
            }
            if let ctx = item.articleTitle {
                Text("On: \(ctx)")
                    .font(.caption)
                    .foregroundColor(VP.dim)
            }
            if activeTab == .pending {
                HStack(spacing: 10) {
                    Button("Claim") {
                        Task { await claim(item) }
                    }
                    .font(.system(.caption, design: .default, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(VP.accent).cornerRadius(6)

                    Button("Decline") {
                        Task { await decline(item) }
                    }
                    .font(.system(.caption, design: .default, weight: .semibold))
                    .foregroundColor(VP.dim)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(VP.border))
                }
            } else if activeTab == .claimed {
                Button("Answer") { answerTarget = item }
                    .font(.system(.caption, design: .default, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(VP.accent).cornerRadius(6)
            } else if activeTab == .answered, let ans = item.answer {
                Text(ans)
                    .font(.footnote)
                    .foregroundColor(VP.soft)
                    .padding(.top, 4)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var backChannelBody: some View {
        VStack(spacing: 10) {
            Spacer().frame(height: 40)
            Text("Back-channel")
                .font(.system(.headline, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text("Private discussion among experts in your categories. Coming soon in a dedicated screen.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Spacer().frame(height: 60)
            Text("Nothing here")
                .font(.system(.callout, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
            Text(emptyMessage)
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
    }

    private var emptyMessage: String {
        switch activeTab {
        case .pending: return "No pending questions in your categories."
        case .claimed: return "Nothing claimed. Head to Pending to pick one up."
        case .answered: return "No answered questions yet."
        case .backChannel: return ""
        }
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 8) {
            Spacer().frame(height: 60)
            Text("Couldn\u{2019}t load queue")
                .font(.system(.callout, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
            Text(msg).font(.footnote).foregroundColor(VP.dim)
            Button("Try again") { Task { await load() } }
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 22).padding(.vertical, 10)
                .frame(minHeight: 44)
                .background(VP.accent).cornerRadius(10)
                .padding(.top, 6)
            Spacer()
        }
    }

    private var notAnExpertState: some View {
        VStack(spacing: 8) {
            Spacer()
            Text("Experts only")
                .font(.system(.headline, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text("The expert queue is available to verified experts. If you think you should have access, contact support.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
    }

    // MARK: - Data

    // Round A (092b_rls_lockdown_followup, 2026-04-19): direct
    // `expert_queue_items` table reads are revoked from the authenticated
    // role (N-01 service-only). Swap to the existing web API
    // `GET /api/expert/queue?status=...` which runs on the service client
    // and enforces the `expert.queue.view` permission server-side. Writes
    // (claim/decline/answer) already route through /api/expert/*.
    private func load() async {
        guard isExpert == true else { return }
        await MainActor.run { loading = true; loadError = nil }
        do {
            struct Row: Decodable {
                let id: String
                let status: String?
                let created_at: String?
                let article_id: String?
                let comments: CommentRef?
                let answer: AnswerRef?
                let articles: ArticleRef?
                let asker: AskerRef?
                let category: CategoryRef?
                struct CommentRef: Decodable { let body: String? }
                struct AnswerRef: Decodable { let id: String?; let status: String? }
                struct ArticleRef: Decodable { let title: String? }
                struct AskerRef: Decodable {
                    let username: String?
                    let verity_score: Int?
                }
                struct CategoryRef: Decodable {
                    let id: String?
                    let name: String?
                }
            }
            struct Resp: Decodable { let items: [Row] }

            let site = SupabaseManager.shared.siteURL
            let statusParam: String
            switch activeTab {
            case .pending: statusParam = "pending"
            case .claimed: statusParam = "claimed"
            case .answered: statusParam = "answered"
            case .backChannel: statusParam = "pending"
            }
            guard let url = URL(string: "/api/expert/queue?status=\(statusParam)", relativeTo: site) else {
                await MainActor.run { loadError = "Network issue."; loading = false }
                return
            }
            guard let session = try? await client.auth.session else {
                await MainActor.run { loadError = "Network issue."; loading = false }
                return
            }
            var req = URLRequest(url: url)
            req.httpMethod = "GET"
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")

            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                await MainActor.run { loadError = "Network issue."; loading = false }
                return
            }

            let resp = try JSONDecoder().decode(Resp.self, from: data)
            let mapped: [ExpertQueueItem] = resp.items.map { r in
                // The API returns answer comment id/status (not body). The
                // previous direct-table read surfaced the body; keep the
                // field populated with a placeholder so existing UI that
                // checks `answer != nil` still reflects answered state.
                let answerBody: String? = (r.answer?.id != nil) ? "" : nil
                return ExpertQueueItem(
                    id: r.id,
                    question: r.comments?.body ?? "",
                    status: r.status,
                    answer: answerBody,
                    category: r.category?.name,
                    articleId: r.article_id,
                    articleTitle: r.articles?.title,
                    createdAt: r.created_at.flatMap { ExpertQueueView.iso8601Fmt.date(from: $0) },
                    askerUsername: r.asker?.username
                )
            }
            await MainActor.run {
                items = mapped
                loading = false
            }
        } catch {
            await MainActor.run {
                loadError = "Network issue."
                loading = false
            }
        }
    }

    private func claim(_ item: ExpertQueueItem) async {
        await callRoute(path: "/api/expert/queue/\(item.id)/claim", body: [:])
    }
    private func decline(_ item: ExpertQueueItem) async {
        await callRoute(path: "/api/expert/queue/\(item.id)/decline", body: [:])
    }
    private func submitAnswer(for item: ExpertQueueItem, body: String) async {
        await callRoute(path: "/api/expert/queue/\(item.id)/answer", body: ["answer": body])
        answerTarget = nil
    }

    private func callRoute(path: String, body: [String: String]) async {
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: path, relativeTo: site) else { return }
        guard let session = try? await client.auth.session else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        _ = try? await URLSession.shared.data(for: req)
        await load()
    }
}

// MARK: - Model

struct ExpertQueueItem: Codable, Identifiable {
    let id: String
    var question: String
    var status: String?
    var answer: String?
    var category: String?
    var articleId: String?
    var articleTitle: String?
    var createdAt: Date?
    var askerUsername: String?

    enum CodingKeys: String, CodingKey {
        case id, question, status, answer, category
        case articleId = "article_id"
        case articleTitle = "article_title"
        case createdAt = "created_at"
        case askerUsername = "asker_username"
    }
}

// MARK: - Answer composer sheet

private struct AnswerComposerSheet: View {
    let item: ExpertQueueItem
    var onSubmit: (String) -> Void
    @Environment(\.dismiss) var dismiss
    @State private var answerText: String = ""
    @State private var composerTab = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Text(item.question)
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Picker("", selection: $composerTab) {
                    Text("Edit").tag(0)
                    Text("Preview").tag(1)
                }
                .pickerStyle(.segmented)

                if composerTab == 0 {
                    TextEditor(text: $answerText)
                        .frame(minHeight: 200)
                        .padding(10)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                } else {
                    ScrollView {
                        let attributed = try? AttributedString(markdown: answerText)
                        Text(attributed ?? AttributedString(answerText))
                            .font(.system(.body))
                            .foregroundColor(VP.text)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(minHeight: 200)
                    .padding(10)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                }

                Spacer()
            }
            .padding(16)
            .navigationTitle("Answer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Submit") {
                        let trimmed = answerText.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !trimmed.isEmpty {
                            onSubmit(trimmed)
                            dismiss()
                        }
                    }
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .disabled(answerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
