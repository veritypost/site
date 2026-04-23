import SwiftUI
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
// @feature-verified family_admin 2026-04-18
// @feature-verified kids_pair 2026-04-22
// @feature-verified kids_add_remove 2026-04-22
// @feature-verified kids_pin 2026-04-22

/// Family dashboard showing per-kid stats, family leaderboard,
/// shared achievements, and weekly report. Gated via `settings.family.view`
/// permission (server-side plan→permission mapping lives in
/// `compute_effective_perms`; admin toggles reflect without client changes).
///
/// Parent-side kid management (add / remove / pair-code / PIN) lives here too —
/// 1:1 parity with the web `/profile/kids` page. Web routes:
///   POST   /api/kids                       (create)
///   DELETE /api/kids/:id?confirm=1         (soft-delete)
///   POST   /api/kids/generate-pair-code    (8-char, server-driven TTL)
///   POST   /api/kids/set-pin               (set/replace 4-digit PIN)
///   POST   /api/kids/reset-pin             (clear PIN; requires parent password)
///
/// All mutation routes share the same shape: parent JWT, server-side
/// requirePermission + checkRateLimit, audit on admin actions. Errors are
/// generic strings; the iOS layer surfaces them via inline banner / toast.
struct FamilyDashboardView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var perms = PermissionStore.shared
    private let client = SupabaseManager.shared.client

    @State private var kids: [KidProfile] = []
    @State private var loading = true
    @State private var canViewFamily: Bool = false
    @State private var canAddKid: Bool = false
    @State private var canRemoveKid: Bool = false
    @State private var canSetPin: Bool = false
    @State private var canResetPin: Bool = false

    // Pre-submit cap check: read max_kids from the user's plan tier and
    // disable Add Kid + show upgrade CTA when the plan limit is reached.
    // Mirrors the server-side `trg_enforce_max_kids` trigger so the user
    // never has to round-trip a 400 to discover they're at cap.
    // Source of truth is plans.metadata->>'max_kids' in Supabase.
    private func maxKids(for tier: String?) -> Int {
        switch tier {
        case "verity_family":    return 2
        case "verity_family_xl": return 4
        default:                 return 0
        }
    }

    // Sheet / dialog state
    @State private var showAddKid = false
    @State private var pairKid: KidProfile?
    @State private var setPinKid: KidProfile?
    @State private var resetPinKid: KidProfile?
    @State private var pendingRemove: KidProfile?
    @State private var removing = false

    // Inline status banners
    @State private var flash: String = ""
    @State private var error: String = ""

    var body: some View {
        ScrollView {
            if !canViewFamily {
                UpgradePromptInline(
                    feature: "Family Dashboard",
                    detail: "The family dashboard is available to Verity Family subscribers."
                )
            } else if loading {
                ProgressView().padding(.top, 40)
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    if !flash.isEmpty { banner(flash, kind: .success) }
                    if !error.isEmpty { banner(error, kind: .error) }

                    HStack(alignment: .firstTextBaseline) {
                        Text("Your kids")
                            .font(.system(.headline, design: .default, weight: .bold))
                            .foregroundColor(VP.text)
                        Spacer()
                        Text("\(kids.count) profile\(kids.count == 1 ? "" : "s")")
                            .font(.caption)
                            .foregroundColor(VP.dim)
                    }

                    if canAddKid {
                        let limit = maxKids(for: auth.currentUser?.plan)
                        let atCap = limit > 0 && kids.count >= limit
                        let noFamilyPlan = limit == 0

                        if atCap || noFamilyPlan {
                            // Inline upgrade banner — appears above the Add
                            // Kid button when the parent has hit their plan's
                            // kid cap or doesn't have a family plan at all.
                            // Tappable; lands on SubscriptionView so the
                            // upgrade is one tap away.
                            NavigationLink {
                                SubscriptionView()
                                    .environmentObject(auth)
                            } label: {
                                HStack(alignment: .top, spacing: 10) {
                                    Image(systemName: "exclamationmark.circle.fill")
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundColor(VP.accent)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(atCap
                                             ? "You've reached your kid profile limit."
                                             : "Add kids with a Verity Family plan.")
                                            .font(.system(.footnote, design: .default, weight: .semibold))
                                            .foregroundColor(VP.text)
                                        Text("Upgrade to Verity Family")
                                            .font(.caption)
                                            .foregroundColor(VP.accent)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundColor(VP.dim)
                                }
                                .padding(12)
                                .background(VP.card)
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                                .cornerRadius(10)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(atCap
                                                ? "Kid profile limit reached. Upgrade to Verity Family."
                                                : "Upgrade to Verity Family to add kids.")
                        }

                        Button {
                            error = ""; flash = ""
                            showAddKid = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "plus")
                                    .font(.system(size: 12, weight: .bold))
                                Text("Add a kid")
                                    .font(.system(.footnote, design: .default, weight: .semibold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .frame(minHeight: 44)
                            .background(atCap || noFamilyPlan ? VP.accent.opacity(0.4) : VP.accent)
                            .cornerRadius(10)
                        }
                        .buttonStyle(.plain)
                        .disabled(atCap || noFamilyPlan)
                        .accessibilityHint(atCap || noFamilyPlan
                                           ? "Upgrade to Verity Family to add kids"
                                           : "")
                    }

                    if kids.isEmpty {
                        Text("No kid profiles set up yet.")
                            .font(.footnote)
                            .foregroundColor(VP.dim)
                            .padding(.top, 4)
                    } else {
                        ForEach(kids) { kid in
                            kidRow(kid)
                        }
                    }

                    NavigationLink {
                        FamilyLeaderboardView()
                            .environmentObject(auth)
                    } label: {
                        HStack {
                            Text("Family leaderboard")
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundColor(VP.dim)
                        }
                        .padding(14)
                        .background(VP.card)
                        .cornerRadius(10)
                    }
                    .buttonStyle(.plain)

                    NavigationLink {
                        FamilyAchievementsView()
                            .environmentObject(auth)
                    } label: {
                        HStack {
                            Text("Shared achievements")
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundColor(VP.dim)
                        }
                        .padding(14)
                        .background(VP.card)
                        .cornerRadius(10)
                    }
                    .buttonStyle(.plain)
                }
                .padding(20)
            }
        }
        .background(VP.bg)
        .navigationTitle("Family")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .task(id: perms.changeToken) {
            canViewFamily = await PermissionService.shared.has("settings.family.view")
            canAddKid = await PermissionService.shared.has("family.add_kid")
            canRemoveKid = await PermissionService.shared.has("family.remove_kid")
            canSetPin = await PermissionService.shared.has("kids.pin.set")
            canResetPin = await PermissionService.shared.has("kids.pin.reset")
        }
        .sheet(isPresented: $showAddKid) {
            AddKidSheet { newKid in
                showAddKid = false
                if newKid != nil {
                    flash = "Kid added."
                    error = ""
                    Task { await reload() }
                }
            }
        }
        .sheet(item: $pairKid) { kid in
            PairCodeSheet(kid: kid)
        }
        .sheet(item: $setPinKid) { kid in
            SetPinSheet(kid: kid) { ok in
                setPinKid = nil
                if ok {
                    flash = "PIN saved."
                    error = ""
                }
            }
        }
        .sheet(item: $resetPinKid) { kid in
            ResetPinSheet(kid: kid) { ok in
                resetPinKid = nil
                if ok {
                    flash = "PIN cleared."
                    error = ""
                }
            }
        }
        .alert("Remove \(pendingRemove?.safeName ?? "kid")?",
               isPresented: Binding(
                get: { pendingRemove != nil },
                set: { if !$0 { pendingRemove = nil } }
               )
        ) {
            Button("Remove", role: .destructive) {
                if let k = pendingRemove { Task { await remove(k) } }
            }
            Button("Cancel", role: .cancel) { pendingRemove = nil }
        } message: {
            Text("This unpairs the device and stops their reading history. Their progress is archived; the profile won't appear here.")
        }
    }

    // MARK: - Kid row

    @ViewBuilder
    private func kidRow(_ kid: KidProfile) -> some View {
        HStack(spacing: 8) {
            NavigationLink {
                KidDashboardView(kid: kid).environmentObject(auth)
            } label: { kidCard(kid) }
            .buttonStyle(.plain)

            Menu {
                Button {
                    error = ""; flash = ""
                    pairKid = kid
                } label: {
                    Label("Get pair code", systemImage: "qrcode")
                }
                if canSetPin {
                    Button {
                        error = ""; flash = ""
                        setPinKid = kid
                    } label: {
                        Label("Set PIN", systemImage: "lock")
                    }
                }
                if canResetPin {
                    Button {
                        error = ""; flash = ""
                        resetPinKid = kid
                    } label: {
                        Label("Reset PIN", systemImage: "lock.rotation")
                    }
                }
                Button {
                    KidsAppLauncher.open(kidId: kid.id)
                } label: {
                    Label("Open Kids App", systemImage: "arrow.up.forward.app")
                }
                if canRemoveKid {
                    Divider()
                    Button(role: .destructive) {
                        error = ""; flash = ""
                        pendingRemove = kid
                    } label: {
                        Label("Remove kid", systemImage: "trash")
                    }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.title3)
                    .foregroundColor(VP.dim)
                    .padding(10)
                    .frame(minWidth: 44, minHeight: 44)
            }
        }
    }

    private func kidCard(_ kid: KidProfile) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color(hex: kid.avatarColor ?? "999999"))
                .frame(width: 40, height: 40)
                .overlay(
                    Text(String(kid.safeName.prefix(1)).uppercased())
                        .font(.system(.headline, design: .default, weight: .bold))
                        .foregroundColor(.white)
                )
            VStack(alignment: .leading, spacing: 2) {
                Text(kid.safeName)
                    .font(.system(.subheadline, design: .default, weight: .semibold))
                    .foregroundColor(VP.text)
                Text(kid.ageLabel)
                    .font(.caption)
                    .foregroundColor(VP.dim)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(VP.dim)
        }
        .padding(14)
        .background(VP.card)
        .cornerRadius(10)
    }

    // MARK: - Banner

    private enum BannerKind { case success, error }
    @ViewBuilder
    private func banner(_ text: String, kind: BannerKind) -> some View {
        let color: Color = kind == .success ? VP.success : VP.danger
        let bg: Color = kind == .success ? VP.passBg : VP.failBg
        let border: Color = kind == .success ? VP.passBorder : VP.failBorder
        HStack(alignment: .top, spacing: 8) {
            Text(text)
                .font(.footnote)
                .foregroundColor(color)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                if kind == .success { flash = "" } else { error = "" }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(color.opacity(0.7))
                    .padding(6)
                    .frame(minWidth: 28, minHeight: 28)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(bg)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(border))
        .cornerRadius(10)
    }

    // MARK: - Loading + mutations

    private func load() async {
        guard let userId = auth.currentUser?.id else { loading = false; return }
        do {
            // Match the /api/kids GET filter: only show is_active=true rows so
            // soft-deleted profiles disappear immediately after a remove.
            let rows: [KidProfile] = try await client.from("kid_profiles")
                .select()
                .eq("parent_user_id", value: userId)
                .eq("is_active", value: true)
                .order("created_at", ascending: true)
                .execute().value
            await MainActor.run { kids = rows; loading = false }
        } catch {
            await MainActor.run { loading = false }
        }
    }

    private func reload() async {
        guard let userId = auth.currentUser?.id else { return }
        do {
            let rows: [KidProfile] = try await client.from("kid_profiles")
                .select()
                .eq("parent_user_id", value: userId)
                .eq("is_active", value: true)
                .order("created_at", ascending: true)
                .execute().value
            await MainActor.run { kids = rows }
        } catch {
            // Stale list is better than empty; surface the error.
            await MainActor.run { self.error = "Could not refresh kids list." }
        }
    }

    private func remove(_ kid: KidProfile) async {
        removing = true
        defer { removing = false }
        do {
            let result = try await KidsAPI.deleteKid(id: kid.id)
            if result.ok {
                pendingRemove = nil
                flash = "\(kid.safeName) removed."
                error = ""
                await reload()
            } else {
                error = result.error ?? "Could not remove kid."
            }
        } catch {
            self.error = "Could not remove kid."
        }
    }
}

