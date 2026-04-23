import SwiftUI

// V3 Quiz Pass scene.
//
// Choreography (from KidModeV3.html quizNew):
//   500ms:  correct-answer chip highlights + checkmark zoom
//   900ms:  radial teal sweep on correct chip
//   1300ms: question area fades to 0.1
//   1500ms: result sheet slides up from bottom
//            + score animates 72 → 84 over ~540ms
//            + ring animates stroke from 0 → 84% over ~1.5s
//   2100ms: 80-particle confetti

struct QuizPassScene: View {
    let question: String
    let answers: [Answer]
    let questionNumber: Int
    let totalQuestions: Int

    let priorScore: Int
    let newScore: Int
    let correctCount: Int
    let timeSeconds: Int
    let insight: String

    var onShare: (() -> Void)? = nil
    var onDone: (() -> Void)? = nil

    struct Answer: Identifiable {
        let id = UUID()
        let text: String
        let correct: Bool
    }

    // Chip state
    @State private var chipHighlightIndex: Int? = nil
    @State private var chipCheckVisible: Bool = false
    @State private var chipSweepScale: CGFloat = 0
    @State private var chipSweepOpacity: Double = 0.6

    // Result state
    @State private var resultOffset: CGFloat = 1000
    @State private var questionOpacity: Double = 1.0
    @State private var scoreTrigger: Bool = false
    @State private var ringProgress: Double = 0

    @StateObject private var particles = ParticleEmitter()

    // Skip chip sweep + ring grow + confetti when reduce-motion is on.
    // Result card appears in its final pose with the new score visible.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            ZStack {
                K.bg.ignoresSafeArea()

