import WidgetKit
import SwiftUI
import ActivityKit

@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        WorkoutActivityWidget()
        HeavyTodayWidget()
    }
}

private let volt = Color(red: 215 / 255, green: 1, blue: 58 / 255)
private let ink = Color(red: 17 / 255, green: 17 / 255, blue: 17 / 255)
private let paper = Color(red: 244 / 255, green: 241 / 255, blue: 234 / 255)

private typealias WState = WorkoutActivityAttributes.ContentState

private func isResting(_ s: WState) -> Bool { s.phase == "rest" && s.restEnd != nil }

private func restWindow(_ s: WState) -> ClosedRange<Date> {
    let end = s.restEnd ?? Date()
    let start = min(s.restStart ?? end, end)
    return start...end
}

/// The Live Activity for the whole workout: current exercise and set while training, a countdown while resting.
struct WorkoutActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            ActivityContentView(attrs: context.attributes, state: context.state, isStale: context.isStale)
                .activityBackgroundTint(ink)
                .activitySystemActionForegroundColor(volt)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(isResting(context.state) ? "REST" : context.attributes.dayName.uppercased())
                        .font(.system(size: 13, weight: .semibold))
                        .tracking(1)
                        .foregroundColor(paper.opacity(0.6))
                        .lineLimit(1)
                        .padding(.top, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if isResting(context.state) {
                        if context.isStale {
                            Text("GO").font(.system(size: 34, weight: .heavy).width(.condensed)).foregroundColor(volt)
                        } else {
                            Text(timerInterval: restWindow(context.state), countsDown: true)
                                .font(.system(size: 34, weight: .heavy).width(.condensed).monospacedDigit())
                                .foregroundColor(volt)
                                .multilineTextAlignment(.trailing)
                                .frame(maxWidth: 110, alignment: .trailing)
                        }
                    } else {
                        Text(context.attributes.startedAt, style: .timer)
                            .font(.system(size: 20, weight: .bold).monospacedDigit())
                            .foregroundColor(volt)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 90, alignment: .trailing)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        if isResting(context.state) {
                            ProgressView(timerInterval: restWindow(context.state), countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                                .tint(volt)
                            Text("Up next · \(context.state.nextUp)")
                                .font(.system(size: 14))
                                .foregroundColor(paper)
                                .lineLimit(1)
                        } else {
                            Text(context.state.exercise)
                                .font(.system(size: 18, weight: .heavy).width(.condensed))
                                .foregroundColor(paper)
                                .lineLimit(1)
                            Text("\(context.state.setText) · \(context.state.detail)")
                                .font(.system(size: 13))
                                .foregroundColor(paper.opacity(0.75))
                                .lineLimit(1)
                            ProgressView(value: Double(context.state.setsDone), total: Double(max(1, context.state.setsTotal))).tint(volt)
                        }
                    }
                }
            } compactLeading: {
                Image(systemName: isResting(context.state) ? "timer" : "figure.strengthtraining.traditional").foregroundColor(volt)
            } compactTrailing: {
                if isResting(context.state) && !context.isStale {
                    Text(timerInterval: restWindow(context.state), countsDown: true)
                        .font(.system(size: 15, weight: .bold).monospacedDigit())
                        .foregroundColor(volt)
                        .frame(maxWidth: 46)
                } else {
                    Text("\(context.state.setsDone)/\(context.state.setsTotal)")
                        .font(.system(size: 14, weight: .bold).monospacedDigit())
                        .foregroundColor(volt)
                }
            } minimal: {
                if isResting(context.state) && !context.isStale {
                    Text(timerInterval: restWindow(context.state), countsDown: true)
                        .font(.system(size: 12, weight: .bold).monospacedDigit())
                        .foregroundColor(volt)
                        .frame(maxWidth: 36)
                } else {
                    Image(systemName: "figure.strengthtraining.traditional").foregroundColor(volt)
                }
            }
            .keylineTint(volt)
        }
        .watchSmartStack()
    }
}

struct LockScreenWorkoutView: View {
    let attrs: WorkoutActivityAttributes
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool

