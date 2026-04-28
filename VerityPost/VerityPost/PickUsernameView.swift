import SwiftUI

/// S9-Q2-iOS — post-magic-link username picker. Presented after
/// `setSession()` lands a session whose `users.username IS NULL`.
/// Mirrors the web `/signup/pick-username` flow:
///   - 250ms-debounced /api/auth/check-username on every keystroke,
///     surfacing "available" / "taken" inline below the field.
///   - On submit, PATCH /api/auth/save-username; on 409 (UNIQUE race)
///     show "Taken — try another"; on 200 reload the user row so
///     ContentView swaps to MainTabView automatically.
///
/// Username constraints mirror the server's regex:
///   - 3-20 characters
///   - lowercase letters, digits, underscore
///   - normalised on input (precomposedString + lowercase + ASCII filter)
struct PickUsernameView: View {
    @EnvironmentObject var auth: AuthViewModel
    @State private var username: String = ""
    @State private var checkState: CheckState = .idle
    @State private var submitting: Bool = false
    @State private var submitError: String?
    @State private var debounceTask: Task<Void, Never>?

    private enum CheckState: Equatable {
        case idle
        case checking
        case available
        case taken
        case reserved
        case tooShort
        case malformed
        case networkError
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                Text("Verity Post")
                    .font(.system(.largeTitle, design: .default, weight: .bold))
                    .tracking(-1)
                    .foregroundColor(VP.text)
                    .padding(.top, 56)
                    .padding(.bottom, 8)

                Text("Pick a username")
                    .font(.subheadline)
                    .foregroundColor(VP.dim)
                    .padding(.bottom, 28)

                Text("This is how other readers will see you. You can change it once.")
                    .font(.footnote)
                    .foregroundColor(VP.dim)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.bottom, 18)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Username")
                        .font(.footnote)
                        .foregroundColor(VP.dim)
                    TextField("yourname", text: $username)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .foregroundColor(VP.text)
                        .padding(12)
                        .frame(minHeight: 44)
                        .background(VP.card)
                        .cornerRadius(10)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(borderColor, lineWidth: 1.5)
                        )
                        .accessibilityLabel("Username")
                        .onChange(of: username) { _, newValue in
                            scheduleCheck(for: newValue)
                        }

                    if let label = statusLabel {
                        Text(label)
                            .font(.caption)
                            .foregroundColor(statusColor)
                    }
                }
                .padding(.bottom, 18)

                if let err = submitError {
                    Text(err)
                        .font(.system(.footnote, design: .default, weight: .medium))
                        .foregroundColor(VP.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 14)
                }

                Button(action: submit) {
                    Group {
                        if submitting {
                            ProgressView().tint(.white)
                        } else {
                            Text("Continue")
                                .font(.system(.subheadline, design: .default, weight: .semibold))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 48)
                    .background(canSubmit ? VP.text : VP.muted)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(!canSubmit)
                .padding(.bottom, 28)
            }
            .padding(.horizontal, 24)
        }
        .background(VP.bg.ignoresSafeArea())
        .preferredColorScheme(.light)
    }

    private var statusLabel: String? {
        switch checkState {
        case .idle: return nil
        case .checking: return "Checking…"
        case .available: return "Available"
        case .taken: return "Taken — try another"
        case .reserved: return "That username is reserved"
        case .tooShort: return "At least 3 characters (a-z, 0-9, underscore)"
        case .malformed: return "Use a-z, 0-9, underscore only"
        case .networkError: return "Couldn\u{2019}t check. Try again."
        }
    }

    private var statusColor: Color {
        switch checkState {
        case .available: return VP.success
        case .taken, .reserved, .malformed, .networkError: return VP.danger
        case .tooShort: return VP.dim
        case .checking, .idle: return VP.dim
        }
    }

    private var borderColor: Color {
        switch checkState {
        case .available: return VP.success
        case .taken, .reserved, .malformed: return VP.danger
        default: return VP.border
        }
    }

    private var canSubmit: Bool {
        !submitting && checkState == .available
    }

    private func normalize(_ raw: String) -> String {
        return raw
            .precomposedStringWithCanonicalMapping
            .lowercased()
            .trimmingCharacters(in: .whitespaces)
            .filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_") }
    }

    private func scheduleCheck(for raw: String) {
        debounceTask?.cancel()
        let normalized = normalize(raw)
        // Reflect the normalised value into the field so the user sees
        // exactly what we'll submit.
        if normalized != username {
            username = normalized
            return // state will refire onChange with the canonical form
        }
        if normalized.isEmpty {
            checkState = .idle
            return
        }
        if normalized.count < 3 {
            checkState = .tooShort
            return
        }
        if normalized.count > 20 {
            checkState = .malformed
            return
        }
        checkState = .checking
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            if Task.isCancelled { return }
            await runCheck(for: normalized)
        }
    }

    private func runCheck(for normalized: String) async {
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/auth/check-username")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        struct Body: Encodable { let username: String }
        struct Resp: Decodable { let available: Bool?; let reserved: Bool? }
        req.httpBody = try? JSONEncoder().encode(Body(username: normalized))
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard !Task.isCancelled else { return }
            // Don't overwrite a newer state — if the user kept typing,
            // the field value diverged from `normalized`.
            guard normalized == username else { return }
            guard let http = response as? HTTPURLResponse else {
                checkState = .networkError
                return
            }
            if http.statusCode == 429 {
                checkState = .networkError
                return
            }
            if !(200...299).contains(http.statusCode) {
                checkState = .networkError
                return
            }
            let parsed = (try? JSONDecoder().decode(Resp.self, from: data)) ?? Resp(available: nil, reserved: nil)
            if parsed.reserved == true {
                checkState = .reserved
            } else if parsed.available == false {
                checkState = .taken
            } else if parsed.available == true {
                checkState = .available
            } else {
                checkState = .networkError
            }
        } catch {
            if Task.isCancelled { return }
            checkState = .networkError
        }
    }

    private func submit() {
        guard canSubmit else { return }
        submitting = true
        submitError = nil
        Task {
            await save()
            submitting = false
        }
    }

    private func save() async {
        guard let session = try? await SupabaseManager.shared.client.auth.session else {
            submitError = "Your session expired. Tap your magic link again."
            return
        }
        let url = SupabaseManager.shared.siteURL.appendingPathComponent("api/auth/save-username")
        var req = URLRequest(url: url)
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        struct Body: Encodable { let username: String }
        req.httpBody = try? JSONEncoder().encode(Body(username: username))
        do {
            let (_, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse else {
                submitError = "Network error. Try again."
                return
            }
            switch http.statusCode {
            case 200...299:
                // Reload the user row so ContentView's
                // `auth.currentUser?.username` flips and we re-render
                // into MainTabView.
                let uid = session.user.id.uuidString
                await auth.loadUser(id: uid)
                return
            case 409:
                checkState = .taken
                submitError = "That username was just taken. Pick another."
            case 429:
                submitError = "Too many attempts. Wait a minute."
            default:
                submitError = "Couldn\u{2019}t save. Try again."
            }
        } catch {
            submitError = "Network error. Try again."
        }
    }
}
