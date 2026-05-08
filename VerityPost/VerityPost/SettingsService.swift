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

        // Derive comment settings from the already-parsed settings dictionary.
        // The settings table is key/value — querying it for named columns silently
        // returns nil for everything. Use the helpers that read self.settings instead.
        // DB comment keys confirmed: comment_max_length, comment_max_depth.
        // Other keys (quiz_required, require_login, etc.) are not yet in the DB and
        // fall through to the hardcoded defaults below.
        var cs: [String: Any] = [:]
        cs["quiz_required"] = isEnabled("quiz_required", default: false)
        cs["rate_limit_comments"] = isEnabled("rate_limit_comments", default: false)
        cs["comment_rate_sec"] = getNumber("comment_rate_sec", default: 30)
        cs["min_body_length"] = getNumber("min_body_length", default: 1)
        cs["max_body_length"] = getNumber("comment_max_length", default: 2000)
        cs["require_login"] = isEnabled("require_login", default: true)
        cs["auto_approve"] = isEnabled("auto_approve", default: true)
        cs["allow_replies"] = isEnabled("allow_replies", default: false)
        cs["max_depth"] = getNumber("comment_max_depth", default: 2)
        commentSettings = cs

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
