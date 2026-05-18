// Public profile editor — iOS mirror of
// `web/src/app/profile/_sections/PublicProfileSection.tsx`.
//
// Persistence:
//   - users.bio                  (varchar, 280-char limit, free text)
//   - users.profile_visibility   (varchar: 'public' | 'private' | 'hidden')
//   - users.show_activity        (boolean)
//
// All writes go through the `update_own_profile` RPC, same as web. The
// 'hidden' state is owned by the Privacy → Lockdown flow (lockdown_self
// RPC); when present we render a read-only notice and never include
// profile_visibility in the save payload, mirroring web's T331 fix.
//
// Tokens: VP.* only — no hard-coded hex. Section labels follow web's
// mono caps treatment; the preview heading is serif; copy is sans.

import SwiftUI
import Supabase

private let BIO_LIMIT = 280

struct PublicProfileEditor: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    @State private var bio: String = ""
    @State private var visibility: String = "public"  // 'public' | 'private' | 'hidden'
    @State private var hideActivity: Bool = false

    // Baseline snapshot to drive the dirty bit + diff-only save payload.
    @State private var originalBio: String = ""
    @State private var originalVisibility: String = "public"
    @State private var originalHideActivity: Bool = false

    @State private var loaded: Bool = false
    @State private var saving: Bool = false
    @State private var savedBanner: String? = nil
    @State private var errorBanner: String? = nil

    private var isLockedDown: Bool { visibility == "hidden" }

    private var dirty: Bool {
        bio != originalBio
            || visibility != originalVisibility
            || hideActivity != originalHideActivity
    }

    private var displayTitle: String {
        let u = auth.currentUser
        if let dn = u?.displayName?.trimmingCharacters(in: .whitespaces), !dn.isEmpty {
            return dn
        }
        return u?.username ?? "You"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VP.Spacing.s5) {
                previewCard
                editorCard
                if let banner = savedBanner {
                    Text(banner)
                        .font(.system(size: VP.Size.sm))
                        .foregroundColor(VP.right)
                }
                if let err = errorBanner {
                    Text(err)
                        .font(.system(size: VP.Size.sm))
                        .foregroundColor(VP.danger)
                }
            }
            .padding(VP.Spacing.s4)
        }
        .background(VP.surface.ignoresSafeArea())
        .navigationTitle("Public profile")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { hydrate() }
    }

    // MARK: - Preview card ("What others see")

    private var previewCard: some View {
        VStack(alignment: .leading, spacing: VP.Spacing.s3) {
            Text("What others see")
                .font(.system(size: VP.Size.lg, weight: .semibold, design: .serif))
                .foregroundColor(VP.ink)

            VStack(alignment: .leading, spacing: VP.Spacing.s3) {
                HStack(spacing: VP.Spacing.s3) {
                    if let user = auth.currentUser {
                        AvatarView(user: user, size: 56)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(displayTitle)
                            .font(.system(size: VP.Size.lg, weight: .semibold, design: .serif))
                            .foregroundColor(VP.ink)
                            .lineLimit(1)
                        if let uname = auth.currentUser?.username, !uname.isEmpty {
                            Text("@\(uname)")
                                .font(.system(size: VP.Size.sm))
                                .foregroundColor(VP.inkMuted)
                        }
                        if auth.currentUser?.isExpert == true,
                           let title = auth.currentUser?.expertTitle?.trimmingCharacters(in: .whitespaces),
                           !title.isEmpty {
                            Text(title)
                                .font(.system(size: VP.Size.xs))
                                .foregroundColor(VP.inkMuted)
                        }
                    }
                    Spacer(minLength: 0)
                }

                if !bio.trimmingCharacters(in: .whitespaces).isEmpty {
                    Text(bio)
                        .font(.system(size: VP.Size.base))
                        .foregroundColor(VP.inkSoft)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if visibility != "public" {
                    Text(visibility == "hidden" ? "Hidden" : "Private")
                        .font(.system(size: VP.Size.xs, weight: .semibold))
                        .foregroundColor(VP.inkMuted)
                        .padding(.horizontal, VP.Spacing.s3)
                        .padding(.vertical, VP.Spacing.s1)
                        .background(VP.surfaceSunken)
                        .overlay(
                            RoundedRectangle(cornerRadius: VP.Radius.pill, style: .continuous)
                                .stroke(VP.borderSoft)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: VP.Radius.pill, style: .continuous))
                }
            }
            .padding(VP.Spacing.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(VP.surfaceRaised)
            .overlay(
                RoundedRectangle(cornerRadius: VP.radiusMD, style: .continuous)
                    .stroke(VP.borderSoft, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD, style: .continuous))
            .vpShadowAmbient()
        }
    }

    // MARK: - Editor card

    private var editorCard: some View {
        VStack(alignment: .leading, spacing: VP.Spacing.s4) {
            Text("EDIT WHAT'S VISIBLE")
                .font(.system(size: VP.Size.xs, weight: .semibold))
                .tracking(0.8)
                .foregroundColor(VP.inkFaint)

            // Bio
            VStack(alignment: .leading, spacing: VP.Spacing.s2) {
                Text("Bio")
                    .font(.system(size: VP.Size.sm, weight: .semibold))
                    .foregroundColor(VP.ink)
                Text("280 characters max. Visible to anyone with the link.")
                    .font(.system(size: VP.Size.xs))
                    .foregroundColor(VP.inkMuted)
                TextField("Tell people what you read about, what you've published, who you are.",
                          text: $bio,
                          axis: .vertical)
                    .font(.system(size: VP.Size.base))
                    .foregroundColor(VP.text)
                    .lineLimit(3...8)
                    .padding(.horizontal, VP.Spacing.s3)
                    .padding(.vertical, 11)
                    .background(VP.bg)
                    .overlay(
                        RoundedRectangle(cornerRadius: VP.radiusSM, style: .continuous)
                            .stroke(VP.border, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusSM, style: .continuous))
                    .onChange(of: bio) { _, new in
                        if new.count > BIO_LIMIT {
                            bio = String(new.prefix(BIO_LIMIT))
                        }
                    }
                HStack {
                    Spacer()
                    Text("\(BIO_LIMIT - bio.count)")
                        .font(.system(size: VP.Size.xs, design: .monospaced))
                        .foregroundColor(BIO_LIMIT - bio.count < 12 ? VP.warn : VP.inkFaint)
                }
            }

            // Visibility
            VStack(alignment: .leading, spacing: VP.Spacing.s2) {
                Text("Profile visibility")
                    .font(.system(size: VP.Size.sm, weight: .semibold))
                    .foregroundColor(VP.ink)
                if isLockedDown {
                    // Lockdown-state notice — read-only here, owned by Privacy.
                    Text("Your profile is hidden. Manage in Privacy.")
                        .font(.system(size: VP.Size.sm))
                        .foregroundColor(VP.inkSoft)
                        .padding(VP.Spacing.s3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(VP.surfaceSunken)
                        .overlay(
                            RoundedRectangle(cornerRadius: VP.radiusSM, style: .continuous)
                                .stroke(VP.borderSoft, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: VP.radiusSM, style: .continuous))
                } else {
                    HStack(spacing: VP.Spacing.s2) {
                        visibilityChoice(value: "public",
                                         label: "Public",
                                         sub: "Anyone with the link can view.")
                        visibilityChoice(value: "private",
                                         label: "Private",
                                         sub: "Only you can view it.")
                    }
                }
            }

            // Hide activity toggle
            Toggle(isOn: $hideActivity) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Hide my activity")
                        .font(.system(size: VP.Size.sm, weight: .semibold))
                        .foregroundColor(VP.ink)
                    Text("Don't show my reading log or discussion history on my public profile.")
                        .font(.system(size: VP.Size.xs))
                        .foregroundColor(VP.inkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .tint(VP.brand)
            .padding(VP.Spacing.s3)
            .background(VP.surfaceSunken)
            .overlay(
                RoundedRectangle(cornerRadius: VP.radiusSM, style: .continuous)
                    .stroke(VP.borderSoft, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: VP.radiusSM, style: .continuous))

            // Save
            Button {
                Task { await save() }
            } label: {
                Text(saving ? "Saving…" : "Save")
                    .font(.system(size: VP.Size.base, weight: .semibold))
                    .foregroundColor(VP.brandInk)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(dirty && !saving ? VP.brand : VP.brand.opacity(0.45))
                    .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(!dirty || saving)
        }
        .padding(VP.Spacing.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VP.surfaceRaised)
        .overlay(
            RoundedRectangle(cornerRadius: VP.radiusMD, style: .continuous)
                .stroke(VP.borderSoft, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: VP.radiusMD, style: .continuous))
        .vpShadowAmbient()
    }

    private func visibilityChoice(value: String, label: String, sub: String) -> some View {
        let active = visibility == value
        return Button {
            visibility = value
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(.system(size: VP.Size.sm, weight: .semibold))
                    .foregroundColor(active ? VP.bg : VP.ink)
                Text(sub)
                    .font(.system(size: VP.Size.xs))
                    .foregroundColor(active ? VP.bg.opacity(0.8) : VP.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
            }
            .padding(VP.Spacing.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(active ? VP.ink : VP.bg)
            .overlay(
                RoundedRectangle(cornerRadius: VP.radiusSM, style: .continuous)
                    .stroke(active ? VP.ink : VP.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: VP.radiusSM, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Load / Save

    private func hydrate() {
        guard !loaded else { return }
        let u = auth.currentUser
        bio = u?.bio ?? ""
        let vis = u?.profileVisibility ?? "public"
        visibility = vis
        hideActivity = !(u?.showActivity ?? true)
        originalBio = bio
        originalVisibility = vis
        originalHideActivity = hideActivity
        loaded = true
    }

    private func save() async {
        guard let uid = auth.currentUser?.id, dirty, !saving else { return }
        saving = true
        savedBanner = nil
        errorBanner = nil
        defer { saving = false }

        // update_own_profile uses jsonb `p_fields ? 'key'` — only changed
        // keys are sent so we don't clobber other web-set fields. Mirrors
        // AccountSettingsView's patch pattern. Visibility is omitted when
        // locked-down (T331 web fix) so a stray save can't undo lockdown.
        struct ProfilePatch: Encodable {
            var bio: String? = nil
            var profile_visibility: String? = nil
            var show_activity: Bool? = nil
        }
        struct Args: Encodable { let p_fields: ProfilePatch }

        var patch = ProfilePatch()
        if bio != originalBio { patch.bio = bio }
        if !isLockedDown, visibility != originalVisibility {
            patch.profile_visibility = visibility
        }
        if hideActivity != originalHideActivity {
            patch.show_activity = !hideActivity
        }

        do {
            try await client.rpc("update_own_profile", params: Args(p_fields: patch)).execute()
        } catch {
            Log.d("PublicProfileEditor save error:", error)
            errorBanner = "Couldn't save. Try again."
            return
        }

        await auth.loadUser(id: uid)
        // Re-seed baseline from the freshly-saved values so the dirty bit
        // resets even before loadUser updates currentUser.
        originalBio = bio
        originalVisibility = visibility
        originalHideActivity = hideActivity
        savedBanner = "Saved."
    }
}
