import SwiftUI

// Friendly paused / soft-deactivated screen for the kids app.
//
// Shown when a parent has flipped paused_at (temporary "stop now") or
// is_active=false (soft delete) on the kid's profile. The kid stays
// logged in — pause and unpause are toggles, not log-in/log-out events.
// The moment a parent unpauses on their device, this screen unlocks
// and the kid resumes where they left off.
//
// Server-side RLS via is_kid_delegated_and_active() enforces the same
// state independently — the kid can't write reading_log / quiz_attempts
// while paused even if a clever local app keeps this screen off the
// stack. So this view is the kid's UX, not the security boundary.

struct KidPausedView: View {
    let kidName: String
    let isInactive: Bool
    var onCheckAgain: () -> Void = {}

    @State private var checking: Bool = false

    private var headline: String {
        if isInactive {
            return "Hi \(displayName), this profile was removed."
        } else {
            return "Hi \(displayName), the app is paused right now."
        }
    }

    private var body1: String {
        if isInactive {
            return "Ask a parent if you should make a new profile or use a different one."
        } else {
            return "A parent paused it. They can unpause it any time — no need to set anything up again."
        }
    }

    private var displayName: String {
        let trimmed = kidName.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "friend" : trimmed
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [K.bg, K.card],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()
                Image(systemName: isInactive ? "tray" : "moon.zzz.fill")
                    .font(.system(size: 64, weight: .medium))
                    .foregroundStyle(K.text)
                    .opacity(0.85)

                Text(headline)
                    .font(.system(.title2, design: .rounded, weight: .heavy))
                    .foregroundStyle(K.text)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)

                Text(body1)
                    .font(.system(.body, design: .rounded, weight: .medium))
                    .foregroundStyle(K.dim)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 36)

                Spacer()

                Button {
                    Task {
                        checking = true
                        defer { checking = false }
                        onCheckAgain()
                    }
                } label: {
                    HStack(spacing: 8) {
                        if checking {
                            ProgressView()
                                .tint(K.bg)
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                        Text(checking ? "Checking…" : "Check again")
                    }
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .foregroundStyle(K.bg)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 14)
                    .background(K.text)
                    .clipShape(RoundedRectangle(cornerRadius: 999, style: .continuous))
                }
                .disabled(checking)
                .padding(.bottom, 40)
            }
        }
    }
}
