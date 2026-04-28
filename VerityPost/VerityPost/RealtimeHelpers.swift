import Foundation
import Supabase

/// A37 — guarantees that `await channel.unsubscribe()` runs whenever the
/// hosting Task ends, including the cancellation paths that drop right
/// past a trailing `await` after a `for await` loop.
///
/// Usage:
/// ```
/// let channel = client.channel("comments-story-\(id)")
/// let stream = channel.postgresChange(InsertAction.self, schema: "public",
///                                     table: "comments", filter: "...")
/// await drainRealtimeChannel(channel, stream: stream) { change in
///     // handle event
/// }
/// ```
///
/// The channel must already have its `postgresChange` registrations set
/// up before this is called — the helper subscribes the channel itself
/// and owns the cleanup. On normal stream end OR Task cancellation the
/// cleanup path fires `await channel.unsubscribe()` inside a detached,
/// non-cancelled hop so the server-side socket actually releases.
/// Without this, a `.task(id:)`-driven view that flips its id (story.id,
/// conversation.id) leaks the prior channel to the broker until the
/// websocket itself drops.
@MainActor
func drainRealtimeChannel<Action: Sendable, S: AsyncSequence & Sendable>(
    _ channel: RealtimeChannelV2,
    stream: S,
    onChange: @MainActor (Action) async -> Void
) async where S.Element == Action {
    await channel.subscribe()
    await withTaskCancellationHandler {
        do {
            for try await change in stream {
                if Task.isCancelled { break }
                await onChange(change)
            }
        } catch {
            // AsyncStream-erased streams don't throw; preserve the catch
            // path for any future stream type that does. CancellationError
            // is the only expected case and we treat it as normal exit.
        }
        // Loop drained naturally — fire the unsubscribe inside a
        // detached hop so it actually round-trips to the broker even if
        // the parent Task is mid-cancel.
        Task.detached { @Sendable in
            await channel.unsubscribe()
        }
    } onCancel: {
        // Parent Task got cancelled (view re-keyed, view dismissed).
        // Detach the unsubscribe so the socket releases server-side.
        Task.detached { @Sendable in
            await channel.unsubscribe()
        }
    }
}
