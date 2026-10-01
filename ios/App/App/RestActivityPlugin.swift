import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

/// The workout Live Activity (lock screen + Dynamic Island), from the first set to the finish. iOS 16.2+; a no-op below.
@objc(WorkoutActivityPlugin)
public class WorkoutActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutActivityPlugin"
    public let jsName = "WorkoutActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
    ]

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["supported": false])
        }
    }

    /// Starts the activity for this workout, or updates it if it is already running.
    /// Options: dayName, startedAt (ms), phase ("train" | "rest"), exercise, setText, detail, setsDone, setsTotal,
    /// restStart / restEnd (ms, rest only), nextUp (rest only).
    @objc func sync(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(["started": false]); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["started": false, "reason": "Live Activities are turned off for Heavy"])
            return
        }
        func date(_ key: String) -> Date? { call.getDouble(key).map { Date(timeIntervalSince1970: $0 / 1000) } }
        let phase = call.getString("phase") ?? "train"
        let restEnd = date("restEnd")
        let state = WorkoutActivityAttributes.ContentState(
            phase: phase,
            exercise: call.getString("exercise") ?? "",
            setText: call.getString("setText") ?? "",
            detail: call.getString("detail") ?? "",
            setsDone: call.getInt("setsDone") ?? 0,
            setsTotal: call.getInt("setsTotal") ?? 0,
            restStart: date("restStart"),
            restEnd: restEnd,
            nextUp: call.getString("nextUp") ?? "")
        let dayName = call.getString("dayName") ?? "Workout"
        let startedAt = date("startedAt") ?? Date()
        // While resting the activity goes "stale" when the rest is over, so the lock screen can say GO even if the app is asleep.
        let content = ActivityContent(state: state, staleDate: phase == "rest" ? restEnd : nil)

        Task {
            let running = Activity<WorkoutActivityAttributes>.activities
            if let current = running.first(where: { abs($0.attributes.startedAt.timeIntervalSince(startedAt)) < 2 }) {
                await current.update(content)   // the same workout
                for extra in running where extra.id != current.id { await extra.end(nil, dismissalPolicy: .immediate) }
                call.resolve(["started": true, "id": current.id])
                return
            }
            for old in running { await old.end(nil, dismissalPolicy: .immediate) }   // a different (older) workout
            do {
                let activity = try Activity.request(attributes: WorkoutActivityAttributes(dayName: dayName, startedAt: startedAt), content: content, pushType: nil)
                call.resolve(["started": true, "id": activity.id])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        Task {
            for activity in Activity<WorkoutActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    /// Diagnostics: running activities and their states.
    @objc func status(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(["activities": []]); return }
        let list: [[String: Any]] = Activity<WorkoutActivityAttributes>.activities.map { a in
            ["id": a.id, "state": String(describing: a.activityState), "phase": a.content.state.phase, "exercise": a.content.state.exercise]
        }
        call.resolve(["enabled": ActivityAuthorizationInfo().areActivitiesEnabled, "activities": list])
    }
}
