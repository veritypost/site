import SwiftUI
import UIKit
import WebKit
import AppTrackingTransparency

// @migrated-to-permissions 2026-04-18
// @feature-verified ads 2026-05-13

/// Per-launch session id for ad serve / impression / cap accounting.
/// One UUID per app launch, mirrors the EventsClient pattern.
private enum AdSession {
    static let id: String = UUID().uuidString
}

/// iOS home placement names follow the `ios_home_<slot>_<tier>` shape.
/// Anonymous users see the `_anon` variant; authenticated users (free
/// tier) see the `_free` variant. Paid tiers don't see either — the
/// placement-level `hidden_for_tiers` array enforces that server-side.
/// Migration `ios_home_placements_tier_split` (2026-05-13) owns these
/// names; do not retire without verifying the iOS binary in production.
enum HomeAdSlotSlot: String {
    case top
    case inFeed1 = "in_feed_1"
    case inFeed2 = "in_feed_2"
    case belowFold = "below_fold"
}

func iosHomePlacement(_ slot: HomeAdSlotSlot, authed: Bool) -> String {
    "ios_home_\(slot.rawValue)_\(authed ? "free" : "anon")"
}

/// Generic ad slot. Calls /api/ads/serve with the supplied placement,
/// renders the returned `ad_unit` row (creative_url image, advertiser
/// name, CTA), records impression on first visible render and click
/// on tap. Self-hides on any failure so a broken ad never breaks the
/// surface it sits in.
struct HomeAdSlot: View {
    let placement: String
    let page: String
    let articleId: String?

    init(placement: String, page: String = "home", articleId: String? = nil) {
        self.placement = placement
        self.page = page
        self.articleId = articleId
    }

    @State private var ad: AdPayload?
    @State private var impressionId: String?
    @State private var recordedImpression = false
    // Section E.2 — viewability gate. Mirrors web _AdBeacon.tsx: ≥50%
    // on-screen for ≥1000ms continuous = MRC viewable impression.
    // Without this, every HomeAdSlot fires recordImpression on mount
    // regardless of whether the cell is in the viewport — inflates
    // impressions vs web's IntersectionObserver.
    @State private var visibleSince: Date? = nil
    @State private var viewabilityTask: Task<Void, Never>? = nil

    var body: some View {
        Group {
            // Wave 2 — skip rendering when RPC signals network_fallback;
            // Wave 6b will mount AdMob at that source. Until then,
            // collapse the slot gracefully (same as a no-fill).
            if let ad, ad.source != "network_fallback" {
                renderedAd(ad)
                    .background(
                        // Non-layout-affecting frame probe. Fires
                        // onPreferenceChange on every scroll tick.
                        GeometryReader { proxy in
                            Color.clear.preference(
                                key: AdCellFrameKey.self,
                                value: proxy.frame(in: .global)
                            )
                        }
                    )
                    .onPreferenceChange(AdCellFrameKey.self) { frame in
                        handleVisibility(frame: frame)
                    }
                    .onDisappear {
                        viewabilityTask?.cancel()
                        viewabilityTask = nil
                        visibleSince = nil
                    }
            } else {
                EmptyView()
            }
        }
        .task(id: placement + (articleId ?? "")) { await load() }
    }

