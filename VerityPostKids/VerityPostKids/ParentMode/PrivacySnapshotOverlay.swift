import SwiftUI
import UIKit

// Privacy snapshot redaction for sensitive parent-mode views.
//
// Why this exists:
// iOS captures a screenshot of the foreground app at every backgrounding
// event for the multitasking switcher and (sometimes) device lock-screen
// preview. If a PIN field, OTP field, audit log, or parent-mode session
// state is on screen when that snapshot fires, the snapshot persists
// outside our trust boundary. Apple's Kids Category review flags this.
//
// SwiftUI's `.scenePhase` is unsuitable for this:
//   - Binding state has a 50–200ms flush gap before the next layout pass
//     runs, leaving a window in which iOS can capture before our overlay
//     is on the tree.
//   - `.inactive` fires on every transient interruption (banner, Control
//     Center, alert, FaceTime nag), so a SwiftUI overlay flickers on
//     every pulldown even though no snapshot is being captured.
//
// The canonical iOS pattern (banks, password managers, Apple's own
// Wallet) is a UIWindow subview attached at `UIScene.willDeactivate` —
// synchronous, runs on the same RunLoop tick as the snapshot, and the
// view is removed at `UIScene.didActivate`. Here we use the
// `UIApplication.willResignActiveNotification` / `didBecomeActive`
// pair as a fallback that's identical in timing for single-scene apps
// (which we are; the project enforces UIApplicationSupportsMultipleScenes
// = false, so there's only one window scene to worry about).
//
// Coalescing: a 200ms grace period between resign/become-active events
// suppresses re-attach for transient interruptions (banner notifications,
// Control Center taps). If the app actually backgrounds, the snapshot
// has already happened by the time the grace expires, so the overlay
// stays attached for the duration of the background phase as expected.
//
// Lifecycle:
//   sensitive view onAppear  -> requestProtection()  // arms the manager
//   sensitive view onDisappear -> releaseProtection() // disarms
//   While armed: willResignActive -> attach overlay synchronously
//                didBecomeActive  -> detach overlay (after grace)
//   When disarmed: notifications still fire but no overlay is attached.
//
// Visibility: internal (kids app target only). No tests reach in.

@MainActor
final class PrivacySnapshotManager {
    static let shared = PrivacySnapshotManager()

    /// Reference count of sensitive views that have requested protection.
    /// We use a counter rather than a Bool because parent flows can stack
    /// (PIN entry pushes a reset sheet, etc.) and we want the protection
    /// to stay armed until every requester has released.
    private var requestCount: Int = 0
    private var overlayView: PrivacySnapshotOverlayView?
    private var pendingDetachTask: Task<Void, Never>?
    private var observersInstalled: Bool = false

    private init() {}

    var isProtectionRequested: Bool { requestCount > 0 }

    /// Arms the snapshot redaction. Call from `.onAppear` of a sensitive
    /// view. Idempotent under nesting via reference counting.
    func requestProtection() {
        requestCount += 1
        installObserversIfNeeded()
    }

    /// Disarms the snapshot redaction. Call from `.onDisappear`.
    func releaseProtection() {
        guard requestCount > 0 else { return }
        requestCount -= 1
        if requestCount == 0 {
            // No one's asking for protection any more; if the overlay is
            // somehow still attached (race during quick toggle), pull it.
            detachOverlay()
        }
    }

    // MARK: Notification wiring

