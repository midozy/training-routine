import Foundation
import Capacitor
#if canImport(WatchConnectivity)
import WatchConnectivity
#endif

/// Apple Watch companion: mirrors the workout (rest countdown + what to log) to a paired Watch, and receives
/// sets quick-logged from the wrist. Counterpart: "ios/App/HeavyWatch Watch App/WatchSessionManager.swift".
///
/// Transport: `updateApplicationContext` for the phone → Watch mirror (latest state only, coalesced — perfect for
/// a rest timer and "what you're on now", never worth replaying older values). `transferUserInfo` for Watch → phone
/// quick-logged sets (the system queues and retries delivery, including while the Watch is out of range, so a set
/// logged mid-set in the gym is never lost even if the phone is briefly unreachable).
@objc(HeavyWatchPlugin)
public class HeavyWatchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HeavyWatchPlugin"
    public let jsName = "HeavyWatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pushContext", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearContext", returnType: CAPPluginReturnPromise),
    ]

    #if canImport(WatchConnectivity)
    private var pending: [[String: Any]] = []   // quick-logs received before any JS listener was attached

    public override func load() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else {
            call.resolve(["supported": false, "paired": false, "appInstalled": false])
            return
        }
        let s = WCSession.default
        call.resolve(["supported": true, "paired": s.isPaired, "appInstalled": s.isWatchAppInstalled])
    }

    /// One snapshot of where the workout is right now. See lib/native.ts `WatchContext` for the field list.
    @objc func pushContext(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else { call.resolve(); return }
        let session = WCSession.default
        guard session.activationState == .activated else { call.resolve(); return }
        var ctx: [String: Any] = [:]
        for key in [
            "dayName", "exercise", "setText", "detail", "nextUp", "units", "suggestedWeight", "suggestedReps",
        ] {
            if let v = call.getString(key) { ctx[key] = v }
        }
        for key in ["setsDone", "setsTotal", "sessionId", "planExerciseId", "exerciseId", "setNumber"] {
            if let v = call.getInt(key) { ctx[key] = v }
        }
        for key in ["startedAt", "restStart", "restEnd", "updatedAt"] {
            if let v = call.getDouble(key) { ctx[key] = v }
        }
        ctx["active"] = call.getBool("active") ?? true
        do {
            try session.updateApplicationContext(ctx)
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    /// Workout finished or left: tell the Watch there is nothing to show or log.
    @objc func clearContext(_ call: CAPPluginCall) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { call.resolve(); return }
        do {
            try WCSession.default.updateApplicationContext(["active": false])
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    // MARK: - JS event bridge

    public override func addListener(_ call: CAPPluginCall) {
        super.addListener(call)
        if call.getString("eventName") == "quickLog", !pending.isEmpty {
            let toFlush = pending; pending = []
            for payload in toFlush { notifyListeners("quickLog", data: payload) }
        }
    }

    fileprivate func deliverQuickLog(_ payload: [String: Any]) {
        if hasListeners("quickLog") {
            notifyListeners("quickLog", data: payload)
        } else {
            pending.append(payload)   // app launched by the watch message with no screen listening yet
            if pending.count > 50 { pending.removeFirst() }
        }
    }
    #else
    @objc func isSupported(_ call: CAPPluginCall) { call.resolve(["supported": false, "paired": false, "appInstalled": false]) }
    @objc func pushContext(_ call: CAPPluginCall) { call.resolve() }
    @objc func clearContext(_ call: CAPPluginCall) { call.resolve() }
    #endif
}

#if canImport(WatchConnectivity)
extension HeavyWatchPlugin: WCSessionDelegate {
    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    public func sessionDidBecomeInactive(_ session: WCSession) {}
    public func sessionDidDeactivate(_ session: WCSession) { session.activate() }   // allow switching paired Watches

    /// A set quick-logged on the Watch. `transferUserInfo` queues this even if the phone was unreachable, and
    /// can redeliver after a relaunch — `clientId` lets the JS side (lib/native.ts onWatchQuickLog) de-dupe.
    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        guard userInfo["type"] as? String == "quickLog" else { return }
        deliverQuickLog(userInfo)
    }
}
#endif