    // Wave 6a — render dispatch. HTML creatives (AdSense `<ins>` blocks
    // and any third-party network markup) route through a sandboxed
    // WKWebView so the native side can host arbitrary publisher script
    // without exposing the host app's cookies/storage. Text-only
    // creatives (the historical iOS render path) stay native because
    // wrapping a 3-line SPONSORED card in a WebView would be wasteful.
    @ViewBuilder
    private func renderedAd(_ ad: AdPayload) -> some View {
        if let html = ad.creative_html, !html.isEmpty {
            HTMLCreativeView(
                html: html,
                height: reservedHeight(for: placement),
                onLinkTap: { url in
                    Task { await recordClick() }
                    UIApplication.shared.open(url)
                }
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        } else {
            Button {
                Task { await recordClick() }
                if let urlStr = ad.click_url, let u = URL(string: urlStr) {
                    UIApplication.shared.open(u)
                }
            } label: {
                VStack(alignment: .leading, spacing: 6) {
                    Text("SPONSORED")
                        .font(.system(.caption2, design: .default, weight: .semibold))
                        .tracking(1.6)
                        .foregroundColor(VP.dim)
                    if let advertiser = ad.advertiser_name, !advertiser.isEmpty {
                        Text(advertiser)
                            .font(.system(.callout, design: .default, weight: .semibold))
                            .foregroundColor(VP.text)
                            .multilineTextAlignment(.leading)
                    }
                    if let cta = ad.cta_text ?? ad.alt_text, !cta.isEmpty {
                        Text(cta)
                            .font(.caption)
                            .foregroundColor(VP.dim)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(VP.card)
                .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.border))
                .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
            }
            .buttonStyle(.plain)
        }
    }

    // Reserved slot height for HTML creatives. Mirrors the web Wave 5
    // CLS reserves in Ad.jsx so WebView mount doesn't jolt the
    // surrounding layout while creative script resolves. Tuned to each
    // placement's expected creative format rather than a one-size
    // default — header/end slots take banner-class creatives (~100pt),
    // in-feed and mid-body take medium-rectangle-class (~250pt).
    private func reservedHeight(for placement: String) -> CGFloat {
        if placement == "article_in_body" { return 250 }
        if placement.hasPrefix("ios_home_in_feed") { return 250 }
        if placement.hasPrefix("ios_home_below_fold") { return 250 }
        return 100
    }

    /// Decide whether the cell is ≥50% on-screen. If yes and we haven't
    /// already started the 1s timer, start it; if no, cancel any pending
    /// timer and reset the dwell clock. Once `recordedImpression` flips
    /// true, this function short-circuits — never re-fires on rescroll.
    private func handleVisibility(frame: CGRect) {
        if recordedImpression { return }
        guard frame.height > 0, frame.width > 0 else { return }
        let screen = UIScreen.main.bounds
        let visible = frame.intersection(screen)
        let ratio = (visible.height * visible.width) /
                    (frame.height * frame.width)
        if ratio >= 0.5 {
            if visibleSince == nil { visibleSince = Date() }
            if viewabilityTask == nil {
                viewabilityTask = Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    if Task.isCancelled { return }
                    if !recordedImpression {
                        recordedImpression = true
                        await recordImpression()
                    }
                }
            }
        } else {
            viewabilityTask?.cancel()
            viewabilityTask = nil
            visibleSince = nil
        }
    }

    private func load() async {
        let site = SupabaseManager.shared.siteURL
        var components = URLComponents(url: site.appendingPathComponent("api/ads/serve"), resolvingAgainstBaseURL: false)
        var items: [URLQueryItem] = [
            URLQueryItem(name: "placement", value: placement),
            URLQueryItem(name: "session_id", value: AdSession.id),
        ]
        if let articleId { items.append(URLQueryItem(name: "article_id", value: articleId)) }
        components?.queryItems = items
        guard let url = components?.url else { return }
        let client = SupabaseManager.shared.client
        var req = URLRequest(url: url)
        if let session = try? await client.auth.session {
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        }
        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            let response = try JSONDecoder().decode(AdServeResponse.self, from: data)
            await MainActor.run { ad = response.ad_unit }
        } catch {
            // Self-hide on failure.
        }
    }

    private func recordImpression() async {
        guard let ad else { return }
        var body: [String: String] = [
            "ad_unit_id": ad.id,
            "placement_id": ad.placement_id,
            "page": page,
            "position": placement,
            "session_id": AdSession.id,
            "device_type": "ios_native",
        ]
        if let articleId { body["article_id"] = articleId }
        if let response: ImpressionResponse = await postBeacon(path: "/api/ads/impression", body: body) {
            await MainActor.run { impressionId = response.impression_id }
        }
    }

    private func recordClick() async {
        guard let id = impressionId else { return }
        let _: EmptyAck? = await postBeacon(path: "/api/ads/click", body: ["impression_id": id])
    }

    private func postBeacon<T: Decodable>(path: String, body: [String: String]) async -> T? {
        let site = SupabaseManager.shared.siteURL
        let url = site.appendingPathComponent(path.hasPrefix("/") ? String(path.dropFirst()) : path)
        let client = SupabaseManager.shared.client
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let session = try? await client.auth.session {
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            return try? JSONDecoder().decode(T.self, from: data)
        } catch {
            return nil
        }
    }
}

