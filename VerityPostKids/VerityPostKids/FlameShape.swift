import SwiftUI

// Animated teardrop flame — SwiftUI port of the morphing SVG path
// from KidModeV3.html. Two layers (outer flame + inner core) breathe
// on independent phases.

struct KidFlame: View {
    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let outerT = CGFloat(0.5 + 0.5 * sin(t * 2 * .pi / 1.8))  // 1.8s cycle
            let innerT = CGFloat(0.5 + 0.5 * sin(t * 2 * .pi / 1.4))  // 1.4s cycle

            ZStack {
                FlamePath(t: outerT)
                    .fill(
                        LinearGradient(
                            colors: [K.tealDark, K.teal, K.gold, .white],
                            startPoint: .bottom,
                            endPoint: .top
                        )
                    )
                InnerFlamePath(t: innerT)
                    .fill(
                        LinearGradient(
                            colors: [
                                .white.opacity(0.4),
                                .white.opacity(0.9)
                            ],
                            startPoint: .bottom,
                            endPoint: .top
                        )
                    )
            }
        }
    }
}

/// Outer flame silhouette. t = 0 (rest) → 1 (peak extension)
private struct FlamePath: Shape {
    var t: CGFloat

    var animatableData: CGFloat {
        get { t }
        set { t = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 100
        var path = Path()

        let tipY = lerp(10, 5, t)
        let waistLeftX = lerp(20, 15, t)
        let waistLeftY = lerp(45, 42, t)
        let waistRightX = lerp(80, 85, t)
        let waistRightY = lerp(45, 45, t)
        let baseLY = lerp(65, 68, t)
        let baseRY = lerp(65, 68, t)
        let bottomY = lerp(95, 98, t)

        let p = { (x: CGFloat, y: CGFloat) -> CGPoint in
            CGPoint(x: rect.minX + x * s, y: rect.minY + y * s)
        }

        path.move(to: p(50, tipY))
        path.addCurve(
            to: p(20, baseLY),
            control1: p(50, tipY),
            control2: p(waistLeftX, waistLeftY)
        )
        path.addCurve(
            to: p(50, bottomY),
            control1: p(20, 82),
            control2: p(33, 95)
        )
        path.addCurve(
            to: p(80, baseRY),
            control1: p(67, 95),
            control2: p(80, 82)
        )
        path.addCurve(
            to: p(50, tipY),
            control1: p(waistRightX, waistRightY),
            control2: p(50, tipY)
        )
        path.closeSubpath()
        return path
    }
}

/// Inner flame (brighter core, smaller).
private struct InnerFlamePath: Shape {
    var t: CGFloat

    var animatableData: CGFloat {
        get { t }
        set { t = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 100
        var path = Path()

        let tipY = lerp(50, 45, t)
        let leftX = lerp(38, 35, t)
        let leftY = lerp(75, 76, t)
        let rightX = lerp(62, 65, t)
        let rightY = lerp(75, 76, t)
        let bottomY = lerp(88, 92, t)

        let p = { (x: CGFloat, y: CGFloat) -> CGPoint in
            CGPoint(x: rect.minX + x * s, y: rect.minY + y * s)
        }

        path.move(to: p(50, tipY))
        path.addCurve(
            to: p(leftX, bottomY - 6),
            control1: p(50, tipY),
            control2: p(leftX, leftY)
        )
        path.addCurve(
            to: p(50, bottomY),
            control1: p(leftX, bottomY - 2),
            control2: p(43, bottomY)
        )
        path.addCurve(
            to: p(rightX, bottomY - 6),
            control1: p(57, bottomY),
            control2: p(rightX, bottomY - 2)
        )
        path.addCurve(
            to: p(50, tipY),
            control1: p(rightX, rightY),
            control2: p(50, tipY)
        )
        path.closeSubpath()
        return path
    }
}

private func lerp(_ a: CGFloat, _ b: CGFloat, _ t: CGFloat) -> CGFloat {
    a + (b - a) * max(0, min(1, t))
}

#Preview("Flame") {
    ZStack {
        K.bg.ignoresSafeArea()
        KidFlame()
            .frame(width: 160, height: 160)
            .shadow(color: K.teal.opacity(0.4), radius: 24, y: 8)
    }
}
