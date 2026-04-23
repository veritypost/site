import Foundation
import Supabase

// @apple-guideline-1.2 2026-04-22
//
// Centralized block-list service. Apple Guideline 1.2 (UGC) requires the
// adult app surface "block user" everywhere users encounter other users
// (comments, DMs, profiles) plus a settings affordance to review/unblock.
//
// All paths route through this singleton so:
//   - the local cache stays the single source of truth for "is this user
//     hidden from me right now?" — every comment-list / DM filter consults
//     `isBlocked(_:)` synchronously,
//   - block / unblock flips trigger one shared invalidation hook
//     (`onChange`) so any view subscribed to the block-set re-renders,
//   - the cache is bidirectional: if EITHER party blocked the other, that
//     user is hidden from this viewer (mirrors the web CommentThread
//     pattern in web/src/components/CommentThread.tsx:122-131).
@MainActor
final class BlockService: ObservableObject {
    static let shared = BlockService()

    /// User IDs the current viewer should not see content from. Populated
    /// from `blocked_users` rows where (blocker = me) OR (blocked = me).
    @Published private(set) var blockedIds: Set<String> = []

    /// Bumped whenever the set changes — views that need to re-filter can
    /// `.task(id: BlockService.shared.changeToken)` to react.
    @Published private(set) var changeToken: Int = 0

    private let client = SupabaseManager.shared.client
    private var loaded = false

    private init() {}

    // Loaded at app start (after auth) and after every block/unblock to
    // pick up rows the OTHER party may have inserted while we were away.
    func refresh(currentUserId: String?) async {
        guard let me = currentUserId else {
            blockedIds = []
            changeToken &+= 1
            loaded = true
            return
        }
        struct Row: Decodable { let blocker_id: String; let blocked_id: String }
        do {
            let rows: [Row] = try await client.from("blocked_users")
                .select("blocker_id, blocked_id")
                .or("blocker_id.eq.\(me),blocked_id.eq.\(me)")
                .execute().value
            var next = Set<String>()
            for r in rows {
                if r.blocker_id == me { next.insert(r.blocked_id) }
                if r.blocked_id == me { next.insert(r.blocker_id) }
            }
            blockedIds = next
            changeToken &+= 1
            loaded = true
        } catch {
            Log.d("BlockService refresh error: \(error)")
        }
    }

    func refreshIfStale(currentUserId: String?) async {
        if !loaded { await refresh(currentUserId: currentUserId) }
    }

    func isBlocked(_ userId: String?) -> Bool {
        guard let id = userId else { return false }
        return blockedIds.contains(id)
    }

    /// POST /api/users/[id]/block. Returns true on success. Optimistically
    /// inserts the id into the cache; reverts on HTTP failure.
    func block(targetId: String, reason: String? = nil) async -> Bool {
        let prev = blockedIds
        blockedIds.insert(targetId)
        changeToken &+= 1

        do {
            guard let session = try? await client.auth.session else { throw URLError(.userAuthenticationRequired) }
            let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/users/\(targetId)/block")
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            if let r = reason, !r.isEmpty {
                req.httpBody = try? JSONSerialization.data(withJSONObject: ["reason": r])
            } else {
                req.httpBody = "{}".data(using: .utf8)
            }
            let (_, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                blockedIds = prev
                changeToken &+= 1
                return false
            }
            return true
        } catch {
            blockedIds = prev
            changeToken &+= 1
            Log.d("BlockService block error: \(error)")
            return false
        }
    }

    /// DELETE /api/users/[id]/block.
    func unblock(targetId: String) async -> Bool {
        let prev = blockedIds
        blockedIds.remove(targetId)
        changeToken &+= 1

        do {
            guard let session = try? await client.auth.session else { throw URLError(.userAuthenticationRequired) }
            let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/users/\(targetId)/block")
            var req = URLRequest(url: url)
            req.httpMethod = "DELETE"
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            let (_, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                blockedIds = prev
                changeToken &+= 1
                return false
            }
            return true
        } catch {
            blockedIds = prev
            changeToken &+= 1
            Log.d("BlockService unblock error: \(error)")
            return false
        }
    }
}

// MARK: - Report payloads
//
// Reusable across StoryDetailView (comments), DMThreadView (conversation),
// and PublicProfileView (user). Maps to POST /api/reports
// { targetType, targetId, reason, description }.
enum ReportTargetType: String { case comment, conversation, user, article }
enum ReportReason: String, CaseIterable, Identifiable {
    case spam = "spam"
    case harassment = "harassment"
    case offTopic = "off_topic"
    case misinformation = "misinformation"
    case other = "other"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .spam: return "Spam"
        case .harassment: return "Harassment or hate"
        case .offTopic: return "Off-topic"
        case .misinformation: return "Misinformation"
        case .other: return "Other"
        }
    }
}

@MainActor
enum ReportService {
    static func submit(
        targetType: ReportTargetType,
        targetId: String,
        reason: ReportReason,
        description: String? = nil
    ) async -> Bool {
        let client = SupabaseManager.shared.client
        guard let session = try? await client.auth.session else { return false }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/reports")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        struct Payload: Encodable {
            let targetType: String
            let targetId: String
            let reason: String
            let description: String?
        }
        req.httpBody = try? JSONEncoder().encode(Payload(
            targetType: targetType.rawValue,
            targetId: targetId,
            reason: reason.rawValue,
            description: description
        ))
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            if let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) { return true }
            return false
        } catch {
            Log.d("ReportService submit error: \(error)")
            return false
        }
    }
}
