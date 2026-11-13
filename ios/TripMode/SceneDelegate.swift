import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?
    private var viewController: ViewController?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = (scene as? UIWindowScene) else { return }

        let window = UIWindow(windowScene: windowScene)
        let rootVC = ViewController()
        self.viewController = rootVC
        window.rootViewController = rootVC
        window.backgroundColor = .black
        self.window = window
        window.makeKeyAndVisible()

        // 1. Check for universal link or custom URL in connectionOptions
        if let userActivity = connectionOptions.userActivities.first,
           userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let webpageURL = userActivity.webpageURL {
            rootVC.loadTargetUrl(webpageURL)
        } else if let urlContext = connectionOptions.urlContexts.first {
            let resolved = resolveDeepLink(urlContext.url)
            rootVC.loadTargetUrl(resolved)
        }

        // 2. Listen for notification tap events
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleOpenUrlNotification(_:)),
            name: .tripModeOpenUrl,
            object: nil
        )
    }

    // Handle Apple Universal Links (e.g. https://tripmode-orcin.vercel.app/join/ABC123)
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
              let webpageURL = userActivity.webpageURL else { return }
        viewController?.loadTargetUrl(webpageURL)
    }

    // Handle Custom URL Scheme (e.g. tripmode://join/ABC123 or tripmode://ABC123)
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        let resolved = resolveDeepLink(url)
        viewController?.loadTargetUrl(resolved)
    }

    @objc private func handleOpenUrlNotification(_ notification: Notification) {
        guard let url = notification.object as? URL else { return }
        viewController?.loadTargetUrl(url)
    }

    private func resolveDeepLink(_ url: URL) -> URL {
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "tripmode" {
            let host = url.host ?? ""
            let path = url.path
            let combined = (host + path).replacingOccurrences(of: "/", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
            if combined.range(of: "^[A-Za-z0-9_-]{4,32}$", options: .regularExpression) != nil {
                return URL(string: "https://tripmode-orcin.vercel.app/join/\(combined)") ?? url
            }
            return URL(string: "https://tripmode-orcin.vercel.app")!
        }
        return url
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        NotificationCenter.default.removeObserver(self, name: .tripModeOpenUrl, object: nil)
    }
}