// MARK: - Per-kid dashboard

struct KidDashboardView: View {
    let kid: KidProfile
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var readCount = 0
    @State private var quizCount = 0
    @State private var streak = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    Circle()
                        .fill(Color(hex: kid.avatarColor ?? "999999"))
                        .frame(width: 56, height: 56)
                        .overlay(
                            Text(String(kid.safeName.prefix(1)).uppercased())
                                .font(.system(.title2, design: .default, weight: .bold))
                                .foregroundColor(.white)
                        )
                    VStack(alignment: .leading, spacing: 4) {
                        Text(kid.safeName)
                            .font(.system(.title3, design: .default, weight: .bold))
                            .foregroundColor(VP.text)
                        Text(kid.ageLabel)
                            .font(.caption)
                            .foregroundColor(VP.dim)
                    }
                }

                HStack(spacing: 16) {
                    statBlock("Articles", value: readCount)
                    statBlock("Quizzes", value: quizCount)
                    statBlock("Streak", value: streak)
                }
            }
            .padding(20)
        }
        .background(VP.bg)
        .navigationTitle(kid.safeName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func statBlock(_ label: String, value: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(value)")
                .font(.system(.title3, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text(label)
                .font(.caption)
                .foregroundColor(VP.dim)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(VP.card)
        .cornerRadius(10)
    }

    private func load() async {
        do {
            // Prompt 11 sweep: v2 has no `kid_reading_log` table; kid reads
            // live in `reading_log.kid_profile_id`. `quiz_attempts` uses the
            // same column (not `kid_id`).
            struct Row: Decodable { let id: String }
            let reads: [Row] = (try? await client.from("reading_log")
                .select("id")
                .eq("kid_profile_id", value: kid.id)
                .execute().value) ?? []
            readCount = reads.count
            struct QRow: Decodable { let attempt_number: Int?; let is_correct: Bool?; let article_id: String? }
            let quizzes: [QRow] = (try? await client.from("quiz_attempts")
                .select("attempt_number, is_correct, article_id")
                .eq("kid_profile_id", value: kid.id)
                .execute().value) ?? []
            var grouped: [String: (correct: Int, total: Int)] = [:]
            for row in quizzes {
                let k = "\(row.article_id ?? "")#\(row.attempt_number ?? 0)"
                var e = grouped[k] ?? (0, 0)
                e.total += 1
                if row.is_correct == true { e.correct += 1 }
                grouped[k] = e
            }
            quizCount = grouped.values.filter { $0.total > 0 && ($0.correct * 10 / max($0.total, 1)) >= 7 }.count
        } catch {}
    }
}

// MARK: - Family leaderboard

struct FamilyLeaderboardView: View {
    @EnvironmentObject var auth: AuthViewModel

    @State private var entries: [FamilyLeaderboardEntry] = []
    @State private var loading = true

    var body: some View {
        ScrollView {
            if loading {
                ProgressView().padding(.top, 40)
            } else if entries.isEmpty {
                Text("No data yet.")
                    .font(.footnote).foregroundColor(VP.dim)
                    .padding(.top, 40)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(entries.enumerated()), id: \.element.name) { idx, e in
                        HStack(spacing: 12) {
                            Text("\(idx + 1)")
                                .font(.system(.subheadline, design: .default, weight: .bold))
                                .foregroundColor(VP.dim)
                                .frame(width: 24)
                            Text(e.name)
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                            Spacer()
                            Text("\(e.score)")
                                .font(.system(.headline, design: .default, weight: .bold))
                                .foregroundColor(VP.accent)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        Divider().background(VP.border)
                    }
                }
            }
        }
        .background(VP.bg)
        .navigationTitle("Family leaderboard")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/family/leaderboard", relativeTo: site) else {
            await MainActor.run { loading = false }
            return
        }
        let client = SupabaseManager.shared.client
        guard let session = try? await client.auth.session else {
            await MainActor.run { loading = false }
            return
        }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            let list = (try? JSONDecoder().decode([FamilyLeaderboardEntry].self, from: data)) ?? []
            await MainActor.run { entries = list; loading = false }
        } catch {
            await MainActor.run { loading = false }
        }
    }
}

