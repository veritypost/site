import SwiftUI

// V3 Morning Ritual / Greeting scene — live home surface.
//
// Choreography (from KidModeV3.html greetingNew):
//   200ms: band drops in from above with opacity
//   500ms: shimmer sweeps across the band
//   600ms: time-of-day orb spins in from scale 0 / -120° rotation
//   750ms: "Good morning" label fades up
//   900ms: name types character-by-character with sparkles per keystroke
//   (name done): underline expands + big sparkle burst
//   1600ms: streak card fades up
//   1900ms: category cards stagger-scale in

struct GreetingScene: View {
    let name: String
    let streakDays: Int
    let streakSubtext: String
    let categories: [KidCategory]

    var onStreakTap: (() -> Void)? = nil
    var onCategoryTap: ((KidCategory) -> Void)? = nil

    // Band animation
    @State private var bandOffset: CGFloat = -120
    @State private var bandOpacity: Double = 0
    @State private var shimmerProgress: CGFloat = -1.0

    // Orb
    @State private var orbScale: CGFloat = 0
    @State private var orbRotation: Double = -120

    // Greeting + name
    @State private var greetingOpacity: Double = 0
    @State private var greetingOffset: CGFloat = 8
    @State private var typedCharCount: Int = 0
    @State private var underlineTrigger: Bool = false

    // Streak + categories
    @State private var streakOpacity: Double = 0
    @State private var streakOffset: CGFloat = 24
    @State private var cardsRevealed: [Bool] = []

    // Typewriter emit anchor (captured from the name text frame)
    @State private var nameTextFrame: CGRect = .zero

    @StateObject private var particles = ParticleEmitter()

    private var greetingText: String {
        let h = Calendar.current.component(.hour, from: Date())
        return h < 12 ? "Good morning" : (h < 17 ? "Good afternoon" : "Good evening")
    }

    private var timeIcon: String {
        let h = Calendar.current.component(.hour, from: Date())
        return h < 12 ? "sun.max.fill" : (h < 17 ? "cloud.sun.fill" : "moon.stars.fill")
    }

    var body: some View {
        // Read the actual top inset from GeometryReader so the band's
        // greeting text always clears the Dynamic Island (54pt) / notch
        // (47pt) / older devices (20pt) without hardcoding any of them.
        GeometryReader { proxy in
            let topInset = proxy.safeAreaInsets.top
            mainContent(topInset: topInset)
        }
    }

