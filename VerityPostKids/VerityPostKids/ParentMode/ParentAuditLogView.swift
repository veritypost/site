import SwiftUI

// Settings screen — last 10 parent_auth_events for the current parent.
//
// Auth model:
//   - The kids-app Supabase client carries the kid JWT, which can't read
//     parent_auth_events (RLS scopes selects to auth.uid() = parent_user_id).
//   - The elevated parent JWT issued by /api/kids/parent/elevate has
//     auth.uid() = parent_user_id, so it CAN read parent_auth_events.
//   - We talk to PostgREST directly with the elevated_token as the bearer
//     (mirrors the SupabaseKidsClient pattern but per-request). Going via
//     the global SupabaseKidsClient would require swapping the bearer
//     globally, which would break kid reads happening in parallel.
//
// Caller is expected to have already required parent-mode (via .parentMode
// modifier or a manual sheet) before pushing this screen.

struct ParentAuditLogView: View {
    @StateObject private var session = ParentSessionManager.shared

    @State private var events: [AuditEvent] = []
    @State private var isLoading: Bool = true
    @State private var loadError: String? = nil

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header

                if !session.isElevated {
                    notElevatedState
                } else if isLoading && events.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 120)
                } else if let err = loadError, events.isEmpty {
                    errorState(err)
                } else if events.isEmpty {
                    emptyState
                } else {
                    eventList
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 40)
        }
        .background(K.bg.ignoresSafeArea())
        .refreshable {
            await load()
        }
        .task { await load() }
        .privacySnapshotProtected()
    }

    // MARK: Subviews

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Recent activity")
                .font(.scaledSystem(size: 26, weight: .black, design: .rounded))
                .foregroundStyle(K.text)
            Text("The last 10 parent-mode events on this account.")
                .font(.scaledSystem(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(K.dim)
        }
    }

    private var notElevatedState: some View {
        VStack(spacing: 10) {
            Image(systemName: "lock.fill")
                .font(.scaledSystem(size: 30, weight: .bold))
                .foregroundStyle(K.dim)
            Text("Parent mode timed out. Reopen Settings to view activity.")
                .font(.scaledSystem(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "tray")
                .font(.scaledSystem(size: 30, weight: .bold))
                .foregroundStyle(K.dim)
            Text("No recent activity.")
                .font(.scaledSystem(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(K.dim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func errorState(_ msg: String) -> some View {
        VStack(spacing: 10) {
            Text(msg)
                .font(.scaledSystem(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(K.coralDark)
                .multilineTextAlignment(.center)
            Button {
                Task { await load() }
            } label: {
                Text("Retry")
                    .font(.scaledSystem(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .frame(minHeight: 44)
                    .background(K.tealDark)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var eventList: some View {
        VStack(spacing: 8) {
            ForEach(events) { ev in
                row(ev)
            }
        }
    }

    private func row(_ ev: AuditEvent) -> some View {
        let reason = ev.metadata?["reason"]
        return HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .fill(iconColor(ev.event_type, reason: reason).opacity(0.15))
                    .frame(width: 36, height: 36)
                Image(systemName: iconName(ev.event_type, reason: reason))
                    .font(.scaledSystem(size: 14, weight: .bold))
                    .foregroundStyle(iconColor(ev.event_type, reason: reason))
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(label(ev.event_type, reason: reason))
                    .font(.scaledSystem(size: 14, weight: .heavy, design: .rounded))
                    .foregroundStyle(K.text)
                Text(relative(ev.occurred_at))
                    .font(.scaledSystem(size: 11, weight: .medium, design: .rounded))
                    .foregroundStyle(K.dim)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(K.border, lineWidth: 1)
        )
    }

    // MARK: Mapping helpers
    //
    // Canonical event_type strings emitted by the server (parent_auth_events):
    //   pin_set                          — initial PIN created
    //   pin_changed                      — PIN rotated by parent
    //   pin_reset_requested              — reset code emailed
    //   pin_reset_failed                 — reset confirm rejected
    //   pin_reset_completed              — new PIN saved
    //   elevate_success                  — PIN entry passed
    //   elevate_failed                   — PIN entry rejected; tier in metadata.reason
    //   session_ended                    — parent ended elevated session
    //   sensitive_action_requested       — OTP minted for a sensitive action
    //   sensitive_action_used            — OTP confirmed (one-shot use)
    //   sensitive_action_failed          — confirm wrong OTP / pending locked
    //   sensitive_action_confirmed       — confirmation token issued
    //   sensitive_action_consumed        — confirmation token spent
    //   sensitive_action_request_failed  — /request leg failed
    //   sensitive_action_confirm_blocked — confirm refused (lockout, expired)
    //
    // Tier lockouts come through `elevate_failed` with metadata.reason ∈
    // {tier1_lockout, tier2_lockout, tier3_lockout} — never as standalone
    // event_type values.

    private func label(_ type: String, reason: String?) -> String {
        switch type {
        case "pin_set":                          return "PIN set"
        case "pin_changed":                      return "PIN changed"
        case "pin_reset_requested":              return "Reset code requested"
        case "pin_reset_failed":                 return "PIN reset failed"
        case "pin_reset_completed":              return "PIN reset via email"
        case "elevate_success":                  return "Parent mode unlocked"
        case "elevate_failed":
            switch reason {
            case "tier1_lockout": return "Locked: 60 seconds"
            case "tier2_lockout": return "Locked: 15 minutes"
            case "tier3_lockout": return "PIN locked — must reset"
            default:              return "PIN entry failed"
            }
        case "session_ended":                    return "Parent mode ended"
        case "sensitive_action_requested":       return "Sensitive action started"
        case "sensitive_action_used":            return "Sensitive action confirmed"
        case "sensitive_action_failed":          return "Sensitive action failed"
        case "sensitive_action_confirmed":       return "Sensitive action confirmed"
        case "sensitive_action_consumed":        return "Sensitive action used"
        case "sensitive_action_request_failed":  return "Sensitive request failed"
        case "sensitive_action_confirm_blocked": return "Sensitive action blocked"
        default:                                 return type.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    private func iconName(_ type: String, reason: String?) -> String {
        switch type {
        case "pin_set", "pin_changed":
            return "key.fill"
        case "pin_reset_requested":
            return "envelope.fill"
        case "pin_reset_completed":
            return "key.horizontal.fill"
        case "pin_reset_failed":
            return "xmark.shield.fill"
        case "elevate_success":
            return "lock.open.fill"
        case "elevate_failed":
            switch reason {
            case "tier1_lockout", "tier2_lockout": return "hourglass"
            case "tier3_lockout":                  return "exclamationmark.triangle.fill"
            default:                                return "xmark.shield.fill"
            }
        case "session_ended":
            return "lock.fill"
        case "sensitive_action_requested":
            return "envelope.fill"
        case "sensitive_action_used",
             "sensitive_action_confirmed",
             "sensitive_action_consumed":
            return "checkmark.shield.fill"
        case "sensitive_action_failed",
             "sensitive_action_request_failed",
             "sensitive_action_confirm_blocked":
            return "xmark.shield.fill"
        default:
            return "doc.text"
        }
    }

    private func iconColor(_ type: String, reason: String?) -> Color {
        switch type {
        case "elevate_failed":
            switch reason {
            case "tier1_lockout", "tier2_lockout": return K.gold     // amber
            case "tier3_lockout":                  return K.coralDark
            default:                                return K.gold
            }
        case "pin_reset_failed",
             "sensitive_action_failed",
             "sensitive_action_request_failed",
             "sensitive_action_confirm_blocked":
            return K.coralDark
        case "elevate_success",
             "pin_set",
             "pin_changed",
             "sensitive_action_used",
             "sensitive_action_confirmed",
             "sensitive_action_consumed":
            return K.tealDark
        case "pin_reset_requested",
             "pin_reset_completed",
             "sensitive_action_requested":
            return K.purple
        default:
            return K.dim
        }
    }

    private func relative(_ iso: String) -> String {
        guard let d = Self.iso.date(from: iso) else { return iso }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: d, relativeTo: Date())
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    // MARK: Network

    /// PostgREST direct read with the elevated parent token. The kids-app
    /// SupabaseClient has the kid JWT injected globally, so we bypass it
    /// here and hit the REST endpoint with our own headers.
    private func load() async {
        guard let token = session.tokenForRequest() else {
            // Session lapsed while the screen was open. The view's
            // notElevatedState branch will render on the next pass.
            isLoading = false
            return
        }

        isLoading = true
        defer { isLoading = false }

        let base = SupabaseKidsClient.shared.supabaseURL
        // PostgREST: GET /rest/v1/parent_auth_events
        // ?select=id,event_type,occurred_at,parent_session_id
        // &order=occurred_at.desc&limit=10
        guard var components = URLComponents(
            url: base.appendingPathComponent("rest/v1/parent_auth_events"),
            resolvingAgainstBaseURL: false
        ) else {
            loadError = "Couldn\u{2019}t build the request."
            return
        }
        components.queryItems = [
            URLQueryItem(name: "select", value: "id,event_type,occurred_at,parent_session_id,metadata"),
            URLQueryItem(name: "order", value: "occurred_at.desc"),
            URLQueryItem(name: "limit", value: "10")
        ]

        guard let url = components.url else {
            loadError = "Couldn\u{2019}t build the request."
            return
        }

        var req = URLRequest(url: url)
        req.timeoutInterval = 12
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        // PostgREST also requires the apikey header (anon publishable key).
        // We don't have direct access from here; SupabaseKidsClient injects
        // it on its SupabaseClient instance, but the raw URLSession path
        // needs it explicitly.
        if let anon = anonKey() {
            req.setValue(anon, forHTTPHeaderField: "apikey")
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                loadError = "Unexpected response"
                return
            }
            if http.statusCode == 200 {
                let rows = try JSONDecoder().decode([AuditEvent].self, from: data)
                self.events = rows
                self.loadError = nil
                return
            }
            if http.statusCode == 401 {
                self.loadError = "Parent mode timed out. Reopen Settings."
                return
            }
            self.loadError = "Couldn\u{2019}t load activity."
        } catch {
            print("[ParentAuditLogView] load failed:", error)
            self.loadError = "Couldn\u{2019}t reach the server."
        }
    }

    /// Fish the anon key out of the bundle the same way SupabaseKidsClient
    /// does at init. Cheap reflective access keeps us from threading a new
    /// accessor through that file purely for this screen.
    private func anonKey() -> String? {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_KEY") as? String,
           !raw.isEmpty { return raw }
        #if DEBUG
        if let raw = ProcessInfo.processInfo.environment["SUPABASE_KEY"], !raw.isEmpty {
            return raw
        }
        #endif
        return nil
    }
}

// MARK: Wire shape

private struct AuditEvent: Decodable, Identifiable {
    let id: String
    let event_type: String
    let occurred_at: String
    let parent_session_id: String?
    let metadata: [String: String]?

    enum CodingKeys: String, CodingKey {
        case id, event_type, occurred_at, parent_session_id, metadata
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(String.self, forKey: .id)
        self.event_type = try c.decode(String.self, forKey: .event_type)
        self.occurred_at = try c.decode(String.self, forKey: .occurred_at)
        self.parent_session_id = try c.decodeIfPresent(String.self, forKey: .parent_session_id)

        // metadata is jsonb on the server — values may be strings, ints,
        // bools, or nested. We only read string-valued fields (e.g. reason)
        // for label/icon mapping, so decode loosely and stringify primitives.
        if let raw = try? c.decodeIfPresent(LooseJSON.self, forKey: .metadata),
           case .object(let dict) = raw {
            var stringMap: [String: String] = [:]
            for (k, v) in dict {
                stringMap[k] = v.stringValue
            }
            self.metadata = stringMap
        } else {
            self.metadata = nil
        }
    }
}

/// Permissive JSON decoder for jsonb columns. We only need to fish string
/// values out of the top-level object (`reason`, `tier`, etc.); anything
/// nested or non-primitive is stringified for safe rendering.
private indirect enum LooseJSON: Decodable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case object([String: LooseJSON])
    case array([LooseJSON])
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let v = try? c.decode(Bool.self) {
            self = .bool(v)
        } else if let v = try? c.decode(Int.self) {
            self = .int(v)
        } else if let v = try? c.decode(Double.self) {
            self = .double(v)
        } else if let v = try? c.decode(String.self) {
            self = .string(v)
        } else if let v = try? c.decode([String: LooseJSON].self) {
            self = .object(v)
        } else if let v = try? c.decode([LooseJSON].self) {
            self = .array(v)
        } else {
            self = .null
        }
    }

    var stringValue: String {
        switch self {
        case .string(let s): return s
        case .int(let i):    return String(i)
        case .double(let d): return String(d)
        case .bool(let b):   return String(b)
        case .null:          return ""
        case .object, .array: return ""
        }
    }
}
