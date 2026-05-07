// Background editor — iOS mirror of web BackgroundCard.
//
// Persistence:
//   - Scalar fields → users.background_* via update_own_profile RPC
//   - Education     → user_education table via set_own_education RPC
//   - Links         → user_links table via set_own_links RPC
//   - Topics        → user_topics_known table via set_own_topics_known RPC
//
// Same vocabulary as the firsthand+context line on individual comments;
// this is the persistent per-user version.

import SwiftUI
import Supabase

private let ONE_LINE_LIMIT = 80
private let PROFESSION_LIMIT = 60
private let YEARS_LIMIT = 24
private let WHERE_LIMIT = 60
private let LIVED_LIMIT = 240
private let LANGUAGES_LIMIT = 80
private let LINK_URL_LIMIT = 200
private let LINK_LABEL_LIMIT = 24
private let LINK_MAX = 4
private let LINK_LABEL_PRESETS = ["LinkedIn", "Personal site", "GitHub", "Research", "Resume"]
private let EDU_SCHOOL_LIMIT = 80
private let EDU_DEGREE_LIMIT = 32
private let EDU_FIELD_LIMIT = 60
private let EDU_YEARS_LIMIT = 16
private let EDU_MAX = 5

private struct EducationEntry: Identifiable, Equatable {
    let id = UUID()
    var school: String = ""
    var degree: String = ""
    var field: String = ""
    var years: String = ""
}

private struct LinkEntry: Identifiable, Equatable {
    let id = UUID()
    var url: String = ""
    var label: String = ""
}

private struct TopicOption: Identifiable, Equatable {
    let id: String
    let name: String
    let parentId: String?
}

private enum SectionKey: String, CaseIterable {
    case profession, years, education, lived, whereLocation, topics, languages, links

    var label: String {
        switch self {
        case .profession: return "What you do"
        case .years: return "Years in the field"
        case .education: return "Education"
        case .lived: return "Lived experience"
        case .whereLocation: return "Where you’re based"
        case .topics: return "Topics you know well"
        case .languages: return "Languages"
        case .links: return "Links"
        }
    }
}

struct SettingsBackgroundView: View {
    @EnvironmentObject var auth: AuthViewModel
    private let client = SupabaseManager.shared.client

    // Scalar fields
    @State private var oneLine: String = ""
    @State private var profession: String = ""
    @State private var years: String = ""
    @State private var lived: String = ""
    @State private var livedPublic: Bool = false
    @State private var whereBased: String = ""
    @State private var languages: String = ""

    // List-shaped
    @State private var education: [EducationEntry] = []
    @State private var links: [LinkEntry] = []
    @State private var topics: Set<String> = []  // category UUIDs
    @State private var topicOptions: [TopicOption] = []

    // Section open state
    @State private var open: Set<SectionKey> = []