/// Wrapping shape returned by /api/ads/serve. `ad_unit` is null when no
/// ad matches the placement/targeting/freq-cap predicate.
struct AdServeResponse: Decodable {
    let ad_unit: AdPayload?
}

/// Mirrors the ad_units columns the serve_ad RPC returns (snake_case
/// straight from the API; consistent with EventsClient's wire shape).
///
/// Wave 2 fix: prior `let id: String` decoded JSON key `id` which the RPC
/// never returns — the RPC ships `ad_unit_id`. Every decode silently failed
/// and ads never rendered on iOS. CodingKeys now maps Swift `id` → JSON
/// `ad_unit_id`. New optional fields `source`, `fallback_network`,
/// `fallback_network_unit_id` ride along for Wave 10 AdMob mount.
struct AdPayload: Decodable, Identifiable {
    let id: String
    let placement_id: String
    let ad_format: String?
    let creative_url: String?
    let creative_html: String?
    let click_url: String?
    let alt_text: String?
    let cta_text: String?
    let advertiser_name: String?
    let source: String?
    let fallback_network: String?
    let fallback_network_unit_id: String?

    enum CodingKeys: String, CodingKey {
        case id = "ad_unit_id"
        case placement_id, ad_format, creative_url, creative_html, click_url
        case alt_text, cta_text, advertiser_name, source
        case fallback_network, fallback_network_unit_id
    }
}

struct ImpressionResponse: Decodable {
    let impression_id: String
}

private struct EmptyAck: Decodable {}

/// PreferenceKey carrying the ad cell's global frame for the viewability
/// math in HomeAdSlot.handleVisibility(frame:). Last value wins — there's
/// only one publisher per HomeAdSlot instance.
private struct AdCellFrameKey: PreferenceKey {
    static let defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        value = nextValue()
    }
}

// MARK: - QuizSponsorEyebrow (Wave 4)
//
// Native "Presented by X" surface that sits above the article quiz idle
// card on iOS. Mirrors the web ArticleQuiz.tsx eyebrow: same placement
// name (`article_quiz_sponsor`), same disclosure copy (sponsors have no
// role in editorial content — PBS-underwriting model, not Geico-on-
// Jeopardy). Whole eyebrow self-hides when serve_ad returns null so
// unsold sponsor surfaces add zero visual weight to the idle card.
//
// Reuses HomeAdSlot for the actual ad render + impression / click
// logging — the only thing this view adds is the editorial frame
// (eyebrow label + disclosure).
//
// COPPA: not applicable. The engagement zone that holds the quiz card
// is already hidden upstream for COPPA articles, so this view never
// mounts in a kids context. The placement row carries is_kids_safe=false
// as a defense-in-depth signal but no extra gate is needed here.
struct QuizSponsorEyebrow: View {
    let articleId: String?

    @State private var hasAd: Bool = false

