import SwiftUI

// Reusable particle system for kid-moment celebrations.
// SwiftUI port of the Canvas-based ParticleSystem from KidModeV3.html.

enum ParticleShape: CaseIterable {
    case circle, star, bar, diamond, rect
}

struct Particle: Identifiable {
    let id = UUID()
    var x: CGFloat
    var y: CGFloat
    var vx: CGFloat
    var vy: CGFloat
    var color: Color
    var size: CGFloat
    var life: Double
    let maxLife: Double
    var gravity: CGFloat
    var drag: CGFloat
    let shape: ParticleShape
    var rotation: Double
    var rotationSpeed: Double

    var isDead: Bool { life <= 0 }
    var alpha: Double { max(0, life / maxLife) }

    mutating func step() {
        vy += gravity
        vx *= drag
        vy *= drag
        x += vx
        y += vy
        rotation += rotationSpeed
        life -= 1
    }
}

@MainActor
final class ParticleEmitter: ObservableObject {
    @Published var particles: [Particle] = []

    func emit(
        at point: CGPoint,
        velocity: CGVector,
        color: Color = K.teal,
        size: CGFloat = 3,
        life: Double = 40,
        gravity: CGFloat = 0.08,
        drag: CGFloat = 0.97,
        shape: ParticleShape = .circle
    ) {
        particles.append(Particle(
            x: point.x, y: point.y,
            vx: velocity.dx, vy: velocity.dy,
            color: color, size: size,
            life: life, maxLife: life,
            gravity: gravity, drag: drag,
            shape: shape,
            rotation: Double.random(in: 0..<(2 * .pi)),
            rotationSpeed: Double.random(in: -0.15...0.15)
        ))
    }

    /// Radial burst — streak milestone, badge unlock, quiz pass.
    func burst(
        at point: CGPoint,
        count: Int = 60,
        minSpeed: CGFloat = 2,
        maxSpeed: CGFloat = 8,
        upwardBias: CGFloat = 0,
        gravity: CGFloat = 0.1
    ) {
        for i in 0..<count {
            let angle = (Double(i) / Double(count)) * 2 * .pi + Double.random(in: -0.1...0.1)
            let speed = CGFloat.random(in: minSpeed...maxSpeed)
            let vx = cos(angle) * Double(speed)
            let vy = sin(angle) * Double(speed) - Double(upwardBias)
            let shape = ParticleShape.allCases.randomElement() ?? .circle
            let color = K.particleColors.randomElement() ?? K.teal
            emit(
                at: point,
                velocity: CGVector(dx: vx, dy: vy),
                color: color,
                size: CGFloat.random(in: 2...8),
                life: Double.random(in: 40...80),
                gravity: gravity,
                drag: 0.97,
                shape: shape
            )
        }
    }

    /// Gentle upward sparkle — typewriter keystrokes, ongoing flame embers.
    func sparkle(at point: CGPoint, colors: [Color] = [K.teal, K.gold, .white]) {
        let color = colors.randomElement() ?? K.teal
        emit(
            at: point,
            velocity: CGVector(
                dx: CGFloat.random(in: -1.5...1.5),
                dy: CGFloat.random(in: -3 ... -1)
            ),
            color: color,
            size: CGFloat.random(in: 1.5...3.5),
            life: Double.random(in: 25...45),
            gravity: 0.04,
            drag: 0.97,
            shape: .circle
        )
    }

    func tick() {
        particles = particles.compactMap { p in
            var p = p
            p.step()
            return p.isDead ? nil : p
        }
    }

    func clear() { particles.removeAll() }
}

struct ParticleLayer: View {
    @ObservedObject var emitter: ParticleEmitter

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: false)) { timeline in
            Canvas { ctx, _ in
                for p in emitter.particles {
                    ctx.drawLayer { layer in
                        layer.opacity = p.alpha
                        layer.translateBy(x: p.x, y: p.y)
                        layer.rotate(by: .radians(p.rotation))
                        drawShape(p, in: &layer)
                    }
                }
            }
            .onChange(of: timeline.date) { _, _ in
                emitter.tick()
            }
        }
        .allowsHitTesting(false)
    }

    private func drawShape(_ p: Particle, in ctx: inout GraphicsContext) {
        let s = p.size * (0.4 + 0.6 * CGFloat(p.alpha))
        switch p.shape {
        case .circle:
            let path = Path(ellipseIn: CGRect(x: -s, y: -s, width: s * 2, height: s * 2))
            ctx.fill(path, with: .color(p.color))
        case .star:
            ctx.fill(starPath(outer: s, inner: s * 0.4, points: 5), with: .color(p.color))
        case .bar:
            ctx.fill(Path(CGRect(x: -s * 0.25, y: -s, width: s * 0.5, height: s * 2)), with: .color(p.color))
        case .diamond:
            var path = Path()
            path.move(to: CGPoint(x: 0, y: -s))
            path.addLine(to: CGPoint(x: s * 0.7, y: 0))
            path.addLine(to: CGPoint(x: 0, y: s))
            path.addLine(to: CGPoint(x: -s * 0.7, y: 0))
            path.closeSubpath()
            ctx.fill(path, with: .color(p.color))
        case .rect:
            ctx.fill(Path(CGRect(x: -s * 0.6, y: -s * 0.3, width: s * 1.2, height: s * 0.6)), with: .color(p.color))
        }
    }

    private func starPath(outer: CGFloat, inner: CGFloat, points: Int) -> Path {
        var path = Path()
        let step = CGFloat.pi / CGFloat(points)
        var rot: CGFloat = -.pi / 2
        path.move(to: CGPoint(x: cos(rot) * outer, y: sin(rot) * outer))
        for _ in 0..<points {
            rot += step
            path.addLine(to: CGPoint(x: cos(rot) * inner, y: sin(rot) * inner))
            rot += step
            path.addLine(to: CGPoint(x: cos(rot) * outer, y: sin(rot) * outer))
        }
        path.closeSubpath()
        return path
    }
}

#Preview("Particle burst") {
    struct Demo: View {
        @StateObject private var emitter = ParticleEmitter()
        var body: some View {
            ZStack {
                Color.black.ignoresSafeArea()
                Button("Burst") {
                    emitter.burst(at: CGPoint(x: 195, y: 380))
                }
                .foregroundStyle(.white)
                .font(.title2.bold())
                ParticleLayer(emitter: emitter)
            }
        }
    }
    return Demo()
}
