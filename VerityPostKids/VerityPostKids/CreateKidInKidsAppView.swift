// Kid profile creation from within the kids app — parent auth path.

import SwiftUI
import os.log

private let log = Logger(subsystem: "com.veritypost.kids", category: "CreateKid")

// COPPA consent text — duplicate of web/src/lib/coppaConsent.js. Update
// both sides together when rewording. Version string below must match.
private let coppaConsentText = """
I am the parent or legal guardian of the child whose profile I am creating. \
I understand that Verity Post will collect and process personal information \
about this child in accordance with the Children's Online Privacy Protection \
Act (COPPA). I consent to the collection of their reading history, quiz \
responses, and streak activity as described in the Privacy Policy, and I \
understand I can review, delete, or revoke access to this data at any time \
from my account settings.
"""
private let coppaConsentVersion = "2026-04-15-v1"

// Allowed DOB range. iOS-side hint to the picker; the server is the
// final authority and rejects outside [3, 13).
private let kidsMinAgeYears = 3
private let kidsMaxAgeYears = 13

struct CreateKidInKidsAppView: View {
    @EnvironmentObject private var auth: KidsAuth

    @State private var kidName: String = ""
    @State private var dateOfBirth: Date? = nil   // Optional — no default; user must tap to set
    @State private var parentName: String = ""
    @State private var consentAccepted: Bool = false
    @State private var isBusy: Bool = false
    @State private var errorMessage: String? = nil

    // After pairDirect succeeds we hold the result locally and show the
    // PIN-setup full-screen cover. Only once the PIN is saved do we
    // promote the pair into KidsAuth (which flips the app into the
    // kid main flow) and sign the parent's GoTrue session out.
    @State private var pendingPair: PairSuccess? = nil
    @State private var showPinSetup: Bool = false

    @FocusState private var nameFocused: Bool

