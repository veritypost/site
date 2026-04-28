import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified follow 2026-04-18

/// Public profile for a user identified by username. Score, follow, and
/// share-card affordances are all gated via `PermissionService` (server
/// owns the plan/role→permission mapping, admin toggles reflect immediately).
struct PublicProfileView: View {
    let username: String
    @EnvironmentObject var auth: AuthViewModel
    @ObservedObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client

    @State private var profile: VPUser?
    @State private var loading = true
    @State private var isFollowing = false
    @State private var followBusy = false
    @State private var notFound = false

    // Permission flags populated from PermissionService.
    @State private var canViewOtherTotal: Bool = false
    @State private var canFollow: Bool = false
    @State private var canShareCard: Bool = false

    // Apple Guideline 1.2 — Report / Block on user profiles.
    @ObservedObject private var blocks = BlockService.shared
    @State private var showReportDialog = false
    @State private var showBlockDialog = false
    @State private var profileToast: String? = nil

    // Anon sign-up CTA sheets — mirror ProfileView's anon flow.
    @State private var showLogin = false
    @State private var showSignup = false

    var body: some View {
        ScrollView {
            if loading {
                ProgressView().padding(.top, 60)
            } else if auth.currentUser == nil {
                // Web parity (`web/src/app/u/[username]/page.tsx`): anon
                // visitors get an in-page sign-up CTA instead of the
                // profile body. We deliberately don't hit the users
                // table on the anon branch — display_name / bio /
                // avatar / follower counts never cross the wire for a
                // random visitor. The /card/<username> path remains the
                // public share surface.
                anonSignUpGate
            } else if notFound {
                VStack(spacing: 6) {
                    Text("Profile not found")
                        .font(.system(.callout, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                    Text("That user doesn\u{2019}t exist or has been removed.")
                        .font(.caption)
                        .foregroundColor(VP.dim)
                }
                .padding(.top, 60)
            } else if let u = profile {
                profileBody(u)
            }
        }
        .background(VP.bg)
        .navigationTitle("@\(username)")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(
            "Report user",
            isPresented: $showReportDialog,
            titleVisibility: .visible
        ) {
            ForEach(ReportReason.allCases) { reason in
                Button(reason.label) {
                    if let id = profile?.id {
                        Task { await submitProfileReport(targetId: id, reason: reason) }
                    }
                }
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("Tell us why. A moderator will review it.")
        }
        .confirmationDialog(
            blocks.isBlocked(profile?.id ?? "") ? "Unblock @\(profile?.username ?? username)?" : "Block @\(profile?.username ?? username)?",
            isPresented: $showBlockDialog,
            titleVisibility: .visible
        ) {
            if blocks.isBlocked(profile?.id ?? "") {
                Button("Unblock") {
                    if let id = profile?.id { Task { await performUnblock(id: id) } }
                }
            } else {
                Button("Block", role: .destructive) {
                    if let id = profile?.id { Task { await performBlock(id: id) } }
                }
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text(blocks.isBlocked(profile?.id ?? "")
                 ? "You\u{2019}ll start seeing this user\u{2019}s comments and messages again."
                 : "You won\u{2019}t see their comments or messages.")
        }
        .overlay(alignment: .top) {
            if let toast = profileToast {
                Text(toast)
                    .font(.system(.footnote, design: .default, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 10).fill(VP.accent))
                    .shadow(radius: 4)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.25), value: profileToast)
        .sheet(isPresented: $showLogin) { LoginView().environmentObject(auth) }
        .sheet(isPresented: $showSignup) { SignupView().environmentObject(auth) }
        .task { await load() }
        .task(id: perms.changeToken) {
            canViewOtherTotal = await PermissionService.shared.has("profile.score.view.other.total")
            canFollow = await PermissionService.shared.has("profile.follow")
            canShareCard = await PermissionService.shared.has("profile.card.share_link")
        }
    }

    // MARK: - Anon sign-up gate (web parity)
    //
    // Mirrors `web/src/app/u/[username]/page.tsx` Q1 anon hero. Renders
    // an in-page CTA prompting the visitor to sign up; tapping the
    // primary or secondary action opens the LoginView / SignupView
    // sheet rather than redirecting (no URL-bar to bounce out of in
    // a native nav stack).
    private var anonSignUpGate: some View {
        VStack(spacing: 14) {
            Spacer().frame(height: 60)
            ZStack {
                Circle()
                    .fill(VP.card)
                    .overlay(Circle().stroke(VP.border))
                    .frame(width: 64, height: 64)
                Text("@")
                    .font(.system(size: 24, weight: .bold, design: .monospaced))
                    .foregroundColor(VP.accent)
            }
            Text("Sign up to see @\(username)\u{2019}s profile")
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
                .multilineTextAlignment(.center)
            Text("Profiles show reading history, Verity Score, streak, comments, and more. Join free to view this profile and build your own.")
                .font(.footnote)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("Sign up") { showSignup = true }
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 28)
                .padding(.vertical, 12)
                .frame(minHeight: 44)
                .background(VP.accent)
                .cornerRadius(10)
            Button("Already have an account? Sign in") { showLogin = true }
                .font(.system(.footnote, design: .default, weight: .medium))
                .foregroundColor(VP.accent)
            Spacer().frame(height: 80)
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Apple Guideline 1.2 — moderation actions

    private func submitProfileReport(targetId: String, reason: ReportReason) async {
        let ok = await ReportService.submit(targetType: .user, targetId: targetId, reason: reason)
        await MainActor.run {
            flashProfileToast(ok ? "Thanks for the report. We\u{2019}ll review it." : "Couldn\u{2019}t send report. Try again.")
        }
    }

    private func performBlock(id: String) async {
        let ok = await BlockService.shared.block(targetId: id)
        await MainActor.run {
            flashProfileToast(ok ? "Blocked." : "Couldn\u{2019}t block. Try again.")
        }
    }

    private func performUnblock(id: String) async {
        let ok = await BlockService.shared.unblock(targetId: id)
        await MainActor.run {
            flashProfileToast(ok ? "Unblocked." : "Couldn\u{2019}t unblock. Try again.")
        }
    }

    @MainActor
    private func flashProfileToast(_ text: String) {
        profileToast = text
        Task {
            try? await Task.sleep(nanoseconds: 2_400_000_000)
            await MainActor.run {
                if profileToast == text { profileToast = nil }
            }
        }
    }

    private func profileBody(_ u: VPUser) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 14) {
                AvatarView(user: u, size: 72)
                VStack(alignment: .leading, spacing: 4) {
                    Text(u.username ?? "")
                        .font(.system(.title3, design: .default, weight: .bold))
                        .foregroundColor(VP.text)
                    VerifiedBadgeView(user: u, size: 11)
                    // D7: gated on `profile.score.view.other.total`.
                    if canViewOtherTotal, let score = u.verityScore {
                        Text("Verity Score \(score)")
                            .font(.caption)
                            .foregroundColor(VP.dim)
                    }
                }
                Spacer()
            }

            // D28: follow button is gated on `profile.follow`.
            if canFollow && auth.currentUser?.id != u.id {
                Button {
                    Task { await toggleFollow(target: u.id) }
                } label: {
                    Text(isFollowing ? "Following" : "Follow")
                        .font(.system(.footnote, design: .default, weight: .semibold))
                        .foregroundColor(isFollowing ? VP.text : .white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 8)
                        .frame(minHeight: 44)
                        .background(isFollowing ? VP.card : VP.accent)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(isFollowing ? VP.border : Color.clear))
                        .cornerRadius(8)
                }
                .disabled(followBusy)
            }

            // Apple Guideline 1.2 — Report user / Block user. Hidden on
            // own profile. Block toggles via the cached BlockService set,
            // so the label flips immediately after a successful POST/DELETE.
            if auth.currentUser?.id != u.id {
                HStack(spacing: 12) {
                    Button {
                        showReportDialog = true
                    } label: {
                        Text("Report user")
                            .font(.system(.footnote, design: .default, weight: .semibold))
                            .foregroundColor(VP.text)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .frame(minHeight: 44)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
                    }
                    Button {
                        showBlockDialog = true
                    } label: {
                        Text(blocks.isBlocked(u.id) ? "Unblock" : "Block user")
                            .font(.system(.footnote, design: .default, weight: .semibold))
                            .foregroundColor(blocks.isBlocked(u.id) ? VP.text : Color(hex: "B91C1C"))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .frame(minHeight: 44)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(blocks.isBlocked(u.id) ? VP.border : Color(hex: "B91C1C")))
                    }
                }
            }

            Divider().background(VP.border)

            // Canonical public-profile stat set — matches own profile,
            // web own profile, and web public profile. Hidden when the
            // target has flipped `show_activity` off.
            if u.showActivity != false {
                HStack(spacing: 16) {
                    stat(label: "Articles read", value: u.articlesReadCount ?? 0)
                    stat(label: "Quizzes passed", value: u.quizzesCompletedCount ?? 0)
                    stat(label: "Comments", value: u.commentCount ?? 0)
                    stat(label: "Followers", value: u.followersCount ?? 0)
                    stat(label: "Following", value: u.followingCount ?? 0)
                }
            }

            if !canViewOtherTotal {
                upgradeHint
            }

            // D32: shareable profile card — gated on `profile.card.share_link`,
            // own profile only (matches site/src/app/u/[username]/page.js:132).
            if canShareCard,
               auth.currentUser?.id == u.id,
               let name = u.username,
               let url = profileCardURL(for: name) {
                ShareLink(item: url) {
                    Text("Share profile")
                        .font(.system(.footnote, design: .default, weight: .semibold))
                        .foregroundColor(VP.accent)
                }
            }

            Spacer().frame(height: 40)
        }
        .padding(20)
    }

