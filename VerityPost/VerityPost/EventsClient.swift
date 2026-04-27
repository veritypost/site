import Foundation
import UIKit

// Ext-Y.4 — adult iOS analytics emitter. Posts to /api/events/batch
// with the same shape the web client uses. Anon-friendly (the route
// rate-limits per IP). Best-effort: any network/parse failure is
// swallowed in production; debug builds log so we can confirm wiring.
//
// Buffering rules mirror the web client: enqueue, flush at 20 events
// OR ~32 KB, force-flush on background.
//
// Resilience model (T182 / T190 / T249):
//   - Each flush moves events into `pendingFlushBatches[id]`. The HTTP
//     task removes the batch only after a 2xx response, so a kill
//     mid-flight leaves the batch on disk.
//   - On background we synchronously persist `pendingFlushBatches`
//     before any async hop — the system gives us ~5s of CPU and the
//     persist must land inside it. We then await the in-flight HTTP
//     with a short timeout; if the network doesn't return in time we
//     cancel and rely on the already-persisted snapshot.
//   - On cold start we hydrate persisted batches and re-flush them
//     before accepting new traffic.

// File-private so the persistence helper below can spell the type.
fileprivate struct EventsClientEvent: Codable {
    let event: String
    let surface: String
    let occurred_at: String
    let session_id: String
    let device_id: String
    let page: String?
    let content_type: String?
    let article_id: String?
    let payload: [String: AnyCodable]?
}

@MainActor
final class EventsClient {
    static let shared = EventsClient()