    var body: some View {
        Group {
            if hasAd {
                VStack(alignment: .center, spacing: 4) {
                    Text("PRESENTED BY")
                        .font(.system(.caption2, design: .default, weight: .bold))
                        .tracking(1.4)
                        .foregroundColor(VP.dim.opacity(0.7))
                    HomeAdSlot(
                        placement: "article_quiz_sponsor",
                        page: "article",
                        articleId: articleId
                    )
                    Text("Sponsors have no role in editorial content.")
                        .font(.system(.caption2, design: .default))
                        .italic()
                        .foregroundColor(VP.dim.opacity(0.55))
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
            } else {
                EmptyView()
            }
        }
        .task(id: articleId ?? "") { await probe() }
    }

    // Probe /api/ads/serve once on mount — if no unit comes back, hide
    // the whole eyebrow (label + disclosure included) rather than
    // showing an empty editorial frame. HomeAdSlot self-hides on null
    // too, but we want the surrounding chrome to go with it.
    private func probe() async {
        let site = SupabaseManager.shared.siteURL
        var components = URLComponents(
            url: site.appendingPathComponent("api/ads/serve"),
            resolvingAgainstBaseURL: false
        )
        var items: [URLQueryItem] = [
            URLQueryItem(name: "placement", value: "article_quiz_sponsor"),
            URLQueryItem(name: "session_id", value: AdSession.id),
        ]
        if let articleId { items.append(URLQueryItem(name: "article_id", value: articleId)) }
        components?.queryItems = items
        guard let url = components?.url else { return }
        let client = SupabaseManager.shared.client
        var req = URLRequest(url: url)
        if let session = try? await client.auth.session {
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        }
        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            let response = try JSONDecoder().decode(AdServeResponse.self, from: data)
            await MainActor.run { hasAd = (response.ad_unit != nil) }
        } catch {
            // Self-hide on probe failure — same policy as HomeAdSlot.
        }
    }
}

// MARK: - HTMLCreativeView (Wave 6a)
//
// Sandboxed WKWebView host for HTML ad creatives. AdSense `<ins
// class="adsbygoogle">` blocks and any third-party network markup
// render here; the native VStack/Text fallback in HomeAdSlot stays for
// text-only direct creatives.
//
// Security posture mirrors the web SsrAdCell sandbox:
//   * `WKWebsiteDataStore.nonPersistent()` — cookies/storage scoped to
//     this view instance, never persisted, never shared with the rest
//     of the app or other ad slots.
//   * `baseURL: nil` on loadHTMLString — creative origin is opaque
//     (about:blank), so creative script cannot reach app-scoped
//     storage or `file://` resources.
//   * Click bridge via `decidePolicyFor navigationAction`: any
//     .linkActivated nav is intercepted, routed through the impression
//     beacon's click handler, opened in Safari via UIApplication, and
//     cancelled inside the WebView (the WebView itself never navigates
//     away from the original creative HTML).
//
// Height is caller-supplied. Auto-sizing via contentSize is a tempting
// follow-up but introduces re-layout jitter when creative script
// resizes mid-render (Wave 5 web side fixed CLS by reserving instead);
// reserve a fixed slot height matching the web Wave 5 minHeights.
struct HTMLCreativeView: UIViewRepresentable {
    let html: String
    let height: CGFloat
    let onLinkTap: ((URL) -> Void)?

    func makeCoordinator() -> Coordinator {
        Coordinator(onLinkTap: onLinkTap)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        // Don't allow universal links to bounce into other apps via the
        // WebView; we route taps through onLinkTap → UIApplication.open
        // (which honors universal links at the OS level) so the
        // decision/auditing stays in our hands.
        config.applicationNameForUserAgent = "VerityPostAdHost"
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.isScrollEnabled = false
        webView.backgroundColor = .clear
        webView.isOpaque = false
        webView.scrollView.backgroundColor = .clear
        webView.loadHTMLString(html, baseURL: nil)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // html is immutable per HomeAdSlot lifecycle (load() sets `ad`
        // once and the View identity changes on placement/articleId).
        // No reload needed; coordinator's onLinkTap is bound at make.
    }

    @MainActor
    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.navigationDelegate = nil
        webView.stopLoading()
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: WKWebView, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? UIScreen.main.bounds.width, height: height)
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        let onLinkTap: ((URL) -> Void)?

        init(onLinkTap: ((URL) -> Void)?) {
            self.onLinkTap = onLinkTap
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            // .other covers the initial loadHTMLString call; allow it
            // through so the creative renders. Only .linkActivated and
            // form submits should be hijacked to the click handler —
            // everything else (subresource fetches, iframes filled by
            // AdSense script) needs to load normally for the creative
            // to display correctly.
            switch navigationAction.navigationType {
            case .linkActivated, .formSubmitted:
                if let url = navigationAction.request.url {
                    onLinkTap?(url)
                }
                decisionHandler(.cancel)
            default:
                decisionHandler(.allow)
            }
        }
    }
}

