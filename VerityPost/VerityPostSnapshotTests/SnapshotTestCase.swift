import XCTest
import SwiftUI
import SnapshotTesting
@testable import VerityPost

/// Locked viewports for the snapshot suite. Each width matches a real
/// device family we ship to. Heights are generous so the SwiftUI view
/// renders its natural content height inside a fixed-width frame; the
/// snapshot library uses the fixed width and the rendered height.
///
/// - 320 = iPhone SE (smallest iPhone we support)
/// - 375 = iPhone 14 / 13 / 12 (current baseline)
/// - 414 = iPhone 14 Plus / Pro Max
/// - 768 = iPad mini portrait + iPad 9.7 portrait
/// - 1024 = iPad 10.9 portrait
/// - 1180 = iPad 10.9 landscape — the rail-rendering threshold
///   (matches `VP.LayoutBreak.rail` in VPLayoutMode.swift)
/// - 1366 = iPad Pro 12.9 landscape (widest iOS canvas)
enum SnapshotViewport: String, CaseIterable {
    case iPhoneSE = "320_iPhoneSE"
    case iPhone = "375_iPhone"
    case iPhonePlus = "414_iPhonePlus"
    case iPadMiniPortrait = "768_iPadMiniPortrait"
    case iPadPortrait = "1024_iPadPortrait"
    case iPadLandscapeRail = "1180_iPadLandscapeRail"
    case iPadProLandscape = "1366_iPadProLandscape"

    var width: CGFloat {
        switch self {
        case .iPhoneSE: return 320
        case .iPhone: return 375
        case .iPhonePlus: return 414
        case .iPadMiniPortrait: return 768
        case .iPadPortrait: return 1024
        case .iPadLandscapeRail: return 1180
        case .iPadProLandscape: return 1366
        }
    }

    /// Generous default heights so the rendered content doesn't get clipped.
    /// The snapshot library lays out the view at the fixed width and uses
    /// the content's natural height up to this cap.
    var height: CGFloat {
        switch self {
        case .iPhoneSE, .iPhone, .iPhonePlus: return 800
        case .iPadMiniPortrait, .iPadPortrait, .iPadLandscapeRail, .iPadProLandscape: return 1024
        }
    }

    /// Convenience: every viewport, in width order.
    static var all: [SnapshotViewport] { Self.allCases }

    /// Subset: only the rail-active viewports (≥1180pt).
    static var railOnly: [SnapshotViewport] {
        [.iPadLandscapeRail, .iPadProLandscape]
    }
}

/// Base class for every snapshot test in the suite.
///
/// Subclass this, do NOT subclass `XCTestCase` directly — the locked
/// `setUp()` here pins timezone / locale / Dynamic Type / color scheme so
/// the rendered PNGs are deterministic across machines. Without this,
/// baselines generated on one Mac will diff on another.
///
/// Record mode:
///   Set `SNAPSHOT_RECORD=YES` in the test target's run-arguments env, OR
///   set `isRecording = true` here for a one-off local run. See README.md.
class SnapshotTestCase: XCTestCase {
    override func setUp() {
        super.setUp()

        // Determinism: freeze timezone + locale so any date / number that
        // renders into the view does not pick up the test machine's locale.
        NSTimeZone.default = TimeZone(identifier: "UTC")!
        // Locale is read by SwiftUI text formatters via the environment;
        // we set it on the view in `assertViewSnapshot` below. Setting it
        // process-wide here is belt-and-braces.
        UserDefaults.standard.set(["en_US_POSIX"], forKey: "AppleLanguages")

        // Honour the env-var record opt-in. SnapshotTesting reads
        // `isRecording` at assertion time, so setting it in setUp is enough.
        if ProcessInfo.processInfo.environment["SNAPSHOT_RECORD"] == "YES" {
            isRecording = true
        }
    }

    /// Snapshot a SwiftUI view at every configured viewport. Each viewport
    /// produces one PNG; on failure the diff names the specific viewport
    /// (e.g. `test_articleReader_tabbed_acrossViewports.1180_iPadLandscapeRail`).
    ///
    /// The view is wrapped in deterministic environment values:
    ///   - light color scheme
    ///   - `.large` Dynamic Type
    ///   - `en_US_POSIX` locale
    func assertViewSnapshot(
        _ view: some View,
        named name: String? = nil,
        viewports: [SnapshotViewport] = SnapshotViewport.all,
        file: StaticString = #file,
        testName: String = #function,
        line: UInt = #line
    ) {
        for viewport in viewports {
            let framed = view
                .environment(\.colorScheme, .light)
                .environment(\.sizeCategory, .large)
                .environment(\.locale, Locale(identifier: "en_US_POSIX"))
                .frame(width: viewport.width)

            let suffix = name.map { "_\($0)" } ?? ""
            assertSnapshot(
                of: framed,
                as: .image(
                    layout: .fixed(width: viewport.width, height: viewport.height)
                ),
                named: viewport.rawValue + suffix,
                file: file,
                testName: testName,
                line: line
            )
        }
    }
}
