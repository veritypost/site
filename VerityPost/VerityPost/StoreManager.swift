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

    /// T-021 — posted when the server sync returned non-2xx or threw.
    /// Listeners can surface "your purchase didn't fully register, try
    /// Restore Purchases" UI. userInfo may carry `statusCode` or `error`
    /// plus `productID`.
    static let vpSubscriptionSyncFailed = Notification.Name("vpSubscriptionSyncFailed")
}

/// StoreKit 2 subscription manager.
///
/// Phase 2 of AI + Plan Change Implementation locks the SKU lineup:
///   Verity        — 7.99 / 79.99
///   Verity Family — 14.99 / 149.99 (1 kid included)
///     + per-additional-kid tiers:
///       2 kids  — 19.98 / 199.98
///       3 kids  — 24.97 / 249.97
///       4 kids  — 29.96 / 299.96
///
/// Pro and Family XL are retired. Pro subs grandfather server-side via
/// auto-migrate at next renewal (Option B). Family XL was never seeded
/// in DB and is dropped permanently — per-kid model replaces it.
///
/// Family is implemented as a tiered subscription group with one SKU per
/// kid count (1-4). Adding/removing a kid triggers an in-group SKU swap;
/// Apple handles proration. Web mirrors this via Stripe quantity-based
/// subscription_items.
///
/// Purchases are synced to /api/ios/subscriptions/sync which updates
/// users.plan_id + users.plan_status + subscriptions rows.
@MainActor
final class StoreManager: ObservableObject {
    static let shared = StoreManager()

    @Published var products: [Product] = []
    @Published var purchasedProductIDs: Set<String> = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    // MARK: - Product IDs (Phase 2: Verity solo + 8 Family-tier SKUs)

    static let verityMonthly       = "com.veritypost.verity.monthly"
    static let verityAnnual        = "com.veritypost.verity.annual"

    // Family base SKU — 1 kid included.
    static let familyMonthly1Kid   = "com.veritypost.family.1kid.monthly"
    static let familyAnnual1Kid    = "com.veritypost.family.1kid.annual"
    // Family with 2 kids — base + 1 extra-seat add-on.
    static let familyMonthly2Kids  = "com.veritypost.family.2kids.monthly"
    static let familyAnnual2Kids   = "com.veritypost.family.2kids.annual"
    // Family with 3 kids — base + 2 extra-seat add-ons.
    static let familyMonthly3Kids  = "com.veritypost.family.3kids.monthly"
    static let familyAnnual3Kids   = "com.veritypost.family.3kids.annual"
    // Family with 4 kids (cap) — base + 3 extra-seat add-ons.
    static let familyMonthly4Kids  = "com.veritypost.family.4kids.monthly"
    static let familyAnnual4Kids   = "com.veritypost.family.4kids.annual"

    // Legacy Pro IDs retained as constants ONLY for grandfather-detection
    // in `tierFromProductID` — no longer in `productIDs` so Product.products()
    // never asks the App Store about them. Existing Pro receipts coming
    // back via Transaction.updates still resolve to a 'verity' tier post-
    // grandfather (the server cron migrates them at next renewal).
    static let legacyVerityProMonthly = "com.veritypost.verity_pro.monthly"
    static let legacyVerityProAnnual  = "com.veritypost.verity_pro.annual"

    // Legacy single-tier Family IDs from before Phase 2's tiered SKU group.
    // Same handling — kept for in-flight receipt resolution; not loaded
    // from App Store on launch.
    static let legacyFamilyMonthly = "com.veritypost.verity_family.monthly"
    static let legacyFamilyAnnual  = "com.veritypost.verity_family.annual"

    private let productIDs: Set<String> = [
        StoreManager.verityMonthly, StoreManager.verityAnnual,
        StoreManager.familyMonthly1Kid, StoreManager.familyAnnual1Kid,
        StoreManager.familyMonthly2Kids, StoreManager.familyAnnual2Kids,
        StoreManager.familyMonthly3Kids, StoreManager.familyAnnual3Kids,
        StoreManager.familyMonthly4Kids, StoreManager.familyAnnual4Kids
    ]

