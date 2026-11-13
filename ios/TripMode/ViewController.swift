import UIKit
import WebKit
import CoreLocation
import AVFoundation
import MediaPlayer
import Network
import UserNotifications

class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, CLLocationManagerDelegate {

    private var webView: WKWebView!
    private var progressView: UIProgressView!
    private let locationManager = CLLocationManager()
    private let pathMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "app.tripmode.convoy.network")
    private var isOfflineState = false

    private let defaultBaseUrl = URL(string: "https://tripmode-orcin.vercel.app")!
    private let allowedHosts: Set<String> = [
        "tripmode-orcin.vercel.app",
        "tripmode.app",
        "www.tripmode.app",
        "localhost",
        "127.0.0.1"
    ]

    private let offlineHtml = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
          <title>Offline - Trip Mode</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif; }
            body { background-color: #000000; color: #f5f5f5; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; text-align: center; }
            .icon-wrapper { width: 88px; height: 88px; border-radius: 50%; background: rgba(239, 68, 68, 0.15); display: flex; align-items: center; justify-content: center; margin-bottom: 24px; border: 1px solid rgba(239, 68, 68, 0.3); }
            .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 9999px; background: #1a1a1a; border: 1px solid #333; font-size: 11px; font-weight: 600; color: #a3a3a3; letter-spacing: 0.05em; margin-bottom: 16px; }
            .dot { width: 6px; height: 6px; border-radius: 50%; background: #ef4444; }
            h1 { font-size: 24px; font-weight: 700; margin-bottom: 10px; color: #ffffff; }
            p { font-size: 14px; color: #a3a3a3; max-width: 320px; line-height: 1.5; margin-bottom: 28px; }
            .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; max-width: 280px; height: 48px; border-radius: 24px; background: #1b5a47; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border: none; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(27, 90, 71, 0.3); }
            .btn:active { transform: scale(0.97); }
            .tips { margin-top: 32px; background: #141414; border: 1px solid #262626; border-radius: 16px; padding: 16px; max-width: 320px; text-align: left; }
            .tips-title { font-size: 11px; font-weight: 700; color: #737373; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
            .tip-item { font-size: 12px; color: #d4d4d4; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
            .tip-item:last-child { margin-bottom: 0; }
          </style>
        </head>
        <body>
          <div class="icon-wrapper">
            <svg style="width:44px;height:44px;fill:#ef4444" viewBox="0 0 24 24"><path d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.8.2-3.95.52l1.63 1.63C10.5 5.06 11.38 5 12 5c5.44 0 9.25 2.87 9.68 3.22L12 19.98 9.3 16.63l-1.42 1.42 3.42 4.25c.38.48 1.02.7 1.6.7s1.22-.22 1.6-.7L23.64 7zM3.41 1.86L2 3.27l2.06 2.06C2.26 6.2 1.05 7.15.36 7.7l11.63 14.54.01-.01.01.01 2.76-3.45 4.54 4.54 1.41-1.41L3.41 1.86z"/></svg>
          </div>
          <div class="badge"><span class="dot"></span>NO INTERNET</div>
          <h1>You're Offline</h1>
          <p>Live convoy map, vehicle tracking, and alerts will automatically resume once your signal returns.</p>
          <button class="btn" onclick="window.location.reload()">
            <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
            Reconnect Convoy
          </button>
          <div class="tips">
            <div class="tips-title">Driver Diagnostics</div>
            <div class="tip-item">• GPS hardware speedometer continues locally</div>
            <div class="tip-item">• Reconnects automatically on cellular signal</div>
          </div>
        </body>
        </html>
    """

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        setupLocationManager()
        setupWebView()
        setupProgressView()
        setupNetworkMonitoring()
        setupHardwareVolumeListener()

        loadTargetUrl(defaultBaseUrl)
    }

    private func setupLocationManager() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.requestWhenInUseAuthorization()
    }

    private func setupWebView() {
        let contentController = WKUserContentController()
        contentController.add(self, name: "tripMode")

        // Inject Universal Bridge Script (supporting window.AndroidBridge, window.iOSBridge, and window.TripModeBridge)
        let bridgeScriptSource = """
            window.AndroidBridge = {
                isNativeApp: function() { return true; },
                getAppVersion: function() { return "1.0.4"; },
                postNotification: function(title, body, tone, targetUrl) {
                    window.webkit.messageHandlers.tripMode.postMessage({
                        action: "postNotification",
                        title: title,
                        body: body,
                        tone: tone,
                        targetUrl: targetUrl
                    });
                },
                share: function(title, text, url) {
                    window.webkit.messageHandlers.tripMode.postMessage({
                        action: "share",
                        title: title,
                        text: text,
                        url: url
                    });
                },
                vibrate: function(durationMs) {
                    window.webkit.messageHandlers.tripMode.postMessage({
                        action: "vibrate",
                        durationMs: durationMs
                    });
                },
                updateCarState: function(active, id, name, dest, members, gapM, maneuver, distM, etaMin) {
                    window.webkit.messageHandlers.tripMode.postMessage({
                        action: "updateCarState",
                        active: active,
                        id: id,
                        name: name,
                        dest: dest,
                        members: members,
                        gapM: gapM,
                        maneuver: maneuver,
                        distM: distM,
                        etaMin: etaMin
                    });
                },
                triggerCarSos: function(driver) {
                    window.webkit.messageHandlers.tripMode.postMessage({
                        action: "triggerCarSos",
                        driver: driver
                    });
                },
                clearCarSos: function() {
                    window.webkit.messageHandlers.tripMode.postMessage({
                        action: "clearCarSos"
                    });
                },
                requestCameraPermission: function() {
                    window.webkit.messageHandlers.tripMode.postMessage({
                        action: "requestCameraPermission"
                    });
                }
            };
            window.iOSBridge = window.AndroidBridge;
            window.TripModeBridge = window.AndroidBridge;
        """
        let userScript = WKUserScript(source: bridgeScriptSource, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        contentController.addUserScript(userScript)

        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.backgroundColor = .black
        webView.isOpaque = false
        webView.scrollView.backgroundColor = .black
        webView.navigationDelegate = self
        webView.uiDelegate = self

        // Observe estimatedProgress for modern smooth progress bar
        webView.addObserver(self, forKeyPath: #keyPath(WKWebView.estimatedProgress), options: .new, context: nil)

        view.addSubview(webView)
    }

    private func setupProgressView() {
        progressView = UIProgressView(progressViewStyle: .bar)
        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.progressTintColor = UIColor(red: 27/255.0, green: 90/255.0, blue: 71/255.0, alpha: 1.0) // Trip Mode Emerald
        progressView.trackTintColor = .clear
        view.addSubview(progressView)

        NSLayoutConstraint.activate([
            progressView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressView.heightAnchor.constraint(equalToConstant: 2.5)
        ])
    }

    private func setupNetworkMonitoring() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                if path.status == .satisfied && self?.isOfflineState == true {
                    self?.isOfflineState = false
                    self?.webView.reload()
                }
            }
        }
        pathMonitor.start(queue: monitorQueue)
    }

    private func setupHardwareVolumeListener() {
        // Prevent volume HUD popup and listen to hardware volume buttons for Push-to-Talk
        let volumeView = MPVolumeView(frame: CGRect(x: -1000, y: -1000, width: 0, height: 0))
        view.addSubview(volumeView)

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(volumeChanged(notification:)),
            name: NSNotification.Name("AVSystemController_SystemVolumeDidChangeNotification"),
            object: nil
        )
    }

    @objc private func volumeChanged(notification: Notification) {
        // Trigger hardware PTT event into web application
        webView.evaluateJavaScript("window.__triggerHardwarePtt?.(true); setTimeout(() => window.__triggerHardwarePtt?.(false), 250);", completionHandler: nil)
    }

    func loadTargetUrl(_ url: URL) {
        let request = URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 30.0)
        webView.load(request)
    }

    // MARK: - WKScriptMessageHandler Bridge
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let dict = message.body as? [String: Any],
              let action = dict["action"] as? String else { return }

        switch action {
        case "postNotification":
            let title = dict["title"] as? String ?? "Convoy Alert"
            let body = dict["body"] as? String ?? ""
            let tone = dict["tone"] as? String
            let targetUrl = dict["targetUrl"] as? String
            scheduleLocalNotification(title: title, body: body, tone: tone, targetUrl: targetUrl)

        case "share":
            let title = dict["title"] as? String ?? "Trip Mode"
            let text = dict["text"] as? String ?? ""
            let url = dict["url"] as? String ?? ""
            var shareItems: [Any] = []
            if !text.isEmpty { shareItems.append(text) }
            if let link = URL(string: url) { shareItems.append(link) }
            let activityVC = UIActivityViewController(activityItems: shareItems, applicationActivities: nil)
            activityVC.popoverPresentationController?.sourceView = self.view
            present(activityVC, animated: true)

        case "vibrate":
            let duration = dict["durationMs"] as? Int ?? 200
            if duration >= 300 {
                let generator = UINotificationFeedbackGenerator()
                generator.notificationOccurred(.warning)
            } else {
                let generator = UIImpactFeedbackGenerator(style: .medium)
                generator.impactOccurred()
            }

        case "updateCarState":
            let active = dict["active"] as? Bool ?? false
            let id = dict["id"] as? String ?? ""
            let name = dict["name"] as? String ?? ""
            let dest = dict["dest"] as? String ?? ""
            let members = dict["members"] as? Int ?? 1
            let gapM = dict["gapM"] as? Int
            let maneuver = dict["maneuver"] as? String
            let distM = dict["distM"] as? Int
            let etaMin = dict["etaMin"] as? Int

            ConvoyCarPlayManager.shared.updateConvoy(
                active: active,
                id: id,
                name: name,
                dest: dest,
                members: members,
                gapM: gapM,
                maneuver: maneuver,
                distM: distM,
                etaMin: etaMin
            )

        case "triggerCarSos":
            let driver = dict["driver"] as? String ?? "Convoy Driver"
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.error)
            ConvoyCarPlayManager.shared.triggerSos(driver: driver)

        case "clearCarSos":
            ConvoyCarPlayManager.shared.clearSos()

        case "requestCameraPermission":
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    if granted {
                        self.webView.reload()
                    }
                }
            }

        default:
            break
        }
    }

    private func scheduleLocalNotification(title: String, body: String, tone: String?, targetUrl: String?) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = tone == "alert" ? UNNotificationSound.defaultCritical : UNNotificationSound.default
        if let targetUrl = targetUrl {
            content.userInfo = ["targetUrl": targetUrl]
        }

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil // deliver immediately
        )
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }

    // MARK: - Progress KVO
    override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey : Any]?, context: UnsafeMutableRawPointer?) {
        if keyPath == #keyPath(WKWebView.estimatedProgress) {
            progressView.progress = Float(webView.estimatedProgress)
            if webView.estimatedProgress >= 1.0 {
                UIView.animate(withDuration: 0.25, delay: 0.1, options: .curveEaseOut, animations: {
                    self.progressView.alpha = 0.0
                }, completion: { _ in
                    self.progressView.progress = 0.0
                })
            } else {
                progressView.alpha = 1.0
            }
        } else {
            super.observeValue(forKeyPath: keyPath, of: object, change: change, context: context)
        }
    }

    // MARK: - WKNavigationDelegate
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        let host = url.host?.lowercased() ?? ""
        if allowedHosts.contains(host) {
            decisionHandler(.allow)
        } else {
            // Open external URLs in Safari
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        isOfflineState = true
        webView.loadHTMLString(offlineHtml, baseURL: nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        isOfflineState = true
        webView.loadHTMLString(offlineHtml, baseURL: nil)
    }

    deinit {
        webView.removeObserver(self, forKeyPath: #keyPath(WKWebView.estimatedProgress))
        pathMonitor.cancel()
    }
}
