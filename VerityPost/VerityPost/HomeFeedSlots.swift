import SwiftUI
import UIKit

// @migrated-to-permissions 2026-04-18
// @feature-verified home_feed 2026-04-18

/// Home-feed recap card. Rendered when `recap.list.view` is granted and a
/// recap exists this week. Users without the permission see an upsell
/// card; anyone else gets `EmptyView`.
struct HomeRecapCard: View {
    @EnvironmentObject var auth: AuthViewModel
    @ObservedObject private var perms = PermissionStore.shared
    @State private var recapTitle: String?
    @State private var recapId: String?
    @State private var canViewRecaps: Bool?
    @State private var showSubscription = false

    var body: some View {
        Group {
            if let title = recapTitle, let id = recapId {
                NavigationLink {
                    RecapQuizView(recapId: id, title: title)
                        .environmentObject(auth)
                } label: {
                    recapCardBody(title: title, sub: "Take the recap quiz")
                }
                .buttonStyle(.plain)
            } else if canViewRecaps == false {
                Button { showSubscription = true } label: {
                    recapCardBody(title: "See what you missed this week", sub: "Available on paid plans.")
                }
                .buttonStyle(.plain)
                .sheet(isPresented: $showSubscription) {
                    SubscriptionView().environmentObject(auth)
                }
            } else {
                EmptyView()
            }
        }
        .task { await load() }
        .task(id: perms.changeToken) {
            canViewRecaps = await PermissionService.shared.has("recap.list.view")
        }
    }

    private func recapCardBody(title: String, sub: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("This week in review")
                .font(.system(.caption2, design: .default, weight: .bold))
                .tracking(1)
                .foregroundColor(VP.accent)
            Text(title)
                .font(.system(.headline, design: .default, weight: .semibold))
                .foregroundColor(VP.text)
                .multilineTextAlignment(.leading)
            Text(sub)
                .font(.caption)
                .foregroundColor(VP.dim)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VP.accent.opacity(0.05))
        .overlay(RoundedRectangle(cornerRadius: VP.radiusMD).stroke(VP.accent.opacity(0.25)))
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD))
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private func load() async {
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/recap", relativeTo: site) else { return }
        let client = SupabaseManager.shared.client
        guard let session = try? await client.auth.session else { return }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            struct MyAttempt: Decodable { let completed_at: String? }
            struct Row: Decodable {
                let id: String
                let title: String
                let my_attempt: MyAttempt?
            }
            struct ListResponse: Decodable { let recaps: [Row]; let paid: Bool? }
            let wrapped = (try? JSONDecoder().decode(ListResponse.self, from: data))
            let rows = wrapped?.recaps ?? []
            await MainActor.run {
                if let next = rows.first(where: { $0.my_attempt?.completed_at == nil }) ?? rows.first {
                    recapId = next.id
                    recapTitle = next.title
                }
            }
        } catch {
            // Swallow — self-hiding slot.
        }
    }
}

/// Per-launch session id for ad serve / impression / cap accounting.
/// One UUID per app launch, mirrors the EventsClient pattern.
private enum AdSession {
    static let id: String = UUID().uuidString
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
                .task(id: ad.id) {
                    if !recordedImpression {
                        recordedImpression = true
                        await recordImpression()
                    }
                }
            } else {
                EmptyView()
            }
        }
        .task(id: placement + (articleId ?? "")) { await load() }
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
