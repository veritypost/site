import SwiftUI

// @migrated-to-permissions 2026-04-18
// @feature-verified notifications 2026-04-18
// Presentational pre-prompt; presented only from surfaces that have
// already gated on notifications.prefs.toggle_push.

/// Pre-prompt sheet for notifications. Shown *before* the iOS system
/// dialog so users who decline here don't burn their one-shot iOS
/// permission — we can re-ask on the next value moment. Only the user's
/// explicit "Turn on" triggers the OS dialog.
struct PushPromptSheet: View {
    let title: String
    let detail: String
    let onEnable: () async -> Void
    let onDecline: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isRequesting = false

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(VP.border)
                .frame(width: 36, height: 4)
                .padding(.top, 10)

            VStack(spacing: 20) {
                Spacer().frame(height: 8)

                VStack(spacing: 8) {
                    Text(title)
                        .font(.system(.title3, design: .default, weight: .bold))
                        .foregroundColor(VP.text)
                        .multilineTextAlignment(.center)
                    Text(detail)
                        .font(.subheadline)
                        .foregroundColor(VP.dim)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 32)

                VStack(spacing: 10) {
                    Button {
                        Task {
                            isRequesting = true
                            await onEnable()
                            isRequesting = false
                            dismiss()
                        }
                    } label: {
                        HStack {
                            if isRequesting { ProgressView().tint(.white) }
                            Text(isRequesting ? "Asking\u{2026}" : "Turn on notifications")
                                .font(.system(.callout, design: .default, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(VP.accent)
                        .cornerRadius(12)
                    }
                    .disabled(isRequesting)

                    Button {
                        onDecline()
                        dismiss()
                    } label: {
                        Text("Not now")
                            .font(.system(.subheadline, design: .default, weight: .medium))
                            .foregroundColor(VP.dim)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 28)
            }
        }
        .background(VP.bg)
        .presentationDetents([.medium])
        .presentationDragIndicator(.hidden)
    }
}