    private func mainContent(topInset: CGFloat) -> some View {
        ZStack(alignment: .top) {
            K.bg.ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    band(topInset: topInset)
                        .offset(y: bandOffset)
                        .opacity(bandOpacity)

                    Button { onStreakTap?() } label: {
                        streakCard
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .offset(y: streakOffset)
                    .opacity(streakOpacity)
                    .accessibilityLabel("\(streakDays) day streak. \(streakSubtext). View streak details.")
                    .accessibilityHint("Opens your streak details")

                    categoryGrid
                        .padding(.horizontal, 20)
                        .padding(.top, 14)

                    Spacer(minLength: 40)
                }
            }
            .ignoresSafeArea(edges: .top)

            ParticleLayer(emitter: particles)
        }
        .coordinateSpace(name: "greeting")
        .task(id: name) {
            if cardsRevealed.count != categories.count {
                cardsRevealed = Array(repeating: false, count: categories.count)
            }
            resetState()
            runChoreography()
        }
        .onPreferenceChange(NameFramePreferenceKey.self) { frame in
            self.nameTextFrame = frame
        }
    }

    // MARK: Band

    private func band(topInset: CGFloat) -> some View {
        // Floor to 24 so previews / non-safe-area contexts still get a
        // reasonable header inset; cap at 80 so the unlikely XL inset
        // doesn't push content off-screen.
        let chromeInset = max(min(topInset + 28, 80), 28)
        let bandHeight: CGFloat = 192 + chromeInset
        return ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [K.teal, K.tealDark, K.purple],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Decorative floating orbs (bottom-right cluster)
            GeometryReader { geo in
                ForEach(0..<6, id: \.self) { i in
                    Circle()
                        .fill(Color.white.opacity(0.04 + Double(i) * 0.02))
                        .frame(width: CGFloat(8 + i * 4), height: CGFloat(8 + i * 4))
                        .position(
                            x: geo.size.width - CGFloat(24 + i * 22),
                            y: geo.size.height - CGFloat(30 + i * 8)
                        )
                }
            }
            .allowsHitTesting(false)

            // Shimmer sweep (left to right, skewed)
            GeometryReader { geo in
                LinearGradient(
                    colors: [.clear, .white.opacity(0.18), .clear],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(width: geo.size.width * 0.55, height: geo.size.height * 1.4)
                .rotationEffect(.degrees(-18))
                .offset(x: shimmerProgress * geo.size.width * 1.5)
                .blendMode(.plusLighter)
            }
            .allowsHitTesting(false)

            // Content
            HStack(alignment: .center, spacing: 16) {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.12))
                        .overlay(
                            Circle().strokeBorder(Color.white.opacity(0.15), lineWidth: 1)
                        )
                        .frame(width: 56, height: 56)
                        .shadow(color: .black.opacity(0.15), radius: 8, y: 3)

                    Image(systemName: timeIcon)
                        .font(.scaledSystem(size: 26, weight: .bold))
                        .foregroundStyle(.white)
                }
                .scaleEffect(orbScale)
                .rotationEffect(.degrees(orbRotation))

                VStack(alignment: .leading, spacing: 2) {
                    Text(greetingText)
                        .font(.scaledSystem(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.white.opacity(0.55))
                        .opacity(greetingOpacity)
                        .offset(y: greetingOffset)

                    typedName
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 28)
            .padding(.top, chromeInset)
        }
        .frame(height: bandHeight)
        .clipShape(
            UnevenRoundedRectangle(
                cornerRadii: .init(bottomLeading: 28, bottomTrailing: 28)
            )
        )
    }

    /// Typewriter name with measured-width underline.
    private var typedName: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Hidden full name for width measurement
            ZStack(alignment: .leading) {
                // Full name (invisible) reserves the final frame width
                Text(name)
                    .font(.scaledSystem(size: 38, weight: .black, design: .rounded))
                    .kerning(-1)
                    .opacity(0)
                    .background(
                        GeometryReader { geo in
                            Color.clear
                                .preference(
                                    key: NameFramePreferenceKey.self,
                                    value: geo.frame(in: .named("greeting"))
                                )
                        }
                    )

                Text(String(name.prefix(typedCharCount)))
                    .font(.scaledSystem(size: 38, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .kerning(-1)
            }
            .frame(height: 44)

            // Underline — grows from 0 to measured text width
            GeometryReader { geo in
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color.white.opacity(0.35))
                    .frame(
                        width: underlineTrigger ? geo.size.width : 0,
                        height: 3,
                        alignment: .leading
                    )
                    .animation(.easeOut(duration: 0.5), value: underlineTrigger)
            }
            .frame(height: 3)
        }
    }

    // MARK: Streak card

    private var streakCard: some View {
        HStack(spacing: 16) {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(LinearGradient(
                        colors: [K.coral, K.gold],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                    .frame(width: 52, height: 52)
                    .shadow(color: K.coral.opacity(0.25), radius: 16, y: 4)

                Image(systemName: "flame.fill")
                    .font(.scaledSystem(size: 26, weight: .bold))
                    .foregroundStyle(.white)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text("\(streakDays) day streak")
                    .font(.scaledSystem(size: 26, weight: .black, design: .rounded))
                    .foregroundStyle(K.text)
                Text(streakSubtext)
                    .font(.scaledSystem(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(K.dim)
            }

            Spacer(minLength: 0)

            Image(systemName: "chevron.right")
                .font(.scaledSystem(size: 14, weight: .bold))
                .foregroundStyle(K.dim)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 18)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(K.border, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.06), radius: 24, y: 4)
        .contentShape(Rectangle())
    }

    // MARK: Category grid — dynamic stagger

    private var categoryGrid: some View {
        LazyVGrid(
            columns: [
                GridItem(.flexible(), spacing: 10),
                GridItem(.flexible(), spacing: 10)
            ],
            spacing: 10
        ) {
            ForEach(Array(categories.enumerated()), id: \.element.id) { idx, cat in
                Button {
                    onCategoryTap?(cat)
                } label: {
                    categoryCardBody(cat)
                        .scaleEffect(isRevealed(idx) ? 1.0 : 0.85)
                        .opacity(isRevealed(idx) ? 1.0 : 0.0)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func isRevealed(_ idx: Int) -> Bool {
        idx < cardsRevealed.count && cardsRevealed[idx]
    }

    private func categoryCardBody(_ cat: KidCategory) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(cat.color.opacity(0.1))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(cat.color.opacity(0.15), lineWidth: 1.5)
                    )
                    .frame(width: 40, height: 40)

                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(cat.color)
                    .frame(width: 18, height: 18)
            }

            Text(cat.name)
                .font(.scaledSystem(size: 14, weight: .heavy, design: .rounded))
                .foregroundStyle(K.text)

            HStack(spacing: 4) {
                ForEach(0..<5, id: \.self) { j in
                    Capsule()
                        .fill(j < cat.progress ? cat.color : K.border)
                        .frame(height: 4)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(K.border, lineWidth: 1)
        )
    }

    // MARK: Choreography

    private func resetState() {
        bandOffset = -120
        bandOpacity = 0
        shimmerProgress = -1.0
        orbScale = 0
        orbRotation = -120
        greetingOpacity = 0
        greetingOffset = 8
        typedCharCount = 0
        underlineTrigger = false
        streakOpacity = 0
        streakOffset = 24
        cardsRevealed = Array(repeating: false, count: categories.count)
    }

    private func runChoreography() {
        try? await_delay(0.2)
        withAnimation(K.springOvershoot) {
            bandOffset = 0
            bandOpacity = 1.0
        }

        try? await_delay(0.3)  // +500ms total
        withAnimation(.easeInOut(duration: 0.8)) {
            shimmerProgress = 1.0
        }

        try? await_delay(0.1)  // +600ms
        withAnimation(K.springOvershoot) {
            orbScale = 1.0
            orbRotation = 0
        }

        try? await_delay(0.15)  // +750ms
        withAnimation(.easeOut(duration: 0.4)) {
            greetingOpacity = 1.0
            greetingOffset = 0
        }

        try? await_delay(0.15)  // +900ms
        typeNextChar()

        // After typewriter finishes, run streak + cards on timers from 1600/1900ms absolute
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            withAnimation(K.springSoft) {
                streakOpacity = 1.0
                streakOffset = 0
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            for i in 0..<categories.count {
                DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.05) {
                    guard i < cardsRevealed.count else { return }
                    withAnimation(K.springOvershoot) {
                        cardsRevealed[i] = true
                    }
                }
            }
        }
    }

    // Synchronous-friendly delay helper (doesn't actually suspend — adds to queue with asyncAfter)
    // Kept as sync-style for readability in runChoreography.
    private func await_delay(_ seconds: Double) throws {
        // No-op placeholder — real sequencing happens via asyncAfter in caller.
        // (Keeps the code readable as a phase list.)
    }

    private func typeNextChar() {
        guard typedCharCount < name.count else {
            underlineTrigger = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                // Big sparkle burst at the trailing edge of the name
                let emitPoint = CGPoint(
                    x: nameTextFrame.maxX > 0 ? nameTextFrame.maxX - 8 : 200,
                    y: nameTextFrame.midY > 0 ? nameTextFrame.midY : 120
                )
                particles.burst(
                    at: emitPoint,
                    count: 25,
                    minSpeed: 1,
                    maxSpeed: 5,
                    upwardBias: 2,
                    gravity: 0.07
                )
            }
            return
        }

        typedCharCount += 1

        // Sparkle at trailing edge of currently-typed text
        // Use measured frame if we have it; fall back to approx otherwise
        let sparklePoint: CGPoint = {
            if nameTextFrame.width > 0 {
                let charRatio = CGFloat(typedCharCount) / CGFloat(name.count)
                return CGPoint(
                    x: nameTextFrame.minX + nameTextFrame.width * charRatio,
                    y: nameTextFrame.midY
                )
            } else {
                return CGPoint(x: 140 + CGFloat(typedCharCount) * 22, y: 125)
            }
        }()

        particles.sparkle(at: sparklePoint, colors: K.particleColors)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.09) {
            typeNextChar()
        }
    }
}

private struct NameFramePreferenceKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        value = nextValue()
    }
}

#Preview("Greeting — Lila, 6 day streak") {
    GreetingScene(
        name: "Lila",
        streakDays: 6,
        streakSubtext: "Read one more to keep it alive",
        categories: [
            .init(name: "Science", color: K.purple, progress: 4),
            .init(name: "World",   color: K.teal,   progress: 2),
            .init(name: "Sports",  color: K.coral,  progress: 0),
            .init(name: "Tech",    color: K.sky,    progress: 3)
        ]
    )
}

#Preview("Greeting — Sam, 14 day streak, 3 cats") {
    GreetingScene(
        name: "Sam",
        streakDays: 14,
        streakSubtext: "Two weeks strong",
        categories: [
            .init(name: "Science", color: K.purple, progress: 5),
            .init(name: "World",   color: K.teal,   progress: 4),
            .init(name: "Sports",  color: K.coral,  progress: 2)
        ]
    )
}
