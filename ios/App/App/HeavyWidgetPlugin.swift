import Foundation
import Capacitor
#if canImport(WidgetKit)
import WidgetKit
#endif

/// Hands the home-screen widget its data: stores the snapshot JSON in the shared App Group and asks iOS to redraw the widget.
@objc(HeavyWidgetPlugin)
public class HeavyWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HeavyWidgetPlugin"
    public let jsName = "HeavyWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
    ]

    static let group = "group.com.elsamman.heavy"
    static let key = "heavy.widget.v1"

    /// Options: json (the snapshot, as a string).
    @objc func update(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else { call.reject("json is required"); return }
        guard let defaults = UserDefaults(suiteName: HeavyWidgetPlugin.group) else {
            call.reject("The shared App Group is not available")
            return
        }
        defaults.set(json, forKey: HeavyWidgetPlugin.key)
        #if canImport(WidgetKit)
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        #endif
        call.resolve(["ok": true])
    }
}
