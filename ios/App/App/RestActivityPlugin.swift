import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Lock-screen / Dynamic Island rest countdown (Live Activity). iOS 16.2+; a no-op below.
@objc(RestActivityPlugin)
public class RestActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RestActivityPlugin"
    public let jsName = "RestActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
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

    /// Starts the countdown, or updates the running one (e.g. after +15s / −15s).
    /// Options: startAt, endAt (ms since epoch), nextUp.
    @objc func start(_ call: CAPPluginCall) {
        guard let endMs = call.getDouble("endAt") else { call.reject("endAt is required"); return }
        let end = Date(timeIntervalSince1970: endMs / 1000)
        let start = min(Date(timeIntervalSince1970: (call.getDouble("startAt") ?? Date().timeIntervalSince1970 * 1000) / 1000), end)
        let nextUp = call.getString("nextUp") ?? ""
        guard #available(iOS 16.2, *) else { call.resolve(["started": false]); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.resolve(["started": false, "reason": "Live Activities are turned off for Heavy"]); return }

        let content = ActivityContent(state: RestActivityAttributes.ContentState(startAt: start, endAt: end, nextUp: nextUp), staleDate: end)
        Task {
            let running = Activity<RestActivityAttributes>.activities
            if let current = running.first {
                await current.update(content)
                for extra in running.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
                call.resolve(["started": true, "id": current.id])
                return
            }
            do {
                let activity = try Activity.request(attributes: RestActivityAttributes(title: "Rest"), content: content, pushType: nil)
                call.resolve(["started": true, "id": activity.id])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        Task {
            for activity in Activity<RestActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    /// Diagnostics: running activities and their states.
    @objc func status(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(["activities": []]); return }
        let list: [[String: Any]] = Activity<RestActivityAttributes>.activities.map { a in
            ["id": a.id, "state": String(describing: a.activityState), "endAt": a.content.state.endAt.timeIntervalSince1970 * 1000]
        }
        call.resolve(["enabled": ActivityAuthorizationInfo().areActivitiesEnabled, "activities": list])
    }
}
