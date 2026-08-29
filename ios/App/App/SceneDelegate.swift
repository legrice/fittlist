import UIKit
import Capacitor
import WebKit
import MessageUI
import Photos
import AuthenticationServices
import CryptoKit

/// One native navigation shell around the existing Capacitor bridge. FittList
/// keeps one web product while the highest-value app surfaces become native.
final class FittListShellViewController: UIViewController, UITabBarDelegate, WKScriptMessageHandler, MFMessageComposeViewControllerDelegate, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let bridge = CAPBridgeViewController()
    private let headerView = UIView()
    private let tabBar = UITabBar()
    private var settingsButton: UIButton?
    private var bridgeTopToHeader: NSLayoutConstraint?
    private var bridgeTopToView: NSLayoutConstraint?
    // These IDs deliberately match src/lib/nav.ts. The web navigation is
    // hidden in the native shell, so a mismatch here removes the only working
    // route to a primary destination.
    private let tabIDs = ["following", "discover", "calendar", "share"]
    private let fallbackRoutes = ["/feed", "/discover", "/you", "/membershare"]
    private let trustedWebHosts: Set<String> = ["fittlist.co", "www.fittlist.co"]

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
        // This preview deliberately lets the web shell draw the headerless,
        // DICE-style dock. Keeping the native controls mounted preserves the
        // bridge contract while removing the duplicate chrome.
        headerView.isHidden = true
        tabBar.isHidden = true

        let topToHeader = bridge.view.topAnchor.constraint(equalTo: headerView.bottomAnchor)
        let topToView = bridge.view.topAnchor.constraint(equalTo: view.topAnchor)
        bridgeTopToHeader = topToHeader
        bridgeTopToView = topToView
        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            headerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            headerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            headerView.heightAnchor.constraint(equalToConstant: 62),
            topToView,
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
        tabBar.tintColor = .black
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
            item("Discover", "magnifyingglass", 1),
            item("Profile", "person.crop.circle", 2),
            item("Share", "arrowshape.turn.up.right", 3),
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
        home.titleLabel?.font = .systemFont(ofSize: 24, weight: .bold)
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

    @objc private func openHome() { navigate(tabID: "following", fallback: "/feed") }
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
        controller.add(self, name: "fittlistTakeover")
        controller.add(self, name: "fittlistShareTarget")
        controller.add(self, name: "fittlistApple")
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
              addEventListener('fittlist:takeover', event => {
                window.webkit.messageHandlers.fittlistTakeover.postMessage(!!event.detail);
              });
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
        if message.name == "fittlistApple", let payload = message.body as? [String: Any] {
            guard isTrustedWebMessage(message),
                  let nonce = payload["nonce"] as? String,
                  nonce.count >= 32,
                  nonce.count <= 128 else {
                appleResult(["error": "unavailable"])
                return
            }
            startAppleSignIn(nonce: nonce)
            return
        }
        if message.name == "fittlistShareTarget", let payload = message.body as? [String: Any] {
            guard isTrustedWebMessage(message) else {
                shareResult("Couldn't prepare that image")
                return
            }
            shareImage(payload)
            return
        }
        if message.name == "fittlistTakeover", let active = message.body as? Bool {
            setTakeover(active)
            return
        }
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
        setTakeover(false)
        settingsButton?.isHidden = !(route["settings"] as? Bool ?? false)
        let active = route["active"] as? String
        let activeTags = ["following": 0, "discover": 1, "calendar": 2, "share": 3]
        let tag: Int?
        if let active, let activeTag = activeTags[active] { tag = activeTag }
        else if path == "/feed" { tag = 0 }
        else if path == "/discover" || path == "/search" { tag = 1 }
        else if path == "/you" || path == "/calendar" || path == "/app" || path == "/week" { tag = 2 }
        else if path == "/coachshare" || path == "/membershare" { tag = 3 }
        else { tag = nil }
        if let tag, let next = tabBar.items?.first(where: { $0.tag == tag }) {
            tabBar.selectedItem = next
        }
    }

    private func setTakeover(_ active: Bool) {
        bridgeTopToHeader?.isActive = false
        bridgeTopToView?.isActive = true
        headerView.isHidden = true
        tabBar.isHidden = true
        view.layoutIfNeeded()
    }

    private func isTrustedWebMessage(_ message: WKScriptMessage) -> Bool {
        guard message.frameInfo.isMainFrame else { return false }
        let origin = message.frameInfo.securityOrigin
        let host = origin.host.lowercased()
        if origin.protocol == "https" && trustedWebHosts.contains(host) { return true }
        // A preview build opts into one exact CAPACITOR_SERVER_URL host. The
        // Capacitor navigation allow-list controls which host can occupy the
        // main web view; matching that live main-frame URL lets the same build
        // exercise Apple/share bridges without trusting wildcard previews.
        if origin.protocol == "https",
           let currentHost = bridge.webView?.url?.host?.lowercased(),
           host == currentHost { return true }
        #if DEBUG
        return origin.protocol == "http" && (host == "localhost" || host == "127.0.0.1")
        #else
        return false
        #endif
    }

    private func startAppleSignIn(nonce: String) {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            appleResult(["error": "invalid_credential"])
            return
        }
        var payload: [String: String] = ["identityToken": identityToken]
        if let givenName = credential.fullName?.givenName, !givenName.isEmpty { payload["givenName"] = givenName }
        if let familyName = credential.fullName?.familyName, !familyName.isEmpty { payload["familyName"] = familyName }
        appleResult(payload)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let code = (error as? ASAuthorizationError)?.code
        appleResult(["error": code == .canceled ? "cancelled" : "authorization_failed"])
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        view.window ?? ASPresentationAnchor()
    }

    private func appleResult(_ payload: [String: String]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async {
            self.bridge.webView?.evaluateJavaScript(
                "window.dispatchEvent(new CustomEvent('fittlist:native-apple-result',{detail:\(json)}))"
            )
        }
    }

    private func cookies(for url: URL, from allCookies: [HTTPCookie]) -> [HTTPCookie] {
        guard let targetHost = url.host?.lowercased() else { return [] }
        return allCookies.filter { cookie in
            let cookieDomain = cookie.domain
                .trimmingCharacters(in: CharacterSet(charactersIn: "."))
                .lowercased()
            let domainMatches = targetHost == cookieDomain || targetHost.hasSuffix(".\(cookieDomain)")
            let pathMatches = url.path.hasPrefix(cookie.path)
            let transportMatches = !cookie.isSecure || url.scheme?.lowercased() == "https"
            return domainMatches && pathMatches && transportMatches
        }
    }

    private func shareImage(_ payload: [String: Any]) {
        guard let target = payload["target"] as? String,
              let rawURL = payload["url"] as? String,
              let url = URL(string: rawURL),
              url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(),
              trustedWebHosts.contains(host),
              url.path.hasPrefix("/api/story/") || url.path.hasPrefix("/api/card/") || url.path.hasPrefix("/api/qr/") else {
            shareResult("Couldn't prepare that image")
            return
        }
        let file = payload["file"] as? String
        bridge.webView?.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
            var request = URLRequest(url: url)
            let matchingCookies = self.cookies(for: url, from: cookies)
            HTTPCookie.requestHeaderFields(with: matchingCookies).forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
            URLSession.shared.dataTask(with: request) { data, response, _ in
                guard let data,
                      let http = response as? HTTPURLResponse,
                      (200..<300).contains(http.statusCode),
                      let image = UIImage(data: data) else {
                    self.shareResult("Couldn't prepare that image")
                    return
                }
                DispatchQueue.main.async {
                    self.deliverShareImage(image, data: data, target: target, file: file)
                }
            }.resume()
        }
    }

    private func deliverShareImage(_ image: UIImage, data: Data, target: String, file: String?) {
        switch target {
        case "instagram":
            UIPasteboard.general.setItems(
                [["com.instagram.sharedSticker.backgroundImage": data]],
                options: [.expirationDate: Date().addingTimeInterval(300)]
            )
            guard let url = URL(string: "instagram-stories://share") else { return }
            UIApplication.shared.open(url, options: [:]) { opened in
                if !opened { self.shareResult("Instagram isn't installed") }
            }
        case "messages":
            guard MFMessageComposeViewController.canSendAttachments() else {
                shareResult("Messages isn't available")
                return
            }
            let composer = MFMessageComposeViewController()
            composer.messageComposeDelegate = self
            composer.addAttachmentData(data, typeIdentifier: "public.png", filename: file ?? "fittlist.png")
            present(composer, animated: true)
        case "photo":
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                guard status == .authorized || status == .limited else {
                    self.shareResult("Allow photo access to save your image")
                    return
                }
                PHPhotoLibrary.shared().performChanges({
                    PHAssetChangeRequest.creationRequestForAsset(from: image)
                }) { saved, _ in
                    self.shareResult(saved ? "Photo saved" : "Couldn't save the photo")
                }
            }
        default:
            DispatchQueue.main.async {
                let sheet = UIActivityViewController(activityItems: [image], applicationActivities: nil)
                sheet.popoverPresentationController?.sourceView = self.view
                sheet.popoverPresentationController?.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.maxY - 1, width: 1, height: 1)
                self.present(sheet, animated: true)
            }
        }
    }

    func messageComposeViewController(_ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) {
        controller.dismiss(animated: true)
    }

    private func shareResult(_ message: String) {
        DispatchQueue.main.async {
            let safe = message.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
            self.bridge.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('fittlist:native-share-result',{detail:{message:'\(safe)'}}))")
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
