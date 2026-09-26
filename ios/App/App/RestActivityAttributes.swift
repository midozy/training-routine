import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Shared by the app (starts/updates the Live Activity) and the RestTimerWidget
/// extension (draws it on the lock screen and in the Dynamic Island).
@available(iOS 16.1, *)
struct RestActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var startAt: Date
        var endAt: Date
        var nextUp: String
    }
    var title: String
}
#endif
