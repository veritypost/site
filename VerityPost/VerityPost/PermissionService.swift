import Foundation
import Supabase

/// iOS mirror of `site/src/lib/permissions.js` Wave 1 path.
///
/// Reads `public.compute_effective_perms(p_user_id)` once and caches the
/// rows in memory. `refreshIfStale()` polls `my_perms_version()` and
/// refreshes when the global or user version changes, matching the web
/// client's cache-invalidation contract.
///
/// Concurrency: the cache itself lives on an `actor` so reads/writes
/// cannot race. A tiny `@MainActor` `ObservableObject` mirror
/// (`PermissionStore.shared`) publishes a change token so SwiftUI views
/// can observe and re-render when permissions change.
final actor PermissionService {
    static let shared = PermissionService()

    struct PermissionRow: Decodable, Sendable {
        let permission_key: String
        let granted: Bool
        let granted_via: String?
        let source_detail: AnyDecodable?
        let deny_mode: String?
        let requires_verified: Bool?
        let lock_message: String?
    }

    private struct VersionRow: Decodable, Sendable {
        let user_version: Int?
        let global_version: Int?
    }

    private struct ComputeArgs: Encodable { let p_user_id: String }

    private var cache: [String: PermissionRow] = [:]
    private var loaded: Bool = false
    private var userVersion: Int = 0
    private var globalVersion: Int = 0
    private var loadInflight: Task<Void, Never>?

    private var client: SupabaseClient { SupabaseManager.shared.client }

    private init() {}

    // MARK: - Public API

    /// Fetch the full effective-permission set for the current user and
    /// populate the cache. Safe to call repeatedly — concurrent calls
    /// dedupe onto a single in-flight task.
    func loadAll() async {
        if let existing = loadInflight {
            await existing.value
            return
        }
        let task = Task { await self.performLoad() }
        loadInflight = task
        await task.value
        loadInflight = nil
    }

    /// Synchronous (to the actor) membership check. Returns `false` when
    /// the cache has not loaded yet — callers that need load-on-demand
    /// semantics should `await loadAll()` first.
    func has(_ key: String) -> Bool {
        guard let row = cache[key] else { return false }
        return row.granted
    }

    /// Full row lookup for callers that need `granted_via` / `lock_message`.
    func get(_ key: String) -> PermissionRow? {
        cache[key]
    }

    /// Check `my_perms_version()`; if the user or global version has
    /// changed since the last load, refresh the cache. Mirrors the web
    /// client's `refreshIfStale`.
    func refreshIfStale() async {
        guard let v = await fetchVersion() else { return }
        let newUser = v.user_version ?? 0
        let newGlobal = v.global_version ?? 0
        if !loaded || newUser != userVersion || newGlobal != globalVersion {
            userVersion = newUser
            globalVersion = newGlobal
            await loadAll()
        }
    }

    /// Drop the cache (call on sign-out / account switch).
    func invalidate() {
        cache = [:]
        loaded = false
        userVersion = 0
        globalVersion = 0
    }

    // MARK: - Internals

    private func performLoad() async {
        guard let userId = await currentUserId() else {
            cache = [:]
            loaded = true
            await PermissionStore.shared.bump()
            return
        }
        do {
            let rows: [PermissionRow] = try await client
                .rpc("compute_effective_perms", params: ComputeArgs(p_user_id: userId))
                .execute()
                .value
            var next: [String: PermissionRow] = [:]
            next.reserveCapacity(rows.count)
            for row in rows {
                next[row.permission_key] = row
            }
            cache = next
            loaded = true
            await PermissionStore.shared.bump()
        } catch {
            Log.d("PermissionService: compute_effective_perms failed: \(error)")
            // Leave prior cache intact on error so stale reads keep working.
        }
    }

    private func fetchVersion() async -> VersionRow? {
        do {
            let v: VersionRow = try await client
                .rpc("my_perms_version")
                .execute()
                .value
            return v
        } catch {
            Log.d("PermissionService: my_perms_version failed: \(error)")
            return nil
        }
    }

    private func currentUserId() async -> String? {
        do {
            let session = try await client.auth.session
            return session.user.id.uuidString
        } catch {
            return nil
        }
    }
}

/// SwiftUI-facing observable mirror. Views that gate on permissions can
/// `@StateObject` or `@ObservedObject` this and call `PermissionService`
/// for the actual checks. The published `changeToken` increments on
/// every successful cache refresh.
@MainActor
final class PermissionStore: ObservableObject {
    static let shared = PermissionStore()
    @Published private(set) var changeToken: Int = 0
    private init() {}
    fileprivate func bump() { changeToken &+= 1 }
}

/// Minimal type-erased JSON value so `source_detail jsonb` decodes
/// without forcing callers to model every variant up front. Supabase
/// Swift SDK returns jsonb as the nested JSON value.
struct AnyDecodable: Decodable, Sendable {
    let value: Any

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self.value = NSNull()
        } else if let b = try? container.decode(Bool.self) {
            self.value = b
        } else if let i = try? container.decode(Int.self) {
            self.value = i
        } else if let d = try? container.decode(Double.self) {
            self.value = d
        } else if let s = try? container.decode(String.self) {
            self.value = s
        } else if let arr = try? container.decode([AnyDecodable].self) {
            self.value = arr.map { $0.value }
        } else if let obj = try? container.decode([String: AnyDecodable].self) {
            self.value = obj.mapValues { $0.value }
        } else {
            self.value = NSNull()
        }
    }
}
