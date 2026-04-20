import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

struct ContentView: View {
    @EnvironmentObject var auth: AuthViewModel

    var body: some View {
        Group {
            if auth.isLoading {
                // Splash
                ZStack {
                    VP.bg.ignoresSafeArea()
                    VStack(spacing: 12) {
                        Text("Verity Post")
                            .font(.system(.largeTitle, design: .default, weight: .bold))
                            .tracking(-1)
                            .foregroundColor(VP.text)
                        ProgressView()
                    }
                }
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
            } else if auth.currentUser?.needsOnboarding == true {
                WelcomeView(onFinish: {})
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
        }
        .preferredColorScheme(.light)
    }
}

// MARK: - Main Tab View — standard SwiftUI TabView (spec: 5 tabs)

struct MainTabView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var selectedTab: Tab = .home
    @State private var showLogin = false

    enum Tab: Hashable { case home, notifications, leaderboard, profile }

    private var isLoggedIn: Bool { auth.currentUser != nil }

    var body: some View {
        VStack(spacing: 0) {
            if auth.sessionExpired {
                sessionExpiredBanner
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
    // Mirrors the web app exactly (site/src/app/NavWrapper.js): 4 tabs,
    // text-only (no icons), bottom-fixed, translucent white with a blur.
    // Active tab renders in accent color, bold. Notifications shows a red
    // dot when unreadCount > 0.

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
                            detail: "Sign in to get breaking news alerts and reply notifications."
                        )
                    }
                }
            case .leaderboard: NavigationStack { LeaderboardView() }
            case .profile:
                NavigationStack {
                    if isLoggedIn {
                        ProfileView()
                    } else {
                        SignInGate(
                            feature: "Your profile",
                            detail: "Create an account to track your reading, earn points, and save articles."
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
        .onChange(of: isLoggedIn) { _, nowLoggedIn in
            if nowLoggedIn && showLogin {
                showLogin = false
                selectedTab = .profile
            } else if !nowLoggedIn && selectedTab == .profile {
                selectedTab = .home
            }
        }
    }

    // MARK: - Session-expired banner

    private var sessionExpiredBanner: some View {
        HStack(spacing: 10) {
            Text("Your session expired. Please sign in again.")
                .font(.system(.footnote, design: .default, weight: .medium))
                .foregroundColor(.white)
            Spacer(minLength: 0)
            Button("Sign in") { showLogin = true }
                .font(.system(.footnote, design: .default, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color.white.opacity(0.18))
                .cornerRadius(6)
            Button {
                auth.sessionExpired = false
            } label: {
                Image(systemName: "xmark")
                    .font(.system(.caption2, design: .default, weight: .bold))
                    .foregroundColor(.white)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(VP.accent)
    }
}

// MARK: - Text-only bottom tab bar (matches web NavWrapper)

struct TextTabBar: View {
    @Binding var selected: MainTabView.Tab
    let isLoggedIn: Bool
    @State private var unreadCount: Int = 0

    private struct Item: Identifiable {
        let id: MainTabView.Tab
        let label: String
    }

    private var items: [Item] {
        [
            Item(id: .home, label: "Home"),
            Item(id: .notifications, label: "Notifications"),
            Item(id: .leaderboard, label: "Leaderboard"),
            Item(id: .profile, label: isLoggedIn ? "Profile" : "Sign in"),
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
