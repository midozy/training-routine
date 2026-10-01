import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Shared by the app (starts/updates the Live Activity) and the RestTimerWidget extension (draws it on the
/// lock screen and in the Dynamic Island). ONE Live Activity runs for the whole workout: the current exercise and
/// set while you train, and the rest countdown between sets.
@available(iOS 16.1, *)
struct WorkoutActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var phase: String        // "train" | "rest"
        var exercise: String     // the exercise you are on (while resting: the one you will do next)
        var setText: String      // "Set 2 of 4"
        var detail: String       // "82.5 kg × 8"
        var setsDone: Int        // across the whole workout
        var setsTotal: Int
        var restStart: Date?     // rest only
        var restEnd: Date?
        var nextUp: String       // rest only: "Barbell Bench Press · Set 2 — 85 kg × 8"
    }
    var dayName: String
    var startedAt: Date          // drives the elapsed-time clock
}
#endif