// MARK: - AdTrackingConsent (Wave 6a — scaffolding, no call site)
//
// ATT (App Tracking Transparency) helper. Wave 6b will wire the call
// site once the Apple Developer console walkthrough lands and
// `NSUserTrackingUsageDescription` ships in Info.plist — without that
// key, `requestTrackingAuthorization` returns `.denied` synchronously
// (Apple's gate, not ours). Keeping the helper here so the call site
// only has to import once Info.plist is in place.
//
// Call shape (when ready, post-onboarding, not at launch):
//   let status = await AdTrackingConsent.requestIfNeeded()
//   // pass status to AdMob's GADMobileAds init in Wave 6b
//
// Apple guidance is to defer the prompt until the value is concrete to
// the user — first ad-supported surface, not first launch.
enum AdTrackingConsent {
    @MainActor
    static func requestIfNeeded() async -> ATTrackingManager.AuthorizationStatus {
        let current = ATTrackingManager.trackingAuthorizationStatus
        if current != .notDetermined { return current }
        return await withCheckedContinuation { continuation in
            ATTrackingManager.requestTrackingAuthorization { status in
                continuation.resume(returning: status)
            }
        }
    }
}

// MARK: - Home-feed slot views (Wave 5 — home_layouts data path)
//
// iPhone home now renders the same home_layouts → home_slots →
// home_slot_items tree as web. These views handle the slot kinds that
// didn't exist on iOS before this wave (square_row, rail_card list
// variant, rail_card default). The compact hero (story_card with
// config.variant == 'hero') stays in HomeView so it can keep the
// @ScaledMetric + lastVisitDate context that already lives there.
//
// Token-only — no hard-coded hex. Slot variants that don't have an iOS
// renderer (top_banner / list_rail / data_ticker / insight_row /
// discovery_feed / engagement / promo / cluster / lead / etc.) render
// EmptyView via the dispatcher in HomeView. Future waves can fill those
// in without touching the data path.

// Square row (compact width) — web mobile collapses the 5-up grid to
// a single column where each tile reads as a normal card. Mirrors that:
// up to 5 stacked tiles, empty slot items collapse silently, ads not
// supported on iOS home (Wave 6a ships AdMob via HomeAdSlot in the feed,
// not inside slot items). Tap → StoryDetailView via NavigationLink.
struct HomeSquareRowView: View {
    let slot: HomeSlotRow
    let categories: [VPCategory]

