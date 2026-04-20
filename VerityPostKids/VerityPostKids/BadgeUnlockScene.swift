import SwiftUI

// V3 Badge Unlock scene.
//
// Choreography (from KidModeV3.html badgeNew):
//   300ms:  dim overlay fades in
//   600ms:  badge enters — scale 0.15 → 1.0 with overshoot
//   1100ms: shimmer sweep (conic gradient rotation)
//   1200ms: pulse rings expand outward
//   1300ms: particle burst (50 particles)
//   1800ms: text block (badge title + insight) fades up
//   2000ms: buttons fade up

struct BadgeUnlockScene: View {
    let tierLabel: String          // "Gold Badge"
    let headline: String           // "You spotted a biased headline five times."
    let subhead: String            // "Bias Detection — Level 3"
    let iconName: String           // SF Symbol, e.g. "star.fill"
    let tint: Color                // badge primary color

    var onShare: (() -> Void)? = nil
    var onDone: (() -> Void)? = nil

    // State
    @State private var overlayOpacity: Double = 0
    @State private var badgeScale: CGFloat = 0.15
    @State private var badgeOpacity: Double = 0
    @State private var shimmerRotation: Double = 0
    @State private var shimmerVisible: Bool = false
    @State private var pulseRing1Visible: Bool = false
    @State private var pulseRing1Scale: CGFloat = 1
    @State private var pulseRing1Opacity: Double = 1
    @State private var pulseRing2Visible: Bool = false
    @State private var pulseRing2Scale: CGFloat = 1
    @State private var pulseRing2Opacity: Double = 1

    @State private var textOpacity: Double = 0
    @State private var textOffset: CGFloat = 16
    @State private var buttonsOpacity: Double = 0
    @State private var buttonsOffset: CGFloat = 20

    @StateObject private var particles = ParticleEmitter()

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Background (simulated feed underneath)
                K.bg.ignoresSafeArea()
                VStack(spacing: 8) {
                    ForEach(0..<5, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(K.card)
                            .overlay(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .strokeBorder(K.border, lineWidth: 1)
                            )
                            .frame(height: 56)
                    }
                }
                .padding(.top, 70)
                .padding(.horizontal, 20)

                // Dim overlay
                Color.black.opacity(0.65)
                    .ignoresSafeArea()
                    .opacity(overlayOpacity)

                // Badge + text + buttons
                VStack(spacing: 28) {
                    badgeView
                    textBlock
                    actionButtons
                }
                .padding(.horizontal, 32)
                .frame(maxWidth: .infinity)

