import Foundation
import UIKit

// Ext-Y.4 — adult iOS analytics emitter. Posts to /api/events/batch
// with the same shape the web client uses. Anon-friendly (the route
// rate-limits per IP). Best-effort: any network/parse failure is
// swallowed in production; debug builds log so we can confirm wiring.
//
// Buffering rules mirror the web client: enqueue, flush at 20 events
// OR ~32 KB, force-flush on background.

@MainActor
final class EventsClient {
    static let shared = EventsClient()
    private init() {
        // Force-flush on background so the buffer doesn't get lost when
        // the user closes the app.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
    }

    private struct Event: Codable {
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

    private var buffer: [Event] = []
    private let maxBufferCount = 20
    private let maxEventBytes = 4 * 1024
    private let maxBufferBytes = 32 * 1024

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

    @objc private func handleBackground() {
        flush()
    }

    private func flush() {
        guard !buffer.isEmpty else { return }
        let toSend = buffer
        buffer.removeAll()

        Task.detached { [toSend] in
            let url = SupabaseManager.shared.siteURL
                .appendingPathComponent("api/events/batch")
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            do {
                req.httpBody = try JSONEncoder().encode(["events": toSend])
                _ = try await URLSession.shared.data(for: req)
            } catch {
                #if DEBUG
                print("[EventsClient] flush failed: \(error.localizedDescription)")
                #endif
            }
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
