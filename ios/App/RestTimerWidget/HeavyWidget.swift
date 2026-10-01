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

    var body: some View {
        Group {
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
        .modifier(HeavyBackground())
    }

    private func todayColumn(_ s: HeavySnapshot) -> some View {
        let t = s.today
        let eyebrow = s.inProgress ? "IN PROGRESS" : (t.kind == "workout" ? "TODAY" : (t.kind == "rest" ? "REST DAY" : "HEAVY"))
        let detail: String = {
            switch t.kind {
            case "workout": return "\(t.exercises) exercises · \(t.sets) sets"
            case "rest": return "Recover. \(s.weekWorkouts) workout\(s.weekWorkouts == 1 ? "" : "s") this week."
            default: return "Open Heavy to choose a plan."
            }
        }()
        return VStack(alignment: .leading, spacing: 4) {
            Text(eyebrow).font(.system(size: 11, weight: .bold)).tracking(1.2).foregroundColor(volt)
            Text(t.name.uppercased())
                .font(.system(size: family == .systemSmall ? 26 : 30, weight: .heavy).width(.condensed))
                .foregroundColor(paper)
                .lineLimit(3)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 0)
            Text(detail).font(.system(size: 12, weight: .medium)).foregroundColor(paper.opacity(0.65)).lineLimit(2)
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
}

struct HeavyTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HeavyToday", provider: HeavyProvider()) { entry in
            HeavyWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Your next workout and your week at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
