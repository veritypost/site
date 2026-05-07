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

    // Background read-side (TODO-50 Piece A). education / links / topics
    // live in their own tables; fetched after the profile row resolves.
    struct EducationRow: Identifiable, Decodable {
        let school: String
        var degree: String?
        var field: String?
        var years: String?
        var sort_order: Int?
        var id: String { "\(school)|\(degree ?? "")|\(field ?? "")|\(years ?? "")|\(sort_order ?? 0)" }
    }
    struct LinkRow: Identifiable, Decodable {
        let url: String
        var label: String?
        var sort_order: Int?
        var id: String { url }
    }
    struct TopicCategoryWrap: Decodable {
        struct Cat: Decodable { let id: String; let name: String? }
        var categories: Cat?
    }
    @State private var bgEducation: [EducationRow] = []
    @State private var bgLinks: [LinkRow] = []
    @State private var bgTopics: [(id: String, name: String)] = []

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
    @State private var showBackgroundEditor = false

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
        .sheet(isPresented: $showBackgroundEditor) {
            NavigationStack {
                SettingsBackgroundView().environmentObject(auth)
            }
        }
        .task { await load() }
        .task(id: perms.changeToken) {
            canViewOtherTotal = await PermissionService.shared.has("profile.score.view.other.total")
            canFollow = await PermissionService.shared.has("profile.follow")
            canShareCard = await PermissionService.shared.has("profile.card_share")
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
                    .font(.system(size: VP.Size.xxl, weight: .bold, design: .monospaced))
                    .foregroundColor(VP.accent)
            }
            Text("Sign up to see @\(username)\u{2019}s profile")
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
                .multilineTextAlignment(.center)
            Text("Profiles show reading history, Verity Score, comments, and more. Join free to view this profile and build your own.")
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
                .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
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

            backgroundBlock(u)

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
                        .overlay(RoundedRectangle(cornerRadius: VP.radiusSM).stroke(isFollowing ? VP.border : Color.clear))
                        .clipShape(RoundedRectangle(cornerRadius: VP.radiusSM))
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

    /// Background block — self-described context (TODO-50 Piece A read side).
    /// Mirrors the web /u/[username] render. Only populated fields draw.
    /// `lived` is gated on `background_lived_public` (doxx safety opt-in).
    @ViewBuilder
    private func backgroundBlock(_ u: VPUser) -> some View {
        let oneLine = (u.backgroundOneline ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let prof = (u.backgroundProfession ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let yrs = (u.backgroundYears ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let where_ = (u.backgroundWhere ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let lived = (u.backgroundLived ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let langs = (u.backgroundLanguages ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let livedPublic = u.backgroundLivedPublic ?? false
        let any = !oneLine.isEmpty || !prof.isEmpty || !yrs.isEmpty
            || !where_.isEmpty || (livedPublic && !lived.isEmpty) || !langs.isEmpty
            || !bgEducation.isEmpty || !bgLinks.isEmpty || !bgTopics.isEmpty
        let isOwnEmpty = !any && auth.currentUser?.id == u.id

        if isOwnEmpty {
            Button {
                showBackgroundEditor = true
            } label: {
                Text("Add a background line to your profile →")
                    .font(.system(.subheadline, design: .serif).italic())
                    .foregroundColor(VP.accent)
            }
            .buttonStyle(.plain)
        } else if any {
            VStack(alignment: .leading, spacing: 10) {
                if !oneLine.isEmpty {
                    Text("— \(oneLine)")
                        .font(.system(.subheadline, design: .serif).italic())
                        .foregroundColor(VP.dim)
                }
                if !prof.isEmpty || !yrs.isEmpty {
                    Text([prof, yrs].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundColor(VP.text)
                }
                if !where_.isEmpty {
                    Text(where_)
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                }
                if livedPublic && !lived.isEmpty {
                    Text(linkifiedAttributedString(from: lived))
                        .font(.footnote)
                        .foregroundColor(VP.text)
                        .tint(VP.accent)
                        .padding(.leading, 10)
                        .overlay(alignment: .leading) {
                            Rectangle().fill(VP.border).frame(width: 2)
                        }
                }
                if !bgEducation.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("EDUCATION")
                            .font(.caption2.weight(.bold))
                            .tracking(0.5)
                            .foregroundColor(VP.muted)
                        ForEach(bgEducation) { e in
                            let meta = [e.degree, e.field, e.years]
                                .compactMap { $0 }
                                .filter { !$0.isEmpty }
                                .joined(separator: " · ")
                            HStack(spacing: 0) {
                                Text(e.school).font(.system(.footnote, weight: .semibold))
                                if !meta.isEmpty {
                                    Text(" · \(meta)").font(.footnote).foregroundColor(VP.dim)
                                }
                                Spacer(minLength: 0)
                            }
                        }
                    }
                }
                if !bgTopics.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("KNOWS WELL")
                            .font(.caption2.weight(.bold))
                            .tracking(0.5)
                            .foregroundColor(VP.muted)
                        FlowLayout(spacing: 6) {
                            ForEach(bgTopics, id: \.id) { t in
                                Text(t.name)
                                    .font(.system(.caption, weight: .medium))
                                    .foregroundColor(VP.text)
                                    .padding(.horizontal, 9)
                                    .padding(.vertical, 4)
                                    .overlay(Capsule().strokeBorder(VP.border))
                            }
                        }
                    }
                }
                if !langs.isEmpty {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("LANGUAGES")
                            .font(.caption2.weight(.bold))
                            .tracking(0.5)
                            .foregroundColor(VP.muted)
                        Text(langs)
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                    }
                }
                if !bgLinks.isEmpty {
                    HStack(spacing: 14) {
                        ForEach(bgLinks) { l in
                            if let url = URL(string: l.url) {
                                Link(destination: url) {
                                    Text("↗ \(l.label?.isEmpty == false ? (l.label ?? l.url) : (url.host ?? l.url))")
                                        .font(.footnote)
                                        .foregroundColor(VP.accent)
                                }
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 4)
        }
    }

    /// Build an AttributedString from free text with http(s) URLs auto-linked
    /// via NSDataDetector. SwiftUI's Text(AttributedString) renders link runs
    /// as tappable; .tint(VP.accent) at the call site colors them.
    private func linkifiedAttributedString(from text: String) -> AttributedString {
        var attributed = AttributedString(text)
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return attributed
        }
        let nsRange = NSRange(text.startIndex..<text.endIndex, in: text)
        detector.enumerateMatches(in: text, range: nsRange) { match, _, _ in
            guard let match = match, let url = match.url,
                  let swiftRange = Range(match.range, in: text),
                  let attrRange = Range(swiftRange, in: attributed) else { return }
            attributed[attrRange].link = url
        }
        return attributed
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
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
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
                .select("id, username, display_name, bio, avatar_url, avatar_color, banner_url, verity_score, is_expert, expert_title, expert_organization, is_verified_public_figure, quizzes_completed_count, comment_count, followers_count, following_count, show_activity, profile_visibility, email_verified, show_on_leaderboard, created_at, background_oneline, background_profession, background_years, background_where, background_lived, background_languages, background_lived_public")
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
            if let target = row?.id {
                async let edu: [EducationRow] = (try? await client.from("user_education")
                    .select("school, degree, field, years, sort_order")
                    .eq("user_id", value: target)
                    .is("deleted_at", value: nil)
                    .order("sort_order", ascending: true)
                    .execute().value) ?? []
                async let links: [LinkRow] = (try? await client.from("user_links")
                    .select("url, label, sort_order")
                    .eq("user_id", value: target)
                    .is("deleted_at", value: nil)
                    .order("sort_order", ascending: true)
                    .execute().value) ?? []
                async let topics: [TopicCategoryWrap] = (try? await client.from("user_topics_known")
                    .select("categories(id, name)")
                    .eq("user_id", value: target)
                    .execute().value) ?? []
                let (eRows, lRows, tRows) = await (edu, links, topics)
                bgEducation = eRows
                bgLinks = lRows
                bgTopics = tRows
                    .compactMap { $0.categories }
                    .compactMap { c -> (id: String, name: String)? in
                        guard let n = c.name, !n.isEmpty else { return nil }
                        return (id: c.id, name: n)
                    }
            }
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
