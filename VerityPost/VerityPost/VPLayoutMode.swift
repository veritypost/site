import SwiftUI

// Layout-mode plumbing for iPad infrastructure (Outstanding.md items 5 + 6,
// Session 3, locked 2026-05-12). Persists per-user as `@AppStorage("ui.layoutMode")`;
// reads as either an explicit user choice or `auto` (the default).
//
// Effective mode = user-stored mode, unless `auto` — in which case size class +
// width pick: iPad-class viewports render `expanded` (multi-column home,
// sidebar profile), iPhone-class viewports render `compact`. The picker hides
// `expanded` on phone-width (<720pt) so users on iPhone can't pick a mode that
// produces horizontal overflow at 360pt — the stored preference is preserved
// even when hidden (so a user who chose `expanded` on iPad keeps it when they
// reopen iPad after spending time on iPhone).
//
// Width thresholds are point-values that come straight from the locked-decision
// table in Outstanding.md § 188-275. Rail threshold mirrors the web breakpoint
// at globals.css:755-773 (rail in landscape only, ≥1180pt — web's own awkward-
// zone comment at globals.css:613-618 rejects rail rendering below 1180px).

enum VPLayoutMode: String, CaseIterable, Identifiable {
    case auto
    case compact
    case expanded

    var id: String { rawValue }

    var label: String {
        switch self {
        case .auto:     return "Automatic"
        case .compact:  return "Compact"
        case .expanded: return "Expanded"
        }
    }

    var icon: String {
        switch self {
        case .auto:     return "rectangle.on.rectangle"
        case .compact:  return "iphone"
        case .expanded: return "ipad.landscape"
        }
    }
}

extension VP {
    /// `@AppStorage` key for the user's layout-mode preference. Namespaced
    /// under `ui.` to avoid collision with the existing `vp_theme` key.
    static let layoutModeKey = "ui.layoutMode"

    /// Width thresholds (pt). Verified across iPad mini (744 portrait), iPad
    /// 10.9" (820/1180), iPad Pro 11" (834/1194), iPad Pro 12.9" (1024/1366).
    enum LayoutBreak {
        /// Hide `expanded` option in the picker below this width — phone-class
        /// viewports overflow on 3-col / 2-col layouts.
        static let hideExpanded: CGFloat = 720
        /// Profile hero avatar bumps from 64pt to 96pt at or above this width.
        /// Lowered from the locked 768pt to capture iPad mini portrait (744pt,
        /// `.regular` class) — see Outstanding.md Q-NEW5 / owner Q 2026-05-12.
        static let avatarBump: CGFloat = 700
        /// HomeView switches single-col → 2-col `LazyVGrid` at this width
        /// (on `.regular` size class only). Above this, the 680pt reading
        /// column repeats twice; below, it stays single-column centered.
        static let homeGrid: CGFloat = 1100
        /// Article reader rail activates here (`.regular` + landscape only).
        /// Matches web's globals.css:755-773 desktop-rail breakpoint.
        static let rail: CGFloat = 1180
        /// Reading-column cap, used by HomeView hero/cards and StoryDetailView
        /// article body. Single source of truth.
        static let readingColumn: CGFloat = 680
    }
}

/// Returns the effective layout mode given the stored user preference, the
/// current size class, and the container width. Used by every iPad-aware
/// surface so the decision logic lives in one place.
///
/// - On `compact` size class (iPhone, iPad Split-View thirds), the result is
///   always `.compact` regardless of stored preference — `.regular` is the
///   prerequisite for `.expanded` to render correctly.
/// - On `.regular`, an explicit stored preference wins; `auto` reads as
///   `.expanded`.
func vpEffectiveLayoutMode(
    stored: String,
    sizeClass: UserInterfaceSizeClass?,
    width: CGFloat
) -> VPLayoutMode {
    guard sizeClass == .regular else { return .compact }
    let mode = VPLayoutMode(rawValue: stored) ?? .auto
    switch mode {
    case .compact:  return .compact
    case .expanded: return .expanded
    case .auto:     return .expanded
    }
}
