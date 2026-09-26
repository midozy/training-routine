import Foundation
import Capacitor
import HealthKit

/// Heavy's Apple Health bridge. Reads body metrics, resting heart rate, steps,
/// active energy and sleep; reads heart rate/energy for a workout window; and
/// saves finished Heavy sessions as strength-training workouts.
@objc(HeavyHealthPlugin)
public class HeavyHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HeavyHealthPlugin"
    public let jsName = "HeavyHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readQuantity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dailySums", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readSleep", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "workoutStats", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

    // MARK: - Types

    private struct QType { let type: HKQuantityType; let unit: HKUnit; let scale: Double }

    private func quantity(_ key: String) -> QType? {
        let bpm = HKUnit.count().unitDivided(by: .minute())
        switch key {
        case "bodyMass": return QType(type: HKQuantityType(.bodyMass), unit: .gramUnit(with: .kilo), scale: 1)
        case "bodyFat": return QType(type: HKQuantityType(.bodyFatPercentage), unit: .percent(), scale: 100)
        case "leanMass": return QType(type: HKQuantityType(.leanBodyMass), unit: .gramUnit(with: .kilo), scale: 1)
        case "height": return QType(type: HKQuantityType(.height), unit: .meterUnit(with: .centi), scale: 1)
        case "restingHeartRate": return QType(type: HKQuantityType(.restingHeartRate), unit: bpm, scale: 1)
        case "heartRate": return QType(type: HKQuantityType(.heartRate), unit: bpm, scale: 1)
        case "steps": return QType(type: HKQuantityType(.stepCount), unit: .count(), scale: 1)
        case "activeEnergy": return QType(type: HKQuantityType(.activeEnergyBurned), unit: .kilocalorie(), scale: 1)
        default: return nil
        }
    }

    private var readTypes: Set<HKObjectType> {
        var s = Set<HKObjectType>()
        for k in ["bodyMass", "bodyFat", "leanMass", "height", "restingHeartRate", "heartRate", "steps", "activeEnergy"] {
            if let q = quantity(k) { s.insert(q.type) }
        }
        s.insert(HKCategoryType(.sleepAnalysis))
        s.insert(HKObjectType.workoutType())
        return s
    }
    private var shareTypes: Set<HKSampleType> { [HKObjectType.workoutType()] }

    // MARK: - Dates

    private func parseDate(_ s: String?) -> Date? {
        guard let s = s else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }
    private func iso(_ d: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: d)
    }
    private func localDay(_ d: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }
    private func range(_ call: CAPPluginCall) -> (Date, Date)? {
        guard let start = parseDate(call.getString("startDate")) else { call.reject("startDate is required (ISO 8601)"); return nil }
        let end = parseDate(call.getString("endDate")) ?? Date()
        return (start, end)
    }

    // MARK: - Availability and permission

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    /// "shouldRequest" until the permission sheet has been shown once, then "unnecessary".
    /// (HealthKit never reveals whether read access was granted.)
    @objc func authStatus(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { call.resolve(["status": "unavailable"]); return }
        store.getRequestStatusForAuthorization(toShare: shareTypes, read: readTypes) { status, error in
            if let error = error { call.reject(error.localizedDescription); return }
            let s: String
            switch status {
            case .shouldRequest: s = "shouldRequest"
            case .unnecessary: s = "unnecessary"
            default: s = "unknown"
            }
            call.resolve(["status": s])
        }
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { call.reject("Health data is not available on this device"); return }
        store.requestAuthorization(toShare: shareTypes, read: readTypes) { ok, error in
            if let error = error { call.reject(error.localizedDescription); return }
            call.resolve(["requested": ok])
        }
    }

    // MARK: - Reads

    /// Individual samples: [{ id, value, startDate, endDate, day, source }].
    @objc func readQuantity(_ call: CAPPluginCall) {
        guard let key = call.getString("type"), let q = quantity(key) else { call.reject("Unknown type"); return }
        guard let (start, end) = range(call) else { return }
        let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: q.type, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            if let error = error { call.reject(error.localizedDescription); return }
            let out: [[String: Any]] = (samples as? [HKQuantitySample] ?? []).map { s in
                [
                    "id": s.uuid.uuidString,
                    "value": s.quantity.doubleValue(for: q.unit) * q.scale,
                    "startDate": self.iso(s.startDate),
                    "endDate": self.iso(s.endDate),
                    "day": self.localDay(s.startDate),
                    "source": s.sourceRevision.source.name,
                ]
            }
            call.resolve(["samples": out])
        }
        store.execute(query)
    }

    /// Per-day totals for cumulative types (steps, activeEnergy): [{ day, value }].
    /// HealthKit de-duplicates overlapping iPhone and Watch data here.
    @objc func dailySums(_ call: CAPPluginCall) {
        guard let key = call.getString("type"), let q = quantity(key), q.type.aggregationStyle == .cumulative else { call.reject("Type must be steps or activeEnergy"); return }
        guard let (start, end) = range(call) else { return }
        let cal = Calendar.current
        let anchor = cal.startOfDay(for: start)
        let pred = HKQuery.predicateForSamples(withStart: anchor, end: end, options: [])
        let query = HKStatisticsCollectionQuery(quantityType: q.type, quantitySamplePredicate: pred, options: .cumulativeSum,
                                                anchorDate: anchor, intervalComponents: DateComponents(day: 1))
        query.initialResultsHandler = { _, results, error in
            if let error = error { call.reject(error.localizedDescription); return }
            var out: [[String: Any]] = []
            results?.enumerateStatistics(from: anchor, to: end) { stat, _ in
                if let sum = stat.sumQuantity() {
                    out.append(["day": self.localDay(stat.startDate), "value": sum.doubleValue(for: q.unit)])
                }
            }
            call.resolve(["days": out])
        }
        store.execute(query)
    }

    /// Raw sleep-analysis samples: [{ id, value, startDate, endDate, source, sourceId }].
    /// value: 0 inBed, 1 asleep (unspecified), 2 awake, 3 core, 4 deep, 5 REM.
    @objc func readSleep(_ call: CAPPluginCall) {
        guard let (start, end) = range(call) else { return }
        let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: HKCategoryType(.sleepAnalysis), predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            if let error = error { call.reject(error.localizedDescription); return }
            let out: [[String: Any]] = (samples as? [HKCategorySample] ?? []).map { s in
                [
                    "id": s.uuid.uuidString,
                    "value": s.value,
                    "startDate": self.iso(s.startDate),
                    "endDate": self.iso(s.endDate),
                    "source": s.sourceRevision.source.name,
                    "sourceId": s.sourceRevision.source.bundleIdentifier,
                ]
            }
            call.resolve(["samples": out])
        }
        store.execute(query)
    }

    /// Heart rate (average, max) and active energy recorded during a window, e.g. by an Apple Watch.
    @objc func workoutStats(_ call: CAPPluginCall) {
        guard let (start, end) = range(call) else { return }
        guard let hr = quantity("heartRate"), let kcal = quantity("activeEnergy") else { call.reject("Types unavailable"); return }
        let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
        let group = DispatchGroup()
        let lock = NSLock()
        var result: [String: Any] = [:]

        group.enter()
        store.execute(HKStatisticsQuery(quantityType: hr.type, quantitySamplePredicate: pred, options: [.discreteAverage, .discreteMax]) { _, stat, _ in
            lock.lock()
            if let a = stat?.averageQuantity() { result["avgHr"] = a.doubleValue(for: hr.unit) }
            if let m = stat?.maximumQuantity() { result["maxHr"] = m.doubleValue(for: hr.unit) }
            lock.unlock()
            group.leave()
        })
        group.enter()
        store.execute(HKStatisticsQuery(quantityType: kcal.type, quantitySamplePredicate: pred, options: .cumulativeSum) { _, stat, _ in
            lock.lock()
            if let s = stat?.sumQuantity() { result["activeKcal"] = s.doubleValue(for: kcal.unit) }
            lock.unlock()
            group.leave()
        })
        group.notify(queue: .global()) { call.resolve(result) }
    }

    // MARK: - Write

    /// Saves a traditional strength-training workout. Idempotent on externalId.
    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard let (start, end) = range(call) else { return }
        guard let externalId = call.getString("externalId"), !externalId.isEmpty else { call.reject("externalId is required"); return }
        guard end > start else { call.reject("endDate must be after startDate"); return }

        let existing = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID, allowedValues: [externalId])
        let find = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: existing, limit: 1, sortDescriptors: nil) { _, samples, _ in
            if let w = samples?.first {
                call.resolve(["id": w.uuid.uuidString, "existed": true])
                return
            }
            let config = HKWorkoutConfiguration()
            config.activityType = .traditionalStrengthTraining
            config.locationType = .indoor
            let builder = HKWorkoutBuilder(healthStore: self.store, configuration: config, device: .local())
            builder.beginCollection(withStart: start) { ok, error in
                guard ok else { call.reject(error?.localizedDescription ?? "Could not start workout"); return }
                var meta: [String: Any] = [HKMetadataKeyExternalUUID: externalId, HKMetadataKeyIndoorWorkout: true]
                if let name = call.getString("name"), !name.isEmpty { meta[HKMetadataKeyWorkoutBrandName] = "Heavy · \(name)" }
                builder.addMetadata(meta) { _, _ in
                    builder.endCollection(withEnd: end) { ok, error in
                        guard ok else { call.reject(error?.localizedDescription ?? "Could not end workout"); return }
                        builder.finishWorkout { workout, error in
                            if let workout = workout { call.resolve(["id": workout.uuid.uuidString, "existed": false]) }
                            else { call.reject(error?.localizedDescription ?? "Could not save workout") }
                        }
                    }
                }
            }
        }
        store.execute(find)
    }
}
