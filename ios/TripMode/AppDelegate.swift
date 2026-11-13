import UIKit
import UserNotifications
import AVFoundation

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // 1. Configure Notification Center
        UNUserNotificationCenter.current().delegate = self
        requestNotificationAuthorization()

        // 2. Configure Audio Session for Push-to-Talk and Convoy Alerts
        configureAudioSession()

        // 3. Keep screen active while app is foregrounded during convoy driving
        UIApplication.shared.isIdleTimerDisabled = true

        return true
    }

    private func requestNotificationAuthorization() {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if granted {
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        }
    }

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
            try session.setActive(true, options: [])
        } catch {
            print("Failed to configure AVAudioSession: \(error.localizedDescription)")
        }
    }

    // MARK: - UISceneSession Lifecycle
    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        if connectingSceneSession.role.rawValue == "CPTemplateApplicationSceneSessionRoleApplication" {
            return UISceneConfiguration(name: "CarPlay Scene", sessionRole: connectingSceneSession.role)
        }
        return UISceneConfiguration(name: "Phone Scene", sessionRole: connectingSceneSession.role)
    }

    // MARK: - UNUserNotificationCenterDelegate
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show banner and play sound even when the app is in the foreground
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .sound, .badge, .list])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let targetUrl = userInfo["targetUrl"] as? String, let url = URL(string: targetUrl) {
            NotificationCenter.default.post(name: .tripModeOpenUrl, object: url)
        }
        completionHandler()
    }
}

extension Notification.Name {
    static let tripModeOpenUrl = Notification.Name("app.tripmode.convoy.openUrl")
}
