import Foundation

// Port of web/src/app/profile/_lib/states.ts — same derivation logic,
// same severity ordering. Only the 5 states the iOS chrome banner shows
// are modelled here; the web has additional states (expert_pending,
// comped, trial-ending, etc.) that are not yet wired on iOS.

enum AccountState {
    case ok
    case banned(reason: String?)
    case verifyLocked
    case unverifiedEmail(email: String?)
    case deletionScheduled(scheduledFor: String?)
    case planGrace(endsAt: String?, provider: String?)
    case muted(until: String?)
}

// MARK: - Severity sort order (highest severity first, mirrors web SEVERITY array)

private let severityOrder: [String] = [
    "banned",
    "deletion_scheduled",
    "verify_locked",
    "unverified_email",
    "plan_grace",
    "muted",
    "ok",
]

private func severityIndex(_ state: AccountState) -> Int {
    let key: String
    switch state {
    case .banned:             key = "banned"
    case .verifyLocked:       key = "verify_locked"
    case .unverifiedEmail:    key = "unverified_email"
    case .deletionScheduled:  key = "deletion_scheduled"
    case .planGrace:          key = "plan_grace"
    case .muted:              key = "muted"
    case .ok:                 key = "ok"
    }
    return severityOrder.firstIndex(of: key) ?? severityOrder.count
}

// MARK: - Derivation

func deriveAccountStates(user: VPUser) -> [AccountState] {
    var states: [AccountState] = []

    if user.isBanned == true {
        states.append(.banned(reason: user.banReason))
    }
    if user.verifyLockedAt != nil {
        states.append(.verifyLocked)
    }
    if user.emailVerified == false {
        states.append(.unverifiedEmail(email: user.email))
    }
    if let scheduledFor = user.deletionScheduledFor, !scheduledFor.isEmpty {
        states.append(.deletionScheduled(scheduledFor: scheduledFor))
    }
    if let endsAt = user.planGracePeriodEndsAt, isFutureOrNow(endsAt) {
        states.append(.planGrace(endsAt: endsAt, provider: user.planProvider))
    }
    if user.isMuted == true || isFutureOrNow(user.mutedUntil) {
        states.append(.muted(until: user.mutedUntil))
    }

    if states.isEmpty { return [.ok] }
    return states.sorted { severityIndex($0) < severityIndex($1) }
}

// MARK: - Helpers

private func isFutureOrNow(_ iso: String?) -> Bool {
    guard let iso, !iso.isEmpty else { return false }
    let t = ISO8601DateFormatter().date(from: iso)?.timeIntervalSinceNow ?? -1
    return t > 0
}
