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
                            RoundedRectangle(cornerRadius: 14)
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
                        .cornerRadius(10)
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
            } else if auth.needsPickUsername {
                // S9-Q2-iOS — magic-link signup creates the auth.users row
                // without a public.users.username; PickUsernameView posts
                // /api/auth/save-username and reloads the user before
                // ContentView re-renders into MainTabView.
                PickUsernameView()
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
        .preferredColorScheme(.light)
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

// MARK: - Main Tab View — 4-tab layout: Home, Notifications, Most Informed, Profile

struct MainTabView: View {
    @EnvironmentObject var auth: AuthViewModel
    @EnvironmentObject var articleRouter: ArticleRouter
    @State private var selectedTab: Tab = .home
    @State private var showLogin = false
    // T118 — story deep-link landing pad. ArticleRouter publishes the
    // slug; the .onChange below fetches the Story and presents
    // StoryDetailView as a sheet so the deep-link doesn't have to push
    // onto a specific tab's nav stack (each tab has its own).
    @State private var deepLinkStory: Story?
    private let deepLinkClient = SupabaseManager.shared.client

    // IA 2026-04-26 (owner-locked, second pass): bottom bar always shows
    // the same 4 slots — Home / Notifications / Most Informed / Profile —
    // for both anon and signed-in users. The Profile slot's label flips
    // to "Sign up" for anon (better engagement than "Log in"; matches web
    // parity). The earlier Browse + Find tabs were folded back into the
    // Home feed (search via a magnifier on Home). Browse view deleted.
    enum Tab: Hashable { case home, notifications, mostInformed, profile }

    private var isLoggedIn: Bool { auth.currentUser != nil }

    var body: some View {
        VStack(spacing: 0) {
            if auth.sessionExpired {
                sessionExpiredBanner
            }
            if let err = auth.deepLinkError {
                deepLinkErrorBanner(message: err)
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
    // 4 tabs: Home, Notifications, Most Informed, Profile.
    // Text-only (no icons), bottom-fixed, translucent white with a blur.
    // Active tab renders in accent color, bold. Notifications shows a red
    // dot when unreadCount > 0. Anon users see the same 4 slots; the
    // Profile slot flips to "Sign up" via the SignInGate destination.
    // LeaderboardView already handles its own anon empty state (top 3 +
    // sign-up overlay), so it's reachable directly without a SignInGate
    // wrap.

    private var adultTabView: some View {
        ZStack {
            switch selectedTab {
            case .home: NavigationStack { HomeView() }
            case .notifications:
                NavigationStack {
                    if isLoggedIn {
                        AlertsView()
                    } else {
                        SignInGate(
                            feature: "Notifications",
                            detail: "Sign up to get breaking news alerts and reply notifications."
                        )
                    }
                }
            case .mostInformed:
                NavigationStack { LeaderboardView() }.environmentObject(auth)
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
                selectedTab = .home
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
            guard let slug = slug else { return }
            articleRouter.pendingSlug = nil
            Task {
                if let story = await fetchStoryBySlug(slug) {
                    deepLinkStory = story
                }
            }
        }
        .sheet(item: $deepLinkStory) { story in
            NavigationStack {
                StoryDetailView(story: story).environmentObject(auth)
            }
        }
    }

    private func fetchStoryBySlug(_ slug: String) async -> Story? {
        do {
            let stories: [Story] = try await deepLinkClient.from("articles")
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
                        RoundedRectangle(cornerRadius: 8)
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
    @State private var unreadCount: Int = 0
    // 60s notification poll matches NavWrapper's web parity: GET
    // /api/notifications?unread=1&limit=1 returns `unread_count` which
    // drives the red dot on the Notifications tab. Anon users skip the
    // poll (no session cookie, the API would 401).
    @State private var unreadTimer: Timer?

    private struct Item: Identifiable {
        let id: MainTabView.Tab
        let label: String
    }

    private var items: [Item] {
        [
            Item(id: .home, label: "Home"),
            Item(id: .notifications, label: "Notifications"),
            Item(id: .mostInformed, label: "Most Informed"),
            Item(id: .profile, label: isLoggedIn ? "Profile" : "Sign up"),
        ]
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items) { item in
                Button {
                    selected = item.id
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Text(item.label)
                            .font(.system(.footnote, design: .default, weight: selected == item.id ? .bold : .medium))
                            .foregroundColor(selected == item.id ? VP.accent : VP.dim)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        if item.id == .notifications && unreadCount > 0 {
                            Circle()
                                .fill(Color(hex: "dc2626"))
                                .frame(width: 8, height: 8)
                                .offset(x: -24, y: 8)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .background(
            Color.white.opacity(0.97)
                .background(.ultraThinMaterial)
                .overlay(Rectangle().fill(VP.border).frame(height: 1), alignment: .top)
        )
        .onAppear { startUnreadPoll() }
        .onDisappear { stopUnreadPoll() }
        .onChange(of: isLoggedIn) { _, _ in
            unreadCount = 0
            startUnreadPoll()
        }
    }

    private func startUnreadPoll() {
        stopUnreadPoll()
        guard isLoggedIn else { return }
        Task { await pollUnreadOnce() }
        unreadTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in
            Task { await pollUnreadOnce() }
        }
    }

    private func stopUnreadPoll() {
        unreadTimer?.invalidate()
        unreadTimer = nil
    }

    private func pollUnreadOnce() async {
        guard isLoggedIn else { return }
        guard let session = try? await SupabaseManager.shared.client.auth.session else { return }
        var url = SupabaseManager.shared.siteURL.appendingPathComponent("api/notifications")
        if var comps = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            comps.queryItems = [URLQueryItem(name: "unread", value: "1"),
                                URLQueryItem(name: "limit", value: "1")]
            if let u = comps.url { url = u }
        }
        var req = URLRequest(url: url)
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }
            struct Body: Decodable { let unread_count: Int? }
            let body = (try? JSONDecoder().decode(Body.self, from: data)) ?? Body(unread_count: nil)
            let count = body.unread_count ?? 0
            await MainActor.run { unreadCount = count }
        } catch {
            // Silent — the dot just stays at its last value rather than
            // flickering on transient network errors.
        }
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
                .cornerRadius(10)
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
