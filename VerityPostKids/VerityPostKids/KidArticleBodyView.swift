import SwiftUI
import UIKit

// Wave B — Kids Interactive Moments renderer.
//
// iOS-Kids ONLY. The adult web pipeline transforms `[[GLOSS:…]]` / `[[REVEAL:…]]`
// / `[[PREDICT:…]]` into inline plain text on the server before render
// (see web/src/lib/pipeline/render-body.ts). This view only ships in the
// VerityPostKids target — adult iOS does not consume kid articles, kids web
// is redirect-only per LockedDecision #15.
//
// Owns per-session reveal/predict state. `onCountersChange` surfaces the
// running aggregate so `KidReaderView` can stamp it into `reading_log` at
// quiz-tap time (Wave C).

struct InteractiveMomentCounters: Equatable {
    var glossaryTaps: Int = 0
    var revealTaps: Int = 0
    var predictShown: Bool = false
    var predictCorrect: Bool? = nil

    static let zero = InteractiveMomentCounters()
}

struct KidArticleBodyView: View {
    let articleBody: String
    let categoryColor: Color
    var onCountersChange: (InteractiveMomentCounters) -> Void = { _ in }

    @State private var segments: [BodySegment] = []
    @State private var lastBody: String = ""

    @State private var revealedReveals: Set<UUID> = []
    @State private var revealedGlosses: Set<UUID> = []
    @State private var firstRevealedReveals: Set<UUID> = []
    @State private var firstRevealedGlosses: Set<UUID> = []

    @State private var predictAnsweredId: UUID? = nil
    @State private var predictPickedIndex: Int? = nil

    @State private var counters: InteractiveMomentCounters = .zero

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(segments) { segment in
                switch segment {
                case .paragraph(_, let runs):
                    ParagraphView(
                        runs: runs,
                        categoryColor: categoryColor,
                        revealedReveals: $revealedReveals,
                        revealedGlosses: $revealedGlosses,
                        onGlossTap: handleGlossTap(id:),
                        onRevealTap: handleRevealTap(id:)
                    )
                case .predict(let id, let question, let options, let correctIndex):
                    PredictCard(
                        id: id,
                        question: question,
                        options: options,
                        correctIndex: correctIndex,
                        answeredId: $predictAnsweredId,
                        pickedIndex: $predictPickedIndex,
                        onShown: handlePredictShown,
                        onPick: handlePredictPick(idx:correct:)
                    )
                }
            }
        }
        .onAppear { reparseIfNeeded() }
        .onChange(of: articleBody) { _, _ in reparseIfNeeded() }
    }

    // MARK: Parse + reset

    private func reparseIfNeeded() {
        guard articleBody != lastBody else { return }
        segments = InteractiveMomentParser.parse(articleBody)
        lastBody = articleBody
        // Reset per-session state on body change. Wave A's spec: re-entering
        // Deep dive resets reveal counters too — keeps the data model simple.
        revealedReveals.removeAll()
        revealedGlosses.removeAll()
        firstRevealedReveals.removeAll()
        firstRevealedGlosses.removeAll()
        predictAnsweredId = nil
        predictPickedIndex = nil
        counters = .zero
        onCountersChange(counters)
    }

    // MARK: Tap handlers

    private func handleGlossTap(id: UUID) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        let firstReveal = !revealedGlosses.contains(id) && !firstRevealedGlosses.contains(id)
        withAnimation(K.springSnap) {
            if revealedGlosses.contains(id) {
                revealedGlosses.remove(id)
            } else {
                revealedGlosses.insert(id)
            }
        }
        if firstReveal {
            firstRevealedGlosses.insert(id)
            counters.glossaryTaps += 1
            onCountersChange(counters)
        }
    }

    private func handleRevealTap(id: UUID) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        let firstReveal = !revealedReveals.contains(id) && !firstRevealedReveals.contains(id)
        withAnimation(K.springSnap) {
            if revealedReveals.contains(id) {
                revealedReveals.remove(id)
            } else {
                revealedReveals.insert(id)
            }
        }
        if firstReveal {
            firstRevealedReveals.insert(id)
            counters.revealTaps += 1
            onCountersChange(counters)
        }
    }

    private func handlePredictShown() {
        guard !counters.predictShown else { return }
        counters.predictShown = true
        onCountersChange(counters)
    }

    private func handlePredictPick(idx: Int, correct: Int) {
        guard counters.predictCorrect == nil else { return } // locked after first pick
        let isCorrect = idx == correct
        if isCorrect {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } else {
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        }
        counters.predictCorrect = isCorrect
        onCountersChange(counters)
    }
}

