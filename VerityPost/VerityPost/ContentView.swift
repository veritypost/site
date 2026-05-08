import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

struct ContentView: View {
    @EnvironmentObject var auth: AuthViewModel

    // Animated splash state — drives a 500-700ms branded fade-in while
    // the session-check task runs in the background. Kept cheap: a single
    // opacity + scale transition, no network coupling, so it completes
    // even on a cold start with no connectivity.
    @State private var splashLogoOpacity: Double = 0
    @State private var splashWordmarkOpacity: Double = 0
    @State private var splashLogoScale: CGFloat = 0.92

    var body: some View {
        Group {
            if !SupabaseManager.shared.configValid {
                // Build was shipped without SUPABASE_URL / SUPABASE_KEY in
                // Info.plist (or with a malformed URL). Render a static
                // failure screen so Apple Review and TestFlight users get
                // a deterministic recovery path instead of a silent crash.
                ZStack {
                    VP.bg.ignoresSafeArea()
                    VStack(spacing: 14) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.largeTitle)
                            .foregroundColor(VP.danger)
                            .accessibilityHidden(true)
                        Text("Verity Post")
                            .font(.system(.title, design: .default, weight: .bold))
                            .tracking(-1)
                            .foregroundColor(VP.text)
                        Text("Build configuration error")
                            .font(.system(.callout, design: .default, weight: .semibold))
                            .foregroundColor(VP.text)
                        Text("This build of the app is missing required configuration. Please contact support@veritypost.com so we can ship a fix.")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Build configuration error. Please contact support at support at veritypost.com.")
                }
            } else if auth.isLoading {
                // Splash — branded fade-in. VP tile scales + fades, wordmark
                // follows at +200ms, ProgressView appears at +500ms so it
                // never flashes ahead of the branding. Stage copy:
                //   .initial — no copy (just branded mark + spinner)
                //   .connecting (5s+) — "Connecting…"
                //   .slowNetwork (15s+) — "Network seems slow — keep waiting?"
                ZStack {
                    VP.bg.ignoresSafeArea()
                    VStack(spacing: 14) {
                        ZStack {
                            RoundedRectangle(cornerRadius: VP.radiusMD)
                                .fill(VP.text)
                                .frame(width: 64, height: 64)
                                .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
                            Text("VP")
                                .font(.system(.title, design: .default, weight: .black))
                                .foregroundColor(.white)
                        }
                        .opacity(splashLogoOpacity)
                        .scaleEffect(splashLogoScale)
                        .accessibilityHidden(true)

                        Text("Verity Post")
                            .font(.system(.largeTitle, design: .default, weight: .bold))
                            .tracking(-1)
                            .foregroundColor(VP.text)
                            .opacity(splashWordmarkOpacity)

                        ProgressView()
                            .tint(VP.dim)
                            .opacity(splashWordmarkOpacity)
                            .padding(.top, 4)

                        if let copy = splashStageCopy {
                            Text(copy)
                                .font(.footnote)
                                .foregroundColor(VP.dim)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 40)
                                .padding(.top, 4)
                                .transition(.opacity)
                        }

                        if auth.splashStage == .slowNetwork {
                            Button("Continue without signing in") {
                                auth.splashTimedOut = true
                                auth.isLoading = false
                            }
                            .font(.footnote)
                            .foregroundColor(VP.accent)
                            .padding(.top, 4)
                        }
                    }
                    .animation(.easeInOut(duration: 0.25), value: auth.splashStage)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Verity Post. Loading.")
                }
                .onAppear { runSplashIntro() }
            } else if auth.splashTimedOut {
                // Fallback when the session check couldn't complete.
                ZStack {
                    VP.bg.ignoresSafeArea()
                    VStack(spacing: 14) {
                        Text("Verity Post")
                            .font(.system(.title, design: .default, weight: .bold))
                            .tracking(-1)
                            .foregroundColor(VP.text)
                        Text("We\u{2019}re having trouble reaching Verity Post.\nCheck your connection and try again.")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                        Button("Try again") {
                            Task { await auth.retrySession() }
                        }
                        .font(.system(.subheadline, design: .default, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 26)
                        .padding(.vertical, 11)
                        .frame(minHeight: 44)
                        .background(VP.accent)
                        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                        Button("Continue without signing in") {
                            auth.splashTimedOut = false
                        }
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                    }
                }
            } else if auth.needsEmailVerification {
                VerifyEmailView()
                    .environmentObject(auth)
            } else if auth.currentUser?.needsOnboarding == true && !auth.bypassOnboardingLocally {
                // WelcomeView handles the onboarding stamp + user reload
                // itself. When the reload flips `needsOnboarding` false
                // this branch is replaced by MainTabView automatically.
                // T88 — `bypassOnboardingLocally` is the user-initiated
                // "Continue anyway" escape after repeated stamp failures.
                // Bypass is local-only; on next launch the welcome flow
                // re-fires if `onboarding_completed_at IS NULL` server-side.
                WelcomeView()
                    .environmentObject(auth)
            } else {
                MainTabView()
                    .environmentObject(auth)
            }
        }
        // Item 13 — first-login username pick is an undismissable sheet
        // mounted at the outer ContentView level so it takes precedence
        // over MainTabView's own .sheet(item: $deepLinkStory). Two sheets
        // on the same view tree fight; this one must win.
        //
        // `auth.needsPickUsername` is a *computed* var (not @Published) —
        // direct `$auth.needsPickUsername` won't compile. Bind through a
        // get/no-op-set Binding; the sheet auto-dismisses when
        // PickUsernameView.save() reloads currentUser and the computed
        // value flips false.
        .sheet(isPresented: Binding(
            get: { auth.needsPickUsername },
            set: { _ in }
        )) {
            PickUsernameView()
                .environmentObject(auth)
                .interactiveDismissDisabled(true)
                .presentationDragIndicator(.hidden)
        }
        .fullScreenCover(isPresented: $auth.isRecoveringPassword) {
            ResetPasswordView()
                .environmentObject(auth)
        }
        .task {
            await auth.checkSession()
        }
        .onChange(of: auth.currentUser?.id) { _, newId in
            PushRegistration.shared.setCurrentUser(newId)
            // H12 — kick off APNs registration now that we have a user.
            // Prior code defined registerIfPermitted() but never called
            // it here; the device-token upload chain only fired when the
            // user manually visited the Alerts tab (if ever). Fire and
            // forget; registerIfPermitted() is a no-op if permission
            // hasn't been granted yet.
            Task { await PushRegistration.shared.registerIfPermitted() }
            // Apple Guideline 1.2 — block-list cache follows the auth user.
            // Loaded fresh on login/logout so comment + DM filters always
            // resolve against the current viewer's perspective.
            Task { await BlockService.shared.refresh(currentUserId: newId) }
        }
    }

    // 600ms branded splash sequence. Skips re-running if the splash is
    // hidden and re-shown (state is preserved on the View).
    private func runSplashIntro() {
        guard splashLogoOpacity == 0 else { return }
        withAnimation(.easeOut(duration: 0.35)) {
            splashLogoOpacity = 1
            splashLogoScale = 1.0
        }
        withAnimation(.easeOut(duration: 0.35).delay(0.15)) {
            splashWordmarkOpacity = 1
        }
    }

    /// T102 — copy that surfaces alongside the branded splash once the
    /// session check has been running long enough that the user might
    /// reasonably wonder whether anything is happening.
    private var splashStageCopy: String? {
        switch auth.splashStage {
        case .initial: return nil
        case .connecting: return "Connecting\u{2026}"
        case .slowNetwork:
            return "Network seems slow. Keep waiting, or continue without signing in?"
        }
    }
}

