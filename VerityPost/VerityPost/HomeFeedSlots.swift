import SwiftUI
import UIKit

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
            if let ad {
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
