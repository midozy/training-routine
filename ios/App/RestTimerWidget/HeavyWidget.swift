import WidgetKit
import SwiftUI

// Home-screen widget: today's workout and this week at a glance.
// The app writes a JSON snapshot into the shared App Group (see HeavyWidgetPlugin in the app target); this reads it.

private let appGroup = "group.com.elsamman.heavy"
private let snapshotKey = "heavy.widget.v1"

private let volt = Color(red: 215 / 255, green: 1, blue: 58 / 255)
private let ink = Color(red: 13 / 255, green: 13 / 255, blue: 11 / 255)
private let paper = Color(red: 244 / 255, green: 241 / 255, blue: 234 / 255)

struct HeavySnapshot: Codable {
    struct Today: Codable {
        var kind: String          // "workout" | "rest" | "none"
        var name: String
        var exercises: Int
        var sets: Int
        var next: [String]
    }
    var v: Int
    var updatedAt: Double
    var weekStart: Int            // 0 Sunday, 1 Monday, 6 Saturday
    var today: Today
    var inProgress: Bool
    var trainedDates: [String]    // local yyyy-MM-dd of finished workouts
    var weekWorkouts: Int
    var streak: Int

    static let sample = HeavySnapshot(
        v: 1, updatedAt: 0, weekStart: 1,
        today: Today(kind: "workout", name: "Chest & Biceps", exercises: 9, sets: 38, next: ["Barbell Bench Press"]),
        inProgress: false, trainedDates: [], weekWorkouts: 3, streak: 5)
}

private func loadSnapshot() -> HeavySnapshot? {
    guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: snapshotKey),
          let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(HeavySnapshot.self, from: data)
}

struct HeavyEntry: TimelineEntry {
    let date: Date
    let snapshot: HeavySnapshot?
}

struct HeavyProvider: TimelineProvider {
    func placeholder(in context: Context) -> HeavyEntry { HeavyEntry(date: Date(), snapshot: .sample) }

    func getSnapshot(in context: Context, completion: @escaping (HeavyEntry) -> Void) {
        completion(HeavyEntry(date: Date(), snapshot: context.isPreview ? .sample : loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HeavyEntry>) -> Void) {
        let now = Date()
        // Redraw just after midnight so "this week" and today's marker roll over even if the app isn't opened.
        let next = Calendar.current.nextDate(after: now, matching: DateComponents(hour: 0, minute: 5), matchingPolicy: .nextTime) ?? now.addingTimeInterval(6 * 3600)
        completion(Timeline(entries: [HeavyEntry(date: now, snapshot: loadSnapshot())], policy: .after(next)))
    }
}

private struct Dot { let letter: String; let trained: Bool; let isToday: Bool }

/// The seven days of the current week (starting on the user's chosen day), marked from the trained dates.
private func weekDots(_ s: HeavySnapshot, now: Date) -> [Dot] {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = .current
    let today = cal.startOfDay(for: now)
    let weekday = cal.component(.weekday, from: today) - 1          // 0 = Sunday
    let lead = (weekday - s.weekStart + 7) % 7
    let start = cal.date(byAdding: .day, value: -lead, to: today) ?? today
    let f = DateFormatter()
    f.calendar = cal
    f.timeZone = .current
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    let letters = ["S", "M", "T", "W", "T", "F", "S"]
    let trained = Set(s.trainedDates)
    return (0..<7).map { i in
        let d = cal.date(byAdding: .day, value: i, to: start) ?? start
        return Dot(letter: letters[(s.weekStart + i) % 7], trained: trained.contains(f.string(from: d)), isToday: cal.isDate(d, inSameDayAs: today))
    }
}

private struct HeavyBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(ink, for: .widget)
        } else {
            content.padding().background(ink)
        }
    }
}