                ParticleLayer(emitter: particles)
            }
            .onAppear {
                runChoreography(at: CGPoint(x: geo.size.width / 2, y: geo.size.height * 0.42))
            }
        }
    }

    // MARK: Badge

    private var badgeView: some View {
        ZStack {
            // Pulse rings
            if pulseRing1Visible {
                RoundedRectangle(cornerRadius: 50, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.4), lineWidth: 3)
                    .frame(width: 172, height: 172)
                    .scaleEffect(pulseRing1Scale)
                    .opacity(pulseRing1Opacity)
            }
            if pulseRing2Visible {
                RoundedRectangle(cornerRadius: 50, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.4), lineWidth: 3)
                    .frame(width: 172, height: 172)
                    .scaleEffect(pulseRing2Scale)
                    .opacity(pulseRing2Opacity)
            }

            // Badge shape
            RoundedRectangle(cornerRadius: 44, style: .continuous)
                .fill(LinearGradient(
                    colors: [tint, Color(hex: "FDE68A"), K.coral],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(width: 160, height: 160)
                .shadow(color: tint.opacity(0.45), radius: 40, y: 20)
                .overlay(
                    // Shimmer conic sweep
                    AngularGradient(
                        colors: [
                            .clear, .clear,
                            .white.opacity(0.5),
                            .clear, .clear
                        ],
                        center: .center
                    )
                    .rotationEffect(.degrees(shimmerRotation))
                    .opacity(shimmerVisible ? 1 : 0)
                    .blendMode(.plusLighter)
                    .mask(
                        RoundedRectangle(cornerRadius: 44, style: .continuous)
                            .frame(width: 160, height: 160)
                    )
                )
                .overlay(
                    Image(systemName: iconName)
                        .font(.scaledSystem(size: 62, weight: .heavy))
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.2), radius: 4, y: 2)
                )
        }
        .scaleEffect(badgeScale)
        .opacity(badgeOpacity)
    }

    // MARK: Text block

    private var textBlock: some View {
        VStack(spacing: 8) {
            Text(tierLabel)
                .font(.scaledSystem(size: 12, weight: .heavy, design: .rounded))
                .kerning(1.5)
                .textCase(.uppercase)
                .foregroundStyle(tint)

            Text(headline)
                .font(.scaledSystem(size: 24, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .lineSpacing(3)
                .frame(maxWidth: 280)

            Text(subhead)
                .font(.scaledSystem(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.45))
        }
        .opacity(textOpacity)
        .offset(y: textOffset)
    }

    // MARK: Buttons

    private var actionButtons: some View {
        HStack(spacing: 10) {
            Button(action: { onShare?() }) {
                Text("Share")
                    .font(.scaledSystem(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.vertical, 14)
                    .padding(.horizontal, 32)
                    .background(K.teal)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .shadow(color: K.teal.opacity(0.3), radius: 12, y: 4)
            }
            .buttonStyle(.plain)

            Button(action: { onDone?() }) {
                Text("Done")
                    .font(.scaledSystem(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.6))
                    .padding(.vertical, 14)
                    .padding(.horizontal, 24)
                    .background(Color.white.opacity(0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .strokeBorder(Color.white.opacity(0.15), lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .opacity(buttonsOpacity)
        .offset(y: buttonsOffset)
    }

    // MARK: Choreography

    private func runChoreography(at center: CGPoint) {
        // 300ms: dim overlay
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            withAnimation(.easeOut(duration: 0.4)) {
                overlayOpacity = 1.0
            }
        }

        // 600ms: badge enters with overshoot
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            withAnimation(K.springOvershoot) {
                badgeScale = 1.0
                badgeOpacity = 1.0
            }
        }

        // 1100ms: shimmer sweep
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.1) {
            shimmerVisible = true
            withAnimation(.linear(duration: 1.0)) {
                shimmerRotation = 360
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                withAnimation(.easeOut(duration: 0.3)) {
                    shimmerVisible = false
                }
            }
        }

        // 1200ms: pulse ring 1
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            pulseRing1Visible = true
            withAnimation(.easeOut(duration: 0.6)) {
                pulseRing1Scale = 1.6
                pulseRing1Opacity = 0
            }
        }
        // Ring 2 150ms later
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.35) {
            pulseRing2Visible = true
            withAnimation(.easeOut(duration: 0.6)) {
                pulseRing2Scale = 1.6
                pulseRing2Opacity = 0
            }
        }

        // 1300ms: particle burst
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.3) {
            particles.burst(
                at: center,
                count: 50,
                minSpeed: 2,
                maxSpeed: 7,
                upwardBias: 0,
                gravity: 0.05
            )
        }

        // 1800ms: text
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            withAnimation(.easeOut(duration: 0.5)) {
                textOpacity = 1.0
                textOffset = 0
            }
        }

        // 2000ms: buttons
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            withAnimation(.easeOut(duration: 0.5)) {
                buttonsOpacity = 1.0
                buttonsOffset = 0
            }
        }
    }
}

#Preview("Badge — Gold, Bias Detection L3") {
    BadgeUnlockScene(
        tierLabel: "Gold Badge",
        headline: "You spotted a biased headline five times.",
        subhead: "Bias Detection — Level 3",
        iconName: "star.fill",
        tint: K.gold
    )
}
