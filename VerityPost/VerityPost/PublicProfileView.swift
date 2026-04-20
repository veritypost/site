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
    @StateObject private var perms = PermissionStore.shared
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

    var body: some View {
        ScrollView {
            if loading {
                ProgressView().padding(.top, 60)
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
        .task { await load() }
        .task(id: perms.changeToken) {
            canViewOtherTotal = await PermissionService.shared.has("profile.score.view.other.total")
            canFollow = await PermissionService.shared.has("profile.follow")
            canShareCard = await PermissionService.shared.has("profile.card.share_link")
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

            Divider().background(VP.border)

            HStack(spacing: 16) {
                stat(label: "Articles", value: u.articlesReadCount ?? 0)
                stat(label: "Quizzes", value: u.quizzesCompletedCount ?? 0)
                stat(label: "Comments", value: u.commentCount ?? 0)
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
            Text("\(value)")
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
        do {
            // Round A (092b_rls_lockdown_followup): narrow `.select()` (was
            // SELECT *) to the safe, anon-readable column list. Authenticated
            // still has table-level SELECT today, but future column REVOKE
            // sweeps would break SELECT * silently. Matches the anon GRANT
            // list from migration 092b + public_user_profiles view shape.
            let row: VPUser? = try await client.from("users")
                .select("id, username, display_name, bio, avatar_url, avatar_color, banner_url, verity_score, streak_current, is_expert, expert_title, expert_organization, is_verified_public_figure, articles_read_count, quizzes_completed_count, comment_count, followers_count, following_count, profile_visibility, is_banned, email_verified, show_on_leaderboard, created_at")
                .eq("username", value: username)
                .limit(1)
                .single()
                .execute().value
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
