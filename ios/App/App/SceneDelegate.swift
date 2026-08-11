import UIKit
import Capacitor
import WebKit

/// One native navigation shell around the existing Capacitor bridge. FittList
/// keeps one web product while the highest-value app surfaces become native.
final class FittListShellViewController: UIViewController, UITabBarDelegate, WKScriptMessageHandler {
    private let bridge = CAPBridgeViewController()
    private let tabBar = UITabBar()
    private let routes = ["/feed", "/discover", "/calendar", "/share", "/you"]

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 25 / 255, green: 21 / 255, blue: 2 / 255, alpha: 1)

        addChild(bridge)
        bridge.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bridge.view)
        bridge.didMove(toParent: self)

        tabBar.translatesAutoresizingMaskIntoConstraints = false
        tabBar.delegate = self
        tabBar.isTranslucent = true
        tabBar.tintColor = UIColor(red: 199 / 255, green: 71 / 255, blue: 10 / 255, alpha: 1)
        tabBar.unselectedItemTintColor = UIColor(red: 25 / 255, green: 21 / 255, blue: 2 / 255, alpha: 0.72)
        tabBar.items = [
            item("Following", "person.2", 0),
            item("Discover", "magnifyingglass", 1),
            item("Schedule", "calendar", 2),
            item("Share", "arrow.up.right", 3),
            item("Profile", "person.crop.circle", 4),
        ]
        tabBar.selectedItem = tabBar.items?.first
        view.addSubview(tabBar)

        NSLayoutConstraint.activate([
            bridge.view.topAnchor.constraint(equalTo: view.topAnchor),
            bridge.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bridge.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bridge.view.bottomAnchor.constraint(equalTo: tabBar.topAnchor),
            tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        installWebHooks()
    }

    private func item(_ title: String, _ symbol: String, _ tag: Int) -> UITabBarItem {
        UITabBarItem(title: title, image: UIImage(systemName: symbol), tag: tag)
    }

    private func installWebHooks() {
        bridge.loadViewIfNeeded()
        guard let controller = bridge.webView?.configuration.userContentController else { return }
        controller.add(self, name: "fittlistRoute")

        // Mark the document before it paints so the HTML fallback bar never
        // flashes underneath the real native tab bar.
        controller.addUserScript(WKUserScript(
            source: "document.documentElement.dataset.native='ios';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        controller.addUserScript(WKUserScript(
            source: """
            (() => {
              const send = () => window.webkit.messageHandlers.fittlistRoute.postMessage(location.pathname);
              const push = history.pushState.bind(history);
              const replace = history.replaceState.bind(history);
              history.pushState = (...args) => { push(...args); send(); };
              history.replaceState = (...args) => { replace(...args); send(); };
              addEventListener('popstate', send);
              addEventListener('hashchange', send);
              document.addEventListener('click', event => {
                if (event.target.closest?.('a[href]')) setTimeout(send, 0);
              }, true);
              send();
            })();
            """,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        ))
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard routes.indices.contains(item.tag) else { return }
        let route = routes[item.tag]
        bridge.webView?.evaluateJavaScript("window.location.assign('\(route)')")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "fittlistRoute", let path = message.body as? String else { return }
        let tag: Int?
        if path == "/feed" || path == "/upcoming" { tag = 0 }
        else if path == "/discover" || path == "/search" { tag = 1 }
        else if path == "/calendar" { tag = 2 }
        else if path.hasPrefix("/share") { tag = 3 }
        else if path == "/you" || path == "/settings" { tag = 4 }
        else { tag = nil }
        if let tag, let next = tabBar.items?.first(where: { $0.tag == tag }) {
            tabBar.selectedItem = next
        }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = FittListShellViewController()
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