    /// Display order for the paywall.
    private let sortOrder: [String: Int] = [
        "com.veritypost.verity.monthly": 0,
        "com.veritypost.verity.annual": 1,
        "com.veritypost.family.1kid.monthly": 2,
        "com.veritypost.family.1kid.annual": 3,
        "com.veritypost.family.2kids.monthly": 4,
        "com.veritypost.family.2kids.annual": 5,
        "com.veritypost.family.3kids.monthly": 6,
        "com.veritypost.family.3kids.annual": 7,
        "com.veritypost.family.4kids.monthly": 8,
        "com.veritypost.family.4kids.annual": 9
    ]

    /// Plan priority for picking the "highest" active entitlement.
    /// Family > Verity. Pro grandfathers as Verity (priority 1) per
    /// Phase 2 Option B; the auto-migrate cron flips renewal to Verity.
    private let planPriority: [String: Int] = [
        "verity_family": 3,
        "verity_pro": 1,   // grandfathered — same priority as Verity
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
            // C18 — only finish the transaction if the server confirmed.
            // If sync fails (4xx/5xx/network), leave the transaction un-
            // finished so StoreKit re-delivers it to
            // `Transaction.updates` on next launch — that's the
            // rediscovery path for lost-sync receipts. The caller is
            // also notified via .vpSubscriptionSyncFailed for UI recovery
            // (SubscriptionView surfaces a "Purchase didn't sync — tap
            // Restore Purchases" banner).
            let ok = await syncPurchaseToServer(
                productID: product.id,
                transactionID: transaction.id,
                receipt: transaction.jsonRepresentation.base64EncodedString(),
                price: product.price
            )
            if ok {
                await transaction.finish()
            } else {
                Log.d("StoreManager: keeping transaction un-finished for retry on next launch")
            }
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
                    // C18 — same gate as purchase(): only finish on
                    // server-confirmed sync. Un-synced re-deliveries
                    // bounce back through this listener on next launch.
                    let ok = await self.syncPurchaseToServer(
                        productID: transaction.productID,
                        transactionID: transaction.id,
                        receipt: transaction.jsonRepresentation.base64EncodedString(),
                        price: product?.price
                    )
                    if ok {
                        await transaction.finish()
                    }
                } catch {
                    Log.d("Transaction update verification failed:", error)
                }
            }
        }
    }

    // MARK: - Check Entitlements

    /// Walk `Transaction.currentEntitlements` and refresh the in-memory
    /// active SKU set. A80 — when the new set differs from
    /// `purchasedProductIDs`, post `.vpSubscriptionDidChange` so
    /// AuthViewModel + the UI's plan gates pick up the change immediately.
    /// Foreground re-checks (`VerityPostApp.swift`'s
    /// `.onChange(of: scenePhase)`) call this on every wake; without the
    /// diff-and-post, a cross-device tier change (Stripe upgrade on web
    /// while iOS slept) would leave the app flashing the prior tier
    /// until a manual restore.
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
        let changed = activeIDs != purchasedProductIDs
        purchasedProductIDs = activeIDs
        if changed {
            NotificationCenter.default.post(name: .vpSubscriptionDidChange, object: nil)
        }
    }

    // MARK: - Sync to server

    // C18 — returns true when the server confirmed entitlement. Callers
    // (purchase(), Transaction.updates listener, restorePurchases) MUST
    // gate their `transaction.finish()` on this return value so StoreKit
    // re-delivers the transaction on next app launch if the server sync
    // never confirmed. Prior code always called `.finish()` — un-synced
    // purchases then silently dropped off StoreKit and the only recovery
    // was a manual Restore.
    @discardableResult
    private func syncPurchaseToServer(productID: String, transactionID: UInt64, receipt: String?, price: Decimal?) async -> Bool {
        guard let session = try? await client.auth.session else {
            Log.d("StoreManager: No auth session for sync")
            return false
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

        // T-021 — verify 2xx before posting the subscription-changed
        // notification. Prior code swallowed non-2xx as debug-only;
        // a 4xx/5xx means the server never recorded entitlement, and
        // the local app would flip to "paid" while the DB stayed stale.
        var syncedOk = false
        do {
            let (_, response) = try await URLSession.shared.data(for: req)
            if let http = response as? HTTPURLResponse {
                let code = http.statusCode
                if (200..<300).contains(code) {
                    syncedOk = true
                } else {
                    Log.d("StoreManager: server sync returned non-2xx", code)
                    NotificationCenter.default.post(
                        name: .vpSubscriptionSyncFailed,
                        object: nil,
                        userInfo: ["statusCode": code, "productID": productID]
                    )
                }
            }
        } catch {
            Log.d("StoreManager: server sync failed:", error)
            NotificationCenter.default.post(
                name: .vpSubscriptionSyncFailed,
                object: nil,
                userInfo: ["error": "\(error)", "productID": productID]
            )
        }

        if syncedOk {
            NotificationCenter.default.post(name: .vpSubscriptionDidChange, object: nil)
        }
        return syncedOk
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

    /// Map a StoreKit product ID to the `users.plan` string.
    /// Phase 2 lineup: verity, verity_family. Pro grandfathers as
    /// 'verity_pro' so the server-side migration cron can detect + flip.
    func planName(for productID: String) -> String {
        if productID.contains(".family.") || productID.contains("verity_family") {
            return "verity_family"
        }
        if productID.contains("verity_pro") { return "verity_pro" }
        if productID.contains("verity") { return "verity" }
        return "free"
    }

    /// How many kid seats does this Family SKU correspond to?
    /// Returns 0 for non-Family SKUs.
    func kidSeatsForProduct(_ productID: String) -> Int {
        if productID.contains(".1kid.") { return 1 }
        if productID.contains(".2kids.") { return 2 }
        if productID.contains(".3kids.") { return 3 }
        if productID.contains(".4kids.") { return 4 }
        // Legacy single-tier Family pre-Phase-2 — treat as 1 kid.
        if productID == Self.legacyFamilyMonthly || productID == Self.legacyFamilyAnnual {
            return 1
        }
        return 0
    }

    /// Compute the Family SKU for a given (kidCount, period) pair.
    /// Used by the seat-management UI to upgrade/downgrade within the
    /// subscription group.
    func familyProductID(kidCount: Int, period: String) -> String? {
        let n = max(1, min(4, kidCount))
        let suffix = period == "annual" ? "annual" : "monthly"
        return "com.veritypost.family.\(n)kid\(n == 1 ? "" : "s").\(suffix)"
    }

    func billingCycle(for productID: String) -> String {
        productID.hasSuffix(".annual") ? "annual" : "monthly"
    }

    /// Approximate fallback — the real price always comes from Product.price
    /// at purchase/restore time. Numbers match Phase 2 pricing.
    private func priceCentsForProduct(_ productID: String) -> Int {
        switch productID {
        case Self.verityMonthly: return 799
        case Self.verityAnnual: return 7999
        case Self.familyMonthly1Kid: return 1499
        case Self.familyAnnual1Kid: return 14999
        case Self.familyMonthly2Kids: return 1998
        case Self.familyAnnual2Kids: return 19998
        case Self.familyMonthly3Kids: return 2497
        case Self.familyAnnual3Kids: return 24997
        case Self.familyMonthly4Kids: return 2996
        case Self.familyAnnual4Kids: return 29996
        // Legacy fallbacks for in-flight grandfathered receipts
        case Self.legacyVerityProMonthly: return 999
        case Self.legacyVerityProAnnual: return 9999
        case Self.legacyFamilyMonthly: return 1499
        case Self.legacyFamilyAnnual: return 14999
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
            // Phase 2 retired Pro tier. These features now travel with
            // any paid plan (Verity solo or Family). Grandfathered Pro
            // subs continue resolving through the legacy product IDs.
            for pid in purchasedProductIDs {
                let plan = planName(for: pid)
                if ["verity", "verity_pro", "verity_family"].contains(plan) {
                    return true
                }
            }
            return false
        case "kids_profiles", "family_leaderboard":
            for pid in purchasedProductIDs {
                let plan = planName(for: pid)
                if plan == "verity_family" { return true }
            }
            return false
        default:
            return true
        }
    }
}
