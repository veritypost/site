import Foundation

/// Lightweight logging shim. In DEBUG builds it writes to stdout via print();
/// in release builds it compiles to a no-op so user data never leaks to the
/// device console or crash reports. Prefer this over raw print() everywhere.
enum Log {
    @inlinable static func d(_ items: Any...) {
        #if DEBUG
        let message = items.map { "\($0)" }.joined(separator: " ")
        print(message)
        #endif
    }
}
