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
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(VP.accent.opacity(0.25)))
        .cornerRadius(12)
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

/// Home-feed ad slot. Calls /api/ads/serve with placement=home_feed.
/// Self-hides on any failure so a broken ad doesn't break the feed.
/// Records an impression on appear and a click on tap.
struct HomeAdSlot: View {
    @State private var ad: AdPayload?
    @State private var recordedImpression = false

    var body: some View {
        Group {
            if let ad {
                Button {
                    Task { await recordClick(ad: ad) }
                    if let u = URL(string: ad.clickUrl) {
                        UIApplication.shared.open(u)
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("SPONSORED")
                            .font(.system(.caption2, design: .default, weight: .bold))
                            .tracking(1)
                            .foregroundColor(VP.dim)
                        Text(ad.title)
                            .font(.system(.callout, design: .default, weight: .semibold))
                            .foregroundColor(VP.text)
                            .multilineTextAlignment(.leading)
                        if let body = ad.body, !body.isEmpty {
                            Text(body)
                                .font(.caption)
                                .foregroundColor(VP.dim)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(VP.card)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(VP.border))
                    .cornerRadius(10)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.plain)
                .task(id: ad.id) {
                    if !recordedImpression {
                        recordedImpression = true
                        await recordImpression(ad: ad)
                    }
                }
            } else {
                EmptyView()
            }
        }
        .task { await load() }
    }

    private func load() async {
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: "/api/ads/serve?placement=home_feed", relativeTo: site) else { return }
        let client = SupabaseManager.shared.client
        var req = URLRequest(url: url)
        if let session = try? await client.auth.session {
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        }
        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            let payload = try JSONDecoder().decode(AdPayload.self, from: data)
            await MainActor.run { ad = payload }
        } catch {
            // Self-hide on failure.
        }
    }

    private func recordImpression(ad: AdPayload) async {
        await postBeacon(path: "/api/ads/impression", body: ["ad_id": ad.id, "placement": "home_feed"])
    }

    private func recordClick(ad: AdPayload) async {
        await postBeacon(path: "/api/ads/click", body: ["ad_id": ad.id, "placement": "home_feed"])
    }

    private func postBeacon(path: String, body: [String: String]) async {
        let site = SupabaseManager.shared.siteURL
        guard let url = URL(string: path, relativeTo: site) else { return }
        let client = SupabaseManager.shared.client
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let session = try? await client.auth.session {
            req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        _ = try? await URLSession.shared.data(for: req)
    }
}

struct AdPayload: Codable, Identifiable {
    let id: String
    let title: String
    let body: String?
    let clickUrl: String

    enum CodingKeys: String, CodingKey {
        case id, title, body
        case clickUrl = "click_url"
    }
}