struct HeavyWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: HeavyEntry

    private var isAccessory: Bool {
        family == .accessoryRectangular || family == .accessoryCircular || family == .accessoryInline
    }

    var body: some View {
        if isAccessory {
            accessoryContent(entry.snapshot).modifier(AccessoryBackground())   // Lock Screen: the system draws the look
        } else {
            homeContent.modifier(HeavyBackground())                          // Home Screen: our dark card
        }
    }

    // MARK: Home Screen (small / medium)

    @ViewBuilder private var homeContent: some View {
        if let s = entry.snapshot {
            if family == .systemMedium {
                HStack(alignment: .top, spacing: 18) {
                    todayColumn(s)
                    weekColumn(s)
                }
            } else {
                todayColumn(s)
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("HEAVY").font(.system(size: 11, weight: .bold)).tracking(1.2).foregroundColor(volt)
                Text("OPEN THE APP").font(.system(size: 24, weight: .heavy).width(.condensed)).foregroundColor(paper)
                Spacer(minLength: 0)
                Text("Open Heavy once to show your workout here.").font(.system(size: 12)).foregroundColor(paper.opacity(0.65))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private func eyebrow(_ s: HeavySnapshot) -> String {
        if s.inProgress { return "IN PROGRESS" }
        switch s.today.kind {
        case "workout": return "TODAY"
        case "rest": return "REST DAY"
        default: return "HEAVY"
        }
    }

    private func detail(_ s: HeavySnapshot) -> String {
        let t = s.today
        switch t.kind {
        case "workout": return "\(t.exercises) exercises · \(t.sets) sets"
        case "rest": return "Recover. \(s.weekWorkouts) workout\(s.weekWorkouts == 1 ? "" : "s") this week."
        default: return "Open Heavy to choose a plan."
        }
    }

    private func todayColumn(_ s: HeavySnapshot) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(eyebrow(s)).font(.system(size: 11, weight: .bold)).tracking(1.2).foregroundColor(volt)
            Text(s.today.name.uppercased())
                .font(.system(size: family == .systemSmall ? 26 : 30, weight: .heavy).width(.condensed))
                .foregroundColor(paper)
                .lineLimit(3)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 0)
            Text(detail(s)).font(.system(size: 12, weight: .medium)).foregroundColor(paper.opacity(0.65)).lineLimit(2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func weekColumn(_ s: HeavySnapshot) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("THIS WEEK").font(.system(size: 11, weight: .bold)).tracking(1.2).foregroundColor(volt)
            HStack(spacing: 5) {
                ForEach(Array(weekDots(s, now: entry.date).enumerated()), id: \.offset) { _, d in
                    VStack(spacing: 3) {
                        Text(d.letter).font(.system(size: 9, weight: .semibold)).foregroundColor(paper.opacity(0.5))
                        Circle()
                            .fill(d.trained ? volt : paper.opacity(0.14))
                            .overlay(Circle().stroke(volt, lineWidth: d.isToday && !d.trained ? 1.5 : 0))
                            .frame(width: 16, height: 16)
                    }
                }
            }
            Spacer(minLength: 0)
            Text("\(s.weekWorkouts) workout\(s.weekWorkouts == 1 ? "" : "s")")
                .font(.system(size: 20, weight: .heavy).width(.condensed)).foregroundColor(paper)
            Text(s.streak > 0 ? "\(s.streak)-week streak" : "Start a streak")
                .font(.system(size: 12, weight: .medium)).foregroundColor(paper.opacity(0.65))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: Lock Screen (inline / circular / rectangular)

    @ViewBuilder private func accessoryContent(_ s: HeavySnapshot?) -> some View {
        switch family {
        case .accessoryInline:
            if let s {
                switch s.today.kind {
                case "workout": Text("\(s.today.name) · \(s.today.sets) sets")
                case "rest": Text("Rest day · \(s.weekWorkouts) this week")
                default: Text("Open Heavy")
                }
            } else {
                Text("Open Heavy")
            }
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Text("\(s?.weekWorkouts ?? 0)").font(.system(size: 24, weight: .heavy).width(.condensed)).widgetAccentable()
                    Text("THIS WK").font(.system(size: 8, weight: .semibold))
                }
            }
        default: // accessoryRectangular
            if let s {
                VStack(alignment: .leading, spacing: 1) {
                    Text(eyebrow(s)).font(.system(size: 11, weight: .bold)).widgetAccentable()
                    Text(s.today.name.uppercased()).font(.system(size: 18, weight: .heavy).width(.condensed)).lineLimit(1)
                    Text(detail(s)).font(.system(size: 11)).lineLimit(1)
                    HStack(spacing: 4) {
                        ForEach(Array(weekDots(s, now: entry.date).enumerated()), id: \.offset) { _, d in
                            Circle()
                                .fill(d.trained ? Color.primary : Color.clear)
                                .overlay(Circle().stroke(Color.primary.opacity(d.isToday ? 1 : 0.45), lineWidth: 1))
                                .frame(width: 8, height: 8)
                        }
                    }
                    .padding(.top, 2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 1) {
                    Text("HEAVY").font(.system(size: 11, weight: .bold)).widgetAccentable()
                    Text("Open the app once").font(.system(size: 14, weight: .semibold))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

private struct AccessoryBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(.clear, for: .widget)
        } else {
            content
        }
    }
}

struct HeavyTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HeavyToday", provider: HeavyProvider()) { entry in
            HeavyWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Your next workout and your week at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}
