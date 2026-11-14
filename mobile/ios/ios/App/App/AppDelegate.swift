import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    // Push notifications: iOS hands the device token (or the failure) to the app delegate; the
    // PushNotifications plugin listens for these and passes the token on to the web app.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}

/// The app's web view, with the app's own native plugin registered.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeToolsPlugin())
    }
}

/// Printing and the iOS share sheet for the web app (window.print and file downloads do nothing in a web view).
/// The web app renders a receipt or a report itself and passes it here as base64.
@objc(NativeToolsPlugin)
public class NativeToolsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeToolsPlugin"
    public let jsName = "NativeTools"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "printImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareText", returnType: CAPPluginReturnPromise),
    ]

    /// Accepts plain base64 or a data: URL.
    private func decode(_ call: CAPPluginCall) -> Data? {
        guard var b64 = call.getString("data") else { return nil }
        if b64.hasPrefix("data:"), let comma = b64.firstIndex(of: ",") { b64 = String(b64[b64.index(after: comma)...]) }
        return Data(base64Encoded: b64, options: .ignoreUnknownCharacters)
    }

    private func present(_ controller: UIViewController, _ call: CAPPluginCall) {
        guard let host = bridge?.viewController else { call.reject("NO_VIEW"); return }
        // iPad (and Mac) show the share sheet as a popover, which needs an anchor.
        controller.popoverPresentationController?.sourceView = host.view
        controller.popoverPresentationController?.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.midY, width: 0, height: 0)
        controller.popoverPresentationController?.permittedArrowDirections = []
        host.present(controller, animated: true)
    }

    private func shareSheet(_ items: [Any], _ call: CAPPluginCall) {
        let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
        sheet.completionWithItemsHandler = { _, completed, _, error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve(["completed": completed]) }
        }
        present(sheet, call)
    }

    @objc func printImage(_ call: CAPPluginCall) {
        guard let data = decode(call), let image = UIImage(data: data) else { call.reject("BAD_IMAGE"); return }
        DispatchQueue.main.async {
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .grayscale
            info.jobName = call.getString("name") ?? "MyService"
            let printer = UIPrintInteractionController.shared
            printer.printInfo = info
            printer.printingItem = image
            printer.present(animated: true) { _, completed, error in
                if let error = error { call.reject(error.localizedDescription) } else { call.resolve(["completed": completed]) }
            }
        }
    }

    @objc func shareFile(_ call: CAPPluginCall) {
        guard let data = decode(call) else { call.reject("BAD_FILE"); return }
        let name = (call.getString("name") ?? "MyService").replacingOccurrences(of: "/", with: "-")
        var items: [Any] = []
        if let text = call.getString("text"), !text.isEmpty { items.append(text) }
        // A picture goes as an image, so the sheet also offers "Save Image" and Telegram sends it as a photo.
        if let mime = call.getString("mime"), mime.hasPrefix("image/"), let image = UIImage(data: data) {
            items.append(image)
        } else {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            do { try data.write(to: url, options: .atomic) } catch { call.reject(error.localizedDescription); return }
            items.append(url)
        }
        DispatchQueue.main.async { self.shareSheet(items, call) }
    }

    @objc func shareText(_ call: CAPPluginCall) {
        guard let text = call.getString("text"), !text.isEmpty else { call.reject("NO_TEXT"); return }
        DispatchQueue.main.async { self.shareSheet([text], call) }
    }
}
