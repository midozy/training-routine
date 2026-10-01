import Foundation
import WatchConnectivity
import WatchKit
import Combine

/// The Watch side of WatchConnectivity: receives the workout context the phone mirrors (HeavyWatchPlugin.pushContext)
/// and sends quick-logged sets back. Counterpart on the phone: ios/App/App/HeavyWatchPlugin.swift.
final class WatchSessionManager: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchSessionManager()

    @Published var context = WatchContext()
    @Published var reachable = false

    private override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// Queued, guaranteed delivery — the system retries this on its own, including once the phone comes back
    /// in range, so a set logged mid-workout is never silently dropped.
    func sendQuickLog(_ log: QuickLogMessage) {
        guard WCSession.isSupported() else { return }
        _ = WCSession.default.transferUserInfo(log.dict)
        WKInterfaceDevice.current().play(.success)
    }

    // MARK: - WCSessionDelegate
    // WCSession calls these on a background queue. The target defaults to MainActor isolation, so they are marked
    // `nonisolated` and hop to the main actor explicitly before touching published state.

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // Pick up whatever context the phone last sent, even if it arrived before this delegate was set
        // (e.g. the Watch app wasn't running yet) — didReceiveApplicationContext only fires for new deliveries.
        let stored = session.receivedApplicationContext
        let ctx: WatchContext? = stored.isEmpty ? nil : WatchContext.from(stored)
        let isReachable = session.isReachable
        Task { @MainActor in
            self.reachable = isReachable
            if let ctx { self.context = ctx }
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let isReachable = session.isReachable
        Task { @MainActor in self.reachable = isReachable }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        let next = WatchContext.from(applicationContext)
        Task { @MainActor in
            let wasResting = self.context.isResting
            self.context = next
            // A fresh rest window just started (not merely a countdown tick — the phone only re-sends on real changes):
            // tap the wrist so you notice without looking, same spirit as the lock-screen rest alert.
            if next.isResting && !wasResting { WKInterfaceDevice.current().play(.start) }
            if !next.active { WKInterfaceDevice.current().play(.stop) }
        }
    }
}
