import SwiftUI

// View-modifier glue for parent-mode gating.
//
// Two surfaces:
//
//   .parentMode(isPresented:onUnlock:)
//     — caller binds `isPresented` to a Bool. When the user taps a guarded
//       button, set the bool to true. If parent-mode is already live, the
//       modifier fires onUnlock immediately and resets the bool. If not,
//       it presents ParentPinEntryView; on success the sheet dismisses
//       and onUnlock fires.
//
//   .sensitiveAction(isPresented:actionKey:label:description:onConfirmed:)
//     — same shape, but presents SensitiveActionView (PIN + email OTP)
//       and only fires onConfirmed after both succeed.
//
// Both modifiers pull the kid token from PairingClient at present-time so
// callers don't have to thread it through the view tree.

extension View {
    /// Gate `onUnlock` behind a live parent-mode session. If no session is
    /// live, presents ParentPinEntryView modally.
    func parentMode(
        isPresented: Binding<Bool>,
        onUnlock: @escaping () -> Void
    ) -> some View {
        modifier(ParentModeModifier(
            isPresented: isPresented,
            onUnlock: onUnlock
        ))
    }

    /// Gate `onConfirmed` behind PIN + email OTP. Always presents the full
    /// two-step sheet — no shortcut even if a parent-mode session is live,
    /// because destructive actions intentionally require a fresh PIN per
    /// owner-locked spec.
    func sensitiveAction(
        isPresented: Binding<Bool>,
        actionKey: String,
        label: String,
        description: String,
        onConfirmed: @escaping (_ confirmationToken: String) async -> Void
    ) -> some View {
        modifier(SensitiveActionModifier(
            isPresented: isPresented,
            actionKey: actionKey,
            label: label,
            description: description,
            onConfirmed: onConfirmed
        ))
    }
}

private struct ParentModeModifier: ViewModifier {
    @Binding var isPresented: Bool
    let onUnlock: () -> Void

    @StateObject private var session = ParentSessionManager.shared
    @State private var sheetPresented: Bool = false

    func body(content: Content) -> some View {
        content
            .onChange(of: isPresented) { _, newValue in
                guard newValue else { return }
                if session.isElevated {
                    isPresented = false
                    onUnlock()
                } else if PairingClient.shared.storedKidToken() != nil {
                    sheetPresented = true
                } else {
                    // No kid token = no way to elevate. Drop quietly; the
                    // caller's UI will reflect the un-acted state.
                    isPresented = false
                }
            }
            .sheet(isPresented: $sheetPresented, onDismiss: {
                isPresented = false
            }) {
                if let token = PairingClient.shared.storedKidToken() {
                    ParentPinEntryView(
                        kidToken: token,
                        onSuccess: {
                            // Sheet already dismissed inside ParentPinEntryView's
                            // submit path; just fire the unlock callback.
                            onUnlock()
                        },
                        onCancel: {}
                    )
                } else {
                    // Edge case: kid token disappeared between Bool flip and
                    // sheet present. Render a tiny error so SwiftUI has a
                    // valid view; user dismisses manually.
                    Text("Session expired. Re-pair this device.")
                        .padding()
                }
            }
    }
}

private struct SensitiveActionModifier: ViewModifier {
    @Binding var isPresented: Bool
    let actionKey: String
    let label: String
    let description: String
    let onConfirmed: (_ confirmationToken: String) async -> Void

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $isPresented) {
                if let token = PairingClient.shared.storedKidToken() {
                    SensitiveActionView(
                        actionKey: actionKey,
                        actionLabel: label,
                        actionDescription: description,
                        kidToken: token,
                        onConfirmed: onConfirmed
                    )
                } else {
                    Text("Session expired. Re-pair this device.")
                        .padding()
                }
            }
    }
}
