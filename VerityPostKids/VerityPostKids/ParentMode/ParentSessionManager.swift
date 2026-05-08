import Foundation
import SwiftUI
import UIKit

// In-memory parent-mode elevation manager.
//
// Owner-locked spec: parent's elevated JWT lives ONLY in-memory on iOS.
// Never to Keychain, never to UserDefaults. Dies on app background
// (purge memory immediately) and on the server-issued 30-min TTL.
//
// Server endpoints (Chunk 2 — already shipped):
//   POST /api/kids/parent/elevate    (no auth)
//        body: { kid_token, pin }
//        200 → { elevated_token, parent_session_id, expires_at, kid_profile_id }
//        401 → invalid_kid_token | incorrect_pin
//        409 → pin_not_set
//        429 → locked  (retryAfter in body or Retry-After header) — tier 1/2
//        429 → pin_locked  (code:'pin_locked') — tier 3, must reset
//   POST /api/kids/parent/end-session  (Bearer elevated_token)
//        200 → { ok: true }
//
// Lockout tiers handled server-side: 5 → 60s, 10 → 15min, 20 → must reset.

enum ParentSessionError: Error, LocalizedError, Equatable {
    case invalidPin
    case pinNotSet
    case locked(retryAfter: Int)
    case tier3LockedMustReset
    case invalidKidToken
    case network
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidPin:           return "Incorrect PIN. Try again."
        case .pinNotSet:            return "Set up your PIN first."
        case .locked(let s):        return "Too many attempts. Try again in \(s)s."
        case .tier3LockedMustReset: return "PIN locked. Reset via email."
        case .invalidKidToken:      return "Session expired. Re-pair this device."
        case .network:              return "Couldn\u{2019}t reach the server. Check the connection."
        case .server(let m):        return m
        }
    }
}

@MainActor
final class ParentSessionManager: ObservableObject {
    static let shared = ParentSessionManager()

    @Published private(set) var isElevated: Bool = false
    @Published private(set) var expiresAt: Date? = nil

    // In-memory only. Never persisted.
    private var elevatedToken: String? = nil
    private var parentSessionId: String? = nil
    private var idleTimer: Task<Void, Never>? = nil

    private var bgObserver: NSObjectProtocol?
    private var fgObserver: NSObjectProtocol?

    private init() {
        installLifecycleObservers()
    }

    deinit {
        if let bgObserver { NotificationCenter.default.removeObserver(bgObserver) }
        if let fgObserver { NotificationCenter.default.removeObserver(fgObserver) }
    }

    // MARK: Lifecycle observers — purge on background, re-validate on foreground

    private func installLifecycleObservers() {
        let center = NotificationCenter.default

        bgObserver = center.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            // didEnterBackground delivers on the main queue when queue is .main.
            // Hop into MainActor context to satisfy the isolation guarantee.
            Task { @MainActor [weak self] in
                self?.purge()
            }
        }

