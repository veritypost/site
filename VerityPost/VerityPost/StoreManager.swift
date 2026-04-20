import StoreKit
import Supabase
import Foundation

// @migrated-to-permissions 2026-04-18
// @feature-verified subscription 2026-04-18
// Note: this file maps StoreKit product IDs to plan tier names so the
// purchase / sync pipeline can POST the right plan to the server. It is
// not a feature-gate layer — feature visibility is handled by views
// via `PermissionService`. `isPaid` / `hasTier` below exist only for
// StoreKit local state (e.g., "has this device seen an active entitlement
// yet?") which is distinct from the server's authoritative permission set.

extension Notification.Name {
    /// Posted after StoreManager finishes syncing a purchase / restore to the
    /// server. AuthViewModel observes this to refresh the cached user row so
    /// the UI reflects the new plan without requiring app relaunch.
    static let vpSubscriptionDidChange = Notification.Name("vpSubscriptionDidChange")
}

/// StoreKit 2 subscription manager.
///
/// Product IDs match the 8 v2 tiers (D10 / D34 / D42):
///   Verity        — 3.99 / 39.99
///   Verity Pro    — 9.99 / 99.99
///   Verity Family — 14.99 / 149.99
///   Verity Family XL — 19.99 / 199.99
///
/// These IDs must match what's configured in App Store Connect. Purchases
/// are synced to /api/ios/subscriptions/sync which updates users.plan_id
/// (via plans.tier lookup) + users.plan_status + subscriptions rows;
/// StoreKit remains the authority for entitlement state on device.
@MainActor
final class StoreManager: ObservableObject {
    static let shared = StoreManager()

    @Published var products: [Product] = []
    @Published var purchasedProductIDs: Set<String> = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    // MARK: - Product IDs

    static let verityMonthly       = "com.veritypost.verity.monthly"
    static let verityAnnual        = "com.veritypost.verity.annual"
    static let verityProMonthly    = "com.veritypost.verity_pro.monthly"
    static let verityProAnnual     = "com.veritypost.verity_pro.annual"
    static let familyMonthly       = "com.veritypost.verity_family.monthly"
    static let familyAnnual        = "com.veritypost.verity_family.annual"
    static let familyXlMonthly     = "com.veritypost.verity_family_xl.monthly"
    static let familyXlAnnual      = "com.veritypost.verity_family_xl.annual"

    private let productIDs: Set<String> = [
        StoreManager.verityMonthly, StoreManager.verityAnnual,
        StoreManager.verityProMonthly, StoreManager.verityProAnnual,
        StoreManager.familyMonthly, StoreManager.familyAnnual,
        StoreManager.familyXlMonthly, StoreManager.familyXlAnnual
    ]

    /// Display order for the paywall.
    private let sortOrder: [String: Int] = [
        "com.veritypost.verity.monthly": 0,
        "com.veritypost.verity.annual": 1,
        "com.veritypost.verity_pro.monthly": 2,
        "com.veritypost.verity_pro.annual": 3,
        "com.veritypost.verity_family.monthly": 4,
        "com.veritypost.verity_family.annual": 5,
        "com.veritypost.verity_family_xl.monthly": 6,
        "com.veritypost.verity_family_xl.annual": 7
    ]

    /// Plan priority for picking the "highest" active entitlement.
    /// Family XL > Family > Verity Pro > Verity.
    private let planPriority: [String: Int] = [
        "verity_family_xl": 4,
        "verity_family": 3,
        "verity_pro": 2,
        "verity": 1
    ]

    private var updateListenerTask: Task<Void, Error>?
    private let client = SupabaseManager.shared.client

    private init() {
        updateListenerTask = listenForTransactions()
        Task { await loadProducts() }
    }

    deinit {
        updateListenerTask?.cancel()
    }

    // MARK: - Load Products