    private var trimmedName: String { kidName.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedKidName: String { trimmedName }
    private var trimmedParentName: String {
        parentName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Unicode-aware: parent name must contain at least one letter and be
    /// at least 1 char trimmed. Server still enforces its own >= 2 rule;
    /// this is the client's defense-in-depth check (see startReading()).
    private var parentNameValid: Bool {
        let trimmed = trimmedParentName
        guard !trimmed.isEmpty else { return false }
        guard let regex = try? NSRegularExpression(pattern: "\\p{L}") else { return false }
        let range = NSRange(trimmed.startIndex..., in: trimmed)
        return regex.firstMatch(in: trimmed, options: [], range: range) != nil
    }

    private var canSubmit: Bool {
        !trimmedKidName.isEmpty
            && trimmedKidName.count <= 30
            && !isBusy
            && dateOfBirth != nil
            && parentNameValid
            && consentAccepted
    }

    /// Native bounds for the DOB picker — anchors on the calendar today
    /// so the user can't pick an out-of-range date.
    private var dobPickerRange: ClosedRange<Date> {
        let cal = Calendar(identifier: .gregorian)
        let today = Date()
        let oldest = cal.date(byAdding: .year, value: -kidsMaxAgeYears, to: today) ?? today
        let youngest = cal.date(byAdding: .year, value: -kidsMinAgeYears, to: today) ?? today
        return oldest...youngest
    }

    private static let dobFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")!
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    // Signed-in-as caption + sign-out link
                    HStack(spacing: 4) {
                        Text("Signed in as \(auth.parentSession?.email ?? "")")
                            .font(.system(.caption, design: .rounded, weight: .medium))
                            .foregroundStyle(K.dim)
                            .lineLimit(1)
                            .truncationMode(.middle)

                        Button {
                            // Owner-locked spec: signing out from the kid-create
                            // screen must wipe the parent's GoTrue session too,
                            // otherwise the kid's device keeps the parent token
                            // in keychain. clearParentSession is now async and
                            // includes signOutParentGoTrue.
                            Task { await auth.clearParentSession() }
                        } label: {
                            Text("Sign out")
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(K.tealDark)
                                .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.bottom, 32)

                    // Main content
                    VStack(spacing: 28) {
                        VStack(spacing: 10) {
                            Text("Name your young reader")
                                .font(.system(.title, design: .rounded, weight: .black))
                                .foregroundStyle(K.text)
                                .multilineTextAlignment(.center)

                            Text("You can change this any time in your parent account.")
                                .font(.system(.subheadline, design: .rounded, weight: .medium))
                                .foregroundStyle(K.dim)
                                .multilineTextAlignment(.center)
                        }

                        VStack(spacing: 12) {
                            nameField
                        }

                        dobSection

                        parentNameSection

                        consentSection

                        if let err = errorMessage {
                            Text(err)
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(K.coralDark)
                                .multilineTextAlignment(.center)
                        }

                        Button { startReading() } label: {
                            HStack(spacing: 8) {
                                if isBusy {
                                    ProgressView().tint(.white)
                                }
                                Text(isBusy ? "Setting up\u{2026}" : "Start Reading \u{2192}")
                                    .font(.system(.body, design: .rounded, weight: .bold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(
                                LinearGradient(
                                    colors: [K.coral, K.teal],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
                        }
                        .buttonStyle(.plain)
                        .disabled(!canSubmit)
                        .opacity(canSubmit ? 1.0 : 0.6)
                    }
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 48)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollBounceBehavior(.basedOnSize)
        }
        .onAppear { nameFocused = true }
        .fullScreenCover(isPresented: $showPinSetup) {
            if let parentToken = auth.parentSession?.accessToken,
               let pair = pendingPair {
                ParentPinSetupView(
                    parentAccessToken: parentToken,
                    onComplete: {
                        // PIN saved server-side. Now promote the pair into
                        // KidsAuth so the app flips into the kid main flow,
                        // then sign the parent's GoTrue session out.
                        auth.adoptPair(pair)
                        await auth.clearParentSession()
                        pendingPair = nil
                        showPinSetup = false
                    }
                )
            } else {
                Text("Couldn\u{2019}t open PIN setup. Try again.")
                    .padding()
            }
        }
    }

    // MARK: Name field

    private var nameField: some View {
        TextField("e.g. Alex", text: Binding(
            get: { kidName },
            set: { newValue in
                // Enforce 30-char max while typing
                kidName = String(newValue.prefix(30))
            }
        ))
        .textInputAutocapitalization(.words)
        .disableAutocorrection(false)
        .focused($nameFocused)
        .font(.scaledSystem(size: 20, weight: .semibold, design: .rounded))
        .foregroundStyle(K.text)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, minHeight: 60)
        .padding(.horizontal, 16)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(nameFocused ? K.tealDark : K.border, lineWidth: nameFocused ? 2 : 1)
        )
        .onSubmit {
            if canSubmit { startReading() }
        }
    }

    // MARK: DOB section

    private var dobSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("When was your reader born?")
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(K.text)

            if let dob = dateOfBirth {
                DatePicker(
                    "",
                    selection: Binding(
                        get: { dob },
                        set: { dateOfBirth = $0 }
                    ),
                    in: dobPickerRange,
                    displayedComponents: .date
                )
                .datePickerStyle(.compact)
                .labelsHidden()
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Button {
                    // Seed at the youngest allowed (today - 3y) so the
                    // first tap doesn't auto-land on today and trip the
                    // future-DOB validator.
                    dateOfBirth = dobPickerRange.upperBound
                } label: {
                    Text("Tap to set date of birth")
                        .font(.system(.body, design: .rounded, weight: .semibold))
                        .foregroundStyle(K.tealDark)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .padding(.horizontal, 16)
                        .background(K.card)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .strokeBorder(K.border, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }

            Text("Verity Post is for readers ages 3-13.")
                .font(.system(.caption, design: .rounded, weight: .medium))
                .foregroundStyle(K.dim)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Parent name section

    private var parentNameSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Parent or guardian name")
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(K.text)

            TextField("Full name", text: $parentName)
                .textInputAutocapitalization(.words)
                .disableAutocorrection(false)
                .font(.scaledSystem(size: 17, weight: .regular, design: .rounded))
                .foregroundStyle(K.text)
                .frame(maxWidth: .infinity, minHeight: 48)
                .padding(.horizontal, 16)
                .background(K.card)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(K.border, lineWidth: 1)
                )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Consent section

    private var consentSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Parental consent")
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(K.text)

            ScrollView {
                Text(coppaConsentText)
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(K.text)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
            }
            .frame(maxHeight: 140)
            .background(K.card)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(K.border, lineWidth: 1)
            )

            Text("Consent version \(coppaConsentVersion)")
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(K.dim)

            Toggle(isOn: $consentAccepted) {
                Text("I am the parent or legal guardian and I consent.")
                    .font(.system(.footnote, design: .rounded, weight: .semibold))
                    .foregroundStyle(K.text)
            }
            .tint(K.tealDark)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Actions

    private func startReading() {
        guard !isBusy else { return }

        // Defense in depth — pasted/IME content can land in fields after
        // the canSubmit gate fires. Re-validate every input before any
        // network call.
        let name = trimmedKidName
        guard name.count >= 1 && name.count <= 30 else {
            errorMessage = "Name must be 1\u{2013}30 characters."
            return
        }

        guard let dob = dateOfBirth else {
            errorMessage = "Please set the date of birth."
            return
        }

        guard parentNameValid else {
            errorMessage = "Enter the parent or guardian's name."
            return
        }

        guard consentAccepted else {
            errorMessage = "Please confirm parental consent."
            return
        }

        guard let parentSession = auth.parentSession else {
            errorMessage = "Session expired. Please go back and sign in again."
            return
        }

        nameFocused = false
        errorMessage = nil

        let dobString = Self.dobFormatter.string(from: dob)
        let parentNameTrimmed = trimmedParentName

        Task {
            isBusy = true
            defer { isBusy = false }
            do {
                let success = try await PairingClient.shared.pairDirect(
                    parentToken: parentSession.accessToken,
                    kidName: name,
                    dateOfBirth: dobString,
                    parentName: parentNameTrimmed
                )
                // Stash the pair result; defer adoptPair until the parent
                // PIN is set. Promoting `auth.kid` early would flip
                // KidsAppRoot into tabbedApp mid-flow and dismount this
                // view before PIN setup could appear.
                pendingPair = success
                showPinSetup = true
            } catch PairError.unauthorized {
                errorMessage = "Session expired. Please go back and sign in again."
                await auth.clearParentSession()
            } catch PairError.rateLimited {
                errorMessage = "Too many attempts. Wait a minute and try again."
            } catch PairError.emailUnverified {
                errorMessage = "Verify your email before adding a reader. Check your inbox."
            } catch let PairError.kidCapReached(maxKids) {
                errorMessage = "You've reached the limit of \(maxKids) readers on your plan."
            } catch PairError.seatRequired {
                errorMessage = "Adding this reader requires upgrading your plan. Open the parent web app to add a seat."
            } catch PairError.seatCheckUnavailable {
                errorMessage = "Couldn't check your plan. Try again in a moment."
            } catch let PairError.validation(msg) {
                errorMessage = msg
            } catch let PairError.consentVersionStale(currentVersion) {
                errorMessage = "Verity Post Kids needs an update. Please update from the App Store. (App: \(coppaConsentVersion), Required: \(currentVersion))"
            } catch {
                log.error("[CreateKidInKidsAppView] pairDirect failed: \(error.localizedDescription, privacy: .private)")
                errorMessage = "Something went wrong. Try again."
            }
        }
    }
}


#Preview {
    CreateKidInKidsAppView()
        .environmentObject({
            let a = KidsAuth()
            a.adoptParentSession(email: "parent@example.com", accessToken: "preview-token")
            return a
        }())
}
