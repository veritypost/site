import SwiftUI

// Shown after a returning parent signs in (OTP) and the server reports they
// already have ≥1 active kid. Tap a row → mint that kid's JWT via
// /api/kids/parent/adopt-existing → KidsAuth.adoptPair flips into the kid
// main flow. The "Add another reader" button drops into the existing
// CreateKidInKidsAppView; back arrow signs the parent out.
//
// Per-PIN-unlock note: the existing model has no kid-PIN-to-start-a-session
// concept (kid_profiles.pin_hash is for parent-mode elevation only). The
// parent's just-completed OTP is the gate. Picker therefore goes straight
// from row-tap to adopt-existing, mirroring pair-direct's posture.

struct ParentKidPickerView: View {
    @EnvironmentObject private var auth: KidsAuth

    let kids: [ExistingKid]

    @State private var isBusy: Bool = false
    @State private var errorMessage: String? = nil
    @State private var showCreate: Bool = false
    @State private var pendingKidId: String? = nil

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                ScrollView {
                    VStack(spacing: 12) {
                        header
                        ForEach(kids) { kid in
                            KidRow(
                                kid: kid,
                                isBusy: pendingKidId == kid.id,
                                disabled: isBusy
                            ) {
                                Task { await adopt(kid) }
                            }
                        }
                        addReaderButton
                            .padding(.top, 8)
                        if let err = errorMessage {
                            Text(err)
                                .font(.system(.footnote, design: .rounded, weight: .semibold))
                                .foregroundStyle(K.coralDark)
                                .multilineTextAlignment(.center)
                                .padding(.top, 8)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 40)
                }
            }
        }
        .fullScreenCover(isPresented: $showCreate) {
            CreateKidInKidsAppView()
                .environmentObject(auth)
        }
    }

    private var topBar: some View {
        HStack {
            Button {
                Task { await auth.clearParentSession() }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                    Text("Sign out")
                }
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                .foregroundStyle(K.dim)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    private var header: some View {
        VStack(spacing: 6) {
            Text("Who\u{2019}s reading?")
                .font(.system(.title, design: .rounded, weight: .black))
                .foregroundStyle(K.text)
            Text("Pick your reader to keep their streak going.")
                .font(.system(.subheadline, design: .rounded, weight: .medium))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
        }
        .padding(.bottom, 8)
    }

    private var addReaderButton: some View {
        Button {
            showCreate = true
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "plus.circle.fill")
                    .font(.system(.title3, weight: .bold))
                Text("Add another reader")
                    .font(.system(.body, design: .rounded, weight: .semibold))
            }
            .foregroundStyle(K.tealDark)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(K.card)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(K.tealDark.opacity(0.3), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
        .opacity(isBusy ? 0.5 : 1.0)
    }

    private func adopt(_ kid: ExistingKid) async {
        guard !isBusy else { return }
        guard let parentToken = auth.parentSession?.accessToken else {
            errorMessage = "Parent session expired. Sign in again."
            return
        }
        if kid.paused_at != nil {
            errorMessage = "\(kid.display_name) is paused. Unpause from the parent web app first."
            return
        }
        isBusy = true
        pendingKidId = kid.id
        errorMessage = nil
        defer {
            isBusy = false
            pendingKidId = nil
        }
        do {
            let success = try await PairingClient.shared.adoptExistingKid(
                parentToken: parentToken,
                kidProfileId: kid.id
            )
            auth.adoptPair(success)
            await auth.clearParentSession()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "Couldn\u{2019}t open this reader. Try again."
        }
    }
}

private struct KidRow: View {
    let kid: ExistingKid
    let isBusy: Bool
    let disabled: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                avatar
                VStack(alignment: .leading, spacing: 2) {
                    Text(kid.display_name.isEmpty ? "Reader" : kid.display_name)
                        .font(.system(.title3, design: .rounded, weight: .heavy))
                        .foregroundStyle(K.text)
                    if let sub = subtitle {
                        Text(sub)
                            .font(.system(.caption, design: .rounded, weight: .medium))
                            .foregroundStyle(K.dim)
                    }
                }
                Spacer()
                if isBusy {
                    ProgressView().controlSize(.regular)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(.body, weight: .heavy))
                        .foregroundStyle(K.dim)
                }
            }
            .padding(14)
            .background(K.card)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(K.tealDark.opacity(kid.paused_at != nil ? 0.0 : 0.15), lineWidth: 1)
            )
            .opacity(kid.paused_at != nil ? 0.55 : 1.0)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }

    private var avatar: some View {
        ZStack {
            Circle().fill(avatarBackground)
            Text(initial)
                .font(.system(.title2, design: .rounded, weight: .heavy))
                .foregroundStyle(.white)
        }
        .frame(width: 48, height: 48)
    }

    private var avatarBackground: Color {
        if let hex = kid.avatar_color, !hex.isEmpty {
            return Color(hex: hex)
        }
        return K.tealDark
    }

    private var initial: String {
        let trimmed = kid.display_name.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? "?" : String(trimmed.prefix(1)).uppercased()
    }

    private var subtitle: String? {
        if kid.paused_at != nil { return "Paused" }
        return nil
    }
}