    private func profileCardURL(for username: String) -> URL? {
        let encoded = username.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? username
        return URL(string: "https://veritypost.com/card/\(encoded)")
    }

    private func stat(label: String, value: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value.formatted())
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text(label)
                .font(.caption)
                .foregroundColor(VP.dim)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var upgradeHint: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("See more with Verity")
                .font(.system(.footnote, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
            Text("Paid plans show per-category Verity Scores and unlock following and DMs.")
                .font(.caption)
                .foregroundColor(VP.dim)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VP.card)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
        .cornerRadius(10)
    }

    // MARK: - Data

    private func load() async {
        loading = true
        // Web parity: anon visitors short-circuit BEFORE the target
        // fetch so we never read another user's profile row anonymously.
        // The body branch renders `anonSignUpGate` instead.
        if auth.currentUser == nil {
            loading = false
            return
        }
        do {
            // Round A (092b_rls_lockdown_followup): narrow `.select()` (was
            // SELECT *) to the safe, anon-readable column list. Authenticated
            // still has table-level SELECT today, but future column REVOKE
            // sweeps would break SELECT * silently. Matches the anon GRANT
            // list from migration 092b + public_user_profiles view shape.
            // T300 — read via public_profiles_v. The view pre-filters
            // profile_visibility='public' + is_banned=false +
            // deletion_scheduled_for IS NULL, so private/hidden/banned/
            // deletion-scheduled users return no row (caught by the
            // `notFound = true` branch below). Sensitive columns
            // (email, plan_id, stripe_customer_id, cohort, frozen_at,
            // kill-switch flags) never reach this surface.
            //
            // Dropped `is_banned` from the column list — the view
            // already excludes banned users so the column isn't needed.
            let row: VPUser? = try await client.from("public_profiles_v")
                .select("id, username, display_name, bio, avatar_url, avatar_color, banner_url, verity_score, streak_current, is_expert, expert_title, expert_organization, is_verified_public_figure, articles_read_count, quizzes_completed_count, comment_count, followers_count, following_count, show_activity, profile_visibility, email_verified, show_on_leaderboard, created_at")
                .eq("username", value: username)
                .limit(1)
                .single()
                .execute().value
            // T330 / T359 — mirror the web /u/[username]/page.tsx gate:
            // 'private' is the legacy opt-in hide; 'hidden' is the lockdown
            // tier added by the redesign. Both must look like notFound to
            // anyone other than the profile owner — otherwise lockdown
            // leaks the moment PUBLIC_PROFILE_ENABLED flips.
            if let visibility = row?.profileVisibility,
               (visibility == "private" || visibility == "hidden"),
               row?.id != auth.currentUser?.id {
                profile = nil
                notFound = true
                return
            }
            profile = row
            if row == nil { notFound = true }
            if let target = row?.id, let me = auth.currentUser?.id {
                struct F: Decodable { let id: String }
                // v2 schema: follows(follower_id, following_id). No `followed_id`.
                let hits: [F] = (try? await client.from("follows")
                    .select("id")
                    .eq("follower_id", value: me)
                    .eq("following_id", value: target)
                    .limit(1)
                    .execute().value) ?? []
                isFollowing = !hits.isEmpty
            }
        } catch {
            notFound = true
        }
        loading = false
    }

    // Round 6 iOS-GATES — follow toggle routes through POST /api/follows so
    // the toggle_follow RPC owns the insert-or-delete decision server-side
    // AND the permission layer (`requirePermission('profile.follow')` ->
    // compute_effective_perms) enforces frozen_at / plan_grace_period_ends_at
    // — which the old direct follows.insert path missed (RLS only called
    // is_premium() and ignored those fields). The RPC response
    // `{following, target_id}` is the authoritative post-toggle state.
    private func toggleFollow(target: String) async {
        guard auth.currentUser?.id != nil else { return }
        followBusy = true
        defer { followBusy = false }
        do {
            guard let session = try? await client.auth.session else { return }
            let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/follows")

            struct Body: Encodable { let target_user_id: String }
            struct Resp: Decodable { let following: Bool; let target_id: String? }

            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            req.httpBody = try JSONEncoder().encode(Body(target_user_id: target))

            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                // 403 = not paid / not permitted (PERMISSION_DENIED:profile.follow).
                // Keep UI state unchanged.
                return
            }
            let resp = try JSONDecoder().decode(Resp.self, from: data)
            await MainActor.run { isFollowing = resp.following }
        } catch {
            Log.d("follow toggle failed: \(error)")
        }
    }
}
