import UIKit
import Capacitor
import WebKit

/// One native navigation shell around the existing Capacitor bridge. FittList
/// keeps one web product while the highest-value app surfaces become native.
final class FittListShellViewController: UIViewController, UITabBarDelegate, WKScriptMessageHandler {
    private let bridge = CAPBridgeViewController()
    private let headerView = UIView()
    private let tabBar = UITabBar()
    private var settingsButton: UIButton?
    private let tabIDs = ["calendar", "discover", "saved"]
    private let fallbackRoutes = ["/calendar", "/discover", "/saved"]

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 25 / 255, green: 21 / 255, blue: 2 / 255, alpha: 1)

        addChild(bridge)
        bridge.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bridge.view)
        bridge.didMove(toParent: self)

        configureHeader()

        configureTabBar()

        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            headerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            headerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            headerView.heightAnchor.constraint(equalToConstant: 62),
            bridge.view.topAnchor.constraint(equalTo: headerView.bottomAnchor),
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
        tabBar.tintColor = UIColor(red: 159 / 255, green: 232 / 255, blue: 112 / 255, alpha: 1)
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

    private func configureHeader() {
        headerView.translatesAutoresizingMaskIntoConstraints = false
        headerView.backgroundColor = UIColor(red: 25 / 255, green: 21 / 255, blue: 2 / 255, alpha: 1)
        view.addSubview(headerView)

        let home = UIButton(type: .system)
        home.translatesAutoresizingMaskIntoConstraints = false
        home.setTitle("FittList", for: .normal)
        home.setImage(brandMark(), for: .normal)
        home.tintColor = .white
        home.configuration = {
            var configuration = UIButton.Configuration.plain()
            configuration.imagePadding = 7
            return configuration
        }()
        home.setTitleColor(.white, for: .normal)
        // Match the web lockup, whose word uses Delight at 600. The fallback
        // keeps the header usable if a development build ever drops the font
        // resource without hiding the entire home control.
        home.titleLabel?.font = UIFont(name: "Delight-SemiBold", size: 24)
            ?? .systemFont(ofSize: 24, weight: .semibold)
        home.addTarget(self, action: #selector(openHome), for: .touchUpInside)
        headerView.addSubview(home)

        let settings = headerButton(symbol: "gearshape", action: #selector(openSettings), label: "Settings")
        settings.isHidden = true
        settingsButton = settings
        let actions = UIStackView(arrangedSubviews: [
            headerButton(symbol: "magnifyingglass", action: #selector(openSearch), label: "Search"),
            headerButton(symbol: "bubble.left", action: #selector(openMessages), label: "Messages"),
            headerButton(symbol: "bell", action: #selector(openUpdates), label: "Notifications"),
            settings,
        ])
        actions.translatesAutoresizingMaskIntoConstraints = false
        actions.axis = .horizontal
        actions.spacing = 2
        headerView.addSubview(actions)

        NSLayoutConstraint.activate([
            home.leadingAnchor.constraint(equalTo: headerView.leadingAnchor, constant: 18),
            home.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            actions.trailingAnchor.constraint(equalTo: headerView.trailingAnchor, constant: -10),
            actions.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
        ])
    }

    private func headerButton(symbol: String, action: Selector, label: String) -> UIButton {
        let button = UIButton(type: .system)
        button.setImage(UIImage(systemName: symbol), for: .normal)
        button.tintColor = .white
        button.accessibilityLabel = label
        button.widthAnchor.constraint(equalToConstant: 44).isActive = true
        button.heightAnchor.constraint(equalToConstant: 44).isActive = true
        button.addTarget(self, action: action, for: .touchUpInside)
        return button
    }

    private func brandMark() -> UIImage {
        let size = CGSize(width: 20, height: 20.3)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { context in
            UIColor.white.setFill()
            let scale = size.width / 134
            let blocks = [
                CGRect(x: 0, y: 0, width: 40, height: 40),
                CGRect(x: 48, y: 0, width: 86, height: 40),
                CGRect(x: 0, y: 48, width: 40, height: 40),
                CGRect(x: 48, y: 48, width: 46, height: 40),
                CGRect(x: 0, y: 96, width: 40, height: 40),
            ]
            blocks.forEach { block in
                let rect = CGRect(
                    x: block.minX * scale,
                    y: block.minY * scale,
                    width: block.width * scale,
                    height: block.height * scale
                )
                UIBezierPath(roundedRect: rect, cornerRadius: 4 * scale).fill()
            }
            context.cgContext.flush()
        }.withRenderingMode(.alwaysTemplate)
    }

    @objc private func openHome() { navigate(tabID: "calendar", fallback: "/calendar") }
    @objc private func openSearch() { navigate(fallback: "/search") }
    @objc private func openMessages() { navigate(fallback: "/inbox") }
    @objc private func openUpdates() { navigate(fallback: "/notifications") }
    @objc private func openSettings() { navigate(fallback: "/settings") }

    private func item(_ title: String, _ symbol: String, _ tag: Int) -> UITabBarItem {
        UITabBarItem(title: title, image: UIImage(systemName: symbol), tag: tag)
    }

    private func installWebHooks() {
        bridge.loadViewIfNeeded()
        guard let controller = bridge.webView?.configuration.userContentController else { return }
        controller.add(self, name: "fittlistRoute")
        controller.add(self, name: "fittlistExternal")
        bridge.webView?.allowsBackForwardNavigationGestures = true

        // Mark the document before it paints so the web header does not flash
        // underneath the native header.
        controller.addUserScript(WKUserScript(
            source: """
            document.documentElement.dataset.native = 'ios';
            const nativeStyle = document.createElement('style');
            nativeStyle.id = 'fittlist-native-shell-style';
            nativeStyle.textContent = '.brandbar,.navwrap{display:none!important}';
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
                settings: !!document.querySelector('.brandbar [aria-label="Settings"]'),
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
        settingsButton?.isHidden = !(route["settings"] as? Bool ?? false)
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
