import Foundation
@testable import VerityPost

/// Deterministic fixtures for snapshot tests. Every field is frozen — no
/// timestamps that drift, no random IDs, no hash-of-username avatar
/// colors. Update these only when a snapshot legitimately needs to change,
/// then regenerate baselines in record mode.
enum MockFixtures {
    /// Frozen reference "now": 2025-01-01 00:00:00 UTC.
    /// Use offsets from this when a fixture needs a relative date.
    static let frozenNow = Date(timeIntervalSince1970: 1735689600)

    /// Story types in `Models.swift` are `internal` with memberwise inits;
    /// `@testable import VerityPost` exposes those inits to the test target.
    /// Real-world bodies on Verity Post run 800–1800 words; we keep this
    /// fixture long enough that the rail layout has something to scroll
    /// against, but short enough that diffs are readable.
    static let mockStory: Story = {
        var s = Story(id: "11111111-1111-1111-1111-111111111111")
        s.storyId = "22222222-2222-2222-2222-222222222222"
        s.title = "Senate Confirms Surgeon General After Two-Week Floor Standoff"
        s.summary = """
        After a procedural delay that stretched twelve calendar days, the \
        Senate confirmed the nominee 58-42 along largely party lines.
        """
        s.content = """
        WASHINGTON — The Senate on Tuesday confirmed the nominee to serve as \
        Surgeon General by a vote of 58-42, ending a two-week procedural \
        standoff that had drawn rebukes from public-health groups and the \
        White House.

        The confirmation followed a cloture motion that succeeded 60-40 on \
        Monday evening, clearing the final procedural hurdle. Three senators \
        from the minority party crossed lines to support cloture, citing \
        what one called "the cost of an empty desk at HHS during a measles \
        resurgence."

        The new Surgeon General has pledged to release an updated advisory \
        on adolescent social-media use within the first 90 days, and to \
        revisit the office's 2023 firearms-violence framework. Both items \
        had been paused under the previous acting officer.

        In a brief floor statement after the vote, the majority leader \
        called the delay "needless" and said the chamber would return to \
        the supplemental appropriations bill on Wednesday morning.

        The minority leader defended the procedural objections, saying his \
        caucus had used "every available tool" to demand additional \
        documents related to the nominee's prior advisory work for a \
        pharmaceutical trade group between 2019 and 2022.

        The Surgeon General will be sworn in Thursday at HHS headquarters.
        """
        s.imageUrl = "https://example.invalid/cover.jpg"
        s.categoryId = "cat-politics"
        s.status = "published"
        s.isBreaking = false
        s.isDeveloping = false
        s.publishedAt = frozenNow
        s.createdAt = frozenNow.addingTimeInterval(-3600)
        s.heroPickForDate = "2025-01-01"
        s.adEligible = true
        s.sensitivityTags = []
        return s
    }()

    /// Frozen reader. UUID + username are stable; avatarColor is set so we
    /// don't pick up the hash-based default that would shift on every run.
    static let mockUser: VPUser = {
        var u = VPUser(id: "33333333-3333-3333-3333-333333333333")
        u.username = "reader_one"
        u.email = "reader_one@example.invalid"
        u.displayName = "Sample Reader"
        u.avatarColor = "#3B5AA8"
        u.emailVerified = true
        u.verityScore = 612
        u.createdAt = frozenNow.addingTimeInterval(-86400 * 90)
        u.showActivity = true
        u.profileVisibility = "public"
        return u
    }()

    /// 5 timeline events in chronological order — frozen dates relative to
    /// `frozenNow`. Covers the typical "Senate confirmation" arc:
    /// nomination → committee → cloture → floor vote → swearing-in.
    static let mockTimeline: [TimelineEvent] = {
        let day: TimeInterval = 86400
        return [
            event(
                id: "tl-1",
                eventDate: frozenNow.addingTimeInterval(-day * 45),
                label: "Nomination announced",
                body: "President names the nominee in a Rose Garden statement."
            ),
            event(
                id: "tl-2",
                eventDate: frozenNow.addingTimeInterval(-day * 30),
                label: "Committee hearing",
                body: "HELP Committee holds a four-hour confirmation hearing."
            ),
            event(
                id: "tl-3",
                eventDate: frozenNow.addingTimeInterval(-day * 14),
                label: "Procedural standoff begins",
                body: "Minority leader objects, citing missing documents."
            ),
            event(
                id: "tl-4",
                eventDate: frozenNow.addingTimeInterval(-day * 1),
                label: "Cloture vote",
                body: "Senate invokes cloture 60-40."
            ),
            event(
                id: "tl-5",
                eventDate: frozenNow,
                label: "Floor vote",
                body: "Senate confirms 58-42."
            ),
        ]
    }()

    private static func event(
        id: String,
        eventDate: Date,
        label: String,
        body: String
    ) -> TimelineEvent {
        var e = TimelineEvent(id: id)
        e.storyId = mockStory.id
        e.type = "milestone"
        e.eventDate = eventDate
        e.eventLabel = label
        e.eventBody = body
        e.sortOrder = 0
        return e
    }
}
