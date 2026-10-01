import UIKit
import Capacitor

/// Registers Heavy's own native plugins (they live in the app target, not in npm packages).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HeavyHealthPlugin())
        bridge?.registerPluginInstance(RestActivityPlugin())
        bridge?.registerPluginInstance(HeavyWidgetPlugin())
    }
}
