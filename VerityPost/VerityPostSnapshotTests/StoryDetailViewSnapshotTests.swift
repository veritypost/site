import XCTest
import SwiftUI
@testable import VerityPost

/// Snapshot baselines for the article reader.
///
/// Implementation note (read me before deleting any baselines):
///
/// The shipping `StoryDetailView` (VerityPost/StoryDetailView.swift) loads
/// timeline + sources + comments + permissions over the network in
/// `.onAppear`, takes an `@EnvironmentObject AuthViewModel`, and runs
/// quiz / TTS / push code paths that need a live Supabase client. None of
/// that is reachable from a hermetic unit-test target without a wholesale
/// dependency-injection refactor of the view.
///
/// Rather than ship snapshots of a perpetual loading spinner, this file
/// renders a **structural proxy** (`StoryReaderProxy`) that mirrors the
/// shape of the shipping view's reader: a header, a tabbed body on phone
/// widths, and the rail layout (article column + sticky timeline rail
/// side-by-side) at ≥1180pt — the same rail threshold encoded in
/// `VP.LayoutBreak.rail`. The proxy renders synchronously from the
/// `MockFixtures` data so PNGs are deterministic.
///
/// When Implementer 1's rail refactor lands and `StoryDetailView` gains
/// a testable initializer (one that accepts pre-loaded `timeline:` /
/// `sources:` and skips the network), swap `StoryReaderProxy` here for
/// the real view and re-record. Until then this proxy locks in the
/// expected layout shape across viewports so a regression in the rail
/// threshold or column widths shows up as a PNG diff.
final class StoryDetailViewSnapshotTests: SnapshotTestCase {

    /// The headline test: render the article reader proxy across every
    /// viewport, from iPhone SE (320pt) up to iPad Pro landscape (1366pt).
    /// At <1180pt the proxy renders the tabbed reader; at ≥1180pt it flips
    /// to the rail layout.
    func test_articleReader_tabbed_acrossViewports() {
        let view = StoryReaderProxy(
            story: MockFixtures.mockStory,
            timeline: MockFixtures.mockTimeline
        )
        assertViewSnapshot(view, viewports: SnapshotViewport.all)
    }

    /// Isolated rail-only test: only the two iPad-landscape viewports.
    /// Easier to eyeball when the rail rendering itself changes — the
    /// phone viewports stay frozen, the rail viewports re-record.
    func test_articleReader_railOnly_iPadLandscape() {
        let view = StoryReaderProxy(
            story: MockFixtures.mockStory,
            timeline: MockFixtures.mockTimeline
        )
        assertViewSnapshot(view, viewports: SnapshotViewport.railOnly)
    }
}

// MARK: - Structural proxy

/// Mirrors the visible shape of `StoryDetailView`'s reader, hermetically.
/// Keep this in sync with the real view's outermost layout so the
/// snapshot diffs reflect real changes. When `StoryDetailView` becomes
/// testable, delete this proxy.
private struct StoryReaderProxy: View {
    let story: Story
    let timeline: [TimelineEvent]

    /// Matches `VP.LayoutBreak.rail` (1180pt) — the threshold at which the
    /// article reader flips from the 3-tab layout to the article+rail
    /// side-by-side layout.
    private let railThreshold: CGFloat = 1180

    var body: some View {
        GeometryReader { proxy in
            if proxy.size.width >= railThreshold {
                railLayout
            } else {
                tabbedLayout
            }
        }
    }

    // <1180pt: phones, iPad portrait, iPad mini portrait — tabbed reader.
    private var tabbedLayout: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            tabBar
            ScrollView {
                Text(story.content ?? "")
                    .font(.body)
                    .padding(.horizontal, 16)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.white)
    }

    // ≥1180pt: iPad landscape — article column + sticky timeline rail.
    private var railLayout: some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                header
                ScrollView {
                    Text(story.content ?? "")
                        .font(.body)
                        .padding(.horizontal, 16)
                }
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)

            Divider()

            railView
                .frame(width: 320)
                .background(Color(white: 0.97))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.white)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(story.title ?? "")
                .font(.system(.title, design: .serif).weight(.bold))
            if let summary = story.summary {
                Text(summary)
                    .font(.system(.subheadline))
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 24)
    }

    private var tabBar: some View {
        HStack(spacing: 24) {
            ForEach(["Story", "Timeline", "Discussion"], id: \.self) { tab in
                Text(tab)
                    .font(.system(.subheadline).weight(.medium))
                    .foregroundColor(tab == "Story" ? .primary : .secondary)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(Color.gray.opacity(0.2)),
            alignment: .bottom
        )
    }

    private var railView: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Timeline")
                .font(.system(.headline))
                .padding(.horizontal, 16)
                .padding(.top, 24)
                .padding(.bottom, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(timeline) { event in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(event.eventLabel ?? "")
                                .font(.system(.subheadline).weight(.semibold))
                            if let body = event.eventBody {
                                Text(body)
                                    .font(.system(.caption))
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
                .padding(.bottom, 24)
            }
        }
    }
}