struct FamilyLeaderboardEntry: Codable {
    let name: String
    let score: Int
}

// MARK: - Family achievements

struct FamilyAchievementsView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var achievements: [FamilyAchievementEntry] = []
    @State private var loading = true

    var body: some View {
        ScrollView {
            if loading {
                ProgressView().padding(.top, 40)
            } else if achievements.isEmpty {
                Text("No shared achievements yet. Keep reading as a family.")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                    .multilineTextAlignment(.center)
                    .padding(.top, 40)
                    .padding(.horizontal, 40)
            } else {
                VStack(spacing: 0) {
                    ForEach(achievements) { a in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(a.name)
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                            if let desc = a.description {
                                Text(desc)
                                    .font(.caption)
                                    .foregroundColor(VP.dim)
                            }
                            if let date = a.earnedAt {
                                Text("Earned \(date)")
                                    .font(.caption2)
                                    .foregroundColor(VP.accent)
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Divider().background(VP.border)
                    }
                }
            }
        }
        .background(VP.bg)
        .navigationTitle("Shared achievements")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/family/achievements", relativeTo: site) else {
            await MainActor.run { loading = false }
            return
        }
        let client = SupabaseManager.shared.client
        guard let session = try? await client.auth.session else {
            await MainActor.run { loading = false }
            return
        }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            let list = (try? JSONDecoder().decode([FamilyAchievementEntry].self, from: data)) ?? []
            await MainActor.run { achievements = list; loading = false }
        } catch {
            await MainActor.run { loading = false }
        }
    }
}