    func loadProducts() async {
        isLoading = true
        errorMessage = nil
        do {
            let storeProducts = try await Product.products(for: productIDs)
            products = storeProducts.sorted { a, b in
                (sortOrder[a.id] ?? 99) < (sortOrder[b.id] ?? 99)
            }
        } catch {
            errorMessage = "Failed to load products: \(error.localizedDescription)"
            Log.d("StoreManager loadProducts error:", error)
        }
        isLoading = false
    }

    // MARK: - Purchase

    func purchase(_ product: Product) async throws -> Bool {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        // Stamp the current user's Supabase UUID onto the StoreKit transaction
        // so App Store Server Notifications can correlate the receipt back to a
        // user without depending on /api/ios/subscriptions/sync having fired
        // first. Apple surfaces this back as `transaction.appAccountToken` and
        // the server reads it from the JWS payload in `lib/appleReceipt.js`.
        let options: Set<Product.PurchaseOption>
        if let session = try? await client.auth.session {
            // Supabase's session.user.id is already UUID-typed; re-wrap just
            // so if an older SDK ever starts returning a non-UUID id we fall
            // back cleanly rather than trapping.
            if let uuid = UUID(uuidString: session.user.id.uuidString) {
                options = [.appAccountToken(uuid)]
            } else {
                Log.d("StoreManager: purchase without appAccountToken — session user id was not a UUID")
                options = []
            }
        } else {
            Log.d("StoreManager: purchase without appAccountToken — no auth session")
            options = []
        }

        let result = try await product.purchase(options: options)

        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            purchasedProductIDs.insert(product.id)
            await syncPurchaseToServer(
                productID: product.id,
                transactionID: transaction.id,
                receipt: transaction.jsonRepresentation.base64EncodedString(),
                price: product.price
            )
            await transaction.finish()
            return true

        case .userCancelled:
            return false

        case .pending:
            errorMessage = "Purchase is pending approval."
            return false

        @unknown default:
            errorMessage = "Unknown purchase result."
            return false
        }
    }

    // MARK: - Listen for Transactions

    private func listenForTransactions() -> Task<Void, Error> {
        Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                do {
                    let transaction = try self.checkVerified(result)
                    let product = await self.products.first(where: { $0.id == transaction.productID })
                    await MainActor.run {
                        self.purchasedProductIDs.insert(transaction.productID)
                    }
                    await self.syncPurchaseToServer(
                        productID: transaction.productID,
                        transactionID: transaction.id,
                        receipt: transaction.jsonRepresentation.base64EncodedString(),
                        price: product?.price
                    )
                    await transaction.finish()
                } catch {
                    Log.d("Transaction update verification failed:", error)
                }
            }
        }
    }

    // MARK: - Check Entitlements

    func checkEntitlements() async {
        var activeIDs: Set<String> = []
        for await result in Transaction.currentEntitlements {
            do {
                let transaction = try checkVerified(result)
                if transaction.revocationDate == nil {
                    activeIDs.insert(transaction.productID)
                }
            } catch {
                Log.d("Entitlement verification failed:", error)
            }
        }
        purchasedProductIDs = activeIDs
    }

    // MARK: - Sync to server

    private func syncPurchaseToServer(productID: String, transactionID: UInt64, receipt: String?, price: Decimal?) async {
        guard let session = try? await client.auth.session else {
            Log.d("StoreManager: No auth session for sync")
            return
        }

        let priceCents: Int = {
            if let price {
                return NSDecimalNumber(decimal: price * 100).intValue
            }
            return priceCentsForProduct(productID)
        }()

        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/ios/subscriptions/sync")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        struct Payload: Encodable {
            let productId: String
            let transactionId: String
            let receipt: String?
            let priceCents: Int
        }
        req.httpBody = try? JSONEncoder().encode(Payload(
            productId: productID,
            transactionId: String(transactionID),
            receipt: receipt,
            priceCents: priceCents
        ))

        do {
            let (_, response) = try await URLSession.shared.data(for: req)
            if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                Log.d("StoreManager: server sync returned", http.statusCode)
            }
        } catch {
            Log.d("StoreManager: server sync failed:", error)
        }

        NotificationCenter.default.post(name: .vpSubscriptionDidChange, object: nil)
    }

    // MARK: - Restore Purchases

    func restorePurchases() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await AppStore.sync()
            await checkEntitlements()

            if let topProductID = highestActiveProduct(),
               let product = products.first(where: { $0.id == topProductID }),
               let tx = try? await product.latestTransaction,
               case .verified(let transaction) = tx {
                let receipt = transaction.jsonRepresentation.base64EncodedString()
                await syncPurchaseToServer(
                    productID: transaction.productID,
                    transactionID: transaction.id,
                    receipt: receipt,
                    price: product.price
                )
            } else {
                NotificationCenter.default.post(name: .vpSubscriptionDidChange, object: nil)
            }
        } catch {
            errorMessage = "Restore failed: \(error.localizedDescription)"
        }
    }

    // MARK: - Helpers

    nonisolated private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw error
        case .verified(let value):
            return value
        }
    }

    /// Map a StoreKit product ID to the v2 `users.plan` string.
    func planName(for productID: String) -> String {
        if productID.contains("verity_family_xl") { return "verity_family_xl" }
        if productID.contains("verity_family") { return "verity_family" }
        if productID.contains("verity_pro") { return "verity_pro" }
        if productID.contains("verity") { return "verity" }
        return "free"
    }

    func billingCycle(for productID: String) -> String {
        productID.hasSuffix(".annual") ? "annual" : "monthly"
    }

    /// Approximate fallback — the real price always comes from Product.price
    /// at purchase/restore time. Numbers match D42 pricing.
    private func priceCentsForProduct(_ productID: String) -> Int {
        switch productID {
        case Self.verityMonthly: return 399
        case Self.verityAnnual: return 3999
        case Self.verityProMonthly: return 999
        case Self.verityProAnnual: return 9999
        case Self.familyMonthly: return 1499
        case Self.familyAnnual: return 14999
        case Self.familyXlMonthly: return 1999
        case Self.familyXlAnnual: return 19999
        default: return 0
        }
    }

    /// Pick the highest-priority active entitlement for server sync.
    private func highestActiveProduct() -> String? {
        var best: (String, Int)? = nil
        for pid in purchasedProductIDs {
            let plan = planName(for: pid)
            let priority = planPriority[plan] ?? 0
            if best == nil || priority > best!.1 {
                best = (pid, priority)
            }
        }
        return best?.0
    }

    /// Any paid entitlement is present.
    var isPaid: Bool {
        !purchasedProductIDs.isEmpty
    }

    @available(*, deprecated, renamed: "isPaid", message: "Use isPaid — v2 has no 'premium' tier.")
    var isPremium: Bool { isPaid }

    /// Convenience to check plan-level access. Prefer deriving from
    /// auth.currentUser.plan in views — StoreKit state may lag the
    /// server after a purchase.
    func hasAccess(to feature: String) -> Bool {
        switch feature {
        case "bookmarks_unlimited", "collections", "dms", "mentions", "follows",
             "tts", "advanced_search", "category_leaderboards", "recap",
             "profile_banner", "profile_card":
            return isPaid
        case "ask_expert", "streak_freeze", "ad_free":
            // Verity Pro and above.
            for pid in purchasedProductIDs {
                let plan = planName(for: pid)
                if ["verity_pro", "verity_family", "verity_family_xl"].contains(plan) {
                    return true
                }
            }
            return false
        case "kids_profiles", "family_leaderboard":
            for pid in purchasedProductIDs {
                let plan = planName(for: pid)
                if ["verity_family", "verity_family_xl"].contains(plan) { return true }
            }
            return false
        default:
            return true
        }
    }
}
