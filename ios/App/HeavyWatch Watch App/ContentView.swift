import SwiftUI

let voltColor = Color(red: 215 / 255, green: 1, blue: 58 / 255)
let paperColor = Color(red: 244 / 255, green: 241 / 255, blue: 234 / 255)

struct ContentView: View {
    @EnvironmentObject private var watch: WatchSessionManager

    var body: some View {
        TabView {
            RestTimerView().environmentObject(watch)
            QuickLogView().environmentObject(watch)
        }
        .tabViewStyle(.page)
    }
}

/// Shown by both tabs when no workout is running on the phone.
struct NoWorkoutView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "figure.strengthtraining.traditional").font(.system(size: 28)).foregroundColor(voltColor)
            Text("No workout").font(.system(size: 15, weight: .semibold)).foregroundColor(paperColor)
            Text("Start one on your iPhone").font(.system(size: 12)).foregroundColor(paperColor.opacity(0.6)).multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