// MARK: - Main Tab View — 2-tab layout: Home, Profile (Browse + Following dropped; BrowseLanding + FollowingView retained for re-expose)

struct MainTabView: View {
    @EnvironmentObject var auth: AuthViewModel
    @EnvironmentObject var articleRouter: ArticleRouter
    @State private var selectedTab: Tab = .today
    @State private var showLogin = false
    // T118 — story deep-link landing pad. ArticleRouter publishes the
    // slug; the .onChange below fetches the Story and presents
    // StoryDetailView as a sheet so the deep-link doesn't have to push
    // onto a specific tab's nav stack (each tab has its own).
    @State private var deepLinkStory: Story?
    private let deepLinkClient = SupabaseManager.shared.client

    // Nav restructure 2026-05-06: matches mobile web. Browse removed
    // from bottom nav; sections accessible via HomeSectionsSheet.
    // 2026-05-07: Following added back as a 3rd tab (mirrors web
    // NavWrapper update) — points at the article-bookmarks list.
    // The story-level /following surface stays launch-hidden.
    // Notifications and Rankings still accessed from Profile.
    // Profile slot relabels to "Sign up" for anon users.
    // Owner cleanup item 12 (2026-05-08, refined) — Following lives in
    // HomeSectionsSheet (top-bar grid icon on Home), not as a tab. Two
    // tabs only: Today + Profile. Mirrors web's Home + Profile bottom nav.
    enum Tab: Hashable { case today, profile }