struct FamilyAchievementEntry: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let earnedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, description
        case earnedAt = "earned_at"
    }
}

// MARK: - Kids API client (iOS-side wrapper around /api/kids/*)
//
// Keeps every mutation route in one place so the presentation layer never
// builds URLs or assembles bodies inline. Matches the web client's
// fetch-with-bearer-token pattern. Errors are surfaced as `.error` strings;
// network/JSON failures collapse to a generic message — never leak SDK internals.

enum KidsAPI {
    static let coppaConsentVersion = "2026-04-15-v1"
    static let coppaConsentText: String = """
        I am the parent or legal guardian of the child whose profile I am creating. \
        I understand that Verity Post will collect and process personal information \
        about this child in accordance with the Children's Online Privacy Protection \
        Act (COPPA). I consent to the collection of their reading history, quiz \
        responses, and streak activity as described in the Privacy Policy, and I \
        understand I can review, delete, or revoke access to this data at any time \
        from my account settings.
        """

    struct CreateKidInput {
        var displayName: String
        var dateOfBirth: String          // "yyyy-MM-dd"
        var avatarColor: String?         // e.g. "#10b981"
        var pin: String?                 // 4 digits, optional
        var readingLevel: String?        // optional, mirrors web
        var parentName: String           // COPPA legal name
    }

