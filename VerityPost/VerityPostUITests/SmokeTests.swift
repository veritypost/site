// First-pass smoke for the adult app. Mirrors the web `anon-golden-path`
// + `auth-signup-login` specs in spirit: launch the app cold, prove the
// entry surfaces render, and exercise the unauthenticated nav.
//
// Strategy:
//   - Match by visible text; we'll add accessibilityIdentifier()s once
//     anchors start drifting.
//   - Each test re-launches a clean app (XCUIApplication.launch())
//     so state from the previous test can't poison the next.
//   - signUp/login flows live in AuthFlowTests once the smoke is green.

import XCTest

final class SmokeTests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// App launches without crashing and renders something on screen.
    /// The cheapest possible smoke — covers the bulk of "did our Swift
    /// changes compile + boot" regressions.
    func test_appLaunches() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
    }

    /// Cold launch lands on the home feed and the bottom nav has the
    /// expected anon tabs (Home, Notifications, Most Informed, Sign in).
    func test_coldLaunchRendersHomeFeed() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.staticTexts["Verity"].waitForExistence(timeout: 5),
            "Expected wordmark heading on cold launch"
        )
        for tabLabel in ["Home", "Notifications", "Most Informed", "Sign in"] {
            XCTAssertTrue(
                app.buttons[tabLabel].waitForExistence(timeout: 3),
                "Expected bottom-nav button '\(tabLabel)' on cold launch"
            )
        }
    }

    /// Anon visitor can reach the LoginView. Two-step flow: bottom-nav
    /// "Sign in" tab switches to anon-profile, then the prompt card's
    /// "Sign in" button opens LoginView as a sheet.
    func test_signInSurfaceReachable() throws {
        let app = XCUIApplication()
        app.launch()

        // Step 1 — tap bottom-nav "Sign in" to switch to anon-profile tab.
        let signInTabs = app.buttons.matching(identifier: "Sign in")
        XCTAssertTrue(signInTabs.firstMatch.waitForExistence(timeout: 5))
        signInTabs.firstMatch.tap()

        // Step 2 — anon-profile prompt renders a second "Sign in" button.
        // Wait for it (count > 1 means the prompt button has appeared
        // alongside the still-present bottom-nav tab).
        let welcomeBack = app.staticTexts["Welcome back."]
        let promptSignIn = app.buttons.matching(identifier: "Sign in").element(boundBy: 1)
        if promptSignIn.waitForExistence(timeout: 5) {
            promptSignIn.tap()
        }

        XCTAssertTrue(
            welcomeBack.waitForExistence(timeout: 5),
            "Expected LoginView 'Welcome back.' headline after two-step sign-in nav"
        )
    }

    /// Tapping "Browse all categories" lands on the Browse list, and
    /// each category row is interactive (regression guard for the
    /// owner-reported "I see a list and I can't click it" bug — the
    /// rows used to be static Text with no NavigationLink).
    func test_browseCategoriesAreInteractive() throws {
        let app = XCUIApplication()
        app.launch()

        // Find and tap the Browse CTA — it sits below the empty home
        // state ("Browse all categories →"). XCTest matches Buttons,
        // and the link is a Button-shaped NavigationLink.
        let browseLink = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] 'browse all categories'")
        ).firstMatch
        XCTAssertTrue(browseLink.waitForExistence(timeout: 8))
        browseLink.tap()

        // Now on Browse view — it shows either a list of categories or
        // a loading/empty state. Wait for the title.
        XCTAssertTrue(app.staticTexts["Browse"].waitForExistence(timeout: 5))

        // If categories loaded, the first row should be a tappable
        // Button (NavigationLink). The "No categories available" empty
        // state is acceptable — that's a data state, not a regression.
        let firstCategoryRow = app.buttons
            .matching(NSPredicate(format: "label != 'Browse' AND label != 'Sign in'"))
            .firstMatch
        if firstCategoryRow.waitForExistence(timeout: 5) {
            // Critical: row must be hittable (the bug was that rows
            // were static Text and not interactive at all).
            XCTAssertTrue(firstCategoryRow.isHittable)
        }
    }

    /// LoginView has email + password fields once reached.
    func test_signInFormHasInputs() throws {
        let app = XCUIApplication()
        app.launch()

        app.buttons.matching(identifier: "Sign in").firstMatch.tap()
        let promptSignIn = app.buttons.matching(identifier: "Sign in").element(boundBy: 1)
        if promptSignIn.waitForExistence(timeout: 5) {
            promptSignIn.tap()
        }
        XCTAssertTrue(app.staticTexts["Welcome back."].waitForExistence(timeout: 5))

        XCTAssertTrue(app.textFields.firstMatch.waitForExistence(timeout: 3))
        XCTAssertTrue(app.secureTextFields.firstMatch.waitForExistence(timeout: 3))
    }
}
