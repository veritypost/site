import Foundation
import UIKit
import UserNotifications

// @migrated-to-permissions 2026-04-18
// @feature-verified notifications 2026-04-18
// iOS system-permission wrapper; the app-level capability (sending
// pushes at all) is gated by notifications.prefs.toggle_push at the
// UI layer. No feature gate here.

/// Thin wrapper around UNUserNotificationCenter so UI code doesn't have to
/// reach into the framework to check status or prompt. Also owns the
/// "first-time we asked" bookkeeping used by SettingsView to know whether
/// the iOS permission dialog has been shown at least once — important
/// because once denied, it can only be re-enabled via Settings.app.
@MainActor
final class PushPermission: ObservableObject {
    static let shared = PushPermission()

    @Published private(set) var status: UNAuthorizationStatus = .notDetermined
    @Published private(set) var lastRefreshed: Date = .distantPast

    private let promptedKey = "vp_push_prompted"
    // H14 — stamp when the user taps "Not now" on the pre-prompt sheet
    // so we don't re-show the pre-prompt on every session. Pre-prompt
    // is different from the OS dialog (which we only get one shot at);
    // the PRE-prompt can be shown multiple times at value moments, but
    // not back-to-back. 7-day cooldown after a decline is a reasonable
    // "leave them alone" window; after that we can re-ask at a later
    // value moment (e.g. breaking-news alert intent from Alerts).
    private let prePromptDeclinedKey = "vp_push_preprompt_declined_at"
    private let prePromptCooldown: TimeInterval = 7 * 24 * 60 * 60

    /// True after we've shown the iOS system dialog at least once, regardless
    /// of the user's answer. Used to pick between "pre-prompt" vs. "open
    /// Settings" in UI copy.
    var hasBeenPrompted: Bool {
        UserDefaults.standard.bool(forKey: promptedKey)
    }

    /// True if the user tapped "Not now" on the pre-prompt sheet within
    /// the cooldown window. Callers should skip showing the pre-prompt
    /// while this is true so a declined user isn't nagged every session.
    var prePromptRecentlyDeclined: Bool {
        guard let ts = UserDefaults.standard.object(forKey: prePromptDeclinedKey) as? Date else {
            return false
        }
        return Date().timeIntervalSince(ts) < prePromptCooldown
    }

    /// Record that the user dismissed the pre-prompt without continuing
    /// to the OS dialog. Call from the PushPromptSheet onDecline closure.
    func markPrePromptDeclined() {
        UserDefaults.standard.set(Date(), forKey: prePromptDeclinedKey)
    }

    /// Clear the pre-prompt decline cooldown — e.g. when the user later
    /// grants permission via Settings.app so we don't dead-lock the UX.
    func clearPrePromptDecline() {
        UserDefaults.standard.removeObject(forKey: prePromptDeclinedKey)
    }

    /// Cheap read of current authorization state. Call from .task on views
    /// that want to reflect the latest value.
    func refresh() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        self.status = settings.authorizationStatus
        self.lastRefreshed = Date()
    }

    /// Show the iOS system permission dialog. Only meaningful when status
    /// is .notDetermined — once the user has answered, this is a no-op.
    /// Returns the status after the attempt so callers can branch on result.
    @discardableResult
    func requestIfNeeded() async -> UNAuthorizationStatus {
        await refresh()
        guard status == .notDetermined else { return status }
        let granted = (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        UserDefaults.standard.set(true, forKey: promptedKey)
        if granted {
            UIApplication.shared.registerForRemoteNotifications()
        }
        // Ext-Y.4 — emit the prompt-result event so we can measure
        // opt-in rate against the web equivalent.
        EventsClient.shared.track(
            event: "push_prompt_result",
            payload: ["granted": granted]
        )
        await refresh()
        return status
    }

    /// Deep-link to this app's entry in Settings.app. The only way for a
    /// user who previously denied push to re-enable it.
    func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    /// Short user-facing summary of current state. Good for SettingsView rows.
    var summary: String {
        switch status {
        case .authorized, .provisional, .ephemeral: return "On"
        case .denied: return "Off"
        case .notDetermined: return "Not set"
        @unknown default: return "Unknown"
        }
    }

    var isOn: Bool {
        switch status {
        case .authorized, .provisional, .ephemeral: return true
        default: return false
        }
    }

    var isDenied: Bool { status == .denied }
}
