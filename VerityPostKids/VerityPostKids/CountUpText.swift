import SwiftUI

// Number that animates from `from` to `to` over `duration`.
// SwiftUI port of the rolling-number effect in KidModeV3.html.

struct CountUpText: View, Animatable {
    var value: Double
    let font: Font
    let formatter: (Int) -> String

    init(
        value: Double,
        font: Font = .system(size: 72, weight: .black, design: .rounded),
        formatter: @escaping (Int) -> String = { "\($0)" }
    ) {
        self.value = value
        self.font = font
        self.formatter = formatter
    }

    var animatableData: Double {
        get { value }
        set { value = newValue }
    }

    var body: some View {
        Text(formatter(Int(value.rounded())))
            .font(font)
            .monospacedDigit()
    }
}

/// Convenience wrapper that animates from `from` → `to` when `trigger` flips true.
struct AnimatedCountUp: View {
    let from: Int
    let to: Int
    let duration: Double
    let trigger: Bool
    let font: Font

    @State private var current: Double

    init(
        from: Int = 0,
        to: Int,
        duration: Double = 0.6,
        trigger: Bool = true,
        font: Font = .system(size: 72, weight: .black, design: .rounded)
    ) {
        self.from = from
        self.to = to
        self.duration = duration
        self.trigger = trigger
        self.font = font
        self._current = State(initialValue: Double(from))
    }

    var body: some View {
        CountUpText(value: current, font: font)
            .onAppear {
                if trigger { start() }
            }
            .onChange(of: trigger) { _, newValue in
                if newValue { start() }
            }
    }

    private func start() {
        current = Double(from)
        withAnimation(.easeOut(duration: duration)) {
            current = Double(to)
        }
    }
}

#Preview("Count up 0→7") {
    struct Demo: View {
        @State private var go = false
        var body: some View {
            VStack(spacing: 32) {
                AnimatedCountUp(from: 0, to: 7, duration: 0.6, trigger: go)
                    .foregroundStyle(K.text)
                Button(go ? "Reset" : "Animate") { go.toggle() }
                    .buttonStyle(.borderedProminent)
            }
            .padding()
        }
    }
    return Demo()
}