    struct CreateResponse: Decodable { let id: String? }
    struct DeleteResponse { let ok: Bool; let error: String? }
    struct PairResponse: Decodable {
        let code: String
        let expires_at: String
    }
    struct GenericResponse: Decodable { let ok: Bool? }

    private static func bearer() async throws -> String {
        let session = try await SupabaseManager.shared.client.auth.session
        return session.accessToken
    }

    private static func endpoint(_ path: String) -> URL {
        SupabaseManager.shared.siteURL.appendingPathComponent(path)
    }

    private static func decodeError(from data: Data) -> String? {
        struct ErrEnvelope: Decodable { let error: String? }
        return (try? JSONDecoder().decode(ErrEnvelope.self, from: data))?.error
    }

    static func createKid(_ input: CreateKidInput) async throws -> (ok: Bool, id: String?, error: String?) {
        let body: [String: Any] = [
            "display_name": input.displayName,
            "avatar_color": input.avatarColor ?? NSNull(),
            "pin": input.pin ?? NSNull(),
            "date_of_birth": input.dateOfBirth,
            "reading_level": input.readingLevel ?? NSNull(),
            "consent": [
                "parent_name": input.parentName,
                "ack": true,
                "version": coppaConsentVersion
            ]
        ]
        var req = URLRequest(url: endpoint("api/kids"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(try await bearer())", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 200 || status == 201 {
            let decoded = try? JSONDecoder().decode(CreateResponse.self, from: data)
            return (true, decoded?.id, nil)
        }
        return (false, nil, decodeError(from: data) ?? "Could not add kid (HTTP \(status)).")
    }

    static func deleteKid(id: String) async throws -> DeleteResponse {
        var req = URLRequest(url: endpoint("api/kids/\(id)?confirm=1"))
        req.httpMethod = "DELETE"
        req.setValue("Bearer \(try await bearer())", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 200 { return DeleteResponse(ok: true, error: nil) }
        return DeleteResponse(ok: false, error: decodeError(from: data) ?? "Delete failed (HTTP \(status)).")
    }

    static func generatePairCode(kidId: String) async throws -> (pair: PairResponse?, error: String?) {
        var req = URLRequest(url: endpoint("api/kids/generate-pair-code"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(try await bearer())", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["kid_profile_id": kidId])
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 200, let pair = try? JSONDecoder().decode(PairResponse.self, from: data) {
            return (pair, nil)
        }
        return (nil, decodeError(from: data) ?? "Could not generate code (HTTP \(status)).")
    }

    static func setPin(kidId: String, pin: String) async throws -> (ok: Bool, error: String?) {
        var req = URLRequest(url: endpoint("api/kids/set-pin"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(try await bearer())", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["kid_profile_id": kidId, "pin": pin])
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 200 { return (true, nil) }
        return (false, decodeError(from: data) ?? "Could not save PIN (HTTP \(status)).")
    }

    static func resetPin(kidId: String, password: String) async throws -> (ok: Bool, error: String?) {
        var req = URLRequest(url: endpoint("api/kids/reset-pin"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(try await bearer())", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["kid_profile_id": kidId, "password": password])
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 200 { return (true, nil) }
        return (false, decodeError(from: data) ?? "Could not reset PIN (HTTP \(status)).")
    }
}

// MARK: - Add Kid Sheet

struct AddKidSheet: View {
    /// Called with the new kid id on success, or `nil` if the user cancels.
    var onComplete: (String?) -> Void

    @State private var displayName = ""
    @State private var dob = Date()
    @State private var avatarColor: String = VP.kidColors.first ?? "#10b981"
    @State private var setPinNow = false
    @State private var pin = ""
    @State private var pinConfirm = ""
    @State private var parentName = ""
    @State private var consentAck = false
    @State private var readingLevel: String = ""

    @State private var saving = false
    @State private var error: String = ""

    private let readingLevels: [(String, String)] = [
        ("", "Not specified"),
        ("early", "Early reader (5-7)"),
        ("intermediate", "Intermediate (8-10)"),
        ("advanced", "Advanced (11-12)"),
    ]

    private let dobFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private var ageYears: Int? {
        Calendar.current.dateComponents([.year], from: dob, to: Date()).year
    }

    private var dobValid: Bool {
        guard let y = ageYears else { return false }
        return y >= 3 && y < 13 && dob < Date()
    }

    private var pinValid: Bool {
        if !setPinNow { return true }
        return pin.count == 4 && pin.allSatisfy(\.isNumber) && pin == pinConfirm
    }

    private var formValid: Bool {
        let nameOk = (1...30).contains(displayName.trimmingCharacters(in: .whitespaces).count)
        let parentOk = parentName.trimmingCharacters(in: .whitespaces).count >= 2
        return nameOk && dobValid && parentOk && consentAck && pinValid
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Display name", text: $displayName)
                        .textInputAutocapitalization(.words)
                    DatePicker("Date of birth",
                               selection: $dob,
                               in: ...Date(),
                               displayedComponents: .date)
                    if let y = ageYears, !dobValid {
                        Text(y < 3
                             ? "Kid must be at least 3 years old."
                             : (y >= 13 ? "Kid profiles are for children under 13." : "Date of birth must be in the past."))
                            .font(.caption)
                            .foregroundColor(VP.danger)
                    }
                } header: {
                    Text("About your kid")
                }

                Section {
                    Picker("Reading level", selection: $readingLevel) {
                        ForEach(readingLevels, id: \.0) { val, label in
                            Text(label).tag(val)
                        }
                    }
                    LabeledContent("Avatar color") {
                        HStack(spacing: 6) {
                            ForEach(VP.kidColors, id: \.self) { hex in
                                Circle()
                                    .fill(Color(hex: hex))
                                    .frame(width: 24, height: 24)
                                    .overlay(
                                        Circle().strokeBorder(
                                            avatarColor == hex ? VP.text : Color.clear,
                                            lineWidth: 2
                                        )
                                    )
                                    .onTapGesture { avatarColor = hex }
                                    .accessibilityLabel("Avatar color \(hex)")
                            }
                        }
                    }
                } header: {
                    Text("Personalization")
                }

                Section {
                    Toggle("Set a 4-digit PIN now", isOn: $setPinNow)
                    if setPinNow {
                        SecureField("PIN", text: Binding(
                            get: { pin },
                            set: { pin = String($0.filter(\.isNumber).prefix(4)) }
                        ))
                            .keyboardType(.numberPad)
                        SecureField("Confirm PIN", text: Binding(
                            get: { pinConfirm },
                            set: { pinConfirm = String($0.filter(\.isNumber).prefix(4)) }
                        ))
                            .keyboardType(.numberPad)
                        if !pin.isEmpty && pin != pinConfirm {
                            Text("PINs don't match.")
                                .font(.caption)
                                .foregroundColor(VP.danger)
                        }
                    }
                } header: {
                    Text("PIN (optional)")
                } footer: {
                    Text("A PIN keeps the kid in their own profile. You can set or reset it later.")
                        .font(.caption)
                        .foregroundColor(VP.dim)
                }

                Section {
                    TextField("Parent or guardian full name", text: $parentName)
                        .textInputAutocapitalization(.words)
                    Text(KidsAPI.coppaConsentText)
                        .font(.caption)
                        .foregroundColor(VP.dim)
                    Toggle(isOn: $consentAck) {
                        Text("I am the parent or legal guardian and consent to the data collection above.")
                            .font(.footnote)
                    }
                } header: {
                    Text("Parental consent (COPPA)")
                }

                if !error.isEmpty {
                    Section {
                        Text(error)
                            .font(.footnote)
                            .foregroundColor(VP.danger)
                    }
                }
            }
            .navigationTitle("Add a kid")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { onComplete(nil) }
                        .disabled(saving)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(saving ? "Saving..." : "Save") {
                        Task { await submit() }
                    }
                    .disabled(saving || !formValid)
                    .fontWeight(.semibold)
                }
            }
            .interactiveDismissDisabled(saving)
        }
    }

    private func submit() async {
        saving = true
        error = ""
        defer { saving = false }
        let input = KidsAPI.CreateKidInput(
            displayName: displayName.trimmingCharacters(in: .whitespaces),
            dateOfBirth: dobFormatter.string(from: dob),
            avatarColor: avatarColor,
            pin: setPinNow ? pin : nil,
            readingLevel: readingLevel.isEmpty ? nil : readingLevel,
            parentName: parentName.trimmingCharacters(in: .whitespaces)
        )
        do {
            let result = try await KidsAPI.createKid(input)
            if result.ok {
                onComplete(result.id ?? "")
            } else {
                error = result.error ?? "Could not add kid."
            }
        } catch {
            self.error = "Network error. Try again."
        }
    }
}

// MARK: - Pair Code Sheet

struct PairCodeSheet: View {
    let kid: KidProfile
    @Environment(\.dismiss) private var dismiss

    @State private var code: String = ""
    @State private var expiresAt: Date?
    @State private var loading = false
    @State private var error: String = ""
    @State private var now: Date = Date()
    @State private var copyFlash = false

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var secondsLeft: Int {
        guard let exp = expiresAt else { return 0 }
        return max(0, Int(exp.timeIntervalSince(now)))
    }

    private var expired: Bool { expiresAt != nil && secondsLeft == 0 }

    private var timeStr: String {
        let m = secondsLeft / 60
        let s = secondsLeft % 60
        return String(format: "%d:%02d", m, s)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Text("Read this code aloud to \(kid.safeName).")
                    .font(.subheadline)
                    .foregroundColor(VP.dim)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
                    .padding(.top, 8)

                if loading {
                    ProgressView().padding(.vertical, 40)
                } else if !code.isEmpty {
                    VStack(spacing: 10) {
                        Text(expired ? "Expired" : "Pair code")
                            .font(.system(.caption, design: .default, weight: .bold))
                            .tracking(1)
                            .foregroundColor(expired ? VP.danger : VP.dim)
                        Text(code)
                            .font(.system(size: 40, weight: .heavy, design: .monospaced))
                            .tracking(4)
                            .foregroundColor(VP.text)
                            .textSelection(.enabled)
                        if !expired, expiresAt != nil {
                            Text("Expires in \(timeStr)")
                                .font(.system(.caption, design: .default, weight: .medium))
                                .monospacedDigit()
                                .foregroundColor(VP.dim)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                    .padding(.horizontal, 16)
                    .background(VP.card)
                    .overlay(RoundedRectangle(cornerRadius: 12)
                        .stroke(expired ? VP.danger : VP.border))
                    .cornerRadius(12)
                    .padding(.horizontal, 20)

                    HStack(spacing: 8) {
                        if !expired {
                            Button {
                                UIPasteboard.general.string = code
                                copyFlash = true
                                Task {
                                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                                    copyFlash = false
                                }
                            } label: {
                                Text(copyFlash ? "Copied" : "Copy")
                                    .font(.system(.subheadline, design: .default, weight: .semibold))
                                    .foregroundColor(copyFlash ? .white : VP.text)
                                    .padding(.horizontal, 18)
                                    .padding(.vertical, 10)
                                    .frame(minHeight: 44)
                                    .background(copyFlash ? VP.success : Color.white)
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                                    .cornerRadius(10)
                            }
                            .buttonStyle(.plain)
                        }
                        Button {
                            Task { await fetchCode() }
                        } label: {
                            Text(loading ? "..." : (expired ? "New code" : "Generate new"))
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                                .foregroundColor(VP.text)
                                .padding(.horizontal, 18)
                                .padding(.vertical, 10)
                                .frame(minHeight: 44)
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                                .cornerRadius(10)
                        }
                        .buttonStyle(.plain)
                        .disabled(loading)
                    }
                    .padding(.top, 4)
                }

                if !error.isEmpty {
                    Text(error)
                        .font(.footnote)
                        .foregroundColor(VP.danger)
                        .padding(.horizontal, 24)
                        .multilineTextAlignment(.center)
                }

                Text("Open Verity Post Kids on \(kid.safeName)'s device and enter this code in the pairing screen. Anyone with this code can pair as \(kid.safeName), so share it directly with your kid.")
                    .font(.caption)
                    .foregroundColor(VP.dim)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
                    .padding(.top, 6)

                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(VP.bg)
            .navigationTitle("Pair code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .task { if code.isEmpty { await fetchCode() } }
            .onReceive(timer) { _ in now = Date() }
        }
    }

    private func fetchCode() async {
        loading = true
        error = ""
        defer { loading = false }
        do {
            let result = try await KidsAPI.generatePairCode(kidId: kid.id)
            if let pair = result.pair {
                code = pair.code
                expiresAt = ISO8601DateFormatter.kidsAPI.date(from: pair.expires_at)
                    ?? ISO8601DateFormatter().date(from: pair.expires_at)
                now = Date()
            } else {
                error = result.error ?? "Could not generate code."
            }
        } catch {
            self.error = "Network error. Try again."
        }
    }
}

// MARK: - Set PIN Sheet

struct SetPinSheet: View {
    let kid: KidProfile
    var onComplete: (Bool) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var pin = ""
    @State private var pinConfirm = ""
    @State private var saving = false
    @State private var error: String = ""

    private var valid: Bool {
        pin.count == 4 && pin.allSatisfy(\.isNumber) && pin == pinConfirm
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Set a 4-digit PIN that \(kid.safeName) types when switching profiles in the kids app.")
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                    SecureField("New PIN", text: Binding(
                        get: { pin },
                        set: { pin = String($0.filter(\.isNumber).prefix(4)) }
                    ))
                    .keyboardType(.numberPad)
                    SecureField("Confirm PIN", text: Binding(
                        get: { pinConfirm },
                        set: { pinConfirm = String($0.filter(\.isNumber).prefix(4)) }
                    ))
                    .keyboardType(.numberPad)
                    if !pin.isEmpty && pin != pinConfirm {
                        Text("PINs don't match.")
                            .font(.caption)
                            .foregroundColor(VP.danger)
                    }
                }
                if !error.isEmpty {
                    Section { Text(error).font(.footnote).foregroundColor(VP.danger) }
                }
            }
            .navigationTitle("Set kid PIN")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { onComplete(false) }
                        .disabled(saving)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(saving ? "Saving..." : "Save") {
                        Task { await submit() }
                    }
                    .disabled(saving || !valid)
                    .fontWeight(.semibold)
                }
            }
            .interactiveDismissDisabled(saving)
        }
    }

