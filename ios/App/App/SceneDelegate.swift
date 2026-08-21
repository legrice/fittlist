import UIKit
import Capacitor
import WebKit

/// One native navigation shell around the existing Capacitor bridge. FittList
/// keeps one web product while the highest-value app surfaces become native.
final class FittListShellViewController: UIViewController, UITabBarDelegate, WKScriptMessageHandler {
    private let bridge = CAPBridgeViewController()
    private let tabBar = UITabBar()
    private let tabIDs = ["calendar", "discover", "saved"]
    private let fallbackRoutes = ["/calendar", "/discover", "/saved"]

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 250 / 255, green: 250 / 255, blue: 248 / 255, alpha: 1)

        addChild(bridge)
        bridge.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bridge.view)
        bridge.didMove(toParent: self)

        configureTabBar()

        NSLayoutConstraint.activate([
            bridge.view.topAnchor.constraint(equalTo: view.topAnchor),
            bridge.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bridge.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bridge.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        installWebHooks()
    }

    private func configureTabBar() {
        tabBar.translatesAutoresizingMaskIntoConstraints = false
        tabBar.delegate = self
        tabBar.isTranslucent = true
        tabBar.tintColor = .label
        tabBar.unselectedItemTintColor = UIColor.label.withAlphaComponent(0.76)

        let appearance = UITabBarAppearance()
        appearance.configureWithTransparentBackground()
        appearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        appearance.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.42)
        appearance.shadowColor = .clear
        tabBar.standardAppearance = appearance
        tabBar.scrollEdgeAppearance = appearance
        tabBar.items = [
            item("Calendar", "calendar", 0),
            item("Discover", "safari", 1),
            item("Favorites", "heart", 2),
        ]
        tabBar.selectedItem = tabBar.items?.first
        view.addSubview(tabBar)
    }

    private func item(_ title: String, _ symbol: String, _ tag: Int) -> UITabBarItem {
        UITabBarItem(title: title, image: UIImage(systemName: symbol), tag: tag)
    }

    private func installWebHooks() {
        bridge.loadViewIfNeeded()
        guard let controller = bridge.webView?.configuration.userContentController else { return }
        controller.add(self, name: "fittlistRoute")
        controller.add(self, name: "fittlistExternal")
        bridge.webView?.allowsBackForwardNavigationGestures = true

        // Mark the document before it paints so the website can hand bottom
        // navigation to UIKit while keeping its current product header.
        controller.addUserScript(WKUserScript(
            source: """
            document.documentElement.dataset.native = 'ios';
            const nativeStyle = document.createElement('style');
            nativeStyle.id = 'fittlist-native-shell-style';
            nativeStyle.textContent = '.navwrap{display:none!important}';
            (document.head || document.documentElement).appendChild(nativeStyle);
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        controller.addUserScript(WKUserScript(
            source: """
            (() => {
              const send = () => window.webkit.messageHandlers.fittlistRoute.postMessage({
                path: location.pathname,
                active: document.querySelector('.navwrap a[aria-current="page"]')?.dataset.tab || null
              });
              const sendAfterRender = () => setTimeout(send, 80);
              const push = history.pushState.bind(history);
              const replace = history.replaceState.bind(history);
              history.pushState = (...args) => { push(...args); sendAfterRender(); };
              history.replaceState = (...args) => { replace(...args); sendAfterRender(); };
              addEventListener('popstate', sendAfterRender);
              addEventListener('hashchange', sendAfterRender);
              document.addEventListener('click', event => {
                const link = event.target.closest?.('a[href]');
                if (!link) return;
                const url = new URL(link.href, location.href);
                const external = url.protocol !== 'http:' && url.protocol !== 'https:'
                  || (url.hostname !== location.hostname
                    && url.hostname !== 'fittlist.co'
                    && url.hostname !== 'www.fittlist.co');
                if (external) {
                  event.preventDefault();
                  window.webkit.messageHandlers.fittlistExternal.postMessage(url.href);
                  return;
                }
                sendAfterRender();
              }, true);
              send();
            })();
            """,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        ))
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard tabIDs.indices.contains(item.tag) else { return }
        navigate(tabID: tabIDs[item.tag], fallback: fallbackRoutes[item.tag])
    }

    private func navigate(tabID: String? = nil, fallback: String) {
        bridge.webView?.evaluateJavaScript("""
          (() => {
            const tabID = \(tabID.map { "'\($0)'" } ?? "null");
            const link = tabID && document.querySelector(`.navwrap a[data-tab="${tabID}"]`);
            if (link) link.click(); else window.location.assign('\(fallback)');
          })();
        """)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "fittlistExternal", let rawURL = message.body as? String,
           let url = URL(string: rawURL),
           let scheme = url.scheme?.lowercased(),
           ["http", "https", "mailto", "tel", "sms", "maps"].contains(scheme) {
            UIApplication.shared.open(url)
            return
        }
        guard message.name == "fittlistRoute",
              let route = message.body as? [String: Any],
              let path = route["path"] as? String else { return }
        let active = route["active"] as? String
        let activeTags = ["calendar": 0, "discover": 1, "saved": 2]
        let tag: Int?
        if let active, let activeTag = activeTags[active] { tag = activeTag }
        else if path == "/calendar" || path == "/app" || path == "/week" { tag = 0 }
        else if path == "/discover" || path == "/search" { tag = 1 }
        else if path == "/saved" { tag = 2 }
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
