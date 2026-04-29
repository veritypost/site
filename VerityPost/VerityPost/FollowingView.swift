import SwiftUI

// Wave 4 stub — real implementation in Wave 5a.
// Shows stories the reader is tracking (read ≥1 article, lifecycle ≠ resolved).
struct FollowingView: View {
    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("Following")
                .font(.system(.title2, design: .default, weight: .bold))
                .foregroundColor(VP.text)
            Text("Stories you're tracking will appear here.")
                .font(.subheadline)
                .foregroundColor(VP.dim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
        .navigationTitle("Following")
        .navigationBarTitleDisplayMode(.inline)
    }
}
