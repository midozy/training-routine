import WidgetKit
import SwiftUI
import ActivityKit

@main
struct RestTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestActivityWidget()
        HeavyTodayWidget()
    }
}

private let volt = Color(red: 215 / 255, green: 1, blue: 58 / 255)
private let ink = Color(red: 17 / 255, green: 17 / 255, blue: 17 / 255)
private let paper = Color(red: 244 / 255, green: 241 / 255, blue: 234 / 255)

private func window(_ s: RestActivityAttributes.ContentState) -> ClosedRange<Date> {
    min(s.startAt, s.endAt)...s.endAt
}

struct RestActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { context in
            LockScreenRestView(state: context.state, isStale: context.isStale)
                .activityBackgroundTint(ink)
                .activitySystemActionForegroundColor(volt)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text("REST")
                        .font(.system(size: 13, weight: .semibold))
                        .tracking(1)
                        .foregroundColor(paper.opacity(0.6))
                        .padding(.top, 6)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.isStale {
                        Text("GO").font(.system(size: 34, weight: .heavy).width(.condensed)).foregroundColor(volt)
                    } else {
                        Text(timerInterval: window(context.state), countsDown: true)
                            .font(.system(size: 34, weight: .heavy).width(.condensed).monospacedDigit())
                            .foregroundColor(volt)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 110, alignment: .trailing)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        ProgressView(timerInterval: window(context.state), countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                            .tint(volt)
                        Text("Up next · \(context.state.nextUp)")
                            .font(.system(size: 14))
                            .foregroundColor(paper)
                            .lineLimit(1)
                    }
                }
            } compactLeading: {
                Image(systemName: "timer").foregroundColor(volt)
            } compactTrailing: {
                Text(timerInterval: window(context.state), countsDown: true)
                    .font(.system(size: 15, weight: .bold).monospacedDigit())
                    .foregroundColor(volt)
                    .frame(maxWidth: 46)
            } minimal: {
                Text(timerInterval: window(context.state), countsDown: true)
                    .font(.system(size: 12, weight: .bold).monospacedDigit())
                    .foregroundColor(volt)
                    .frame(maxWidth: 36)
            }
            .keylineTint(volt)
        }
    }
}

struct LockScreenRestView: View {
    let state: RestActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(isStale ? "REST OVER" : "REST")
                    .font(.system(size: 13, weight: .semibold))
                    .tracking(1.2)
                    .foregroundColor(paper.opacity(0.6))
                Spacer()
                if isStale {
                    Text("GO")
                        .font(.system(size: 52, weight: .heavy).width(.condensed))
                        .foregroundColor(volt)
                } else {
                    Text(timerInterval: window(state), countsDown: true)
                        .font(.system(size: 52, weight: .heavy).width(.condensed).monospacedDigit())
                        .foregroundColor(volt)
                        .multilineTextAlignment(.trailing)
                }
            }
            ProgressView(timerInterval: window(state), countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                .tint(volt)
            Text("Up next · \(state.nextUp)")
                .font(.system(size: 15))
                .foregroundColor(paper)
                .lineLimit(1)
        }
        .padding(16)
    }
}
