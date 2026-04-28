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

    // Skip the choreography when reduce-motion is on. Kid sees the final
    // streak number + flame + milestone card immediately.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
                        font: .scaledSystem(size: 72, weight: .black, design: .rounded)
                    )
                    .foregroundStyle(K.text)
                    .frame(height: 76)
                    .padding(.top, 8)

                    Text("day streak")
                        .font(.scaledSystem(size: 16, weight: .bold, design: .rounded))
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
            // A8 — `.task` so SwiftUI cancels the choreography on view
            // disappear, propagating into every `try await Task.sleep`
            // below. Pre-A8 used DispatchQueue.main.asyncAfter blocks
            // with no cancellation path.
            .task {
                await runChoreography(at: CGPoint(x: cx, y: cy))
            }
            .onDisappear {
                sparkleTimer?.invalidate()
                sparkleTimer = nil
            }
            // Combine the entire celebration scene into a single
            // VoiceOver element so a kid using assistive tech hears one
            // coherent summary instead of being walked through the
            // animated number, the milestone headline, the subhead, and
            // the share/done buttons as four disconnected stops. The
            // share + done buttons remain individually focusable through
            // their .accessibilityAction descendants since SwiftUI keeps
            // direct buttons as actions on the combined element.
            .accessibilityElement(children: .combine)
            .accessibilityLabel(a11yLabel)
        }
        .background(K.bg.ignoresSafeArea())
    }

    /// Spoken summary for the entire StreakScene. Mirrors what a
    /// sighted kid sees: the new streak count, the streak unit, and
    /// the milestone headline + subhead when present.
    private var a11yLabel: String {
        var parts: [String] = ["\(current) day streak"]
        if let m = milestone {
            parts.append(m.headline)
            parts.append(m.subhead)
        }
        return parts.joined(separator: ". ")
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
                    .font(.scaledSystem(size: 24, weight: .bold))
                    .foregroundStyle(.white)
            }

            VStack(spacing: 4) {
                Text(m.headline)
                    .font(.scaledSystem(size: 20, weight: .black, design: .rounded))
                    .foregroundStyle(K.text)
                    .multilineTextAlignment(.center)
                    .lineSpacing(2)

                Text(m.subhead)
                    .font(.scaledSystem(size: 14, weight: .medium, design: .rounded))
                    .foregroundStyle(K.dim)
            }

            HStack(spacing: 10) {
                Button(action: { onShare?() }) {
                    Text("Share this")
                        .font(.scaledSystem(size: 15, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(K.teal)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
                }
                .buttonStyle(.plain)

                Button(action: { onDone?() }) {
                    Text("Done")
                        .font(.scaledSystem(size: 15, weight: .semibold, design: .rounded))
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

    /// A8 — async choreography. Every step awaits `Task.sleep` so
    /// SwiftUI's `.task` cancellation propagates and the scene unwinds
    /// cleanly mid-animation. Pre-A8 ran on DispatchQueue.main.asyncAfter
    /// blocks with no cancellation hook.
    private func runChoreography(at center: CGPoint) async {
        if reduceMotion {
            // Static end-state — no flame animation, no rings, no particle
            // burst, no continuous sparkles. Number jumps to current.
            flameScale = 1.0
            flameOpacity = 1.0
            numberTrigger = true
            glowOpacity = 1.0
            milestoneOffset = 0
            milestoneOpacity = 1.0
            return
        }

        do {
            // 300ms: flame enters with overshoot
            try await Task.sleep(nanoseconds: 300_000_000)
            try Task.checkCancellation()
            withAnimation(K.springOvershoot) {
                flameScale = 1.0
                flameOpacity = 1.0
            }

            // 550ms: number rolls up
            try await Task.sleep(nanoseconds: 250_000_000) // +550ms
            try Task.checkCancellation()
            numberTrigger = true

            // 600ms: glow fades in
            try await Task.sleep(nanoseconds: 50_000_000) // +600ms
            try Task.checkCancellation()
            withAnimation(.easeOut(duration: 0.8)) {
                glowOpacity = 1.0
            }

            // 700/850/1000ms: 3 expanding rings, 150ms apart
            try await Task.sleep(nanoseconds: 100_000_000) // +700ms
            try Task.checkCancellation()
            spawnRing()
            try await Task.sleep(nanoseconds: 150_000_000) // +850ms
            try Task.checkCancellation()
            spawnRing()

            // 850ms: 70-particle burst (fires alongside second ring)
            particles.burst(at: center, count: 70, minSpeed: 3, maxSpeed: 10, upwardBias: 2)

            try await Task.sleep(nanoseconds: 150_000_000) // +1000ms
            try Task.checkCancellation()
            spawnRing()

            // 1800ms: milestone card slides up
            try await Task.sleep(nanoseconds: 800_000_000) // +1800ms
            try Task.checkCancellation()
            withAnimation(K.springOvershoot) {
                milestoneOffset = 0
                milestoneOpacity = 1.0
            }

            // 2000ms: continuous sparkle timer kicks off (still uses
            // Timer because the prototype is a 200ms repeating emitter
            // for 6s; converting to Task.sleep loop is equivalent but
            // the Timer pattern reads clearer for a sparkle metronome).
            try await Task.sleep(nanoseconds: 200_000_000) // +2000ms
            try Task.checkCancellation()
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
        } catch {
            // Cancellation — view is going away. Leave state at whatever
            // point the cancellation arrived; .onDisappear cleans the
            // sparkleTimer.
            return
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

        // A8 — ring cleanup also moves to Task.sleep. Each spawned
        // ring's removal task is ad-hoc (not bound to .task because
        // multiple rings spawn concurrently); it carries no view
        // state past `rings.removeAll`, so a missed cancellation just
        // leaves a stale ring in the array — harmless once the view
        // unmounts.
        Task { @MainActor [id = ring.id] in
            try? await Task.sleep(nanoseconds: 850_000_000)
            rings.removeAll { $0.id == id }
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
