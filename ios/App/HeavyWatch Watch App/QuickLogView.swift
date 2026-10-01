import SwiftUI

/// Log the set the phone is currently on, from the wrist. Weight turns with the Digital Crown (fine control
/// without a keyboard); reps step with +/- buttons. "Log set" sends a `transferUserInfo` quick-log to the phone
/// (HeavyWatchPlugin → lib/native.ts onWatchQuickLog), which applies it exactly like a phone-side set.
struct QuickLogView: View {
    @EnvironmentObject private var watch: WatchSessionManager
    @State private var weight: Double = 0
    @State private var reps: Int = 0
    @State private var crownValue: Double = 0
    @State private var justLogged = false

    private var ctx: WatchContext { watch.context }
    private var weightStep: Double { ctx.units == "kg" ? 1.25 : 2.5 }

    var body: some View {
        Group {
            if !ctx.active {
                NoWorkoutView()
            } else {
                VStack(spacing: 8) {
                    Text(ctx.setText).font(.system(size: 12, weight: .semibold)).foregroundColor(voltColor)

                    VStack(spacing: 0) {
                        Text("\(fmt(weight)) \(ctx.units)")
                            .font(.system(size: 26, weight: .heavy, design: .rounded))
                            .foregroundColor(paperColor)
                        Text("turn crown to adjust").font(.system(size: 9)).foregroundColor(paperColor.opacity(0.4))
                    }
                    .focusable(true)
                    .digitalCrownRotation($crownValue, from: -1000, through: 1000, by: 1, sensitivity: .medium, isContinuous: true)
                    .onChange(of: crownValue) { _, v in weight = max(0, weightFrom(v)) }

                    HStack(spacing: 14) {
                        Button { reps = max(0, reps - 1) } label: { Image(systemName: "minus.circle.fill") }
                        Text("\(reps) reps").font(.system(size: 16, weight: .semibold)).foregroundColor(paperColor).frame(minWidth: 60)
                        Button { reps += 1 } label: { Image(systemName: "plus.circle.fill") }
                    }
                    .font(.system(size: 20))
                    .foregroundColor(voltColor)
                    .buttonStyle(.plain)

                    Button(justLogged ? "Logged ✓" : "Log set") { logSet() }
                        .buttonStyle(.borderedProminent)
                        .tint(justLogged ? .gray : voltColor)
                        .disabled(reps == 0 || justLogged)
                }
                .padding(.horizontal, 4)
                .onAppear(perform: resetFromContext)
                .onChange(of: ctx.planExerciseId) { _, _ in resetFromContext() }
                .onChange(of: ctx.setNumber) { _, _ in resetFromContext() }
            }
        }
    }

    /// The crown moves in small ticks; divide down so a full spin nudges weight by a handful of plates, not hundreds of kg.
    private func weightFrom(_ crown: Double) -> Double { (ctx.suggestedWeight.asDouble ?? 0) + crown * weightStep / 50 }

    private func resetFromContext() {
        weight = ctx.suggestedWeight.asDouble ?? 0
        reps = Int(ctx.suggestedReps) ?? 0
        crownValue = 0
        justLogged = false
    }

    private func fmt(_ v: Double) -> String { v == v.rounded() ? String(Int(v)) : String(format: "%.2f", v) }

    private func logSet() {
        guard ctx.active, reps > 0 else { return }
        watch.sendQuickLog(QuickLogMessage(
            sessionId: ctx.sessionId, planExerciseId: ctx.planExerciseId, exerciseId: ctx.exerciseId,
            setNumber: ctx.setNumber, weight: weight, reps: reps, units: ctx.units))
        justLogged = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { justLogged = false }
    }
}

private extension String {
    var asDouble: Double? { Double(self.replacingOccurrences(of: ",", with: ".")) }
}