    private func installObserversIfNeeded() {
        guard !observersInstalled else { return }
        observersInstalled = true

        let nc = NotificationCenter.default
        // willResignActive fires on the same RunLoop tick as the snapshot
        // — synchronous attach here is what makes the redaction effective.
        nc.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            // forName with .main queue can dispatch async; we want the
            // attach on this very tick. MainActor.assumeIsolated keeps
            // it sync (we know the main queue is the main actor).
            MainActor.assumeIsolated {
                self?.handleWillResignActive()
            }
        }
        nc.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.handleDidBecomeActive()
            }
        }
    }

    private func handleWillResignActive() {
        // Cancel any pending detach from a prior become-active that
        // hadn't run yet — we're going inactive again, keep the overlay.
        pendingDetachTask?.cancel()
        pendingDetachTask = nil

        guard isProtectionRequested else { return }
        attachOverlay()
    }

    private func handleDidBecomeActive() {
        // Coalesce: schedule the detach 200ms out. If another willResign
        // fires inside that window (transient interruption sequence), the
        // pending task gets cancelled and the overlay stays put.
        pendingDetachTask?.cancel()
        pendingDetachTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 200_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                self?.detachOverlay()
            }
        }
    }

    // MARK: Overlay view management

    private func attachOverlay() {
        guard overlayView == nil, let window = activeKeyWindow() else { return }
        let overlay = PrivacySnapshotOverlayView(frame: window.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        // Topmost: ensures we sit above any presented sheet, alert chrome,
        // or keyboard accessory view that's in the window hierarchy.
        window.addSubview(overlay)
        window.bringSubviewToFront(overlay)
        overlayView = overlay
    }

    private func detachOverlay() {
        overlayView?.removeFromSuperview()
        overlayView = nil
    }

    /// Find the key window from the foreground-active scene. Single-scene
    /// guaranteed by Info.plist, but we still walk defensively.
    private func activeKeyWindow() -> UIWindow? {
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene,
                  windowScene.activationState == .foregroundActive
                    || windowScene.activationState == .foregroundInactive
            else { continue }
            if let key = windowScene.windows.first(where: \.isKeyWindow) {
                return key
            }
            return windowScene.windows.first
        }
        return nil
    }
}

// MARK: - Overlay UIView

/// Opaque cover that hides the underlying SwiftUI hierarchy from the iOS
/// snapshotter. Painted with `K.bg` (light/dark adaptive), with a centered
/// lock glyph and the wordmark so the multitasking switcher still feels
/// branded rather than blank/error-looking.
final class PrivacySnapshotOverlayView: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        configure()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        configure()
    }

    private func configure() {
        // K.bg renders as systemBackground-equivalent — adaptive in dark
        // mode. We resolve via UIColor wrapper so the overlay tracks the
        // user's appearance even while the snapshot is fading in.
        backgroundColor = UIColor { tc in
            tc.userInterfaceStyle == .dark
                ? UIColor(red: 0.067, green: 0.067, blue: 0.067, alpha: 1)
                : UIColor(red: 0.980, green: 0.980, blue: 0.980, alpha: 1)
        }
        isOpaque = true
        // Cover everything: full window bounds, ignore safe area.
        translatesAutoresizingMaskIntoConstraints = true

        // Hide from VoiceOver — this is a transient privacy chrome, not
        // a navigable screen. AT users get the underlying view announced
        // when the app returns to the foreground.
        accessibilityElementsHidden = true
        isAccessibilityElement = false

        let stack = UIStackView()
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        let glyphConfig = UIImage.SymbolConfiguration(pointSize: 36, weight: .bold)
        let glyph = UIImageView(image: UIImage(
            systemName: "lock.fill",
            withConfiguration: glyphConfig
        ))
        glyph.tintColor = UIColor { tc in
            tc.userInterfaceStyle == .dark
                ? UIColor(red: 0.612, green: 0.643, blue: 0.686, alpha: 1)
                : UIColor(red: 0.420, green: 0.447, blue: 0.502, alpha: 1)
        }
        glyph.contentMode = .scaleAspectFit

        let wordmark = UILabel()
        wordmark.text = "Verity Post Kids"
        wordmark.font = UIFont.systemFont(ofSize: 17, weight: .heavy)
        wordmark.textColor = UIColor { tc in
            tc.userInterfaceStyle == .dark
                ? UIColor(red: 0.941, green: 0.941, blue: 0.941, alpha: 1)
                : UIColor(red: 0.102, green: 0.102, blue: 0.102, alpha: 1)
        }
        wordmark.textAlignment = .center

        stack.addArrangedSubview(glyph)
        stack.addArrangedSubview(wordmark)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }
}

// MARK: - SwiftUI sugar

extension View {
    /// Arm the privacy snapshot overlay while this view is on screen.
    /// Use on every parent-mode surface that displays PINs, OTPs, parent
    /// session ids, or any auth chrome that shouldn't end up in the iOS
    /// task switcher snapshot.
    func privacySnapshotProtected() -> some View {
        onAppear { PrivacySnapshotManager.shared.requestProtection() }
            .onDisappear { PrivacySnapshotManager.shared.releaseProtection() }
    }
}
