import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified notifications 2026-04-18
// Self-gates the inbox, the mark-all-read action, and each subscription
// lane (category / subcategory / keyword) on the matching permission
// key. Server routes (/api/notifications, RLS on alert_preferences)
// mirror each check so direct-DB callers can't bypass.

struct AlertsView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var activeSection = "Alerts"
    private let sections = ["Alerts", "Manage"]

    @State private var notifications: [VPNotification] = []
    @State private var loading = true
    @State private var navigateToSlug: String? = nil
    @State private var navigatedStory: Story? = nil

    // Manage tab state
    @State private var subscribedCategories: [AlertSubscription] = []
    @State private var subscribedKeywords: [AlertSubscription] = []
    @State private var allCategories: [VPCategory] = []
    @State private var allSubcategories: [VPSubcategory] = []
    @State private var subscribedSubcategories: [AlertSubscription] = []
    @State private var manageLoading = true
    @State private var selectedCategoryToAdd: String = ""
    @State private var selectedSubcategoryToAdd: String = ""
    @State private var newKeyword = ""

    @State private var showLogin = false
    @State private var showSignup = false
    @StateObject private var push = PushPermission.shared
    @State private var showPushPrompt = false

    // Permission flags, hydrated on change-token bumps.
    @StateObject private var perms = PermissionStore.shared
    @State private var canViewInbox = false
    @State private var canMarkAllRead = false
    @State private var canSubCategory = false
    @State private var canSubSubcategory = false
    @State private var canSubKeyword = false
    @State private var canUnsubscribe = false

    var body: some View {
        Group {
            if auth.currentUser == nil {
                anonHero
            } else if !canViewInbox {
                // Signed in but the inbox permission isn't granted (banned,
                // scope-blocked, etc). Don't show an empty feed — explain.
                inboxDeniedHero
            } else {
                VStack(spacing: 0) {
                    // Section tabs
                    HStack(spacing: 8) {
                        ForEach(sections, id: \.self) { section in
                            PillButton(label: section, isActive: activeSection == section) {
                                activeSection = section
                            }
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)

                    if activeSection == "Alerts" {
                        alertsContent
                    } else {
                        manageContent
                    }
                }
            }
        }
        .background(VP.bg.ignoresSafeArea())
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showLogin) { LoginView().environmentObject(auth) }
        .sheet(isPresented: $showSignup) { SignupView().environmentObject(auth) }
        .sheet(isPresented: $showPushPrompt) {
            PushPromptSheet(
                title: "Get breaking news alerts",
                detail: "We'll send a push when stories you subscribed to break \u{2014} nothing else, ever. You can turn it off anytime.",
                onEnable: {
                    await push.requestIfNeeded()
                    if push.isOn, let uid = auth.currentUser?.id {
                        PushRegistration.shared.setCurrentUser(uid)
                    }
                },
                onDecline: {
                    // H14 — stamp the decline so we don't re-open this
                    // sheet on every visit to Alerts. 7-day cooldown
                    // via PushPermission. Re-ask after that at the next
                    // value moment.
                    push.markPrePromptDeclined()
                }
            )
        }
        .task { await push.refresh() }
        .toolbar {
            if activeSection == "Alerts" && canMarkAllRead {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Read All") {
                        Task { await markAllRead() }
                    }
                    .font(.system(.footnote, design: .default, weight: .medium))
                    .foregroundColor(VP.accent)
                }
            }
        }
        .task(id: auth.currentUser?.id) { await loadNotifications() }
        .task(id: auth.currentUser?.id) { await loadManageData() }
        .task(id: perms.changeToken) { await hydratePermissions() }
        .navigationDestination(item: $navigatedStory) { story in
            StoryDetailView(story: story)
        }
        .onChange(of: navigateToSlug) {
            guard let slug = navigateToSlug else { return }
            navigateToSlug = nil
            Task {
                if let story = await fetchStoryBySlug(slug) {
                    navigatedStory = story
                }
            }
        }
    }

    // MARK: - Anon hero (no forced redirect)

    private var anonHero: some View {
        VStack(spacing: 14) {
            Spacer().frame(height: 48)
            Text("Alerts").font(.system(.title3, design: .default, weight: .bold)).foregroundColor(VP.text)
            Text("Sign in to get breaking news alerts and reply notifications.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("Sign in") { showLogin = true }
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 26)
                .padding(.vertical, 11)
                .frame(minHeight: 44)
                .background(VP.accent)
                .cornerRadius(10)
            Button("Create free account") { showSignup = true }
                .font(.system(.footnote, design: .default, weight: .medium))
                .foregroundColor(VP.accent)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // Inbox disabled for this user (banned, scope override, etc).
    private var inboxDeniedHero: some View {
        VStack(spacing: 12) {
            Spacer().frame(height: 48)
            Image(systemName: "bell.slash")
                .font(.largeTitle)
                .foregroundColor(VP.dim)
            Text("Notifications unavailable")
                .font(.system(.callout, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
            Text("Your account doesn\u{2019}t have access to the notifications inbox right now.")
                .font(.caption)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // Hydrate permission-gated affordances on change-token bumps.
    private func hydratePermissions() async {
        canViewInbox = await PermissionService.shared.has("notifications.inbox.view")
        canMarkAllRead = await PermissionService.shared.has("notifications.mark_all_read")
        canSubCategory = await PermissionService.shared.has("notifications.subscription.category")
        canSubSubcategory = await PermissionService.shared.has("notifications.subscription.subcategory")
        canSubKeyword = await PermissionService.shared.has("notifications.subscription.keyword")
        canUnsubscribe = await PermissionService.shared.has("notifications.subscription.unsubscribe")
    }

    // MARK: - Alerts Content

    private var alertsContent: some View {
        ScrollView {
            VStack(spacing: 0) {
                if loading {
                    ProgressView()
                        .padding(.top, 60)
                } else if notifications.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "bell.slash")
                            .font(.largeTitle)
                            .foregroundColor(VP.dim)
                        Text("You\u{2019}re all caught up")
                            .font(.system(.callout, design: .default, weight: .semibold))
                            .foregroundColor(VP.text)
                        Text("Breaking news and interactions with your content will show up here. Subscribe to categories in Manage to get alerts.")
                            .font(.caption)
                            .foregroundColor(VP.dim)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 80)
                    .padding(.horizontal, 40)
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(notifications.enumerated()), id: \.element.id) { idx, notif in
                            Button {
                                Task {
                                    await markAsRead(notif)
                                    if let slug = notif.storySlug {
                                        navigateToSlug = slug
                                    }
                                }
                            } label: {
                                notificationRow(notif)
                            }
                            .buttonStyle(.plain)

                            if idx < notifications.count - 1 {
                                Divider().background(VP.border)
                            }
                        }
                    }
                    .background(VP.bg)
                    .padding(.top, 8)
                }
            }
            .padding(.bottom, 100)
        }
    }

    // MARK: - Manage Content

    // Round 11 P1: the Manage tab used to render category/subcategory/keyword
    // pickers and an "Add" affordance for each. Those save paths were gated
    // off in Round 6 because `alert_preferences` is a per-alert-type
    // channel/frequency table — it has no `type`/`value`/`reference_id`
    // columns to model per-topic subscriptions. The UI still rendered,
    // creating a fake-functional affordance that silently no-op'd on tap.
    // Hide the entire subscription-manage surface behind this flag until a
    // real `subscription_topics` table + API route ships. Do NOT flip this
    // on until both exist — see OWNER_TO_DO ("Alert subscriptions model").
    private let manageSubscriptionsEnabled = false

    @ViewBuilder
    private var manageContent: some View {
        if manageSubscriptionsEnabled {
            manageContentLive
        } else {
            manageContentPlaceholder
        }
    }

    private var manageContentPlaceholder: some View {
        VStack(spacing: 12) {
            Spacer().frame(height: 48)
            Image(systemName: "bell.badge")
                .font(.largeTitle)
                .foregroundColor(VP.dim)
            Text("Subscription manager coming soon")
                .font(.system(.callout, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
            Text("We\u{2019}re redesigning how you subscribe to categories, subcategories, and keywords. Your inbox still works \u{2014} just check the Alerts tab.")
                .font(.caption)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // Preserved verbatim so the Round-7+ redesign only has to flip the flag
    // above (and wire up the real API). This view is never reachable while
    // `manageSubscriptionsEnabled == false`.
    private var manageContentLive: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Subscribed Categories
                VStack(alignment: .leading, spacing: 12) {
                    Text("Subscribed Categories")
                        .font(.system(.callout, design: .default, weight: .bold))
                        .foregroundColor(VP.text)

                    if subscribedCategories.isEmpty {
                        Text("No category subscriptions yet")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                    } else {
                        ForEach(subscribedCategories) { sub in
                            HStack {
                                Text(sub.value ?? "Unknown")
                                    .font(.subheadline)
                                    .foregroundColor(VP.text)
                                Spacer()
                                if canUnsubscribe {
                                    Button {
                                        Task { await removeSubscription(sub) }
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.headline)
                                            .foregroundColor(VP.dim)
                                    }
                                }
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(VP.card)
                            .cornerRadius(8)
                        }
                    }

                    // Add category picker — hidden when user lacks the
                    // subscription.category permission.
                    if canSubCategory {
                        HStack(spacing: 8) {
                            Picker("Category", selection: $selectedCategoryToAdd) {
                                Text("Select category...").tag("")
                                ForEach(allCategories) { cat in
                                    Text(cat.displayName).tag(cat.id)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(VP.text)

                            Button {
                                Task { await addCategorySubscription() }
                            } label: {
                                Text("Add")
                                    .font(.system(.footnote, design: .default, weight: .semibold))
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    .frame(minHeight: 44)
                                    .background(VP.accent)
                                    .foregroundColor(.white)
                                    .cornerRadius(8)
                            }
                            .disabled(selectedCategoryToAdd.isEmpty)
                        }
                    }
                }

                Divider().background(VP.border)

                // Subscribed Subcategories
                VStack(alignment: .leading, spacing: 12) {
                    Text("Subscribed Subcategories")
                        .font(.system(.callout, design: .default, weight: .bold))
                        .foregroundColor(VP.text)

                    if subscribedSubcategories.isEmpty {
                        Text("No subcategory subscriptions yet")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                    } else {
                        ForEach(subscribedSubcategories) { sub in
                            HStack {
                                Text(sub.value ?? "Unknown")
                                    .font(.subheadline)
                                    .foregroundColor(VP.text)
                                Spacer()
                                if canUnsubscribe {
                                    Button {
                                        Task { await removeSubscription(sub) }
                                    } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.headline)
                                            .foregroundColor(VP.dim)
                                    }
                                }
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(VP.card)
                            .cornerRadius(8)
                        }
                    }

                    // Add subcategory picker — hidden when user lacks
                    // notifications.subscription.subcategory.
                    if canSubSubcategory {
                        HStack(spacing: 8) {
                            Picker("Subcategory", selection: $selectedSubcategoryToAdd) {
                                Text("Select subcategory...").tag("")
                                ForEach(allSubcategories) { sub in
                                    Text(sub.name).tag(sub.id)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(VP.text)

                            Button {
                                Task { await addSubcategorySubscription() }
                            } label: {
                                Text("Add")
                                    .font(.system(.footnote, design: .default, weight: .semibold))
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    .frame(minHeight: 44)
                                    .background(VP.accent)
                                    .foregroundColor(.white)
                                    .cornerRadius(8)
                            }
                            .disabled(selectedSubcategoryToAdd.isEmpty)
                        }
                    }
                }

                Divider().background(VP.border)

                // Keywords
                VStack(alignment: .leading, spacing: 12) {
                    Text("Keyword Alerts")
                        .font(.system(.callout, design: .default, weight: .bold))
                        .foregroundColor(VP.text)

                    if subscribedKeywords.isEmpty {
                        Text("No keyword alerts yet")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                    } else {
                        FlowLayout(spacing: 8) {
                            ForEach(subscribedKeywords) { sub in
                                HStack(spacing: 4) {
                                    Text(sub.value ?? "")
                                        .font(.footnote)
                                        .foregroundColor(VP.text)
                                    if canUnsubscribe {
                                        Button {
                                            Task { await removeSubscription(sub) }
                                        } label: {
                                            Image(systemName: "xmark")
                                                .font(.system(.caption2, design: .default, weight: .bold))
                                                .foregroundColor(VP.dim)
                                        }
                                    }
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(VP.card)
                                .cornerRadius(16)
                                .overlay(RoundedRectangle(cornerRadius: 16).stroke(VP.border))
                            }
                        }
                    }

                    // Add keyword — hidden when user lacks
                    // notifications.subscription.keyword.
                    if canSubKeyword {
                        HStack(spacing: 8) {
                            TextField("Add keyword...", text: $newKeyword)
                                .font(.subheadline)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .background(VP.card)
                                .cornerRadius(8)
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))

                            Button {
                                Task { await addKeywordSubscription() }
                            } label: {
                                Image(systemName: "plus.circle.fill")
                                    .font(.title)
                                    .foregroundColor(newKeyword.trimmingCharacters(in: .whitespaces).isEmpty ? VP.dim : VP.accent)
                            }
                            .disabled(newKeyword.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 100)
        }
    }

    private func fetchStoryBySlug(_ slug: String) async -> Story? {
        do {
            let stories: [Story] = try await client.from("articles")
                .select()
                .eq("slug", value: slug)
                .limit(1)
                .execute().value
            return stories.first
        } catch {
            Log.d("Failed to fetch story by slug:", error)
            return nil
        }
    }

    /// Notification card — matches site/src/app/notifications/page.js exactly.
    /// Read: #f7f7f7 bg, 1pt border. Unread: white bg, 1pt accent border.
    /// Type badge (uppercase 10pt 700) + title (14pt 600) + relative time.
    private func notificationRow(_ notif: VPNotification) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if let type = notif.type, !type.isEmpty {
                    Text(type.uppercased())
                        .font(.system(.caption2, design: .default, weight: .bold))
                        .foregroundColor(VP.dim)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(VP.card)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                Text(notif.title ?? "Notification")
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                    .lineLimit(2)
                Spacer(minLength: 8)
                if let date = notif.createdAt {
                    Text(timeAgo(date))
                        .font(.caption)
                        .foregroundColor(VP.dim)
                }
            }

            if let body = notif.body, !body.isEmpty {
                Text(body)
                    .font(.footnote)
                    .foregroundColor(VP.text)
                    .lineLimit(3)
                    .padding(.top, 2)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(notif.isRead ? VP.card : Color.white)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(notif.isRead ? VP.border : VP.accent, lineWidth: 1)
        )
        .cornerRadius(10)
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }

    // Route through the existing permission-gated PATCH /api/notifications
    // route (service-client writes, is_read/read_at/is_seen/seen_at). Direct
    // PostgREST updates here previously wrote a non-existent `read` column,
    // silently failing.
    private func markAsRead(_ notif: VPNotification) async {
        guard !notif.isRead else { return }
        guard let session = try? await client.auth.session else { return }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/notifications")
        do {
            struct Body: Encodable { let ids: [String]; let mark: String }
            let payload = Body(ids: [notif.id], mark: "read")
            var req = URLRequest(url: url)
            req.httpMethod = "PATCH"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            req.httpBody = try JSONEncoder().encode(payload)
            let (_, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                Log.d("Mark read failed:", (response as? HTTPURLResponse)?.statusCode as Any)
                return
            }
            if let idx = notifications.firstIndex(where: { $0.id == notif.id }) {
                notifications[idx] = VPNotification(
                    id: notif.id, userId: notif.userId, title: notif.title,
                    body: notif.body, type: notif.type, isReadRaw: true,
                    actionUrl: notif.actionUrl, createdAt: notif.createdAt
                )
            }
        } catch {
            Log.d("Mark read error:", error)
        }
    }

    private func markAllRead() async {
        let unread = notifications.filter { !$0.isRead }
        guard !unread.isEmpty else { return }
        guard let session = try? await client.auth.session else { return }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/notifications")
        do {
            struct Body: Encodable { let all: Bool; let mark: String }
            let payload = Body(all: true, mark: "read")
            var req = URLRequest(url: url)
            req.httpMethod = "PATCH"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            req.httpBody = try JSONEncoder().encode(payload)
            let (_, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                Log.d("Mark all read failed:", (response as? HTTPURLResponse)?.statusCode as Any)
                return
            }
            notifications = notifications.map {
                VPNotification(id: $0.id, userId: $0.userId, title: $0.title,
                               body: $0.body, type: $0.type, isReadRaw: true,
                               actionUrl: $0.actionUrl, createdAt: $0.createdAt)
            }
        } catch {
            Log.d("Mark all read error:", error)
        }
    }

    private func loadNotifications() async {
        guard let userId = auth.currentUser?.id else {
            loading = false
            return
        }

        do {
            let data: [VPNotification] = try await client.from("notifications")
                .select()
                .eq("user_id", value: userId)
                .order("created_at", ascending: false)
                .limit(50)
                .execute().value
            notifications = data
        } catch {
            Log.d("Failed to load notifications: \(error)")
        }
        loading = false
    }

    // MARK: - Manage Data

    private func loadManageData() async {
        guard let userId = auth.currentUser?.id else {
            manageLoading = false
            return
        }

        do {
            // Round 6 iOS-DATA: `alert_preferences` schema is per-alert-type
            // channel/frequency settings (channel_push, channel_email,
            // is_enabled, frequency). It does NOT model per-topic
            // subscriptions with `type`/`value`/`reference_id`. The iOS
            // subscription feature is disabled until Round 7 designs a
            // `subscription_topics` table + API route. See
            // 05-Working/OWNER_TO_DO.md ("Alert subscriptions model").
            #if false
            let subs: [AlertSubscription] = try await client.from("alert_preferences")
                .select()
                .eq("user_id", value: userId)
                .execute().value

            subscribedCategories = subs.filter { $0.type == "category" }
            subscribedSubcategories = subs.filter { $0.type == "subcategory" }
            subscribedKeywords = subs.filter { $0.type == "keyword" }
            #else
            subscribedCategories = []
            subscribedSubcategories = []
            subscribedKeywords = []
            #endif

            // Fetch all categories
            allCategories = try await client.from("categories")
                .select()
                .eq("is_kids_safe", value: false)
                .eq("is_active", value: true)
                .order("sort_order", ascending: true)
                .execute().value

            allSubcategories = []
        } catch {
            Log.d("Failed to load manage data: \(error)")
        }
        manageLoading = false
    }

    private func addCategorySubscription() async {
        guard let userId = auth.currentUser?.id, !selectedCategoryToAdd.isEmpty else { return }
        let catName = allCategories.first(where: { $0.id == selectedCategoryToAdd })?.name ?? selectedCategoryToAdd

        // Round 6 iOS-DATA: gated off until Round 7 redesign — see
        // loadManageData() comment. Kept in source so the UI wiring is
        // trivial to re-enable once the real table exists.
        #if false
        struct NewSub: Encodable {
            let user_id: String
            let type: String
            let value: String
            let reference_id: String
        }

        do {
            let sub = NewSub(user_id: userId, type: "category", value: catName, reference_id: selectedCategoryToAdd)
            try await client.from("alert_preferences").insert(sub).execute()
            selectedCategoryToAdd = ""
            await loadManageData()
            await maybeOfferPush()
        } catch {
            Log.d("Failed to add category subscription: \(error)")
        }
        #else
        _ = userId; _ = catName
        selectedCategoryToAdd = ""
        await loadManageData()
        #endif
    }

    private func addSubcategorySubscription() async {
        guard let userId = auth.currentUser?.id, !selectedSubcategoryToAdd.isEmpty else { return }
        let subName = allSubcategories.first(where: { $0.id == selectedSubcategoryToAdd })?.name ?? selectedSubcategoryToAdd

        // Round 6 iOS-DATA: gated off until Round 7 redesign.
        #if false
        struct NewSub: Encodable {
            let user_id: String
            let type: String
            let value: String
            let reference_id: String
        }

        do {
            let sub = NewSub(user_id: userId, type: "subcategory", value: subName, reference_id: selectedSubcategoryToAdd)
            try await client.from("alert_preferences").insert(sub).execute()
            selectedSubcategoryToAdd = ""
            await loadManageData()
            await maybeOfferPush()
        } catch {
            Log.d("Failed to add subcategory subscription: \(error)")
        }
        #else
        _ = userId; _ = subName
        selectedSubcategoryToAdd = ""
        await loadManageData()
        #endif
    }

    private func addKeywordSubscription() async {
        guard let userId = auth.currentUser?.id else { return }
        let keyword = newKeyword.trimmingCharacters(in: .whitespaces)
        guard !keyword.isEmpty else { return }

        // Round 6 iOS-DATA: gated off until Round 7 redesign.
        #if false
        struct NewSub: Encodable {
            let user_id: String
            let type: String
            let value: String
        }

        do {
            let sub = NewSub(user_id: userId, type: "keyword", value: keyword)
            try await client.from("alert_preferences").insert(sub).execute()
            newKeyword = ""
            await loadManageData()
            await maybeOfferPush()
        } catch {
            Log.d("Failed to add keyword subscription: \(error)")
        }
        #else
        _ = userId; _ = keyword
        newKeyword = ""
        await loadManageData()
        #endif
    }

    /// Offer push enrollment the first time a user subscribes to anything.
    /// If they've already been through the iOS prompt, don't re-ask — there's
    /// no value in showing a pre-prompt we can't back up with a system dialog.
    private func maybeOfferPush() async {
        await push.refresh()
        guard push.status == .notDetermined, !push.hasBeenPrompted else { return }
        await MainActor.run { showPushPrompt = true }
    }

    private func removeSubscription(_ sub: AlertSubscription) async {
        // Round 6 iOS-DATA: gated off until Round 7 redesign. The
        // subscription list is always empty in the current build, so
        // this path is unreachable — but preserved in source for Round 7.
        #if false
        do {
            try await client.from("alert_preferences")
                .delete()
                .eq("id", value: sub.id)
                .execute()

            subscribedCategories.removeAll { $0.id == sub.id }
            subscribedSubcategories.removeAll { $0.id == sub.id }
            subscribedKeywords.removeAll { $0.id == sub.id }
        } catch {
            Log.d("Failed to remove subscription: \(error)")
        }
        #else
        _ = sub
        #endif
    }
}

// MARK: - Notification model

struct VPNotification: Codable, Identifiable {
    let id: String
    var userId: String?
    var title: String?
    var body: String?
    var type: String?
    // Round 6 iOS-DATA: table columns are `is_read` and `action_url`.
    // Previous `read` / `link` Codable keys were phantom; reads silently
    // decoded to nil and every row appeared unread / linkless.
    var isReadRaw: Bool?
    var actionUrl: String?
    var createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, title, body, type
        case userId = "user_id"
        case isReadRaw = "is_read"
        case actionUrl = "action_url"
        case createdAt = "created_at"
    }

    /// Non-optional convenience for call sites that want a plain Bool.
    var isRead: Bool { isReadRaw ?? false }

    /// Extracts a story slug from the action_url field if it matches "/story/<slug>".
    var storySlug: String? {
        guard let link = actionUrl, link.hasPrefix("/story/") else { return nil }
        let slug = String(link.dropFirst("/story/".count))
        return slug.isEmpty ? nil : slug
    }
}

// MARK: - Alert Subscription model

struct AlertSubscription: Codable, Identifiable {
    let id: String
    var userId: String?
    var type: String?
    var value: String?
    var referenceId: String?
    var createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, type, value
        case userId = "user_id"
        case referenceId = "reference_id"
        case createdAt = "created_at"
    }
}

// MARK: - Flow Layout for keyword tags

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }

        return CGSize(width: maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX && x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