        fgObserver = center.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let exp = self.expiresAt, exp < Date() {
                    self.purge()
                }
            }
        }
    }

    // MARK: Elevate

    /// POST /api/kids/parent/elevate. Stores the elevated token in memory.
    func elevate(kidToken: String, pin: String) async throws {
        let url = SupabaseKidsClient.shared.siteURL
            .appendingPathComponent("api/kids/parent/elevate")

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "kid_token": kidToken,
            "pin": pin
        ])

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw ParentSessionError.network
        }

        guard let http = response as? HTTPURLResponse else {
            throw ParentSessionError.server("Unexpected response")
        }

        if http.statusCode == 200 {
            let success = try JSONDecoder().decode(ElevateSuccess.self, from: data)
            apply(token: success.elevated_token,
                  sessionId: success.parent_session_id,
                  expiresAt: parseISO(success.expires_at))
            return
        }

        // Error branches
        let body = (try? JSONDecoder().decode(ElevateErrorBody.self, from: data))
        let msg = body?.error ?? "Elevation failed"
        let code = body?.code

        switch http.statusCode {
        case 401:
            // 401 covers both invalid_kid_token + incorrect_pin. The server
            // distinguishes via `error` string; map to typed errors so the UI
            // can show the right message.
            if msg.localizedCaseInsensitiveContains("kid") {
                throw ParentSessionError.invalidKidToken
            }
            throw ParentSessionError.invalidPin
        case 409:
            throw ParentSessionError.pinNotSet
        case 429:
            if code == "pin_locked" {
                throw ParentSessionError.tier3LockedMustReset
            }
            // tier 1/2 lockout — pick retryAfter from body, fall back to
            // Retry-After header, fall back to 60s.
            let retry = body?.retryAfter
                ?? Int(http.value(forHTTPHeaderField: "Retry-After") ?? "")
                ?? 60
            throw ParentSessionError.locked(retryAfter: retry)
        default:
            throw ParentSessionError.server(msg)
        }
    }

    // MARK: End session

    /// Best-effort POST /end-session, then zero in-memory state regardless
    /// of network outcome. Caller never needs to know whether the server
    /// acknowledged — local state is the source of truth for "elevated or not."
    func endSession() async {
        let token = elevatedToken
        purge()

        guard let token else { return }

        let url = SupabaseKidsClient.shared.siteURL
            .appendingPathComponent("api/kids/parent/end-session")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 8
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        // Fire and forget. Server-side revocation is hygiene — local purge
        // already prevents this client from reusing the token.
        _ = try? await URLSession.shared.data(for: req)
    }

    // MARK: Token access for Settings reads (audit log etc.)

    /// Returns the current elevated token if it's still live. Proactively
    /// expires + purges if `expiresAt` has passed (server enforces TTL via
    /// JWT exp anyway, but we don't want to send a known-dead token).
    func tokenForRequest() -> String? {
        if let exp = expiresAt, exp < Date() {
            purge()
            return nil
        }
        return elevatedToken
    }

    /// Snapshot of (elevated_token, parent_session_id) for callers that
    /// need both — e.g. sensitive-action confirm posts include the
    /// session id so the server can audit which elevation was used.
    func sessionSnapshot() -> (token: String, sessionId: String)? {
        if let exp = expiresAt, exp < Date() {
            purge()
            return nil
        }
        guard let t = elevatedToken, let s = parentSessionId else { return nil }
        return (t, s)
    }

    // MARK: Internal

    private func apply(token: String, sessionId: String, expiresAt: Date?) {
        self.elevatedToken = token
        self.parentSessionId = sessionId
        self.expiresAt = expiresAt
        self.isElevated = true
        scheduleAutoExpiry(at: expiresAt)
    }

    private func purge() {
        idleTimer?.cancel()
        idleTimer = nil
        elevatedToken = nil
        parentSessionId = nil
        expiresAt = nil
        if isElevated { isElevated = false }
    }

    /// Schedule a one-shot Task that flips isElevated → false at the
    /// server-issued exp. Server enforces the TTL too; this just keeps
    /// the UI in sync without a tap to discover expiry.
    private func scheduleAutoExpiry(at date: Date?) {
        idleTimer?.cancel()
        guard let date else { return }
        let interval = date.timeIntervalSinceNow
        guard interval > 0 else {
            purge()
            return
        }
        idleTimer = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.purge()
        }
    }

    private func parseISO(_ s: String) -> Date? {
        // Server emits ISO-8601 with fractional seconds, same format as
        // PairingClient.expires_at. Reuse a configured formatter locally.
        Self.iso.date(from: s)
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

// MARK: Wire shapes

private struct ElevateSuccess: Decodable {
    let elevated_token: String
    let parent_session_id: String
    let expires_at: String
    let kid_profile_id: String
}

private struct ElevateErrorBody: Decodable {
    let error: String?
    let code: String?
    let retryAfter: Int?
}
