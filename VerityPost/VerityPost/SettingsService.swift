import Foundation
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18

@MainActor
final class SettingsService: ObservableObject {
    static let shared = SettingsService()

    @Published var settings: [String: Any] = [:]
    @Published var commentSettings: [String: Any] = [:]

    private let client = SupabaseManager.shared.client
    private var lastFetch: Date?
    private let cacheTTL: TimeInterval = 60

    private init() {}

    // MARK: - Load

    func loadIfNeeded() async {
        if let last = lastFetch, Date().timeIntervalSince(last) < cacheTTL {
            return
        }
        await load()
    }

    func load() async {
        // Fetch settings table
        do {
            struct SettingRow: Decodable {
                let key: String
                let value: String // jsonb comes as string
                let type: String?
            }
            let rows: [SettingRow] = try await client.from("settings")
                .select()
                .execute()
                .value

            var parsed: [String: Any] = [:]
            for row in rows {
                if let data = row.value.data(using: .utf8),
                   let json = try? JSONSerialization.jsonObject(with: data) {
                    parsed[row.key] = json
                } else {
                    // Try raw string value
                    parsed[row.key] = row.value
                }
            }
            settings = parsed
        } catch {
            Log.d("SettingsService: failed to load settings: \(error)")
        }

        // Fetch comment settings from settings table (single row)
        do {
            struct RawRow: Decodable {
                let id: String?
                let quiz_required: Bool?
                let rate_limit_comments: Bool?
                let comment_rate_sec: Int?
                let min_body_length: Int?
                let max_body_length: Int?
                let require_login: Bool?
                let auto_approve: Bool?
                let allow_replies: Bool?
                let max_depth: Int?
            }
            let rows: [RawRow] = try await client.from("settings")
                .select()
                .limit(1)
                .execute()
                .value

            if let row = rows.first {
                var cs: [String: Any] = [:]
                cs["quiz_required"] = row.quiz_required ?? false
                cs["rate_limit_comments"] = row.rate_limit_comments ?? false
                cs["comment_rate_sec"] = row.comment_rate_sec ?? 30
                cs["min_body_length"] = row.min_body_length ?? 1
                cs["max_body_length"] = row.max_body_length ?? 2000
                cs["require_login"] = row.require_login ?? true
                cs["auto_approve"] = row.auto_approve ?? true
                cs["allow_replies"] = row.allow_replies ?? false
                cs["max_depth"] = row.max_depth ?? 1
                commentSettings = cs
            }
        } catch {
            Log.d("SettingsService: failed to load comment settings: \(error)")
        }

        lastFetch = Date()
    }

    // MARK: - Helpers

    /// Check a boolean setting from the `settings` table
    func isEnabled(_ key: String, default defaultValue: Bool = false) -> Bool {
        if let val = settings[key] as? Bool { return val }
        if let val = settings[key] as? Int { return val != 0 }
        if let val = settings[key] as? String {
            return val == "true" || val == "1"
        }
        return defaultValue
    }

    /// Get a number setting from the `settings` table
    func getNumber(_ key: String, default defaultValue: Int = 0) -> Int {
        if let val = settings[key] as? Int { return val }
        if let val = settings[key] as? Double { return Int(val) }
        if let val = settings[key] as? String, let n = Int(val) { return n }
        return defaultValue
    }

    /// Check a boolean from comment_settings
    func commentBool(_ key: String, default defaultValue: Bool = false) -> Bool {
        if let val = commentSettings[key] as? Bool { return val }
        if let val = commentSettings[key] as? Int { return val != 0 }
        return defaultValue
    }

    /// Get a number from comment_settings
    func commentNumber(_ key: String, default defaultValue: Int = 0) -> Int {
        if let val = commentSettings[key] as? Int { return val }
        if let val = commentSettings[key] as? Double { return Int(val) }
        return defaultValue
    }
}