    private var resting: Bool { isResting(state) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(resting ? (isStale ? "REST OVER" : "REST") : attrs.dayName.uppercased())
                    .font(.system(size: 13, weight: .semibold))
                    .tracking(1.2)
                    .foregroundColor(paper.opacity(0.6))
                    .lineLimit(1)
                Spacer()
                if !resting {
                    Text(attrs.startedAt, style: .timer)
                        .font(.system(size: 15, weight: .bold).monospacedDigit())
                        .foregroundColor(paper.opacity(0.8))
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 90, alignment: .trailing)
                }
            }

            if resting {
                HStack(alignment: .firstTextBaseline) {
                    if isStale {
                        Text("GO").font(.system(size: 52, weight: .heavy).width(.condensed)).foregroundColor(volt)
                    } else {
                        Text(timerInterval: restWindow(state), countsDown: true)
                            .font(.system(size: 52, weight: .heavy).width(.condensed).monospacedDigit())
                            .foregroundColor(volt)
                    }
                    Spacer()
                }
                if !isStale {
                    ProgressView(timerInterval: restWindow(state), countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                        .tint(volt)
                }
                Text("Up next · \(state.nextUp)")
                    .font(.system(size: 14))
                    .foregroundColor(paper)
                    .lineLimit(2)
            } else {
                Text(state.exercise)
                    .font(.system(size: 28, weight: .heavy).width(.condensed))
                    .foregroundColor(paper)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text("\(state.setText) · \(state.detail)")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(paper.opacity(0.8))
                    .lineLimit(1)
            }

            VStack(alignment: .leading, spacing: 3) {
                ProgressView(value: Double(state.setsDone), total: Double(max(1, state.setsTotal))).tint(volt)
                Text("\(state.setsDone) of \(state.setsTotal) sets done")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(paper.opacity(0.55))
            }
        }
        .padding(16)
    }
}


/// iOS 18+: also offer the Live Activity to Apple Watch's Smart Stack in the `.small` family (otherwise watchOS falls back
/// to the Dynamic Island compact view — just an icon and "3/33"). Older iOS: unchanged.
extension WidgetConfiguration {
    func watchSmartStack() -> some WidgetConfiguration {
        if #available(iOS 18.0, *) {
            return self.supplementalActivityFamilies([.small])
        } else {
            return self
        }
    }
}

/// Picks the layout: the Watch Smart Stack (`.small`) gets a compact training/rest card, everything else the lock-screen view.
struct ActivityContentView: View {
    let attrs: WorkoutActivityAttributes
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        if #available(iOS 18.0, *) {
            FamilyAwareActivityView(attrs: attrs, state: state, isStale: isStale)
        } else {
            LockScreenWorkoutView(attrs: attrs, state: state, isStale: isStale)
        }
    }
}

@available(iOS 18.0, *)
private struct FamilyAwareActivityView: View {
    @Environment(\.activityFamily) private var family
    let attrs: WorkoutActivityAttributes
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        if family == .small {
            WatchActivityView(attrs: attrs, state: state, isStale: isStale)
        } else {
            LockScreenWorkoutView(attrs: attrs, state: state, isStale: isStale)
        }
    }
}

/// Apple Watch Smart Stack card: exercise, set and weight × reps while training; the countdown and what's next while resting.
private struct WatchActivityView: View {
    let attrs: WorkoutActivityAttributes
    let state: WorkoutActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if isResting(state) {
                HStack(alignment: .firstTextBaseline) {
                    Text("REST").font(.system(size: 12, weight: .bold)).tracking(1).foregroundColor(paper.opacity(0.6))
                    Spacer(minLength: 4)
                    if isStale {
                        Text("GO").font(.system(size: 26, weight: .heavy).width(.condensed)).foregroundColor(volt)
                    } else {
                        Text(timerInterval: restWindow(state), countsDown: true)
                            .font(.system(size: 26, weight: .heavy).width(.condensed).monospacedDigit())
                            .foregroundColor(volt).multilineTextAlignment(.trailing)
                    }
                }
                Text(state.nextUp).font(.system(size: 13, weight: .medium)).foregroundColor(paper).lineLimit(2)
            } else {
                HStack {
                    Text(attrs.dayName.uppercased()).font(.system(size: 11, weight: .bold)).tracking(0.8)
                        .foregroundColor(paper.opacity(0.6)).lineLimit(1)
                    Spacer(minLength: 4)
                    Text("\(state.setsDone)/\(state.setsTotal)").font(.system(size: 11, weight: .bold).monospacedDigit()).foregroundColor(volt)
                }
                Text(state.exercise).font(.system(size: 16, weight: .heavy).width(.condensed)).foregroundColor(paper).lineLimit(1)
                Text("\(state.setText) · \(state.detail)").font(.system(size: 13, weight: .semibold)).foregroundColor(volt).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(.horizontal, 2)
    }
}