    private func submit() async {
        saving = true
        error = ""
        defer { saving = false }
        do {
            let result = try await KidsAPI.setPin(kidId: kid.id, pin: pin)
            if result.ok {
                onComplete(true)
            } else {
                error = result.error ?? "Could not save PIN."
            }
        } catch {
            self.error = "Network error. Try again."
        }
    }
}

// MARK: - Reset PIN Sheet

struct ResetPinSheet: View {
    let kid: KidProfile
    var onComplete: (Bool) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var password = ""
    @State private var saving = false
    @State private var error: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Clear \(kid.safeName)'s PIN. We need your account password to confirm it's you.")
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                    SecureField("Your account password", text: $password)
                        .textContentType(.password)
                }
                if !error.isEmpty {
                    Section { Text(error).font(.footnote).foregroundColor(VP.danger) }
                }
            }
            .navigationTitle("Reset kid PIN")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { onComplete(false) }
                        .disabled(saving)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(saving ? "Resetting..." : "Reset") {
                        Task { await submit() }
                    }
                    .disabled(saving || password.isEmpty)
                    .fontWeight(.semibold)
                }
            }
            .interactiveDismissDisabled(saving)
        }
    }

    private func submit() async {
        saving = true
        error = ""
        defer { saving = false }
        do {
            let result = try await KidsAPI.resetPin(kidId: kid.id, password: password)
            if result.ok {
                onComplete(true)
            } else {
                error = result.error ?? "Could not reset PIN."
            }
        } catch {
            self.error = "Network error. Try again."
        }
    }
}

// MARK: - ISO date helpers

extension ISO8601DateFormatter {
    /// Matches the `expires_at` shape returned by /api/kids/generate-pair-code,
    /// which serializes Postgres timestamptz as ISO-8601 with fractional seconds.
    static let kidsAPI: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