    var body: some View {
        VStack(spacing: 14) {
            ForEach(filledItems, id: \.id) { item in
                if let story = item.articles {
                    NavigationLink(value: story) {
                        tile(for: story)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
    }

    // Drop items that have no article so the row never renders an empty
    // placeholder rectangle. Matches the owner-locked behavior from web
    // SquareRow (registry comment "square_row no longer self-sources
    // empty cells — when no articles are pinned, the row collapses
    // entirely instead of rendering 5 placeholder rectangles").
    private var filledItems: [HomeSlotItemRow] {
        (slot.home_slot_items ?? [])
            .sorted { $0.position < $1.position }
            .filter { $0.articles != nil }
    }

    @ViewBuilder
    private func tile(for story: Story) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let cat = categoryName(for: story.categoryId) {
                // Mono caps kicker on burgundy — mirrors web
                // `.vp-rh-square__cat` (small mono uppercase accent).
                Text(cat.uppercased())
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .tracking(1.0)
                    .foregroundColor(VP.burgundy)
            }
            Text(story.title ?? "Untitled")
                // System serif regular at 14pt matches web
                // `.vp-rh-square__title` (serif, weight 400, ~0.95rem).
                .font(.system(size: 14, weight: .regular, design: .serif))
                .lineSpacing(1)
                .foregroundColor(VP.ink)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(VP.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(VP.border, lineWidth: 1)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(story.title ?? "Untitled")
        .accessibilityAddTraits(.isLink)
    }

    private func categoryName(for id: String?) -> String? {
        guard let id else { return nil }
        return categories.first(where: { $0.id == id })?.displayName
    }
}

// Default rail card — single-article cell. On compact width this stacks
// inline with the main feed (rail/main column merge per web mobile).
// Mirrors web RailCard.tsx default variant.
struct HomeRailCardView: View {
    let slot: HomeSlotRow
    let categories: [VPCategory]

    private var firstStory: Story? {
        (slot.home_slot_items ?? [])
            .sorted { $0.position < $1.position }
            .first(where: { $0.articles != nil })?
            .articles
    }

    var body: some View {
        if let story = firstStory {
            NavigationLink(value: story) {
                VStack(alignment: .leading, spacing: 6) {
                    if let cat = categories.first(where: { $0.id == story.categoryId })?.displayName {
                        Text(cat.uppercased())
                            .font(.system(size: 10, weight: .semibold, design: .monospaced))
                            .tracking(1.0)
                            .foregroundColor(VP.burgundy)
                            .padding(.bottom, 2)
                    }
                    Text(story.title ?? "Untitled")
                        .font(.system(size: 16, weight: .regular, design: .serif))
                        .lineSpacing(1)
                        .foregroundColor(VP.ink)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    if let excerpt = story.excerpt, !excerpt.isEmpty {
                        Text(excerpt)
                            .font(.system(size: 13, weight: .regular))
                            .lineSpacing(2)
                            .foregroundColor(VP.textMuted)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 4)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(VP.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(VP.border, lineWidth: 1)
                )
                .padding(.horizontal, 20)
                .padding(.top, 14)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(story.title ?? "Untitled")
                .accessibilityAddTraits(.isLink)
            }
            .buttonStyle(.plain)
        } else {
            EmptyView()
        }
    }
}

// List-variant rail card — mono caps label + up to 4 hairline-divided
// rows. Data is fetched server-side per slot (one of: most_read /
// most_discussed / recent_updates / most_active_timelines). Mirrors web
// RailCard.tsx list variant.
struct HomeRailListView: View {
    let label: String
    let rows: [HomeListRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .tracking(1.0)
                .foregroundColor(VP.burgundy)
                .padding(.bottom, 10)
            ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                if idx > 0 {
                    Rectangle().fill(VP.borderSoft).frame(height: 1)
                }
                HStack(alignment: .top, spacing: 12) {
                    if let slug = row.slug {
                        NavigationLink(value: HomeStorySlugLink(slug: slug, title: row.title)) {
                            Text(row.title)
                                .font(.system(size: 13, weight: .regular, design: .serif))
                                .foregroundColor(VP.ink)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text(row.title)
                            .font(.system(size: 13, weight: .regular, design: .serif))
                            .foregroundColor(VP.ink)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if let badge = row.badge, !badge.isEmpty {
                        Text(badge)
                            .font(.system(size: 10, weight: .regular, design: .monospaced))
                            .tracking(0.4)
                            .foregroundColor(VP.textSoft)
                            .fixedSize(horizontal: true, vertical: false)
                    }
                }
                .padding(.vertical, 10)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(VP.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(VP.border, lineWidth: 1)
        )
        .padding(.horizontal, 20)
        .padding(.top, 14)
    }
}

// Slug-based navigation target — list-rail rows know the story slug
// but don't carry a full Story. The home NavigationStack already has a
// destination for `Story`; this is a second value type so list-rail
// rows can push directly to a slug-only target.
struct HomeStorySlugLink: Hashable {
    let slug: String
    let title: String
}

// Resolves a slug-only link to a full Story and mounts StoryDetailView.
// Shows a brief loading state while the article row is fetched. Falls
// back to a friendly error if the slug doesn't resolve.
struct HomeListRailDestination: View {
    let link: HomeStorySlugLink
    @EnvironmentObject var auth: AuthViewModel

    @State private var story: Story? = nil
    @State private var loadFailed = false

    var body: some View {
        Group {
            if let story {
                StoryDetailView(story: story)
            } else if loadFailed {
                VStack(spacing: 8) {
                    Text("Story unavailable")
                        .font(.system(.callout, design: .default, weight: .semibold))
                        .foregroundColor(VP.text)
                    Text("We couldn't load this article.")
                        .font(.system(.footnote))
                        .foregroundColor(VP.dim)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(VP.bg.ignoresSafeArea())
            } else {
                VStack(spacing: 12) {
                    ProgressView()
                    Text(link.title)
                        .font(.system(.footnote))
                        .foregroundColor(VP.dim)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(VP.bg.ignoresSafeArea())
            }
        }
        .task(id: link.slug) {
            await resolve()
        }
    }

    private func resolve() async {
        let client = SupabaseManager.shared.client
        do {
            // Resolve slug → most-recent published article for that
            // story. List-rail rows on most_active_timelines key by
            // story_id; for the other sources the row's article_id
            // could equally be queried, but going via slug keeps a
            // single code path.
            let rows: [Story] = try await client.from("articles")
                .select("*, ad_eligible, sensitivity_tags, stories!inner(slug)")
                .eq("stories.slug", value: link.slug)
                .eq("status", value: "published")
                .is("deleted_at", value: nil)
                .order("published_at", ascending: false)
                .limit(1)
                .execute()
                .value
            if let first = rows.first {
                await MainActor.run { story = first }
            } else {
                await MainActor.run { loadFailed = true }
            }
        } catch {
            Log.d("[HomeListRailDestination] resolve failed: \(error)")
            await MainActor.run { loadFailed = true }
        }
    }
}

// MARK: - List-rail data fetcher
//
// Mirrors web RailCard.tsx `fetchListRows`. Source-specific Supabase
// queries, slug-deduped so two articles in the same story collapse to
// one row. Runs on the iOS side because iOS doesn't have a per-card
// server fetch.
enum HomeListRailSource {
    static let defaultLabel: [String: String] = [
        "most_read": "Most read",
        "most_discussed": "Most discussed",
        "recent_updates": "Recent updates",
        "most_active_timelines": "Most active timelines",
    ]
    static let defaultDays: [String: Int] = [
        "most_read": 7,
        "most_discussed": 7,
        "recent_updates": 0,
        "most_active_timelines": 30,
    ]

    static func resolveDays(source: String, cfgDays: Int?) -> Int {
        if let d = cfgDays, d > 0, d <= 365 { return d }
        return defaultDays[source] ?? 7
    }

    static func label(forSource source: String, cfgLabel: String?) -> String {
        if let l = cfgLabel, !l.isEmpty { return l }
        return defaultLabel[source] ?? source
    }

    static let rowCap = 4
}

// Minimal join shapes for the list-rail queries. Kept here next to the
// fetcher so the wire shape lives with its only consumer.
private struct LRArticleRow: Decodable {
    let article_id: String?
    struct ArticleRef: Decodable {
        let id: String
        let title: String?
        let stories: StorySlugRef?
    }
    let articles: ArticleRef?
}

private struct LRRecentArticleRow: Decodable {
    let id: String
    let title: String?
    let updated_at: Date?
    let stories: StorySlugRef?
}

private struct LRTimelineRow: Decodable {
    let story_id: String
    struct StoryRef: Decodable {
        let slug: String?
        let title: String?
    }
    let stories: StoryRef?
}

enum HomeListRailFetcher {
    static func relTime(_ date: Date?) -> String? {
        guard let date else { return nil }
        let ms = Date().timeIntervalSince(date)
        if !ms.isFinite || ms < 0 { return nil }
        let mins = Int(ms / 60)
        if mins < 60 { return "\(mins)m ago" }
        let hrs = mins / 60
        if hrs < 24 { return "\(hrs)h ago" }
        let days = hrs / 24
        if days < 7 { return "\(days)d ago" }
        return "\(days / 7)w ago"
    }

    static func fetch(source: String, cfgDays: Int?) async -> [HomeListRow] {
        let client = SupabaseManager.shared.client
        let days = HomeListRailSource.resolveDays(source: source, cfgDays: cfgDays)
        let isoFmt = ISO8601DateFormatter()
        let since = isoFmt.string(from: Date().addingTimeInterval(-Double(days) * 86400))

        do {
            switch source {
            case "most_read":
                let rows: [LRArticleRow] = try await client.from("reading_log")
                    .select("article_id, articles!inner(id, title, deleted_at, stories(slug))")
                    .gte("created_at", value: since)
                    .not("article_id", operator: .is, value: "null")
                    .is("articles.deleted_at", value: nil)
                    .limit(500)
                    .execute()
                    .value
                return tallyArticleRows(rows, badgeSuffix: "reads")

            case "most_discussed":
                let rows: [LRArticleRow] = try await client.from("comments")
                    .select("article_id, status, articles!inner(id, title, deleted_at, stories(slug))")
                    .gte("created_at", value: since)
                    .not("article_id", operator: .is, value: "null")
                    .is("articles.deleted_at", value: nil)
                    .eq("status", value: "visible")
                    .limit(500)
                    .execute()
                    .value
                return tallyArticleRows(rows, badgeSuffix: "replies")

            case "recent_updates":
                let rows: [LRRecentArticleRow] = try await client.from("articles")
                    .select("id, title, updated_at, stories(slug)")
                    .eq("status", value: "published")
                    .is("deleted_at", value: nil)
                    .order("updated_at", ascending: false)
                    .limit(HomeListRailSource.rowCap * 6)
                    .execute()
                    .value
                var seen = Set<String>()
                var out: [HomeListRow] = []
                for r in rows {
                    guard let slug = r.stories?.slug, !seen.contains(slug) else { continue }
                    seen.insert(slug)
                    out.append(HomeListRow(
                        id: r.id,
                        title: r.title ?? "",
                        slug: slug,
                        badge: relTime(r.updated_at)
                    ))
                    if out.count >= HomeListRailSource.rowCap { break }
                }
                return out

            case "most_active_timelines":
                let rows: [LRTimelineRow] = try await client.from("timelines")
                    .select("story_id, stories!inner(slug, title)")
                    .gte("event_date", value: since)
                    .limit(500)
                    .execute()
                    .value
                // Slug-dedupe (not story_id) — matches web rule.
                var counts: [String: (row: HomeListRow, count: Int)] = [:]
                for r in rows {
                    guard let slug = r.stories?.slug else { continue }
                    if var ex = counts[slug] {
                        ex.count += 1
                        counts[slug] = ex
                    } else {
                        counts[slug] = (
                            HomeListRow(
                                id: r.story_id,
                                title: r.stories?.title ?? "",
                                slug: slug,
                                badge: nil
                            ),
                            1
                        )
                    }
                }
                return counts.values
                    .sorted { $0.count > $1.count }
                    .prefix(HomeListRailSource.rowCap)
                    .map { entry in
                        HomeListRow(
                            id: entry.row.id,
                            title: entry.row.title,
                            slug: entry.row.slug,
                            badge: "+\(entry.count) this month"
                        )
                    }

            default:
                return []
            }
        } catch {
            Log.d("[HomeListRailFetcher] \(source) failed: \(error)")
            return []
        }
    }

    private static func tallyArticleRows(
        _ rows: [LRArticleRow],
        badgeSuffix: String
    ) -> [HomeListRow] {
        // Slug-dedupe so two articles in the same story collapse into
        // one row. First-seen seeds the title/id; later siblings just
        // bump the count.
        var counts: [String: (row: HomeListRow, count: Int)] = [:]
        for r in rows {
            guard let art = r.articles,
                  let slug = art.stories?.slug else { continue }
            if var ex = counts[slug] {
                ex.count += 1
                counts[slug] = ex
            } else {
                counts[slug] = (
                    HomeListRow(
                        id: art.id,
                        title: art.title ?? "",
                        slug: slug,
                        badge: nil
                    ),
                    1
                )
            }
        }
        return counts.values
            .sorted { $0.count > $1.count }
            .prefix(HomeListRailSource.rowCap)
            .map { entry in
                HomeListRow(
                    id: entry.row.id,
                    title: entry.row.title,
                    slug: entry.row.slug,
                    badge: "\(entry.count) \(badgeSuffix)"
                )
            }
    }
}
