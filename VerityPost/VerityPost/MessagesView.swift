import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified messaging 2026-04-18

struct MessagesView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client

    @State private var conversations: [DMConversation] = []
    @State private var loading = true
    @State private var hasDmAccess = false
    @State private var accessChecked = false
    @State private var selectedConvo: DMConversation? = nil

    // Compose / search
    @State private var showSearch = false
    @State private var showSubscription = false
    @State private var searchQuery = ""
    @State private var searchResults: [SearchUser] = []
    @State private var roleFilter = "all"
    @State private var searching = false

    struct DMConversation: Codable, Identifiable {
        let id: String
        var title: String?
        var lastMessagePreview: String?
        var lastMessageAt: Date?
        var otherUsername: String?
        var otherAvatarColor: String?
        var unread: Int = 0

        enum CodingKeys: String, CodingKey {
            case id, title
            case lastMessagePreview = "last_message_preview"
            case lastMessageAt = "last_message_at"
        }
    }

    struct SearchUser: Codable, Identifiable {
        let id: String
        var username: String?
        var avatarColor: String?
        var verityScore: Int?

        enum CodingKeys: String, CodingKey {
            case id, username
            case avatarColor = "avatar_color"
            case verityScore = "verity_score"
        }
    }

    var body: some View {
        Group {
            if !accessChecked {
                ProgressView().padding(.top, 80)
            } else if auth.currentUser == nil {
                // Not logged in
                VStack(spacing: 16) {
                    Text("Sign in to message")
                        .font(.system(.title3, design: .default, weight: .bold))
                        .foregroundColor(VP.text)
                }
                .padding(.top, 120)
            } else if !hasDmAccess {
                // Lock screen
                VStack(spacing: 12) {
                    Text("Direct Messages")
                        .font(.system(.title3, design: .default, weight: .bold))
                        .foregroundColor(VP.text)
                    Text("Direct messaging with readers, experts, and journalists is available on paid plans.")
                        .font(.subheadline)
                        .foregroundColor(VP.dim)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                    Button {
                        showSubscription = true
                    } label: {
                        Text("See paid plans")
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 28)
                            .padding(.vertical, 12)
                            .frame(minHeight: 44)
                            .background(VP.accent)
                            .cornerRadius(10)
                    }
                    .padding(.top, 8)
                }
                .padding(.top, 80)
            } else if let convo = selectedConvo {
                // Chat thread
                DMThreadView(conversation: convo, onBack: {
                    selectedConvo = nil
                    Task { await loadConversations() }
                })
                .environmentObject(auth)
            } else {
                // Conversation list
                conversationListView
            }
        }
        .background(VP.bg.ignoresSafeArea())
        .navigationTitle(selectedConvo != nil ? (selectedConvo?.otherUsername ?? "Chat") : "Messages")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if selectedConvo == nil && hasDmAccess {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSearch = true } label: {
                        Image(systemName: "square.and.pencil")
                            .font(.subheadline)
                            .foregroundColor(VP.accent)
                    }
                }
            }
        }
        .task(id: auth.currentUser?.id) { await checkAccessAndLoad() }
        .task(id: perms.changeToken) { await checkAccessAndLoad() }
        .task(id: auth.currentUser?.id) { await subscribeToConversationUpdates() }
        .task(id: auth.currentUser?.id) { await subscribeToNewParticipants() }
        .task(id: auth.currentUser?.id) { await subscribeToCrossConvoMessages() }
        .sheet(isPresented: $showSearch) { searchSheet }
        .sheet(isPresented: $showSubscription) {
            SubscriptionView().environmentObject(auth)
        }
    }

    // MARK: - Conversation List

    private var conversationListView: some View {
        ScrollView {
            if loading {
                ProgressView().padding(.top, 60)
            } else if conversations.isEmpty {
                VStack(spacing: 12) {
                    Text("No messages yet")
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                    Text("Start a conversation with another user.")
                        .font(.caption)
                        .foregroundColor(VP.dim)
                    Button {
                        showSearch = true
                    } label: {
                        Text("New message")
                            .font(.system(.footnote, design: .default, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .frame(minHeight: 44)
                            .background(VP.accent)
                            .cornerRadius(8)
                    }
                }
                .padding(.top, 80)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(conversations) { convo in
                        let isUnread = convo.unread > 0
                        Button {
                            selectedConvo = convo
                            Task { await markConversationRead(convo.id) }
                        } label: {
                            HStack(spacing: 12) {
                                // Avatar
                                Circle()
                                    .fill(Color(hex: convo.otherAvatarColor ?? "cccccc"))
                                    .frame(width: 44, height: 44)
                                    .overlay(
                                        Text(String((convo.otherUsername ?? "?").prefix(1)).uppercased())
                                            .font(.system(.callout, design: .default, weight: .bold))
                                            .foregroundColor(.white)
                                    )

                                VStack(alignment: .leading, spacing: 2) {
                                    HStack {
                                        Text(convo.otherUsername ?? "Conversation")
                                            .font(.system(.callout, design: .default, weight: isUnread ? .bold : .semibold))
                                            .foregroundColor(VP.text)
                                        Spacer()
                                        if isUnread {
                                            Text("\(convo.unread)")
                                                .font(.system(.caption, design: .default, weight: .bold))
                                                .foregroundColor(.white)
                                                .padding(.horizontal, 7)
                                                .padding(.vertical, 1)
                                                .background(VP.accent)
                                                .clipShape(Capsule())
                                        }
                                        if let date = convo.lastMessageAt {
                                            Text(timeAgo(date))
                                                .font(.caption)
                                                .foregroundColor(VP.muted)
                                        }
                                    }
                                    Text(convo.lastMessagePreview ?? "No messages yet")
                                        .font(.system(.footnote, design: .default, weight: isUnread ? .semibold : .regular))
                                        .foregroundColor(isUnread ? VP.text : VP.dim)
                                        .lineLimit(1)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                        }
                        .buttonStyle(.plain)
                        Divider().padding(.leading, 72)
                    }
                }
            }
        }
    }

    // MARK: - Search Sheet

    private var searchSheet: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search bar
                HStack(spacing: 8) {
                    Text("To:")
                        .font(.subheadline)
                        .foregroundColor(VP.muted)
                    TextField("Search by username...", text: $searchQuery)
                        .font(.subheadline)
                        .onChange(of: searchQuery) { _ in Task { await searchUsers() } }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(VP.card)
                .cornerRadius(10)
                .padding(.horizontal, 16)
                .padding(.top, 8)

                // Role filter
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(["all", "expert", "educator", "journalist", "moderator", "admin"], id: \.self) { r in
                            Button {
                                roleFilter = r
                                Task { await searchUsers() }
                            } label: {
                                Text(r == "all" ? "All Users" : r.capitalized + "s")
                                    .font(.system(.caption, design: .default, weight: .medium))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(roleFilter == r ? VP.text : VP.card)
                                    .foregroundColor(roleFilter == r ? .white : VP.dim)
                                    .cornerRadius(12)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }

                // Results
                if searching {
                    ProgressView().padding(.top, 30)
                } else {
                    List(searchResults) { user in
                        Button {
                            Task { await startConversation(with: user) }
                        } label: {
                            HStack(spacing: 12) {
                                Circle()
                                    .fill(Color(hex: user.avatarColor ?? "cccccc"))
                                    .frame(width: 40, height: 40)
                                    .overlay(
                                        Text(String((user.username ?? "?").prefix(1)).uppercased())
                                            .font(.system(.subheadline, design: .default, weight: .bold))
                                            .foregroundColor(.white)
                                    )
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(user.username ?? "User")
                                        .font(.system(.subheadline, design: .default, weight: .semibold))
                                        .foregroundColor(VP.text)
                                    Text("\(user.verityScore ?? 0) VP")
                                        .font(.caption)
                                        .foregroundColor(VP.muted)
                                }
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("New message")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        showSearch = false
                        searchQuery = ""
                        searchResults = []
                        roleFilter = "all"
                    }
                    .foregroundColor(VP.accent)
                }
            }
        }
    }

    // MARK: - Data

    private func checkAccessAndLoad() async {
        guard auth.currentUser?.id != nil else {
            accessChecked = true
            loading = false
            return
        }

        // DM access is now sourced from PermissionService (key:
        // `messages.dm.compose`). The admin-bypass + plan_features lookup
        // is consolidated in compute_effective_perms server-side.
        await PermissionService.shared.refreshIfStale()
        hasDmAccess = await PermissionService.shared.has("messages.dm.compose")

        accessChecked = true
        await loadConversations()
    }

    private func loadConversations() async {
        guard let userId = auth.currentUser?.id else { loading = false; return }

        do {
            struct Participant: Decodable { let conversation_id: String }
            let parts: [Participant] = try await client.from("conversation_participants")
                .select("conversation_id")
                .eq("user_id", value: userId)
                .execute().value

            if parts.isEmpty { conversations = []; loading = false; return }

            let ids = parts.map { $0.conversation_id }
            let convos: [DMConversation] = try await client.from("conversations")
                .select("id, title, last_message_preview, last_message_at")
                .in("id", values: ids)
                .order("last_message_at", ascending: false)
                .execute().value

            // Get other user info for each conversation
            var result: [DMConversation] = []
            for var convo in convos {
                struct CP: Decodable {
                    let user_id: String
                    struct U: Decodable { let username: String?; let avatar_color: String? }
                    let users: U?
                }
                let cps: [CP] = (try? await client.from("conversation_participants")
                    .select("user_id, users(username, avatar_color)")
                    .eq("conversation_id", value: convo.id)
                    .neq("user_id", value: userId)
                    .execute().value) ?? []
                let other = cps.first
                convo.otherUsername = other?.users?.username
                convo.otherAvatarColor = other?.users?.avatar_color
                result.append(convo)
            }

            // Unread counts via migration 038 RPC. bigint → Int coerced below.
            struct UnreadRow: Decodable { let conversation_id: String; let unread: Int }
            let counts: [UnreadRow] = (try? await client.rpc("get_unread_counts").execute().value) ?? []
            let unreadMap: [String: Int] = Dictionary(uniqueKeysWithValues: counts.map { ($0.conversation_id, $0.unread) })
            for i in result.indices {
                result[i].unread = unreadMap[result[i].id] ?? 0
            }

            conversations = result
        } catch {
            Log.d("Failed to load conversations: \(error)")
        }
        loading = false
    }

    // Mark a conversation read — writes last_read_at = now() on the caller's
    // participant row (RLS scopes to user_id = auth.uid()) and zeroes the
    // local unread pill so the UI drops the indicator immediately. Task 46
    // inserts message_receipts rows AFTER this call completes (same firing
    // order on both platforms).
    // Kept client-side (RLS: user_id = auth.uid()). If future DM read-state
    // rules land server-side, route this through an API in that track.
    func markConversationRead(_ convoId: String) async {
        guard let userId = auth.currentUser?.id else { return }
        if let i = conversations.firstIndex(where: { $0.id == convoId }) {
            conversations[i].unread = 0
        }
        let nowIso = ISO8601DateFormatter().string(from: Date())
        try? await client.from("conversation_participants")
            .update(["last_read_at": nowIso])
            .eq("conversation_id", value: convoId)
            .eq("user_id", value: userId)
            .execute()
    }

    private func searchUsers() async {
        let q = searchQuery.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty, let userId = auth.currentUser?.id else { searchResults = []; return }
        searching = true

        do {
            var results: [SearchUser] = try await client.from("users")
                .select("id, username, avatar_color, verity_score")
                .ilike("username", value: "%\(q)%")
                .neq("id", value: userId)
                .limit(20)
                .execute().value

            if roleFilter != "all" && !results.isEmpty {
                struct RJ: Decodable { let user_id: String }
                let rr: [RJ] = (try? await client.from("user_roles")
                    .select("user_id, roles!inner(name)")
                    .eq("roles.name", value: roleFilter)
                    .in("user_id", values: results.map { $0.id })
                    .execute().value) ?? []
                let matchIds = Set(rr.map { $0.user_id })
                results = results.filter { matchIds.contains($0.id) }
            }

            searchResults = results
        } catch {
            Log.d("Search error: \(error)")
        }
        searching = false
    }

    // Round 7 Bug 1 -- convo create routes through POST /api/conversations so
    // the start_conversation RPC enforces paid gate (user_has_dm_access),
    // mute/ban, self-start guard, recipient existence, and atomically inserts
    // the conversation + both participant rows. Direct `conversations.insert`
    // + `conversation_participants.insert` was letting free accounts create
    // empty solo-owner convos (recipient participant insert failed RLS while
    // the owner row + convo row already landed). Mirrors the send() path at
    // line 850 which routes through POST /api/messages for the same reasons.
    private func startConversation(with user: SearchUser) async {
        guard auth.currentUser?.id != nil else { return }

        // Check if conversation already exists
        if let existing = conversations.first(where: { $0.otherUsername == user.username }) {
            selectedConvo = existing
            showSearch = false
            return
        }

        do {
            guard let session = try? await client.auth.session else {
                showSearch = false
                return
            }
            let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/conversations")

            struct Body: Encodable { let other_user_id: String }
            struct ConvoRef: Decodable { let id: String; let existed: Bool? }
            struct Envelope: Decodable { let conversation: ConvoRef }

            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            req.httpBody = try JSONEncoder().encode(Body(other_user_id: user.id))

            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                // 403 = paid / muted / banned, 404 = recipient missing,
                // 400 = self-start / validation. Log + bail.
                Log.d("Start conversation failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)")
                showSearch = false
                return
            }
            let env = try JSONDecoder().decode(Envelope.self, from: data)
            let convoId = env.conversation.id

            // Hydrate the single convo row now that the caller is a participant
            // (RLS permits this SELECT).
            let rows: [DMConversation] = try await client.from("conversations")
                .select()
                .eq("id", value: convoId)
                .limit(1)
                .execute().value
            guard var convo = rows.first else {
                showSearch = false
                return
            }
            convo.otherUsername = user.username
            convo.otherAvatarColor = user.avatarColor
            if !conversations.contains(where: { $0.id == convo.id }) {
                conversations.insert(convo, at: 0)
            }
            selectedConvo = convo
        } catch {
            Log.d("Failed to create conversation: \(error)")
        }
        showSearch = false
    }

    // MARK: - Realtime (conversation list)
    //
    // Mirrors web `site/src/app/messages/page.js` Pass-2 Task-10: one channel
    // listens for UPDATE on conversations (preview / last_message_at patched
    // into the visible row; list re-sorted) — no row filter, RLS scopes to
    // rows the user can see. A second channel listens for INSERT on
    // conversation_participants filtered to this user, to pick up "someone
    // added me to a new conversation" — on fire we just reload the list.
    private func subscribeToConversationUpdates() async {
        guard let userId = auth.currentUser?.id else { return }
        let channelName = "convos-\(userId)-\(Int(Date().timeIntervalSince1970))"
        let channel = client.channel(channelName)
        let updates = channel.postgresChange(
            UpdateAction.self,
            schema: "public",
            table: "conversations"
        )
        await channel.subscribe()
        for await change in updates {
            guard case let .string(convoId) = change.record["id"] else { continue }
            let preview: String? = {
                if case let .string(v) = change.record["last_message_preview"] { return v }
                return nil
            }()
            let lastAt: Date? = {
                guard case let .string(v) = change.record["last_message_at"] else { return nil }
                let f = ISO8601DateFormatter()
                f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let d = f.date(from: v) { return d }
                f.formatOptions = [.withInternetDateTime]
                return f.date(from: v)
            }()
            await MainActor.run {
                guard let i = conversations.firstIndex(where: { $0.id == convoId }) else { return }
                var patched = conversations[i]
                patched.lastMessagePreview = preview
                patched.lastMessageAt = lastAt
                conversations[i] = patched
                conversations.sort { ($0.lastMessageAt ?? .distantPast) > ($1.lastMessageAt ?? .distantPast) }
            }
        }
        await channel.unsubscribe()
    }

    // Listens to messages INSERT across every conversation the user can see
    // (RLS scopes). Drives the unread pill on the list view when a message
    // arrives for a conversation that isn't currently open. Skips own sends
    // and the open conversation.
    private func subscribeToCrossConvoMessages() async {
        guard let userId = auth.currentUser?.id else { return }
        let channelName = "messages-any-\(userId)-\(Int(Date().timeIntervalSince1970))"
        let channel = client.channel(channelName)
        let inserts = channel.postgresChange(
            InsertAction.self,
            schema: "public",
            table: "messages"
        )
        await channel.subscribe()
        for await change in inserts {
            guard case let .string(convoId) = change.record["conversation_id"] else { continue }
            if convoId == selectedConvo?.id { continue }
            if case let .string(senderId) = change.record["sender_id"], senderId == userId { continue }
            await MainActor.run {
                if let i = conversations.firstIndex(where: { $0.id == convoId }) {
                    conversations[i].unread += 1
                }
            }
        }
        await channel.unsubscribe()
    }

    private func subscribeToNewParticipants() async {
        guard let userId = auth.currentUser?.id else { return }
        let channelName = "convo-parts-\(userId)-\(Int(Date().timeIntervalSince1970))"
        let channel = client.channel(channelName)
        let inserts = channel.postgresChange(
            InsertAction.self,
            schema: "public",
            table: "conversation_participants",
            filter: "user_id=eq.\(userId)"
        )
        await channel.subscribe()
        for await _ in inserts {
            // Someone added me to a new conversation. Reload the list.
            await loadConversations()
        }
        await channel.unsubscribe()
    }

    private func timeAgo(_ date: Date) -> String {
        let secs = Int(Date().timeIntervalSince(date))
        let m = secs / 60
        if m < 60 { return "\(m)m" }
        let h = m / 60
        if h < 24 { return "\(h)h" }
        return "\(h / 24)d"
    }
}

// MARK: - Chat Thread

struct DMThreadView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    let conversation: MessagesView.DMConversation
    let onBack: () -> Void

    @State private var messages: [Msg] = []
    @State private var loading = true
    @State private var input = ""
    @State private var sending = false
    // Ids of THIS viewer's own sent messages in this conversation that
    // another participant has marked read via message_receipts (migration
    // 039 loosens RLS so the sender can SELECT these rows).
    @State private var readMessageIds: Set<String> = []
    // Per-user opt-out for DM read receipts (migration 044 / Task 62).
    // Client-side gate on markVisibleMessagesAsSeen — default true
    // preserves always-on behavior.
    @State private var dmReceiptsEnabled: Bool = true

    struct Msg: Codable, Identifiable {
        let id: String
        var senderId: String?
        var body: String?
        var createdAt: Date?

        enum CodingKeys: String, CodingKey {
            case id
            case senderId = "sender_id"
            case body
            case createdAt = "created_at"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Button { onBack() } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.system(.subheadline, design: .default, weight: .semibold))
                        Text(conversation.otherUsername ?? "Chat")
                            .font(.system(.headline, design: .default, weight: .semibold))
                    }
                    .foregroundColor(VP.accent)
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(VP.bg)
            .overlay(Divider().background(VP.border), alignment: .bottom)

            // Messages
            ScrollViewReader { proxy in
                ScrollView {
                    if loading {
                        ProgressView().padding(.top, 40)
                    } else {
                        // iMessage-style "Read" caption: attach once, to the
                        // last of the viewer's OWN sent messages that has a
                        // receipt from another user. Matches the web render.
                        let lastReadOwnId: String? = {
                            let myId = auth.currentUser?.id
                            return messages.last(where: { $0.senderId == myId && readMessageIds.contains($0.id) })?.id
                        }()
                        LazyVStack(spacing: 4) {
                            ForEach(messages) { msg in
                                let isMe = msg.senderId == auth.currentUser?.id
                                VStack(alignment: isMe ? .trailing : .leading, spacing: 2) {
                                    HStack {
                                        if isMe { Spacer(minLength: 60) }
                                        Text(msg.body ?? "")
                                            .font(.callout)
                                            .foregroundColor(isMe ? .white : VP.text)
                                            .padding(.horizontal, 14)
                                            .padding(.vertical, 9)
                                            .background(isMe ? VP.accent : Color(hex: "E9E9EB"))
                                            .cornerRadius(18)
                                        if !isMe { Spacer(minLength: 60) }
                                    }
                                    if msg.id == lastReadOwnId {
                                        Text("Read")
                                            .font(.system(.caption2, design: .default, weight: .semibold))
                                            .foregroundColor(VP.muted)
                                            .padding(.trailing, 4)
                                    }
                                }
                                .id(msg.id)
                            }
                        }
                        .padding(16)
                    }
                }
                .onChange(of: messages.count) { _ in
                    if let last = messages.last {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }

            // Input bar
            HStack(spacing: 8) {
                TextField("Type a message...", text: $input)
                    .font(.callout)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(VP.bg)
                    .cornerRadius(20)
                    .overlay(RoundedRectangle(cornerRadius: 20).stroke(VP.border))
                    .onSubmit { Task { await send() } }

                Button {
                    Task { await send() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.largeTitle)
                        .foregroundColor(input.trimmingCharacters(in: .whitespaces).isEmpty ? Color(hex: "CCCCCC") : VP.accent)
                }
                .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty || sending)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(hex: "F7F7F7"))
        }
        .task(id: conversation.id) { await loadMessages() }
        .task(id: conversation.id) { await subscribeToNewMessages() }
        .task(id: conversation.id) { await subscribeToReadReceipts() }
    }

    // Realtime: new messages in this open conversation. Parity with
    // site/src/app/messages/page.js Pass-2 Task-10 — dedup by id so the
    // sender's own insert echo doesn't double-render. The auto-scroll is
    // already wired by `.onChange(of: messages.count)` above.
    private func subscribeToNewMessages() async {
        let channelName = "messages-\(conversation.id)-\(Int(Date().timeIntervalSince1970))"
        let channel = client.channel(channelName)
        let inserts = channel.postgresChange(
            InsertAction.self,
            schema: "public",
            table: "messages",
            filter: "conversation_id=eq.\(conversation.id)"
        )
        await channel.subscribe()
        for await change in inserts {
            guard case let .string(newId) = change.record["id"] else { continue }
            if messages.contains(where: { $0.id == newId }) { continue }
            let senderId: String? = {
                if case let .string(v) = change.record["sender_id"] { return v }
                return nil
            }()
            let body: String? = {
                if case let .string(v) = change.record["body"] { return v }
                return nil
            }()
            let createdAt: Date? = {
                guard case let .string(v) = change.record["created_at"] else { return nil }
                let f = ISO8601DateFormatter()
                f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let d = f.date(from: v) { return d }
                f.formatOptions = [.withInternetDateTime]
                return f.date(from: v)
            }()
            let msg = Msg(id: newId, senderId: senderId, body: body, createdAt: createdAt)
            await MainActor.run {
                if !messages.contains(where: { $0.id == msg.id }) {
                    messages.append(msg)
                }
            }
        }
        await channel.unsubscribe()
    }

    private func loadMessages() async {
        do {
            let data: [Msg] = try await client.from("messages")
                .select("id, sender_id, body, created_at")
                .eq("conversation_id", value: conversation.id)
                .order("created_at", ascending: true)
                .execute().value
            messages = data
        } catch {
            Log.d("Failed to load messages: \(error)")
        }
        loading = false

        // Task 46 — receipts side of the conversation-open hook. Firing
        // order: `last_read_at` first (handled by the parent MessagesView's
        // markConversationRead inside the Button action), then these two
        // steps. Separate `Task` so it doesn't delay the bubble-render path.
        guard let userId = auth.currentUser?.id else { return }
        await loadDmReceiptsPref(userId: userId)
        await markVisibleMessagesAsSeen(userId: userId)
        await loadOwnReadReceipts(userId: userId)
    }

    // Task 62 — read the viewer's own dm_read_receipts_enabled flag so
    // markVisibleMessagesAsSeen can skip the upsert when the viewer has
    // opted out. Default true preserves always-on behavior when the
    // fetch fails or the column is NULL.
    private func loadDmReceiptsPref(userId: String) async {
        struct Row: Decodable { let dm_read_receipts_enabled: Bool? }
        let r: [Row] = (try? await client.from("users")
            .select("dm_read_receipts_enabled")
            .eq("id", value: userId)
            .execute().value) ?? []
        dmReceiptsEnabled = r.first?.dm_read_receipts_enabled ?? true
    }

    // Insert message_receipts rows for every message in this conversation
    // whose sender is NOT the viewer. UNIQUE(message_id, user_id) keeps
    // re-opens idempotent — duplicates are silently ignored via upsert with
    // ignoreDuplicates. Task 62 — skip entirely when the viewer has
    // opted out of emitting DM read receipts (client-side gate only;
    // social convention, not a security boundary).
    private func markVisibleMessagesAsSeen(userId: String) async {
        if !dmReceiptsEnabled { return }
        struct Receipt: Encodable {
            let message_id: String
            let user_id: String
            let read_at: String
        }
        let others = messages.filter { $0.senderId != userId }
        if others.isEmpty { return }
        let nowIso = ISO8601DateFormatter().string(from: Date())
        let rows: [Receipt] = others.map { Receipt(message_id: $0.id, user_id: userId, read_at: nowIso) }
        do {
            try await client.from("message_receipts")
                .upsert(rows, onConflict: "message_id,user_id", ignoreDuplicates: true)
                .execute()
        } catch {
            Log.d("markVisibleMessagesAsSeen error: \(error)")
        }
    }

    // Load existing receipts for our OWN sent messages so the "Read"
    // caption renders correctly on cold open. Migration 039 RLS grants
    // the sender SELECT on receipts for messages they sent.
    private func loadOwnReadReceipts(userId: String) async {
        let ownIds = messages.filter { $0.senderId == userId }.map { $0.id }
        if ownIds.isEmpty { readMessageIds = []; return }
        struct Row: Decodable { let message_id: String }
        let rows: [Row] = (try? await client.from("message_receipts")
            .select("message_id")
            .in("message_id", values: ownIds)
            .neq("user_id", value: userId)
            .execute().value) ?? []
        readMessageIds = Set(rows.map { $0.message_id })
    }

    // Realtime: message_receipts INSERT. Under migration 039 RLS the sender
    // sees the recipient's receipt rows land; we add the message_id to
    // readMessageIds so the "Read" caption flips live on the sender's side.
    // Own receipts (from the upsert above) are filtered out — the sender
    // doesn't need "Read" on their own read-acks of incoming messages.
    private func subscribeToReadReceipts() async {
        let channelName = "receipts-\(conversation.id)-\(Int(Date().timeIntervalSince1970))"
        let channel = client.channel(channelName)
        let inserts = channel.postgresChange(
            InsertAction.self,
            schema: "public",
            table: "message_receipts"
        )
        await channel.subscribe()
        for await change in inserts {
            guard case let .string(messageId) = change.record["message_id"] else { continue }
            if case let .string(userId) = change.record["user_id"], userId == auth.currentUser?.id { continue }
            await MainActor.run {
                if !readMessageIds.contains(messageId) {
                    readMessageIds.insert(messageId)
                }
            }
        }
        await channel.unsubscribe()
    }

    // Round 6 iOS-GATES — DM send routes through POST /api/messages so the
    // post_message RPC enforces paid-tier, mute/ban, participant, rate-limit
    // (30/min), and length (4000) checks server-side. Direct messages.insert
    // was deleted (RLS only scoped to participant + not-blocked, missing all
    // other gates). The redundant conversations.update was also deleted —
    // post_message patches last_message_preview / last_message_at / updated_at
    // server-side (verified via pg_proc body). Realtime channel at
    // subscribeToNewMessages() handles the UI echo + dedup by id.
    private func send() async {
        guard auth.currentUser?.id != nil else { return }
        let text = input.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        input = ""
        sending = true
        defer { sending = false }

        do {
            guard let session = try? await client.auth.session else {
                await MainActor.run { input = text }
                return
            }
            let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/messages")

            struct Body: Encodable {
                let conversation_id: String
                let body: String
            }
            struct RawMsg: Decodable {
                let id: String
                let sender_id: String?
                let body: String?
                let created_at: String?
            }
            struct Envelope: Decodable { let message: RawMsg }

            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            req.httpBody = try JSONEncoder().encode(Body(
                conversation_id: conversation.id,
                body: text
            ))

            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                // 403 = paid / muted / banned / not-participant,
                // 429 = rate-limit, 400 = length/validation. Restore draft.
                await MainActor.run { input = text }
                return
            }
            let env = try JSONDecoder().decode(Envelope.self, from: data)
            // Parse created_at using the same tolerant formatter pattern as
            // the realtime handler at subscribeToNewMessages() (lines 719-726).
            let createdAt: Date? = {
                guard let v = env.message.created_at else { return nil }
                let f = ISO8601DateFormatter()
                f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let d = f.date(from: v) { return d }
                f.formatOptions = [.withInternetDateTime]
                return f.date(from: v)
            }()
            let msg = Msg(
                id: env.message.id,
                senderId: env.message.sender_id,
                body: env.message.body,
                createdAt: createdAt
            )
            await MainActor.run {
                // Dedup mirrors the realtime channel's own check at line 710.
                if !messages.contains(where: { $0.id == msg.id }) {
                    messages.append(msg)
                }
            }
        } catch {
            Log.d("Failed to send: \(error)")
            await MainActor.run { input = text }
        }
    }
}