// MARK: - ParagraphView
//
// Renders a single paragraph's runs. Decision: chunked HStack/VStack hybrid
// using `WrappingHStack` would require a custom layout; SwiftUI 17 inline
// `Button` inside `Text` via the `+` operator does not support tap targets.
// Accepted compromise: render the paragraph's plain-text runs as a single
// concatenated `Text` for proper line-wrapping, then render each marker run
// (GLOSS / REVEAL) as a full-width tappable callout below the paragraph
// text. This gives proper Dynamic Type wrapping for the prose and tap-
// friendly targets for the markers, at the cost of marker callouts not
// being mid-flow. Documented tradeoff — flagged in PR.

private struct ParagraphView: View {
    let runs: [InlineRun]
    let categoryColor: Color
    @Binding var revealedReveals: Set<UUID>
    @Binding var revealedGlosses: Set<UUID>
    var onGlossTap: (UUID) -> Void
    var onRevealTap: (UUID) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Inline prose: concatenate the plain `.text` runs and the
            // term-as-it-appears for `.gloss` runs. Reveal facts are NOT
            // inlined — they render as a callout below.
            inlineText
                .font(.scaledSystem(size: 17, weight: .regular, design: .rounded))
                .foregroundStyle(K.text)
                .lineSpacing(5)
                .frame(maxWidth: .infinity, alignment: .leading)