    private init() {
        // Hydrate batches that didn't confirm delivery before the last
        // termination, then re-flush them on the same dispatch path as
        // live traffic.
        self.pendingFlushBatches = persistence.load()

        // Block-based observer captures `[weak self]` and is delivered
        // on the main queue so we stay synchronous-on-MainActor inside
        // the system's background CPU window — see `handleBackground`.
        self.backgroundObserverToken = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.handleBackground()
            }
        }

        if !pendingFlushBatches.isEmpty {
            redispatchPendingBatches()
        }
    }

    deinit {
        // Singleton today, but explicit cleanup keeps this safe if a
        // non-singleton variant (per-surface emitter, test double) is
        // ever introduced.
        if let token = backgroundObserverToken {
            NotificationCenter.default.removeObserver(token)
        }
    }

    private typealias Event = EventsClientEvent

    private var buffer: [Event] = []
    private let maxBufferCount = 20
    private let maxEventBytes = 4 * 1024
    private let maxBufferBytes = 32 * 1024

    // Dispatched-but-not-yet-confirmed batches. Keyed by id so an
    // entry can be removed exactly when its HTTP call returns 2xx,
    // independent of other concurrent batches.
    private var pendingFlushBatches: [UUID: [Event]] = [:]
    private var inFlightTasks: [UUID: Task<Void, Never>] = [:]

    private let persistence = EventsPersistence()

    // Window we'll wait for the in-flight HTTP to drain on background
    // before falling back to the persisted snapshot. Stays well inside
    // the ~5s background CPU budget.
    private let backgroundDrainTimeout: TimeInterval = 3.0

    private var backgroundObserverToken: NSObjectProtocol?

    private static let isoFmt = ISO8601DateFormatter()
    private let sessionId: String = UUID().uuidString
    private var deviceId: String {
        if let existing = UserDefaults.standard.string(forKey: "vp.device_id") {
            return existing
        }
        let fresh = UUID().uuidString
        UserDefaults.standard.set(fresh, forKey: "vp.device_id")
        return fresh
    }

    /// Public entry point. `event` matches the web event taxonomy
    /// (page_view, story_view, quiz_attempt, etc). Payload is optional
    /// per-event metadata.
    func track(
        event: String,
        page: String? = nil,
        content_type: String? = nil,
        article_id: String? = nil,
        payload: [String: Any]? = nil
    ) {
        let evt = Event(
            event: event,
            surface: "ios_adult",
            occurred_at: EventsClient.isoFmt.string(from: Date()),
            session_id: sessionId,
            device_id: deviceId,
            page: page,
            content_type: content_type,
            article_id: article_id,
            payload: payload?.mapValues(AnyCodable.init)
        )

        // Per-event size guard. Drop oversized events with a debug log.
        if let data = try? JSONEncoder().encode(evt), data.count > maxEventBytes {
            #if DEBUG
            print("[EventsClient] dropped \(event): \(data.count) bytes > \(maxEventBytes)")
            #endif
            return
        }

        buffer.append(evt)

        let bufferBytes = (try? JSONEncoder().encode(buffer))?.count ?? 0
        if buffer.count >= maxBufferCount || bufferBytes >= maxBufferBytes {
            flush()
        }
    }

    private func handleBackground() {
        // Move whatever is buffered into a pending batch first, so the
        // synchronous persist below covers it.
        flush()

        // Persist synchronously inside the background CPU window. Even
        // if the OS suspends us before the drain task below runs, the
        // next launch will rehydrate everything currently in
        // `pendingFlushBatches`.
        persistence.save(pendingFlushBatches)

        // Best-effort drain: race the in-flight HTTP awaits against a
        // short timer; whichever finishes first wins, the rest get
        // cancelled. Anything cancelled is already on disk and will
        // re-flush on next launch.
        let snapshot = inFlightTasks
        guard !snapshot.isEmpty else { return }

        Task { [weak self, snapshot, timeout = backgroundDrainTimeout] in
            let timedOut = await withTaskGroup(of: Bool.self) { group -> Bool in
                group.addTask {
                    await withTaskGroup(of: Void.self) { inner in
                        for (_, task) in snapshot {
                            inner.addTask { await task.value }
                        }
                        for await _ in inner { }
                    }
                    return false
                }
                group.addTask {
                    try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                    return true
                }
                let first = await group.next() ?? false
                group.cancelAll()
                return first
            }
            if timedOut {
                for (_, task) in snapshot { task.cancel() }
            }
            // Re-persist after the drain in case any batch confirmed
            // and self-removed during the window.
            await self?.persistCurrent()
        }
    }

    private func persistCurrent() {
        persistence.save(pendingFlushBatches)
    }

    private func flush() {
        guard !buffer.isEmpty else { return }
        let batch = buffer
        buffer.removeAll()
        dispatchBatch(batch, id: UUID())
    }

    private func redispatchPendingBatches() {
        // Re-dispatch hydrated batches under their existing ids so a
        // success response removes the same entry persistence wrote.
        // Collect empty entries first to avoid mutating the dictionary
        // mid-iteration (exclusive-access violation).
        let emptyIds = pendingFlushBatches.compactMap { $0.value.isEmpty ? $0.key : nil }
        for id in emptyIds {
            pendingFlushBatches.removeValue(forKey: id)
        }
        for (id, batch) in pendingFlushBatches {
            startHTTPTask(for: id, batch: batch)
        }
        if !emptyIds.isEmpty {
            // Disk may now disagree; rewrite so it matches memory.
            persistence.save(pendingFlushBatches)
        }
    }

    private func dispatchBatch(_ batch: [Event], id: UUID) {
        pendingFlushBatches[id] = batch
        startHTTPTask(for: id, batch: batch)
    }

    private func startHTTPTask(for id: UUID, batch: [Event]) {
        // Inherit MainActor so the success-removal hop back is free —
        // URLSession itself runs off-actor regardless.
        let task = Task { [weak self] in
            let delivered = await EventsClient.send(batch: batch)
            // Only confirmed 2xx removes the batch. Cancellations and
            // network errors leave it in `pendingFlushBatches` for the
            // next background-persist or cold-start re-flush.
            if delivered {
                await self?.markBatchDelivered(id: id)
            } else {
                await self?.releaseInFlightHandle(id: id)
            }
        }
        inFlightTasks[id] = task
    }

    private func markBatchDelivered(id: UUID) {
        pendingFlushBatches.removeValue(forKey: id)
        inFlightTasks.removeValue(forKey: id)
        // Keep the persisted file in sync — otherwise a kill right
        // after success would re-flush a delivered batch on next launch.
        persistence.save(pendingFlushBatches)
    }

    private func releaseInFlightHandle(id: UUID) {
        // Drop the task handle but leave the batch in
        // `pendingFlushBatches` so the next background-persist or cold
        // start picks it up.
        inFlightTasks.removeValue(forKey: id)
    }

    /// Returns true on a 2xx response, false on any failure
    /// (cancellation, network error, non-2xx status). `nonisolated` so
    /// JSON encoding and the URLSession await don't pin MainActor
    /// while the actor services other work.
    nonisolated private static func send(batch: [Event]) async -> Bool {
        let url = SupabaseManager.shared.siteURL
            .appendingPathComponent("api/events/batch")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            req.httpBody = try JSONEncoder().encode(["events": batch])
            let (_, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                #if DEBUG
                let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
                print("[EventsClient] flush rejected: status \(code)")
                #endif
                return false
            }
            return true
        } catch {
            #if DEBUG
            print("[EventsClient] flush failed: \(error.localizedDescription)")
            #endif
            return false
        }
    }
}