                // Question area
                VStack(spacing: 0) {
                    progressDots
                        .padding(.top, 70)

                    Text("Question \(questionNumber) of \(totalQuestions)")
                        .font(.scaledSystem(size: 12, weight: .bold, design: .rounded))
                        .kerning(1)
                        .foregroundStyle(K.dim)
                        .textCase(.uppercase)
                        .padding(.top, 14)

                    Text(question)
                        .font(.scaledSystem(size: 18, weight: .heavy, design: .rounded))
                        .foregroundStyle(K.text)
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                        .padding(.horizontal, 20)
                        .padding(.top, 10)

                    VStack(spacing: 8) {
                        ForEach(Array(answers.enumerated()), id: \.offset) { idx, ans in
                            answerChip(ans, index: idx)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)

                    Spacer()
                }
                .opacity(questionOpacity)

                // Result sheet
                VStack {
                    Spacer()
                    resultCard
                        .offset(y: resultOffset)
                }
                .ignoresSafeArea(edges: .bottom)

                ParticleLayer(emitter: particles)
            }
            .onAppear {
                runChoreography(at: CGPoint(x: geo.size.width / 2, y: geo.size.height * 0.65))
            }
        }
    }

    // MARK: Progress dots

    private var progressDots: some View {
        HStack(spacing: 8) {
            ForEach(0..<totalQuestions, id: \.self) { i in
                let isCurrent = i == totalQuestions - 1
                Circle()
                    .fill(K.teal)
                    .frame(width: isCurrent ? 12 : 8, height: isCurrent ? 12 : 8)
                    .overlay(
                        Circle()
                            .strokeBorder(K.teal.opacity(0.25), lineWidth: isCurrent ? 4 : 0)
                    )
            }
        }
    }

    // MARK: Answer chip

    private func answerChip(_ ans: Answer, index: Int) -> some View {
        let highlighted = chipHighlightIndex == index

        return ZStack {
            // Radial sweep overlay
            if highlighted {
                RadialGradient(
                    colors: [K.tealLight, .clear],
                    center: .center,
                    startRadius: 0,
                    endRadius: 100
                )
                .scaleEffect(chipSweepScale)
                .opacity(chipSweepOpacity)
                .allowsHitTesting(false)
            }

            HStack {
                Text(ans.text)
                    .font(.scaledSystem(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(K.text)
                Spacer()
                if highlighted && chipCheckVisible {
                    ZStack {
                        Circle().fill(K.teal).frame(width: 26, height: 26)
                        Image(systemName: "checkmark")
                            .font(.scaledSystem(size: 12, weight: .heavy))
                            .foregroundStyle(.white)
                    }
                    .transition(.scale(scale: 0).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 15)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(highlighted ? K.tealLight : K.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(highlighted ? K.teal : K.border, lineWidth: 2)
        )
        .scaleEffect(highlighted ? 1.04 : 1.0)
    }

    // MARK: Result card

    private var resultCard: some View {
        VStack(spacing: 18) {
            Text("Quiz Passed")
                .font(.scaledSystem(size: 12, weight: .heavy, design: .rounded))
                .kerning(1.5)
                .textCase(.uppercase)
                .foregroundStyle(K.teal)

            // Score ring
            ZStack {
                Circle()
                    .stroke(K.border, lineWidth: 8)
                    .frame(width: 140, height: 140)

                Circle()
                    .trim(from: 0, to: ringProgress)
                    .stroke(K.teal, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .frame(width: 140, height: 140)
                    .rotationEffect(.degrees(-90))

                VStack(spacing: 0) {
                    AnimatedCountUp(
                        from: priorScore,
                        to: newScore,
                        duration: 0.55,
                        trigger: scoreTrigger,
                        font: .scaledSystem(size: 38, weight: .black, design: .rounded)
                    )
                    .foregroundStyle(K.text)

                    Text("Verity Score")
                        .font(.scaledSystem(size: 11, weight: .semibold, design: .rounded))
                        .foregroundStyle(K.dim)
                        .padding(.top, 2)
                }
            }

            HStack(spacing: 10) {
                statChip(label: "Correct", value: "\(correctCount)/\(totalQuestions)", color: K.teal)
                statChip(label: "Time",    value: "\(timeSeconds)s",                   color: K.dim)
                statChip(label: "Delta",   value: "+\(newScore - priorScore)",          color: K.mint)
            }

            Text(insight)
                .font(.scaledSystem(size: 15, weight: .semibold, design: .rounded))
                .foregroundStyle(K.text)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .padding(.horizontal, 8)

            Button(action: { onShare?() }) {
                Text("Share result")
                    .font(.scaledSystem(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(K.teal)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 24)
        .padding(.top, 28)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity)
        .background(K.card)
        .clipShape(
            UnevenRoundedRectangle(
                cornerRadii: .init(topLeading: 28, topTrailing: 28)
            )
        )
        .shadow(color: .black.opacity(0.12), radius: 60, y: -16)
    }

    private func statChip(label: String, value: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.scaledSystem(size: 18, weight: .black, design: .rounded))
                .foregroundStyle(color)
            Text(label)
                .font(.scaledSystem(size: 11, weight: .semibold, design: .rounded))
                .foregroundStyle(K.dim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(K.bg)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    // MARK: Choreography

    private func runChoreography(at center: CGPoint) {
        if reduceMotion {
            // Static end-state — correct chip already highlighted, result
            // sheet up, score and ring at final values, no confetti.
            if let idx = answers.firstIndex(where: { $0.correct }) {
                chipHighlightIndex = idx
                chipCheckVisible = true
            }
            chipSweepScale = 2.5
            chipSweepOpacity = 0
            questionOpacity = 0.1
            resultOffset = 0
            scoreTrigger = true
            ringProgress = Double(newScore) / 100.0
            return
        }

        // 500ms: highlight correct chip + show checkmark
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            if let idx = answers.firstIndex(where: { $0.correct }) {
                withAnimation(K.springOvershoot) {
                    chipHighlightIndex = idx
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    withAnimation(K.springOvershoot) {
                        chipCheckVisible = true
                    }
                }
            }
        }

        // 900ms: radial sweep on correct chip
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
            withAnimation(.easeOut(duration: 0.5)) {
                chipSweepScale = 2.5
                chipSweepOpacity = 0
            }
        }

        // 1300ms: fade question
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.3) {
            withAnimation(.easeOut(duration: 0.4)) {
                questionOpacity = 0.1
            }
        }

        // 1500ms: result slides up + score + ring animate
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            withAnimation(K.springOvershoot) {
                resultOffset = 0
            }
            scoreTrigger = true
            withAnimation(.easeOut(duration: 1.5)) {
                ringProgress = Double(newScore) / 100.0
            }
        }

        // 2100ms: confetti burst
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.1) {
            particles.burst(
                at: center,
                count: 80,
                minSpeed: 3,
                maxSpeed: 12,
                upwardBias: 3,
                gravity: 0.12
            )
        }
    }
}

#Preview("Quiz Pass 72 → 84") {
    QuizPassScene(
        question: "Which headline uses a loaded word?",
        answers: [
            .init(text: "\"City announces new park plans\"",            correct: false),
            .init(text: "\"Mayor slams opposition in heated debate\"",  correct: true),
            .init(text: "\"School board reviews budget proposal\"",     correct: false),
            .init(text: "\"Weather expected to change this week\"",     correct: false)
        ],
        questionNumber: 5,
        totalQuestions: 5,
        priorScore: 72,
        newScore: 84,
        correctCount: 5,
        timeSeconds: 42,
        insight: "You spotted a loaded headline on the first try."
    )
}
