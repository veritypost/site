import Foundation
import UIKit
import UserNotifications
import Supabase

// @migrated-to-permissions 2026-04-18
// @feature-verified notifications 2026-04-18
// APNs plumbing; gating for the surfaces that invoke this lives in
// AlertsView / NotificationsSettingsView. No feature gate here.

// Handles APNs registration. Call registerIfPermitted() after login. The token
// is upserted into user_devices for the current user. Requires the Push
// Notifications capability in Xcode + an APNs auth key on the server.

final class PushRegistration: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushRegistration()
    private let client = SupabaseManager.shared.client
    private var lastUserId: String?

    func setCurrentUser(_ userId: String?) {
        // T187 — validate UUID shape before storing. A garbage value would
        // pass through to upsert_user_push_token and surface as a server
        // 400; failing fast here makes the bug obvious in DEBUG and avoids
        // a botched RPC in production.
        if let raw = userId {
            guard UUID(uuidString: raw) != nil else {
                assertionFailure("PushRegistration.setCurrentUser got non-UUID string: \(raw)")
                Log.d("PushRegistration: dropped non-UUID userId:", raw)
                return
            }
        }
        lastUserId = userId
    }

    // Prompts for permission if undetermined, then registers for remote
    // notifications if granted. Safe to call repeatedly.
    @MainActor
    func registerIfPermitted() async {
        UNUserNotificationCenter.current().delegate = self
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            let granted = (try? await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])) ?? false
            if granted { UIApplication.shared.registerForRemoteNotifications() }
        case .authorized, .provisional, .ephemeral:
            UIApplication.shared.registerForRemoteNotifications()
        default:
            break
        }
    }

    // Called from the app delegate when APNs hands us the device token.
    // Registers the token via upsert_user_push_token (idempotent).
    func handleDeviceToken(_ token: Data) {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        guard lastUserId != nil else { return }

        #if DEBUG
        let environment = "sandbox"
        #else
        let environment = "production"
        #endif

        let appVersion = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? ""

        Task {
            struct Args: Encodable {
                let p_provider: String
                let p_token: String
                let p_environment: String?
                let p_device_name: String?
                let p_platform: String?
                let p_os_version: String?
                let p_app_version: String?
            }
            let args = Args(
                p_provider: "apns",
                p_token: hex,
                p_environment: environment,
                p_device_name: UIDevice.current.name,
                p_platform: "ios",
                p_os_version: UIDevice.current.systemVersion,
                p_app_version: appVersion
            )
            do {
                try await client.rpc("upsert_user_push_token", params: args).execute()
            } catch {
                Log.d("Push token upload error:", error)
            }
        }
    }

    // Show banner even when app is foregrounded (matches App Store guidance).
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }
}

// UIApplicationDelegate shim so SwiftUI can receive the APNs callback.
final class VPAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        PushRegistration.shared.handleDeviceToken(deviceToken)
    }
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Log.d("APNs registration failed:", error)
    }
}
