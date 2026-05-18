import Foundation

// Codable mirrors of the home_layouts / home_slots / home_slot_items
// tables. Column names + types verified against information_schema on
// 2026-05-18; see also web/src/app/_home/types.ts (the web equivalent).
//
// Schema (public.*) — kept verbatim so future schema drift surfaces at
// compile / decode time instead of silently mis-decoding:
//   home_layouts(id uuid, slug text, name text, description text NULL,
//                status text, variant_of uuid NULL,
//                created_at timestamptz, updated_at timestamptz,
//                created_by uuid NULL, published_at timestamptz NULL,
//                ads_enabled bool)
//   home_slots(id uuid, layout_id uuid, key text, kind text,
//              span smallint, position int, config jsonb,
//              created_at timestamptz, updated_at timestamptz)
//   home_slot_items(id uuid, slot_id uuid, position int,
//                   content_type text, article_id uuid NULL,
//                   ref_id uuid NULL, payload jsonb,
//                   created_at timestamptz)

// MARK: - AnyJSON (jsonb container)
//
// home_slots.config / home_slot_items.payload are jsonb. Swift can't
// pattern-match a free-form JSON object via Codable alone — this minimal
// wrapper preserves the value so config["variant"] / config["source"]
// reads continue to work without dragging in a third-party JSON library.

enum AnyJSON: Codable, Hashable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case object([String: AnyJSON])
    case array([AnyJSON])
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let i = try? c.decode(Int.self) { self = .int(i); return }
        if let d = try? c.decode(Double.self) { self = .double(d); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let arr = try? c.decode([AnyJSON].self) { self = .array(arr); return }
        if let obj = try? c.decode([String: AnyJSON].self) { self = .object(obj); return }
        throw DecodingError.dataCorruptedError(
            in: c,
            debugDescription: "Unsupported JSON scalar"
        )
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .int(let i): try c.encode(i)
        case .double(let d): try c.encode(d)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    var stringValue: String? {
        if case .string(let s) = self { return s }
        return nil
    }
    var intValue: Int? {
        if case .int(let i) = self { return i }
        if case .double(let d) = self { return Int(d) }
        return nil
    }
}

// MARK: - Rows

struct HomeLayoutRow: Decodable {
    let id: String
    let slug: String
    let name: String
    let status: String
    let ads_enabled: Bool?
    // PostgREST nested select — `home_slots(*, home_slot_items(*, articles(...)))`
    // delivers the children alongside the parent in a single round-trip.
    let home_slots: [HomeSlotRow]?
}

struct HomeSlotRow: Decodable {
    let id: String
    let layout_id: String?
    let key: String
    let kind: String          // 'story_card' | 'rail_card' | 'square_row' | 'top_banner' | ...
    let span: Int
    let position: Int
    let config: [String: AnyJSON]?
    let home_slot_items: [HomeSlotItemRow]?

    var variant: String? { config?["variant"]?.stringValue }
    var sourceKey: String? { config?["source"]?.stringValue }
    var configDays: Int? { config?["days"]?.intValue }
}

struct HomeSlotItemRow: Decodable {
    let id: String
    let slot_id: String?
    let position: Int
    let content_type: String      // 'article' | 'ad' | ...
    let article_id: String?
    let ref_id: String?
    let payload: [String: AnyJSON]?
    // Nested article join — PostgREST FK alias matches the schema's
    // fk_home_slot_items_article_id constraint (see database.ts).
    let articles: Story?
}

// MARK: - List-rail row (synthesized client-side)
//
// home_slot_items doesn't carry list-rail rows; web RailCard.tsx fetches
// them per slot. iOS does the same source-specific lookup and produces
// these synthetic rows for the renderer.

struct HomeListRow: Identifiable, Hashable {
    let id: String           // article_id (most_read/most_discussed/recent_updates) or story_id (most_active_timelines)
    let title: String
    let slug: String?        // story slug — what the row links to
    let badge: String?
}
