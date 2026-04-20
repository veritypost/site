import SwiftUI

// V3 Streak +1 scene — first kids-app experience ported from KidModeV3.html.
//
// Choreography (mirrors prototype):
//   300ms:  flame scales in with overshoot
//   550ms:  number rolls up from previous → current
//   600ms:  radial background glow fades in
//   700ms:  three expanding rings spawn 150ms apart
//   850ms:  70-particle radial burst
//   1800ms: milestone card slides up
//   2000ms: gentle flame sparkles for 30 emits

struct StreakScene: View {
    let previous: Int
    let current: Int
    let milestone: Milestone?

    var onShare: (() -> Void)? = nil
    var onDone: (() -> Void)? = nil

    struct Milestone {
        let headline: String
        let subhead: String
    }

    // Animation state
    @State private var flameScale: CGFloat = 0.4
    @State private var flameOpacity: Double = 0
    @State private var numberTrigger: Bool = false
    @State private var glowOpacity: Double = 0
    @State private var milestoneOffset: CGFloat = 600
    @State private var milestoneOpacity: Double = 0
    @State private var rings: [RingPulse] = []

    @StateObject private var particles = ParticleEmitter()
    @State private var sparkleCount = 0
    @State private var sparkleTimer: Timer? = nil

    var body: some View {
        GeometryReader { geo in
            let cx = geo.size.width / 2
            let cy = geo.size.height * 0.45

            ZStack {
                // Background radial glow
                RadialGradient(
                    colors: [K.teal.opacity(0.2), .clear],
                    center: .center,
                    startRadius: 0,
                    endRadius: 350
                )
                .opacity(glowOpacity)
                .allowsHitTesting(false)

                VStack(spacing: 0) {
                    Spacer(minLength: 0)

                    // Flame with expanding rings behind
                    ZStack {
                        ForEach(rings) { ring in
                            Circle()
                                .stroke(K.teal, lineWidth: 2)
                                .frame(width: 60, height: 60)
                                .scaleEffect(ring.scale)
                                .opacity(ring.opacity)
                        }

                        KidFlame()
                            .frame(width: 120, height: 120)
                            .shadow(color: K.teal.opacity(0.4), radius: 24, y: 8)
                            .scaleEffect(flameScale)
                            .opacity(flameOpacity)
                    }
                    .frame(height: 140)

                    // Big number
                    AnimatedCountUp(
                        from: previous,
                        to: current,
                        duration: 0.55,
                        trigger: numberTrigger,
                        font: .system(size: 72, weight: .black, design: .rounded)
                    )
                    .foregroundStyle(K.text)
                    .frame(height: 76)
                    .padding(.top, 8)

                    Text("day streak")
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundStyle(K.dim)
                        .padding(.top, 4)

                    Spacer()

                    // Milestone card
                    if let milestone {
                        milestoneCard(milestone)
                            .padding(.horizontal, 20)
                            .padding(.bottom, 80)
                            .offset(y: milestoneOffset)
                            .opacity(milestoneOpacity)
                    }
                }

                // Particles on top
                ParticleLayer(emitter: particles)
            }
            .onAppear {
                runChoreography(at: CGPoint(x: cx, y: cy))
            }
            .onDisappear {
                sparkleTimer?.invalidate()
                sparkleTimer = nil
            }
        }
        .background(K.bg.ignoresSafeArea())
    }

    // MARK: Milestone card

    @ViewBuilder
    private func milestoneCard(_ m: Milestone) -> some View {
        VStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(LinearGradient(
                        colors: [K.teal, K.purple],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ))
                    .frame(width: 56, height: 56)
                    .shadow(color: K.teal.opacity(0.3), radius: 8, y: 4)

                Image(systemName: "shield.fill")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(.white)
            }

            VStack(spacing: 4) {
                Text(m.headline)
                    .font(.system(size: 20, weight: .black, design: .rounded))
                    .foregroundStyle(K.text)
                    .multilineTextAlignment(.center)
                    .lineSpacing(2)

                Text(m.subhead)
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundStyle(K.dim)
            }

            HStack(spacing: 10) {
                Button(action: { onShare?() }) {
                    Text("Share this")
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(K.teal)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
                }
                .buttonStyle(.plain)

                Button(action: { onDone?() }) {
                    Text("Done")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundStyle(K.dim)
                        .frame(minWidth: 80, minHeight: 48)
                        .padding(.horizontal, 20)
                        .background(K.bg)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .strokeBorder(K.border, lineWidth: 1.5)
                        )
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 4)
        }
        .padding(24)
        .background(K.card)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(K.border, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.12), radius: 50, y: 16)
    }

    // MARK: Choreography

    private func runChoreography(at center: CGPoint) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation(K.springOvershoot) {
                flameScale = 1.0
                flameOpacity = 1.0
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) {
            numberTrigger = true
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            withAnimation(.easeOut(duration: 0.8)) {
                glowOpacity = 1.0
            }
        }

        for i in 0..<3 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7 + Double(i) * 0.15) {
                spawnRing()
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.85) {
            particles.burst(at: center, count: 70, minSpeed: 3, maxSpeed: 10, upwardBias: 2)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            withAnimation(K.springOvershoot) {
                milestoneOffset = 0
                milestoneOpacity = 1.0
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            sparkleTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { timer in
                Task { @MainActor in
                    guard sparkleCount < 30 else {
                        timer.invalidate()
                        return
                    }
                    sparkleCount += 1
                    particles.sparkle(at: CGPoint(
                        x: center.x + CGFloat.random(in: -15...15),
                        y: center.y - 25
                    ))
                }
            }
        }
    }

    private func spawnRing() {
        let ring = RingPulse()
        rings.append(ring)

        if let idx = rings.firstIndex(where: { $0.id == ring.id }) {
            withAnimation(.easeOut(duration: 0.8)) {
                rings[idx].scale = 3.0
                rings[idx].opacity = 0
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.85) {
            rings.removeAll { $0.id == ring.id }
        }
    }
}

private struct RingPulse: Identifiable {
    let id = UUID()
    var scale: CGFloat = 0.5
    var opacity: Double = 1.0
}

#Preview("Streak +1 → 7 with milestone") {
    StreakScene(
        previous: 6,
        current: 7,
        milestone: .init(
            headline: "You've read news for seven days straight.",
            subhead: "That's becoming a real habit."
        )
    )
}

#Preview("Streak +1 → 3 (no milestone)") {
    StreakScene(
        previous: 2,
        current: 3,
        milestone: nil
    )
}
