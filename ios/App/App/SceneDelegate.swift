import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = DiimeBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

private final class DiimeBridgeViewController: CAPBridgeViewController {
    private var navigationHandler: DiimeWebNavigation?

    override func capacitorDidLoad() {
        guard let webView, let delegate = webView.navigationDelegate, let config = bridge?.config else { return }
        let handler = DiimeWebNavigation(delegate: delegate, config: config)
        navigationHandler = handler
        webView.navigationDelegate = handler
        webView.configuration.userContentController.add(handler, name: "diimeRetryConnection")
    }
}

private final class DiimeWebNavigation: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    private weak var delegate: WKNavigationDelegate?
    private let config: InstanceConfiguration

    init(delegate: WKNavigationDelegate, config: InstanceConfiguration) {
        self.delegate = delegate
        self.config = config
    }

    // Capacitor still handles navigation policy, lifecycle and the local error page.
    override func responds(to selector: Selector!) -> Bool {
        super.responds(to: selector) || delegate?.responds(to: selector) == true
    }

    override func forwardingTarget(for selector: Selector!) -> Any? {
        if let delegate, delegate.responds(to: selector) { return delegate }
        return super.forwardingTarget(for: selector)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard !isInterruptedNavigation(error) else { return }
        delegate?.webView?(webView, didFail: navigation, withError: error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard !isInterruptedNavigation(error) else { return }
        delegate?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
    }

    private func isInterruptedNavigation(_ error: Error) -> Bool {
        let error = error as NSError
        return (error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled)
            || (error.domain == "WebKitErrorDomain" && error.code == 102) // Frame load interrupted by policy change.
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let errorURL = config.errorPathURL, message.frameInfo.request.url == errorURL else { return }

        let request = URLRequest(url: config.appStartServerURL, cachePolicy: .reloadIgnoringLocalCacheData)
        message.webView?.load(request)
    }
}
