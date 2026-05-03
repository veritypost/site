import SwiftUI
import Supabase

// Shown when the iOS sync endpoint returns 409 with code='stripe_sub_active',
// meaning the user has an active Stripe (web) subscription and should not
// also purchase an Apple subscription. Per Q06 sub-decision: iOS calls
// transaction.finish() before showing this sheet; the user must cancel
// the web sub via Verity Post billing or request an Apple refund.

/// Reason enum for the conflict sheet. Extend when the inverse (apple_sub_active)
/// is handled on the web side; iOS only handles stripe_sub_active for now.
enum ConflictReason: Identifiable {
    case stripeSubActive(message: String)

    var id: String {
        switch self {
        case .stripeSubActive: return "stripe_sub_active"
        }
    }
}

struct SubscriptionConflictSheet: View {
    let reason: ConflictReason
    @Environment(\.dismiss) private var dismiss

    private var bodyMessage: String {
        switch reason {
        case .stripeSubActive(let message): return message
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(VP.border)
                .frame(width: 36, height: 4)
                .padding(.top, 10)

            VStack(spacing: 20) {
                Spacer().frame(height: 8)

                VStack(spacing: 8) {
                    Text("You already have a Verity Post web subscription")
                        .font(.system(.title3, design: .default, weight: .bold))
                        .foregroundColor(VP.text)
                        .multilineTextAlignment(.center)

                    Text(bodyMessage)
                        .font(.subheadline)
                        .foregroundColor(VP.dim)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 32)

                VStack(spacing: 10) {
                    Button {
                        // Derive from SupabaseManager.siteURL so staging builds
                        // open the matching environment's billing surface rather
                        // than hardcoded production. Pattern mirrors SettingsView
                        // Ext-J4 and SubscriptionView's Terms/Privacy links.
                        let billingURL = SupabaseManager.shared.siteURL
                            .appendingPathComponent("profile/settings")
                            .absoluteString + "#billing"
                        if let url = URL(string: billingURL) {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        Text("Open Verity Post billing")
                            .font(.system(.callout, design: .default, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(VP.accent)
                            .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                    }

                    Button {
                        if let url = URL(string: "https://reportaproblem.apple.com") {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        Text("Request refund from Apple")
                            .font(.system(.subheadline, design: .default, weight: .medium))
                            .foregroundColor(VP.accent)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                    }

                    Button {
                        dismiss()
                    } label: {
                        Text("Close")
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
