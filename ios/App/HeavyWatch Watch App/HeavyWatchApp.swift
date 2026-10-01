import SwiftUI

@main
struct HeavyWatchApp: App {
    @StateObject private var watch = WatchSessionManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView().environmentObject(watch)
        }
    }
}
