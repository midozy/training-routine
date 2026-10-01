import SwiftUI

/// Mirrors the lock-screen rest countdown (RestTimerWidget on the phone) on the wrist, with a haptic tap when a
/// rest window starts (WatchSessionManager) and another once it's over.
struct RestTimerView: View {
    @EnvironmentObject private var watch: WatchSessionManager

    private var ctx: WatchContext { watch.context }

    var body: some View {
        Group {
            if !ctx.active {
                NoWorkoutView()
            } else if ctx.isResting, let end = ctx.restEnd {
                restBody(end: end)
            } else {
                trainingBody
            }
        }
    }

    private func restBody(end: Date) -> some View {
        let now = Date()
        return VStack(spacing: 4) {
            Text("REST").font(.system(size: 12, weight: .bold)).tracking(1.5).foregroundColor(paperColor.opacity(0.6))
            if now < end {
                Text(timerInterval: now...end, countsDown: true)
                    .font(.system(size: 40, weight: .heavy, design: .rounded).monospacedDigit())
                    .foregroundColor(voltColor)
                    .minimumScaleFactor(0.6)
            } else {
                Text("GO").font(.system(size: 40, weight: .heavy, design: .rounded)).foregroundColor(voltColor)
            }
            Text(ctx.nextUp).font(.system(size: 12)).foregroundColor(paperColor).lineLimit(2).multilineTextAlignment(.center)
        }
        .padding()
    }

    private var trainingBody: some View {
        VStack(spacing: 6) {
            Text(ctx.dayName.uppercased()).font(.system(size: 11, weight: .bold)).tracking(1.2).foregroundColor(paperColor.opacity(0.55))
            Text(ctx.exercise).font(.system(size: 18, weight: .heavy)).foregroundColor(paperColor).lineLimit(2).minimumScaleFactor(0.7).multilineTextAlignment(.center)
            Text(ctx.setText).font(.system(size: 13, weight: .semibold)).foregroundColor(voltColor)
            if !ctx.detail.isEmpty {
                Text(ctx.detail).font(.system(size: 12)).foregroundColor(paperColor.opacity(0.7))
            }
            ProgressView(value: Double(ctx.setsDone), total: Double(max(1, ctx.setsTotal))).tint(voltColor).padding(.top, 2)
        }
        .padding()
    }
}
