import SwiftUI

/// The main Watch screen. While training: the exercise and every set of it (done ✓ / current / still to do), scrollable
/// with the Digital Crown. While resting: the countdown (mirrors the lock-screen RestTimerWidget), what's next, and the
/// same set list below. WatchSessionManager taps the wrist when a rest starts.
struct RestTimerView: View {
    @EnvironmentObject private var watch: WatchSessionManager

    private var ctx: WatchContext { watch.context }

    var body: some View {
        if !ctx.active {
            NoWorkoutView()
        } else {
            ScrollView {
                VStack(spacing: 6) {
                    if ctx.isResting, let end = ctx.restEnd { restHeader(end: end) } else { trainingHeader }
                    SetListView(ctx: ctx).padding(.top, 4)
                }
                .padding(.horizontal, 4)
            }
        }
    }

    private func restHeader(end: Date) -> some View {
        let now = Date()
        return VStack(spacing: 2) {
            Text("REST").font(.system(size: 11, weight: .bold)).tracking(1.5).foregroundColor(paperColor.opacity(0.6))
            if now < end {
                Text(timerInterval: now...end, countsDown: true)
                    .font(.system(size: 38, weight: .heavy, design: .rounded).monospacedDigit())
                    .foregroundColor(voltColor)
                    .minimumScaleFactor(0.6)
            } else {
                Text("GO").font(.system(size: 38, weight: .heavy, design: .rounded)).foregroundColor(voltColor)
            }
            if !ctx.nextUp.isEmpty {
                Text("Next: \(ctx.nextUp)").font(.system(size: 12)).foregroundColor(paperColor)
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var trainingHeader: some View {
        VStack(spacing: 3) {
            Text(headerLine).font(.system(size: 10, weight: .bold)).tracking(1.1).foregroundColor(paperColor.opacity(0.55))
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(ctx.exercise).font(.system(size: 17, weight: .heavy)).foregroundColor(paperColor)
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            Text(ctx.setText).font(.system(size: 13, weight: .semibold)).foregroundColor(voltColor)
            if !ctx.detail.isEmpty {
                Text(ctx.detail).font(.system(size: 15, weight: .bold, design: .rounded)).foregroundColor(paperColor)
            }
            ProgressView(value: Double(ctx.setsDone), total: Double(max(1, ctx.setsTotal))).tint(voltColor).padding(.top, 2)
        }
    }

    private var headerLine: String {
        let day = ctx.dayName.uppercased()
        return ctx.exerciseCount > 0 ? "\(day) · \(ctx.exerciseIndex)/\(ctx.exerciseCount)" : day
    }
}

/// Every set of the current exercise: ✓ for logged, highlighted row for the one you're on, target reps for the rest.
struct SetListView: View {
    let ctx: WatchContext

    var body: some View {
        VStack(spacing: 3) {
            ForEach(ctx.sets) { s in
                let current = s.n == ctx.setNumber && !s.logged
                HStack(spacing: 6) {
                    Text("\(s.n)").font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(current ? .black : paperColor.opacity(0.6)).frame(width: 16)
                    Text(line(s)).font(.system(size: 13, weight: current ? .bold : .medium, design: .rounded))
                        .foregroundColor(current ? .black : paperColor.opacity(s.logged ? 1 : 0.75))
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Spacer(minLength: 0)
                    if s.logged {
                        Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundColor(voltColor)
                    } else if !s.target.isEmpty {
                        Text("→\(s.target)").font(.system(size: 10, weight: .semibold))
                            .foregroundColor(current ? .black.opacity(0.6) : paperColor.opacity(0.4))
                    }
                }
                .padding(.horizontal, 8).padding(.vertical, 5)
                .background(RoundedRectangle(cornerRadius: 8).fill(current ? voltColor : Color.white.opacity(0.08)))
            }
        }
    }

    private func line(_ s: WatchSet) -> String {
        let w = s.weight.trimmingCharacters(in: .whitespaces)
        let reps = s.reps.isEmpty ? "–" : s.reps
        return (Double(w.replacingOccurrences(of: ",", with: ".")) ?? 0) > 0 ? "\(w) \(ctx.units) × \(reps)" : "\(reps) reps"
    }
}