    // Save / load state
    @State private var loading: Bool = true
    @State private var loadFailed: Bool = false
    @State private var saving: Bool = false
    @State private var initialSnapshot: String = ""
    @State private var toastMessage: String = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 60)
                } else {
                    if loadFailed {
                        Text("Couldn’t load your saved background. Edits made now may overwrite existing data — pull to refresh, or come back later.")
                            .font(.footnote.italic())
                            .foregroundColor(VP.warn)
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(VP.warn.opacity(0.4)))
                    }
                    introHeader
                    primaryLineField
                    if oneLine.trimmingCharacters(in: .whitespaces).isEmpty == false {
                        previewBlock
                    }
                    optionalSections
                    if let username = auth.currentUser?.username, !username.isEmpty {
                        Divider().padding(.vertical, 6)
                        HStack(spacing: 8) {
                            NavigationLink {
                                PublicProfileView(username: username)
                                    .environmentObject(auth)
                            } label: {
                                Text("View your public profile ↗")
                                    .font(.system(.footnote, weight: .semibold))
                                    .foregroundColor(VP.accent)
                            }
                            .buttonStyle(.plain)
                            Text("preview what readers see")
                                .font(.caption)
                                .foregroundColor(VP.muted)
                        }
                    }
                }
            }
            .padding(20)
        }
        .background(Color(.systemBackground))
        .navigationTitle("Background")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    Task { await save() }
                } label: {
                    if saving {
                        ProgressView().controlSize(.small)
                    } else {
                        Text("Save")
                            .font(.system(.subheadline, weight: .semibold))
                            .foregroundColor(canSave ? VP.accent : VP.dim)
                    }
                }
                .disabled(!canSave)
            }
        }
        .overlay(alignment: .bottom) {
            if !toastMessage.isEmpty {
                Text(toastMessage)
                    .font(.footnote)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(VP.text.opacity(0.92))
                    .foregroundColor(VP.bg)
                    .clipShape(Capsule())
                    .padding(.bottom, 32)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .task { await loadInitial() }
    }

    // MARK: - Sections

    private var introHeader: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Who’s writing?")
                .font(.system(.title3, design: .serif).weight(.semibold))
                .foregroundColor(VP.text)
            Text("A short line saying who you are is the only required bit. Everything else is optional — share whatever fits, skip whatever doesn’t.")
                .font(.footnote)
                .foregroundColor(VP.dim)
        }
    }

    private var primaryLineField: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 0) {
                Text("In one line, who’s writing?")
                    .font(.system(.subheadline, weight: .medium))
                    .foregroundColor(VP.text)
                Text("  optional")
                    .font(.caption.italic())
                    .foregroundColor(VP.muted)
            }
            HStack(alignment: .center, spacing: 10) {
                TextField("e.g. dad of three in Detroit  ·  civil engineer, 30 yrs", text: $oneLine)
                    .font(.system(.body, design: .serif).italic())
                    .textFieldStyle(.plain)
                    .padding(10)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .onChange(of: oneLine) { _, new in
                        if new.count > ONE_LINE_LIMIT {
                            oneLine = String(new.prefix(ONE_LINE_LIMIT))
                        }
                    }
                Text("\(ONE_LINE_LIMIT - oneLine.count)")
                    .font(.system(.caption, design: .serif).italic())
                    .foregroundColor((ONE_LINE_LIMIT - oneLine.count) < 12 ? VP.warn : VP.muted)
                    .monospacedDigit()
                    .frame(minWidth: 22)
            }
            Text("Lived experience or expertise. Not political identity. 80 characters.")
                .font(.caption2)
                .foregroundColor(VP.muted)
            if onelineMissing {
                Text("Add a one-line summary to save the rest.")
                    .font(.caption2.italic())
                    .foregroundColor(VP.warn)
            }
        }
    }

    private var previewBlock: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("PREVIEW")
                .font(.caption2.weight(.semibold))
                .foregroundColor(VP.muted)
                .tracking(0.5)
            Text("— \(oneLine)")
                .font(.system(.body, design: .serif).italic())
                .foregroundColor(VP.dim)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(alignment: .leading) {
            Rectangle().fill(VP.border).frame(width: 2)
        }
    }

    private var optionalSections: some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider()
            Text("Add more (optional)")
                .font(.system(.subheadline, weight: .semibold))
                .foregroundColor(VP.text)
            Text("Pick anything that fits. Skip what doesn’t. Topics powers future “find someone who knows X” search.")
                .font(.caption)
                .foregroundColor(VP.dim)
            chipTray
            ForEach(SectionKey.allCases, id: \.rawValue) { key in
                if open.contains(key) {
                    sectionEditor(for: key)
                        .transition(.opacity)
                }
            }
        }
    }

    private var chipTray: some View {
        FlexibleStack(spacing: 6, lineSpacing: 6) {
            ForEach(SectionKey.allCases, id: \.rawValue) { key in
                let filled = sectionFilled(key)
                let count = sectionCount(key)
                Button {
                    withAnimation(.easeInOut(duration: 0.12)) {
                        if open.contains(key) {
                            open.remove(key)
                        } else {
                            open.insert(key)
                        }
                        return ()
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(filled ? "✓ \(key.label)\(count.map { " · \($0)" } ?? "")" : "+ \(key.label)")
                            .font(.system(.caption, weight: .semibold))
                    }
                    .padding(.horizontal, 11)
                    .padding(.vertical, 6)
                    .background(filled ? VP.text : Color.clear)
                    .foregroundColor(filled ? VP.bg : VP.dim)
                    .overlay(
                        Capsule().strokeBorder(
                            filled ? VP.text : VP.border,
                            style: StrokeStyle(lineWidth: 1, dash: filled ? [] : [4, 3])
                        )
                    )
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func sectionEditor(for key: SectionKey) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 0) {
                Text(key.label)
                    .font(.system(.subheadline, weight: .medium))
                    .foregroundColor(VP.text)
                Text("  optional")
                    .font(.caption.italic())
                    .foregroundColor(VP.muted)
                Spacer()
                Button {
                    withAnimation(.easeInOut(duration: 0.12)) {
                        open.remove(key)
                        return ()
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(VP.muted)
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
            }
            switch key {
            case .profession:
                limitedTextField($profession, placeholder: "e.g. civil engineer, ER nurse, retired teacher", limit: PROFESSION_LIMIT)
                hint("Job, trade, or role.")
            case .years:
                limitedTextField($years, placeholder: "e.g. 30 yrs · since 2008", limit: YEARS_LIMIT)
                hint("Only meaningful if you filled in what you do.")
            case .education:
                educationEditor
            case .lived:
                Toggle(isOn: $livedPublic) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Show this on my public profile")
                            .font(.system(.footnote, weight: .semibold))
                            .foregroundColor(VP.text)
                        Text("Off by default — lived experience can include details that identify you. Flip on if you want others to see it.")
                            .font(.caption2)
                            .foregroundColor(VP.muted)
                    }
                }
                .toggleStyle(.switch)
                .tint(VP.accent)
                limitedTextEditor($lived, placeholder: "e.g. dad of three in Detroit · Vietnam vet, infantry, ‘68–’70", limit: LIVED_LIMIT)
                hint("Something you’ve been through that shapes how you read certain stories.")
            case .whereLocation:
                limitedTextField($whereBased, placeholder: "e.g. rural Maine · Tokyo · suburban Atlanta", limit: WHERE_LIMIT)
                hint("Region or city. As specific as you’re comfortable.")
            case .topics:
                topicsEditor
                hint("Helps people find you when they’re looking for someone with knowledge in an area.")
            case .languages:
                limitedTextField($languages, placeholder: "e.g. English, Spanish, Mandarin", limit: LANGUAGES_LIMIT)
                hint("Languages you read or speak fluently.")
            case .links:
                linksEditor
                hint("LinkedIn, personal site, research page — wherever readers can verify you or learn more.")
            }
        }
        .padding(14)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var educationEditor: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach($education) { $entry in
                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        TextField("School or institution (e.g. University of Michigan)", text: $entry.school)
                            .textFieldStyle(.roundedBorder)
                            .onChange(of: entry.school) { _, n in
                                if n.count > EDU_SCHOOL_LIMIT { entry.school = String(n.prefix(EDU_SCHOOL_LIMIT)) }
                            }
                        Button {
                            education.removeAll { $0.id == entry.id }
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(VP.muted)
                                .frame(width: 28, height: 28)
                                .overlay(RoundedRectangle(cornerRadius: 6).stroke(VP.border))
                        }
                        .buttonStyle(.plain)
                    }
                    HStack(spacing: 8) {
                        TextField("Degree", text: $entry.degree)
                            .textFieldStyle(.roundedBorder)
                            .onChange(of: entry.degree) { _, n in
                                if n.count > EDU_DEGREE_LIMIT { entry.degree = String(n.prefix(EDU_DEGREE_LIMIT)) }
                            }
                        TextField("Field of study", text: $entry.field)
                            .textFieldStyle(.roundedBorder)
                            .onChange(of: entry.field) { _, n in
                                if n.count > EDU_FIELD_LIMIT { entry.field = String(n.prefix(EDU_FIELD_LIMIT)) }
                            }
                        TextField("Years", text: $entry.years)
                            .textFieldStyle(.roundedBorder)
                            .onChange(of: entry.years) { _, n in
                                if n.count > EDU_YEARS_LIMIT { entry.years = String(n.prefix(EDU_YEARS_LIMIT)) }
                            }
                    }
                }
                .padding(10)
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
            }
            if education.count < EDU_MAX {
                Button {
                    education.append(EducationEntry())
                } label: {
                    Text("+ Add \(education.isEmpty ? "education" : "another")")
                        .font(.system(.caption, weight: .semibold))
                        .padding(.horizontal, 11)
                        .padding(.vertical, 6)
                        .overlay(Capsule().strokeBorder(VP.border, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                        .foregroundColor(VP.dim)
                }
                .buttonStyle(.plain)
            } else {
                Text("Up to \(EDU_MAX) entries — remove one to add another.")
                    .font(.caption.italic())
                    .foregroundColor(VP.muted)
            }
        }
    }

    private var topicsEditor: some View {
        let topLevels = topicOptions.filter { $0.parentId == nil }
        let subsByParent = Dictionary(grouping: topicOptions.filter { $0.parentId != nil }) { $0.parentId ?? "" }
        return Group {
            if topLevels.isEmpty {
                Text("No topics available yet.")
                    .font(.caption.italic())
                    .foregroundColor(VP.muted)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(topLevels) { parent in
                        let subs = subsByParent[parent.id] ?? []
                        FlexibleStack(spacing: 6, lineSpacing: 6) {
                            topicChip(parent, isParent: true)
                            if !subs.isEmpty {
                                Text("›")
                                    .font(.caption)
                                    .foregroundColor(VP.muted)
                            }
                            ForEach(subs) { sub in
                                topicChip(sub, isParent: false)
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func topicChip(_ topic: TopicOption, isParent: Bool) -> some View {
        let selected = topics.contains(topic.id)
        Button {
            if selected { topics.remove(topic.id) } else { topics.insert(topic.id) }
        } label: {
            Text(selected ? "✓ \(topic.name)" : topic.name)
                .font(.system(.caption, weight: isParent ? .bold : .medium))
                .padding(.horizontal, 11)
                .padding(.vertical, 5)
                .background(selected ? VP.text : Color.clear)
                .foregroundColor(
                    selected ? VP.bg
                    : (isParent ? VP.text : VP.dim)
                )
                .overlay(Capsule().strokeBorder(selected ? VP.text : VP.border))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var linksEditor: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach($links) { $link in
                HStack(spacing: 8) {
                    TextField("Label (e.g. LinkedIn)", text: $link.label)
                        .textFieldStyle(.roundedBorder)
                        .onChange(of: link.label) { _, n in
                            if n.count > LINK_LABEL_LIMIT { link.label = String(n.prefix(LINK_LABEL_LIMIT)) }
                        }
                        .frame(minWidth: 100)
                    TextField("https://", text: $link.url)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: link.url) { _, n in
                            if n.count > LINK_URL_LIMIT { link.url = String(n.prefix(LINK_URL_LIMIT)) }
                        }
                    Button {
                        links.removeAll { $0.id == link.id }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(VP.muted)
                            .frame(width: 28, height: 28)
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(VP.border))
                    }
                    .buttonStyle(.plain)
                }
            }
            if links.count < LINK_MAX {
                FlexibleStack(spacing: 8, lineSpacing: 6) {
                    Button {
                        links.append(LinkEntry())
                    } label: {
                        Text("+ Add a link")
                            .font(.system(.caption, weight: .semibold))
                            .padding(.horizontal, 11)
                            .padding(.vertical, 6)
                            .overlay(Capsule().strokeBorder(VP.border, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                            .foregroundColor(VP.dim)
                    }
                    .buttonStyle(.plain)
                    Text("or quick-add:")
                        .font(.caption)
                        .foregroundColor(VP.muted)
                    ForEach(LINK_LABEL_PRESETS.filter { preset in
                        !links.contains { $0.label.trimmingCharacters(in: .whitespaces).lowercased() == preset.lowercased() }
                    }, id: \.self) { preset in
                        Button {
                            links.append(LinkEntry(url: "", label: preset))
                        } label: {
                            Text(preset)
                                .font(.system(.caption, weight: .medium))
                                .padding(.horizontal, 9)
                                .padding(.vertical, 4)
                                .overlay(Capsule().strokeBorder(VP.border))
                                .foregroundColor(VP.dim)
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                Text("Up to \(LINK_MAX) links — remove one to add another.")
                    .font(.caption.italic())
                    .foregroundColor(VP.muted)
            }
        }
    }

    // MARK: - Helpers

    private func limitedTextField(_ binding: Binding<String>, placeholder: String, limit: Int) -> some View {
        HStack(alignment: .center, spacing: 10) {
            TextField(placeholder, text: binding)
                .textFieldStyle(.roundedBorder)
                .onChange(of: binding.wrappedValue) { _, new in
                    if new.count > limit { binding.wrappedValue = String(new.prefix(limit)) }
                }
            Text("\(limit - binding.wrappedValue.count)")
                .font(.system(.caption, design: .serif).italic())
                .foregroundColor((limit - binding.wrappedValue.count) < 12 ? VP.warn : VP.muted)
                .monospacedDigit()
                .frame(minWidth: 24)
        }
    }

    private func limitedTextEditor(_ binding: Binding<String>, placeholder: String, limit: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack(alignment: .topLeading) {
                if binding.wrappedValue.isEmpty {
                    Text(placeholder)
                        .font(.body)
                        .foregroundColor(VP.muted)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 8)
                }
                TextEditor(text: binding)
                    .font(.body)
                    .frame(minHeight: 80)
                    .padding(4)
                    .onChange(of: binding.wrappedValue) { _, new in
                        if new.count > limit { binding.wrappedValue = String(new.prefix(limit)) }
                    }
            }
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(VP.border))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            HStack {
                Spacer()
                Text("\(limit - binding.wrappedValue.count)")
                    .font(.system(.caption, design: .serif).italic())
                    .foregroundColor((limit - binding.wrappedValue.count) < 12 ? VP.warn : VP.muted)
                    .monospacedDigit()
            }
        }
    }

    private func hint(_ text: String) -> some View {
        Text(text).font(.caption2).foregroundColor(VP.muted)
    }

    private func sectionFilled(_ key: SectionKey) -> Bool {
        switch key {
        case .profession: return !profession.trimmingCharacters(in: .whitespaces).isEmpty
        case .years: return !years.trimmingCharacters(in: .whitespaces).isEmpty
        case .education: return education.contains { entry in
            !(entry.school + entry.degree + entry.field + entry.years).trimmingCharacters(in: .whitespaces).isEmpty
        }
        case .lived: return !lived.trimmingCharacters(in: .whitespaces).isEmpty
        case .whereLocation: return !whereBased.trimmingCharacters(in: .whitespaces).isEmpty
        case .topics: return !topics.isEmpty
        case .languages: return !languages.trimmingCharacters(in: .whitespaces).isEmpty
        case .links: return links.contains { !$0.url.trimmingCharacters(in: .whitespaces).isEmpty }
        }
    }

    private func sectionCount(_ key: SectionKey) -> Int? {
        switch key {
        case .topics: return topics.count
        case .links: return links.filter { !$0.url.trimmingCharacters(in: .whitespaces).isEmpty }.count
        case .education: return education.filter { entry in
            !(entry.school + entry.degree + entry.field + entry.years).trimmingCharacters(in: .whitespaces).isEmpty
        }.count
        default: return nil
        }
    }

    // MARK: - Persistence

    private var snapshotString: String {
        struct Snap: Encodable {
            let oneLine: String; let profession: String; let years: String; let lived: String
            let livedPublic: Bool
            let whereBased: String; let languages: String
            let topics: [String]
            struct E: Encodable { let school: String; let degree: String; let field: String; let years: String }
            let education: [E]
            struct L: Encodable { let url: String; let label: String }
            let links: [L]
        }
        let s = Snap(
            oneLine: oneLine,
            profession: profession,
            years: years,
            lived: lived,
            livedPublic: livedPublic,
            whereBased: whereBased,
            languages: languages,
            topics: topics.sorted(),
            education: education.map { Snap.E(school: $0.school, degree: $0.degree, field: $0.field, years: $0.years) },
            links: links.map { Snap.L(url: $0.url, label: $0.label) }
        )
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        return (try? String(data: enc.encode(s), encoding: .utf8)) ?? ""
    }

    private var isDirty: Bool { snapshotString != initialSnapshot }

    /// Saving requires the primary "one line" byline whenever any optional
    /// field has content — keeps the public byline coherent. Fully-empty
    /// state is still reachable (clearing everything → dirty → onelineMissing
    /// false → save enabled).
    private var hasOptionalContent: Bool {
        !profession.trimmingCharacters(in: .whitespaces).isEmpty
            || !years.trimmingCharacters(in: .whitespaces).isEmpty
            || !lived.trimmingCharacters(in: .whitespaces).isEmpty
            || !whereBased.trimmingCharacters(in: .whitespaces).isEmpty
            || !languages.trimmingCharacters(in: .whitespaces).isEmpty
            || !topics.isEmpty
            || education.contains { !$0.school.trimmingCharacters(in: .whitespaces).isEmpty }
            || links.contains { !$0.url.trimmingCharacters(in: .whitespaces).isEmpty }
    }
    private var onelineMissing: Bool {
        hasOptionalContent && oneLine.trimmingCharacters(in: .whitespaces).isEmpty
    }
    private var canSave: Bool {
        isDirty && !saving && !onelineMissing
    }

    private func loadInitial() async {
        guard let uid = auth.currentUser?.id else {
            await MainActor.run { loading = false }
            return
        }

        // Wrap the user fetch separately so we can distinguish a genuine
        // empty profile from a failed network call. If the user row throws,
        // surface a one-line error so the user knows their data isn't gone.
        var userRowFetched: VPUser? = nil
        var userRowFailed = false
        do {
            userRowFetched = try await client
                .from("users")
                .select("background_oneline, background_profession, background_years, background_where, background_lived, background_languages, background_lived_public")
                .eq("id", value: uid)
                .single()
                .execute()
                .value
        } catch {
            userRowFailed = true
        }
        let userRowFinal = userRowFetched
        let didFail = userRowFailed
        async let eduRows: [DBEducation] = (try? await client
            .from("user_education")
            .select("school, degree, field, years, sort_order")
            .eq("user_id", value: uid)
            .is("deleted_at", value: nil)
            .order("sort_order", ascending: true)
            .execute()
            .value) ?? []
        async let linkRows: [DBLink] = (try? await client
            .from("user_links")
            .select("url, label, sort_order")
            .eq("user_id", value: uid)
            .is("deleted_at", value: nil)
            .order("sort_order", ascending: true)
            .execute()
            .value) ?? []
        async let topicRows: [DBTopic] = (try? await client
            .from("user_topics_known")
            .select("category_id")
            .eq("user_id", value: uid)
            .execute()
            .value) ?? []
        async let catRows: [DBCategory] = (try? await client
            .from("categories")
            .select("id, name, parent_id")
            .order("name", ascending: true)
            .execute()
            .value) ?? []

        let user = userRowFinal
        let eduList = await eduRows
        let linkList = await linkRows
        let topicList = await topicRows
        let catList = await catRows

        await MainActor.run {
            oneLine = user?.backgroundOneline ?? ""
            profession = user?.backgroundProfession ?? ""
            years = user?.backgroundYears ?? ""
            whereBased = user?.backgroundWhere ?? ""
            lived = user?.backgroundLived ?? ""
            livedPublic = user?.backgroundLivedPublic ?? false
            languages = user?.backgroundLanguages ?? ""
            education = eduList.map {
                EducationEntry(school: $0.school ?? "", degree: $0.degree ?? "", field: $0.field ?? "", years: $0.years ?? "")
            }
            links = linkList.map { LinkEntry(url: $0.url ?? "", label: $0.label ?? "") }
            topics = Set(topicList.map { $0.category_id })
            topicOptions = catList.map { TopicOption(id: $0.id, name: $0.name ?? "", parentId: $0.parent_id) }
            loading = false
            loadFailed = didFail
            initialSnapshot = snapshotString
            // Auto-open sections that already have content.
            var s: Set<SectionKey> = []
            for key in SectionKey.allCases where sectionFilled(key) { s.insert(key) }
            open = s
        }
    }

    private func save() async {
        guard !saving, let uid = auth.currentUser?.id else { return }
        _ = uid
        await MainActor.run { saving = true }
        defer { Task { @MainActor in saving = false } }

        let educationClean: [[String: AnyJSON]] = education
            .map { e in
                let school = e.school.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !school.isEmpty else { return [String: AnyJSON]() }
                var dict: [String: AnyJSON] = ["school": .string(school)]
                let d = e.degree.trimmingCharacters(in: .whitespacesAndNewlines); if !d.isEmpty { dict["degree"] = .string(d) }
                let f = e.field.trimmingCharacters(in: .whitespacesAndNewlines);  if !f.isEmpty { dict["field"]  = .string(f) }
                let y = e.years.trimmingCharacters(in: .whitespacesAndNewlines);  if !y.isEmpty { dict["years"]  = .string(y) }
                return dict
            }
            .filter { !$0.isEmpty }

        let linksClean: [[String: AnyJSON]] = links
            .map { l in
                let url = l.url.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !url.isEmpty else { return [String: AnyJSON]() }
                var dict: [String: AnyJSON] = ["url": .string(url)]
                let lab = l.label.trimmingCharacters(in: .whitespacesAndNewlines); if !lab.isEmpty { dict["label"] = .string(lab) }
                return dict
            }
            .filter { !$0.isEmpty }

        let profileFields: [String: AnyJSON] = [
            "background_oneline":    nullableString(oneLine),
            "background_profession": nullableString(profession),
            "background_years":      nullableString(years),
            "background_where":      nullableString(whereBased),
            "background_lived":      nullableString(lived),
            "background_lived_public": .bool(livedPublic),
            "background_languages":  nullableString(languages),
        ]

        do {
            async let p1: Void = client.rpc("update_own_profile", params: ["p_fields": AnyJSON.object(profileFields)]).execute().value
            async let p2: Void = client.rpc("set_own_education", params: ["p_entries": AnyJSON.array(educationClean.map { .object($0) })]).execute().value
            async let p3: Void = client.rpc("set_own_links", params: ["p_entries": AnyJSON.array(linksClean.map { .object($0) })]).execute().value
            async let p4: Void = client.rpc("set_own_topics_known", params: ["p_category_ids": AnyJSON.array(topics.map { .string($0) })]).execute().value
            _ = try await (p1, p2, p3, p4)

            await MainActor.run {
                initialSnapshot = snapshotString
                showToast("Background saved.")
            }
        } catch {
            await MainActor.run {
                showToast("Couldn’t save. Try again.")
            }
        }
    }

    private func nullableString(_ s: String) -> AnyJSON {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? .null : .string(t)
    }

    private func showToast(_ message: String) {
        toastMessage = message
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            await MainActor.run {
                if toastMessage == message { toastMessage = "" }
            }
        }
    }
}

// MARK: - DB row types

private struct DBEducation: Decodable {
    var school: String?
    var degree: String?
    var field: String?
    var years: String?
    var sort_order: Int?
}

private struct DBLink: Decodable {
    var url: String?
    var label: String?
    var sort_order: Int?
}

private struct DBTopic: Decodable {
    var category_id: String
}

private struct DBCategory: Decodable {
    var id: String
    var name: String?
    var parent_id: String?
}

// MARK: - FlexibleStack (chip-tray that wraps lines)

private struct FlexibleStack<Content: View>: View {
    let spacing: CGFloat
    let lineSpacing: CGFloat
    @ViewBuilder let content: Content
    init(spacing: CGFloat = 6, lineSpacing: CGFloat = 6, @ViewBuilder content: () -> Content) {
        self.spacing = spacing; self.lineSpacing = lineSpacing; self.content = content()
    }
    var body: some View {
        BgFlowLayout(spacing: spacing, lineSpacing: lineSpacing) { content }
    }
}

private struct BgFlowLayout: Layout {
    let spacing: CGFloat
    let lineSpacing: CGFloat
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0; var y: CGFloat = 0; var lineH: CGFloat = 0; var totalW: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > maxW && x > 0 {
                y += lineH + lineSpacing; totalW = max(totalW, x - spacing); x = 0; lineH = 0
            }
            x += s.width + spacing
            lineH = max(lineH, s.height)
        }
        totalW = max(totalW, x - spacing)
        return CGSize(width: max(0, totalW), height: y + lineH)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX; var y: CGFloat = bounds.minY; var lineH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX && x > bounds.minX {
                y += lineH + lineSpacing; x = bounds.minX; lineH = 0
            }
            v.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(s))
            x += s.width + spacing
            lineH = max(lineH, s.height)
        }
    }
}
