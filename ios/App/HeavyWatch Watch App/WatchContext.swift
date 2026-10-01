import Foundation

/// The workout snapshot mirrored from the phone (see HeavyWatchPlugin.pushContext on the iOS side). One struct,
/// rebuilt from whatever WCSession's applicationContext last delivered — never partially updated.
nonisolated struct WatchContext: Equatable, Sendable {
    var active = false            // a workout is in progress; false means "nothing to show"
    var dayName = ""
    var exercise = ""
    var setText = ""               // "Set 2 of 4"
    var detail = ""                // "82.5 kg × 8" (what's currently logged, if anything)
    var setsDone = 0
    var setsTotal = 0
    var restStart: Date?
    var restEnd: Date?
    var nextUp = ""
    var sessionId = 0
    var planExerciseId = 0
    var exerciseId = 0
    var setNumber = 0              // 1-based: the set a quick-log from here will be saved against
    var units = "kg"
    var suggestedWeight = ""       // what the phone would prefill — the Watch starts from the same number
    var suggestedReps = ""

    var isResting: Bool { active && restEnd != nil }

    static func from(_ dict: [String: Any]) -> WatchContext {
        var c = WatchContext()
        c.active = dict["active"] as? Bool ?? false
        c.dayName = dict["dayName"] as? String ?? ""
        c.exercise = dict["exercise"] as? String ?? ""
        c.setText = dict["setText"] as? String ?? ""
        c.detail = dict["detail"] as? String ?? ""
        c.setsDone = dict["setsDone"] as? Int ?? 0
        c.setsTotal = dict["setsTotal"] as? Int ?? 0
        if let v = dict["restStart"] as? Double { c.restStart = Date(timeIntervalSince1970: v / 1000) }
        if let v = dict["restEnd"] as? Double { c.restEnd = Date(timeIntervalSince1970: v / 1000) }
        c.nextUp = dict["nextUp"] as? String ?? ""
        c.sessionId = dict["sessionId"] as? Int ?? 0
        c.planExerciseId = dict["planExerciseId"] as? Int ?? 0
        c.exerciseId = dict["exerciseId"] as? Int ?? 0
        c.setNumber = dict["setNumber"] as? Int ?? 0
        c.units = dict["units"] as? String ?? "kg"
        c.suggestedWeight = dict["suggestedWeight"] as? String ?? ""
        c.suggestedReps = dict["suggestedReps"] as? String ?? ""
        return c
    }
}

/// A set quick-logged on the Watch, sent to the phone via `transferUserInfo` (queued delivery — survives the
/// Watch being briefly out of range). The phone only accepts it if it still matches the set it last advertised.
nonisolated struct QuickLogMessage {
    var sessionId: Int
    var planExerciseId: Int
    var exerciseId: Int
    var setNumber: Int
    var weight: Double     // display units (whatever `units` said)
    var reps: Int
    var units: String
    var clientId: String = UUID().uuidString

    var dict: [String: Any] {
        ["type": "quickLog", "sessionId": sessionId, "planExerciseId": planExerciseId, "exerciseId": exerciseId,
         "setNumber": setNumber, "weight": weight, "reps": reps, "units": units, "clientId": clientId]
    }
}