            // Marker callouts: gloss-definition (when revealed) + every reveal pill.
            ForEach(runs.indices, id: \.self) { i in
                switch runs[i] {
                case .text:
                    EmptyView()
                case .gloss(let id, let term, let definition):
                    if revealedGlosses.contains(id) {
                        glossCallout(term: term, definition: definition)
                    }
                case .reveal(let id, let fact):
                    revealPill(id: id, fact: fact)
                }
            }
        }
    }

    /// Concatenate the inline-flowing pieces into a single `Text` so the
    /// renderer wraps them naturally at any Dynamic Type size. Glossary
    /// terms render underlined in `categoryColor`; reveal facts are
    /// represented in-flow by a small "tap below" hint sigil so the kid
    /// can correlate the prose with the pill.
    private var inlineText: Text {
        var combined = Text("")
        for run in runs {
            switch run {
            case .text(let s):
                combined = combined + Text(s)
            case .gloss(let id, let term, _):
                let isOpen = revealedGlosses.contains(id)
                combined = combined + Text(term)
                    .font(.scaledSystem(size: 17, weight: .semibold, design: .rounded))
                    .underline(true, color: categoryColor)
                    .foregroundColor(isOpen ? K.text : categoryColor)
            case .reveal:
                // Inline sparkle sigil — visually correlates the in-prose hint
                // to the tappable REVEAL pill that renders below the paragraph.
                // Subtle but discoverable for a 7-9 year-old reader.
                combined = combined + Text(verbatim: " ✨")
                    .foregroundColor(K.gold)
            }
        }
        return combined
    }

    private func glossCallout(term: String, definition: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "book.fill")
                .font(.scaledSystem(size: 13, weight: .bold))
                .foregroundStyle(categoryColor)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(term)
                    .font(.scaledSystem(size: 14, weight: .heavy, design: .rounded))
                    .foregroundStyle(K.text)
                Text(definition)
                    .font(.scaledSystem(size: 14, weight: .regular, design: .rounded))
                    .foregroundStyle(K.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(K.card)
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(K.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .transition(.opacity.combined(with: .scale(scale: 0.98, anchor: .top)))
    }

    private func revealPill(id: UUID, fact: String) -> some View {
        let isOpen = revealedReveals.contains(id)
        return Button {
            onRevealTap(id)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: isOpen ? "sparkles" : "questionmark.circle.fill")
                    .font(.scaledSystem(size: 14, weight: .bold))
                    .foregroundStyle(isOpen ? K.tealDark : K.tealDark)
                    .accessibilityHidden(true)
                if isOpen {
                    Text(fact)
                        .font(.scaledSystem(size: 15, weight: .semibold, design: .rounded))
                        .foregroundStyle(K.text)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text("Wait, really? Tap to find out")
                        .font(.scaledSystem(size: 14, weight: .bold, design: .rounded))
                        .foregroundStyle(K.tealDark)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(K.teal.opacity(0.15))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(K.teal.opacity(0.35), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isOpen ? "Reveal: \(fact)" : "Wait, really? Tap to find out")
    }
}

// MARK: - PredictCard

private struct PredictCard: View {
    let id: UUID
    let question: String
    let options: [String]
    let correctIndex: Int
    @Binding var answeredId: UUID?
    @Binding var pickedIndex: Int?
    var onShown: () -> Void
    var onPick: (Int, Int) -> Void

    private var locked: Bool { answeredId == id }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "lightbulb.fill")
                    .font(.scaledSystem(size: 14, weight: .bold))
                    .foregroundStyle(K.gold)
                    .accessibilityHidden(true)
                Text("What do you think?")
                    .font(.scaledSystem(size: 12, weight: .heavy, design: .rounded))
                    .foregroundStyle(K.dim)
                    .textCase(.uppercase)
                    .kerning(0.5)
            }

            Text(question)
                .font(.scaledSystem(size: 18, weight: .bold, design: .rounded))
                .foregroundStyle(K.text)
                .fixedSize(horizontal: false, vertical: true)

            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
                spacing: 10
            ) {
                ForEach(options.indices, id: \.self) { i in
                    optionButton(idx: i)
                }
            }

            if locked {
                let correct = (pickedIndex == correctIndex)
                Text(correct
                     ? "Nice prediction!"
                     : "Good guess — keep reading to see why.")
                    .font(.scaledSystem(size: 13, weight: .semibold, design: .rounded))
                    .foregroundStyle(K.dim)
                    .transition(.opacity)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(K.card)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(K.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .onAppear { onShown() }
    }

    @ViewBuilder
    private func optionButton(idx: Int) -> some View {
        let isPicked = pickedIndex == idx
        let isCorrect = idx == correctIndex

        let bg: Color = {
            guard locked else { return K.card }
            if isCorrect { return K.mint.opacity(0.2) }
            if isPicked { return K.coral.opacity(0.18) }
            return K.card.opacity(0.5)
        }()
        let border: Color = {
            guard locked else { return K.border }
            if isCorrect { return K.mint }
            if isPicked { return K.coral }
            return K.border
        }()
        let fg: Color = {
            guard locked else { return K.text }
            if isCorrect || isPicked { return K.text }
            return K.dim.opacity(0.7)
        }()

        Button {
            guard !locked else { return }
            withAnimation(K.springSnap) {
                pickedIndex = idx
                answeredId = id
            }
            onPick(idx, correctIndex)
        } label: {
            HStack(alignment: .top, spacing: 8) {
                Text(options[idx])
                    .font(.scaledSystem(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(fg)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if locked {
                    if isCorrect {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.scaledSystem(size: 16, weight: .bold))
                            .foregroundStyle(K.mint)
                            .accessibilityHidden(true)
                    } else if isPicked {
                        Image(systemName: "xmark.circle.fill")
                            .font(.scaledSystem(size: 16, weight: .bold))
                            .foregroundStyle(K.coral)
                            .accessibilityHidden(true)
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .topLeading)
            .background(bg)
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(border, lineWidth: 2)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(locked)
    }
}