/// Disk-backed snapshot of `pendingFlushBatches`. Single JSON file in
/// Application Support so it's user-invisible, included in iCloud
/// backups (low-volume telemetry, fine to back up), and isolated from
/// UserDefaults churn.
private struct EventsPersistence {
    private struct Snapshot: Codable {
        let version: Int
        let batches: [String: [EventsClientEvent]]
    }

    private let fileURL: URL = {
        let fm = FileManager.default
        let base = (try? fm.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? fm.temporaryDirectory
        let dir = base.appendingPathComponent("VerityPost", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("events_pending.json")
    }()

    func save(_ batches: [UUID: [EventsClientEvent]]) {
        do {
            if batches.isEmpty {
                // Drop the file entirely so an empty pending state
                // doesn't survive across reinstalls of older binaries.
                try? FileManager.default.removeItem(at: fileURL)
                return
            }
            let snapshot = Snapshot(
                version: 1,
                batches: Dictionary(uniqueKeysWithValues: batches.map { ($0.key.uuidString, $0.value) })
            )
            let data = try JSONEncoder().encode(snapshot)
            try data.write(to: fileURL, options: [.atomic])
        } catch {
            #if DEBUG
            print("[EventsPersistence] save failed: \(error.localizedDescription)")
            #endif
        }
    }

    func load() -> [UUID: [EventsClientEvent]] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return [:] }
        do {
            let data = try Data(contentsOf: fileURL)
            let snapshot = try JSONDecoder().decode(Snapshot.self, from: data)
            var out: [UUID: [EventsClientEvent]] = [:]
            for (key, batch) in snapshot.batches {
                guard let id = UUID(uuidString: key) else { continue }
                out[id] = batch
            }
            return out
        } catch {
            #if DEBUG
            print("[EventsPersistence] load failed: \(error.localizedDescription)")
            #endif
            // Corrupt file — nuke it so it can't pin us forever.
            try? FileManager.default.removeItem(at: fileURL)
            return [:]
        }
    }
}

/// Type-erased Codable wrapper so heterogeneous payload dictionaries
/// can be encoded without a per-event Codable struct.
private struct AnyCodable: Codable {
    let value: Any
    init(_ value: Any) { self.value = value }
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let v as String: try container.encode(v)
        case let v as Int: try container.encode(v)
        case let v as Double: try container.encode(v)
        case let v as Bool: try container.encode(v)
        case is NSNull: try container.encodeNil()
        default:
            // Fallback — stringify unknown types
            try container.encode(String(describing: value))
        }
    }
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self.value = NSNull()
        } else if let v = try? container.decode(String.self) {
            self.value = v
        } else if let v = try? container.decode(Int.self) {
            self.value = v
        } else if let v = try? container.decode(Double.self) {
            self.value = v
        } else if let v = try? container.decode(Bool.self) {
            self.value = v
        } else {
            self.value = NSNull()
        }
    }
}
