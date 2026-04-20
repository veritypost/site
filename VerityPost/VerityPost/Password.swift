import Foundation

/// Mirror of `site/src/lib/password.js`. Keep the two in lockstep — if you
/// change the server-side rule in `validatePasswordServer`, update the
/// constants + `validate` here too. The iOS app uses the base set only
/// (len + upper + number); the optional special-character rule is reserved
/// for a future admin-settings toggle.

enum PasswordFailure: String {
    case length
    case uppercase
    case number
    case symbol
}

struct PasswordValidation {
    let meetsPolicy: Bool
    let strength: Int
    let failures: [PasswordFailure]
}

enum PasswordPolicy {
    static let minLength = 8
    static let requireUpper = true
    static let requireNumber = true
    static let requireSymbol = false

    static func validate(_ pw: String) -> PasswordValidation {
        var failures: [PasswordFailure] = []
        if pw.count < minLength { failures.append(.length) }
        if requireUpper, pw.range(of: "[A-Z]", options: .regularExpression) == nil {
            failures.append(.uppercase)
        }
        if requireNumber, pw.range(of: "[0-9]", options: .regularExpression) == nil {
            failures.append(.number)
        }
        if requireSymbol, pw.range(of: "[^A-Za-z0-9]", options: .regularExpression) == nil {
            failures.append(.symbol)
        }

        let hits = [
            pw.count >= minLength,
            pw.range(of: "[A-Z]", options: .regularExpression) != nil,
            pw.range(of: "[0-9]", options: .regularExpression) != nil,
            pw.range(of: "[^A-Za-z0-9]", options: .regularExpression) != nil,
        ].filter { $0 }.count

        return PasswordValidation(
            meetsPolicy: failures.isEmpty,
            strength: min(4, hits),
            failures: failures
        )
    }

    static func message(_ failure: PasswordFailure) -> String {
        switch failure {
        case .length:    return "Password must be at least \(minLength) characters"
        case .uppercase: return "Password must include an uppercase letter"
        case .number:    return "Password must include a number"
        case .symbol:    return "Password must include a special character"
        }
    }

    static let hint = "At least 8 characters, one uppercase letter, and one number."
}
