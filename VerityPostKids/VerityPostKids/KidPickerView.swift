import SwiftUI

// Shown when an adult has signed in but hasn't picked which kid this
// device is for. If they only have one kid, KidsAuth auto-selects and
// this view never renders.

struct KidPickerView: View {
    @EnvironmentObject private var auth: KidsAuth

    var body: some View {
        ZStack {
            K.bg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    Spacer(minLength: 60)

                    VStack(spacing: 6) {
                        Text("Who's reading?")
                            .font(.system(size: 28, weight: .black, design: .rounded))
                            .foregroundStyle(K.text)

                        Text("Pick which kid this device is for.")
                            .font(.system(size: 14, weight: .medium, design: .rounded))
                            .foregroundStyle(K.dim)
                    }

                    if auth.isBusy && auth.availableKids.isEmpty {
                        ProgressView().padding(.top, 40)
                    } else if auth.availableKids.isEmpty {
                        emptyState
                    } else {
                        VStack(spacing: 12) {
                            ForEach(auth.availableKids) { kid in
                                Button { auth.selectKid(kid) } label: { row(kid) }
                                    .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 24)
                    }

                    Button {
                        Task { await auth.signOut() }
                    } label: {
                        Text("Sign out")
                            .font(.system(size: 14, weight: .semibold, design: .rounded))
                            .foregroundStyle(K.dim)
                    }
                    .padding(.top, 16)
                    .buttonStyle(.plain)

                    Spacer(minLength: 40)
                }
            }
        }
    }

    private func row(_ kid: KidProfile) -> some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(Color(hex: kid.avatarColor ?? "2DD4BF"))
                    .frame(width: 48, height: 48)
                Text(String((kid.displayName ?? "?").prefix(1)).uppercased())
                    .font(.system(size: 20, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(kid.safeName)
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(K.text)

                if let ar = kid.ageRange, !ar.isEmpty {
                    Text("Age \(ar)")
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundStyle(K.dim)
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(K.dim)
        }
        .padding(16)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(K.border, lineWidth: 1)
        )
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.2.slash.fill")
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(K.dim)

            Text("No kid profiles found")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundStyle(K.text)

            Text("Create a kid profile in the Verity Post adult app or on veritypost.com first.")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(K.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .padding(.vertical, 40)
    }
}

#Preview {
    KidPickerView()
        .environmentObject(KidsAuth())
}
