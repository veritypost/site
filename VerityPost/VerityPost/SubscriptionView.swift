import SwiftUI
import StoreKit

// @migrated-to-permissions 2026-04-18
// @feature-verified subscription 2026-04-18
// Note: this file is intrinsically about plan choice — `currentPlan`
// is used only to highlight the viewer's existing tier on the plan
// grid. It is not a feature gate. No `PermissionService` lookup needed.

struct SubscriptionView: View {
    @EnvironmentObject var auth: AuthViewModel
    @StateObject private var store = StoreManager.shared
    @State private var isAnnual = true
    @State private var promoCode = ""
    @State private var promoLoading = false
    @State private var promoMessage: String?
    @State private var promoSuccess = false
    @State private var purchaseError: String?

    private let client = SupabaseManager.shared.client

    private var currentPlan: String {
        auth.currentUser?.plan ?? "free"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    header
                    billingToggle
                    planCard(plan: "free")
                    planCard(plan: "verity")
                    planCard(plan: "verity_pro")
                    planCard(plan: "verity_family")
                    planCard(plan: "verity_family_xl")
                    promoSection
                    restoreSection
                    manageLink
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
            }
            .background(VP.bg)
            .navigationTitle("Subscription")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 8) {
            // Show the user's current plan at the top so they understand
            // whether they're upgrading, downgrading, or viewing for
            // reference — no more mystery about current state.
            if auth.isLoggedIn {
                HStack(spacing: 6) {
                    Text("Current plan:")
                        .font(.caption)
                        .foregroundColor(VP.dim)
                    Text(planTitle(currentPlan))
                        .font(.system(.caption, design: .default, weight: .bold))
                        .foregroundColor(VP.accent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 3)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(VP.accent.opacity(0.12))
                        )
                }
            }
            Text("Choose Your Plan")
                .font(.system(.title, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text("Unlock full features and support quality journalism.")
                .font(.subheadline)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: - Billing Toggle

    private var billingToggle: some View {
        HStack(spacing: 0) {
            toggleButton("Monthly", active: !isAnnual) { isAnnual = false }
            toggleButton("Annual", active: isAnnual) { isAnnual = true }
        }
        .background(RoundedRectangle(cornerRadius: 10).fill(VP.card))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border, lineWidth: 1))
    }

    private func toggleButton(_ label: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(.subheadline, design: .default, weight: .semibold))
                .foregroundColor(active ? .white : VP.dim)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(active ? VP.accent : .clear)
                        .padding(2)
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Plan Card

    @ViewBuilder
    private func planCard(plan: String) -> some View {
        let isCurrent = currentPlan == plan
        let features = planFeatures(plan)
        let price = planPrice(plan)
        let productID = planProductID(plan)

        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(planTitle(plan))
                    .font(.system(.title3, design: .default, weight: .bold))
                    .foregroundColor(VP.text)
                Spacer()
                if isCurrent {
                    Text("CURRENT")
                        .font(.system(.caption2, design: .default, weight: .bold))
                        .tracking(1)
                        .foregroundColor(VP.success)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(VP.success.opacity(0.12))
                        )
                }
            }

            Text(price)
                .font(.system(.callout, design: .default, weight: .semibold))
                .foregroundColor(VP.accent)

            VStack(alignment: .leading, spacing: 8) {
                ForEach(features, id: \.self) { feature in
                    HStack(alignment: .top, spacing: 10) {
                        Rectangle()
                            .fill(VP.success)
                            .frame(width: 3)
                            .padding(.vertical, 2)
                        Text(feature)
                            .font(.footnote)
                            .foregroundColor(VP.text)
                    }
                }
            }

            if !isCurrent && plan != "free" {
                if let pid = productID, let product = store.products.first(where: { $0.id == pid }) {
                    Button {
                        Task {
                            purchaseError = nil
                            do {
                                let success = try await store.purchase(product)
                                if success {
                                    await auth.checkSession()
                                }
                            } catch {
                                purchaseError = error.localizedDescription
                            }
                        }
                    } label: {
                        HStack {
                            if store.isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .scaleEffect(0.8)
                            }
                            Text("Subscribe")
                                .font(.system(.callout, design: .default, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .frame(minHeight: 44)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(VP.accent)
                        )
                    }
                    .disabled(store.isLoading)
                    .buttonStyle(.plain)
                } else {
                    // Product not loaded yet
                    Text("Loading...")
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                }
            }

            if let err = purchaseError {
                Text(err)
                    .font(.caption)
                    .foregroundColor(VP.danger)
            }

            if let err = store.errorMessage {
                Text(err)
                    .font(.caption)
                    .foregroundColor(VP.danger)
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isCurrent ? VP.accent.opacity(0.04) : VP.card)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(isCurrent ? VP.accent : VP.border, lineWidth: isCurrent ? 2 : 1)
        )
    }

    // MARK: - Promo Code Section

    private var promoSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PROMO CODE")
                .font(.system(.caption2, design: .default, weight: .bold))
                .tracking(1)
                .foregroundColor(VP.dim)

            HStack(spacing: 10) {
                TextField("Enter code", text: $promoCode)
                    .font(.subheadline)
                    .textFieldStyle(.roundedBorder)
                    .autocapitalization(.allCharacters)
                    .disableAutocorrection(true)

                Button {
                    Task { await redeemPromo() }
                } label: {
                    Text(promoLoading ? "..." : "Apply")
                        .font(.system(.subheadline, design: .default, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 9)
                        .frame(minHeight: 44)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(promoCode.isEmpty ? VP.dim : VP.accent)
                        )
                }
                .disabled(promoCode.trimmingCharacters(in: .whitespaces).isEmpty || promoLoading)
                .buttonStyle(.plain)
            }

            if let msg = promoMessage {
                Text(msg)
                    .font(.caption)
                    .foregroundColor(promoSuccess ? VP.success : VP.danger)
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(VP.card)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(VP.border, lineWidth: 1)
        )
    }

    // MARK: - Restore

    private var restoreSection: some View {
        Button {
            Task { await store.restorePurchases() }
        } label: {
            Text("Restore Purchases")
                .font(.system(.subheadline, design: .default, weight: .medium))
                .foregroundColor(VP.accent)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Manage

    private var manageLink: some View {
        Button {
            if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
                UIApplication.shared.open(url)
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "gear")
                    .font(.footnote)
                Text("Manage Subscription")
                    .font(.system(.subheadline, design: .default, weight: .medium))
            }
            .foregroundColor(VP.dim)
        }
        .buttonStyle(.plain)
        .padding(.bottom, 20)
    }

    // MARK: - Plan Data

    private func planFeatures(_ plan: String) -> [String] {
        switch plan {
        case "free":
            return [
                "Read every article",
                "Take quizzes, join discussions",
                "10 bookmarks",
                "One breaking-news alert per day",
                "Global leaderboard"
            ]
        case "verity":
            return [
                "Everything in Free",
                "Unlimited bookmarks + collections",
                "Direct messages, follows, mentions",
                "Advanced search + filters",
                "Listen to articles (TTS)",
                "Category leaderboards",
                "Weekly recap quizzes",
                "Shareable profile card"
            ]
        case "verity_pro":
            return [
                "Everything in Verity",
                "Ask an Expert",
                "Streak freezes (2 per week)",
                "Ad-free",
                "Priority support"
            ]
        case "verity_family":
            return [
                "Everything in Verity Pro",
                "Up to 2 adults + up to 2 kids",
                "Family leaderboard",
                "Shared achievements",
                "Weekly family report",
                "Kid expert sessions"
            ]
        case "verity_family_xl":
            return [
                "Everything in Verity Family",
                "Up to 4 kids"
            ]
        default:
            return []
        }
    }

    /// D42 pricing (~17% annual savings on clean round numbers).
    private func planPrice(_ plan: String) -> String {
        switch plan {
        case "free": return "Free"
        case "verity":
            return isAnnual ? "$39.99/yr" : "$3.99/mo"
        case "verity_pro":
            return isAnnual ? "$99.99/yr" : "$9.99/mo"
        case "verity_family":
            return isAnnual ? "$149.99/yr" : "$14.99/mo"
        case "verity_family_xl":
            return isAnnual ? "$199.99/yr" : "$19.99/mo"
        default: return ""
        }
    }

    private func planProductID(_ plan: String) -> String? {
        switch plan {
        case "verity":
            return isAnnual ? StoreManager.verityAnnual : StoreManager.verityMonthly
        case "verity_pro":
            return isAnnual ? StoreManager.verityProAnnual : StoreManager.verityProMonthly
        case "verity_family":
            return isAnnual ? StoreManager.familyAnnual : StoreManager.familyMonthly
        case "verity_family_xl":
            return isAnnual ? StoreManager.familyXlAnnual : StoreManager.familyXlMonthly
        default:
            return nil
        }
    }

    /// Human-readable name for each plan (the card title).
    private func planTitle(_ plan: String) -> String {
        switch plan {
        case "free": return "Free"
        case "verity": return "Verity"
        case "verity_pro": return "Verity Pro"
        case "verity_family": return "Verity Family"
        case "verity_family_xl": return "Verity Family XL"
        default: return plan.capitalized
        }
    }

    // MARK: - Promo Redemption

    // Delegates to the permission-gated /api/promo/redeem route (service-
    // client writes, duplicate-use guard, audit log, optimistic current_uses
    // increment). Prior direct-write path tried to mutate promo_codes /
    // promo_uses / users with wrong column names and invalid RLS scope.
    private func redeemPromo() async {
        let code = promoCode.trimmingCharacters(in: .whitespaces).uppercased()
        guard !code.isEmpty else { return }
        guard let session = try? await client.auth.session else {
            promoMessage = "You must be logged in."
            promoSuccess = false
            return
        }

        promoLoading = true
        promoMessage = nil
        defer { promoLoading = false }

        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/promo/redeem")
        struct Body: Encodable { let code: String }
        struct SuccessResponse: Decodable {
            let success: Bool?
            let fullDiscount: Bool?
            let plan: String?
            let message: String?
        }
        struct ErrorResponse: Decodable { let error: String? }

        do {
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            req.httpBody = try JSONEncoder().encode(Body(code: code))
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                promoMessage = "Network issue."
                promoSuccess = false
                return
            }
            if http.statusCode == 200 {
                let decoded = try JSONDecoder().decode(SuccessResponse.self, from: data)
                promoMessage = decoded.message ?? "Promo applied!"
                promoSuccess = true
                promoCode = ""
                await auth.checkSession()
            } else {
                let err = (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.error
                promoMessage = err ?? "Failed to redeem code."
                promoSuccess = false
            }
        } catch {
            promoMessage = "Failed to redeem: \(error.localizedDescription)"
            promoSuccess = false
        }
    }
}