    private var isLoggedIn: Bool { auth.currentUser != nil }

    var body: some View {
        VStack(spacing: 0) {
            if auth.sessionExpired {
                sessionExpiredBanner
            }
            if let err = auth.deepLinkError {
                deepLinkErrorBanner(message: err)
            }
            if let user = auth.currentUser {
                AccountStateBannerView(user: user)
            }

            adultTabView
        }
        .ignoresSafeArea(.keyboard)
        .sheet(isPresented: $showLogin) {
            LoginView().environmentObject(auth)
        }
    }

    // MARK: - Adult tab bar
    //
    // 2 tabs: Home, Profile — matches mobile web nav.
    // Browse removed; sections accessible via HomeSectionsSheet on the home toolbar.
    // Text-only (no icons), bottom-fixed, translucent white with a blur.
    // Active tab renders in accent color, bold. Anon users see the same 2
    // slots; the Profile slot flips to "Sign up" via the SignInGate
    // destination. Alerts and Rankings are accessed from Profile.

    private var adultTabView: some View {
        ZStack {
            switch selectedTab {
            case .today: NavigationStack { HomeView() }
            case .profile:
                NavigationStack {
                    if isLoggedIn {
                        ProfileView()
                    } else {
                        SignInGate(
                            feature: "Create your account",
                            detail: "Sign up to track your reading, earn points, and save articles."
                        )
                    }
                }
            }
        }
        .environmentObject(auth)
        // safeAreaInset makes the tab bar dock above the home indicator
        // automatically — no manual bottom padding, no white gap below.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            TextTabBar(selected: $selectedTab, isLoggedIn: isLoggedIn)
        }
        .onChange(of: auth.pendingHomeJump) { _, requested in
            // T66 — BookmarksView's empty-state CTA requests a tab swap
            // by flipping this flag. Apply the swap + clear the flag so a
            // future request is observable.
            if requested {
                selectedTab = .today
                auth.pendingHomeJump = false
            }
        }
        .onChange(of: isLoggedIn) { _, nowLoggedIn in
            if nowLoggedIn && showLogin {
                showLogin = false
                selectedTab = .profile
            }
            // Anon users keep the Profile tab visible (relabelled "Sign up");
            // no auto-redirect to .home on logout.
        }
        .onChange(of: articleRouter.pendingSlug) { _, slug in
            consumePendingSlugIfReady(slug: slug)
        }
        .onReceive(NotificationCenter.default.publisher(for: .vpOpenStory)) { note in
            if let slug = note.userInfo?["slug"] as? String {
                articleRouter.pendingSlug = slug
            }
        }
        .onChange(of: auth.currentUser?.username) { _, _ in
            // Item 13 — when the first-login username sheet finishes,
            // currentUser.username flips from nil/empty to the picked
            // value and `needsPickUsername` becomes false. Re-attempt
            // any deep link that was held above so links arriving during
            // the sheet aren't dropped.
            consumePendingSlugIfReady(slug: articleRouter.pendingSlug)
        }
        .sheet(item: $deepLinkStory) { story in
            NavigationStack {
                StoryDetailView(story: story).environmentObject(auth)
            }
        }
    }

    /// Item 13 — gate the deep-link consumer behind the username sheet.
    /// While `auth.needsPickUsername` is true the slug is held on
    /// `articleRouter.pendingSlug`; once the sheet dismisses (username
    /// saved → currentUser reload → needsPickUsername flips false) the
    /// onChange watcher on `currentUser?.username` re-invokes this and
    /// the deep link plays normally.
    private func consumePendingSlugIfReady(slug: String?) {
        guard let slug = slug else { return }
        if auth.needsPickUsername { return }
        articleRouter.pendingSlug = nil
        Task {
            if let story = await fetchStoryBySlug(slug) {
                deepLinkStory = story
            }
        }
    }

    private func fetchStoryBySlug(_ slug: String) async -> Story? {
        do {
            struct StoryIdRow: Decodable { let id: String }
            let storyRows: [StoryIdRow] = try await deepLinkClient.from("stories")
                .select("id").eq("slug", value: slug).limit(1).execute().value
            guard let storyId = storyRows.first?.id else { return nil }
            let stories: [Story] = try await deepLinkClient.from("articles")
                .select("*, stories(slug)").eq("story_id", value: storyId).limit(1).execute().value
            return stories.first
        } catch {
            Log.d("Failed to fetch story by slug:", error)
            return nil
        }
    }

    // MARK: - Session-expired banner

    /// T103 — branch banner copy on the cause. Falls back to the original
    /// generic line when the listener fired without setting a reason
    /// (defensive — every wired signout path now sets one).
    private var sessionExpiredCopy: String {
        switch auth.sessionExpiredReason {
        case .tokenExpired, .none:
            return "Session expired \u{2014} please sign in."
        case .remoteSignout:
            return "Signed out from another device."
        case .accountChange:
            return "Account changes detected \u{2014} please sign in again."
        }
    }

    private var sessionExpiredBanner: some View {
        HStack(spacing: 10) {
            Text(sessionExpiredCopy)
                .font(.system(.footnote, design: .default, weight: .medium))
                .foregroundColor(.white)
            Spacer(minLength: 0)
            Button {
                auth.dismissSessionExpired()
                showLogin = true
            } label: {
                Text("Sign in")
                    .font(.system(.footnote, design: .default, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .background(
                        RoundedRectangle(cornerRadius: VP.radiusSM)
                            .fill(Color.white.opacity(0.18))
                    )
            }
            Button {
                auth.dismissSessionExpired()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(.caption, design: .default, weight: .bold))
                    .foregroundColor(.white)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Dismiss session expired banner")
        }
        .padding(.leading, 16)
        .padding(.trailing, 4)
        .padding(.vertical, 4)
        .background(VP.accent)
    }

    // MARK: - T206 + T48 — Deep-link error banner

    private func deepLinkErrorBanner(message: String) -> some View {
        HStack(spacing: 10) {
            Text(message)
                .font(.system(.footnote, design: .default, weight: .medium))
                .foregroundColor(.white)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button {
                auth.dismissDeepLinkError()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(.caption, design: .default, weight: .bold))
                    .foregroundColor(.white)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Dismiss link error banner")
        }
        .padding(.leading, 16)
        .padding(.trailing, 4)
        .padding(.vertical, 4)
        .background(VP.danger)
    }
}

// MARK: - Text-only bottom tab bar (matches web NavWrapper)

struct TextTabBar: View {
    @Binding var selected: MainTabView.Tab
    let isLoggedIn: Bool

    private struct Item: Identifiable {
        let id: MainTabView.Tab
        let label: String
    }

    private var items: [Item] {
        // Owner cleanup item 12 (2026-05-08, refined) — Following lives in
        // HomeSectionsSheet (top-bar grid icon on Home), not as a tab. Two
        // slots only: Home + Profile (or Sign up for anon). Mirrors web.
        if isLoggedIn {
            return [
                Item(id: .today,   label: "Home"),
                Item(id: .profile, label: "Profile"),
            ]
        }
        return [
            Item(id: .today,   label: "Home"),
            Item(id: .profile, label: "Sign up"),
        ]
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items) { item in
                Button {
                    selected = item.id
                } label: {
                    Text(item.label)
                        .font(.system(.footnote, design: .default, weight: selected == item.id ? .bold : .medium))
                        .foregroundColor(selected == item.id ? VP.accent : VP.dim)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .overlay(alignment: .bottom) {
                            Rectangle()
                                .fill(selected == item.id ? VP.accent : Color.clear)
                                .frame(height: 2)
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .background(
            VP.bg.opacity(0.97)
                .background(.ultraThinMaterial)
                .overlay(Rectangle().fill(VP.border).frame(height: 1), alignment: .top)
        )
    }
}

// MARK: - Sign-in gate

struct SignInGate: View {
    let feature: String
    let detail: String
    @State private var showLogin = false
    @State private var showSignup = false
    @EnvironmentObject var auth: AuthViewModel

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Text(feature)
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text(detail)
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
                .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
            Button("Create free account") { showSignup = true }
                .font(.system(.footnote, design: .default, weight: .medium))
                .foregroundColor(VP.accent)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(VP.bg)
        .sheet(isPresented: $showLogin) { LoginView().environmentObject(auth) }
        .sheet(isPresented: $showSignup) { SignupView().environmentObject(auth) }
    }
}
