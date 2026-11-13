# Trip Mode for iOS & Apple CarPlay

Native Swift iOS application container for Trip Mode with full Apple CarPlay support, background GPS location tracking, Push-to-Talk voice, and deep linking via Apple Universal Links.

---

## Architecture Parity with Android

| Feature | Android (`mobile/`) | iOS (`ios/`) |
| :--- | :--- | :--- |
| **Language** | Kotlin | Swift 5 |
| **Web Container** | `android.webkit.WebView` | `WebKit.WKWebView` |
| **JavaScript Bridge** | `@JavascriptInterface` (`AndroidBridge`) | `WKScriptMessageHandler` (`AndroidBridge` + `iOSBridge` shim) |
| **In-Car Platform** | Android Auto (`androidx.car.app`) | Apple CarPlay (`CPTemplateApplicationSceneDelegate`) |
| **Deep Links** | Android App Links (`assetlinks.json`) | Apple Universal Links (`apple-app-site-association`) |
| **Custom URL Scheme** | `tripmode://...` | `tripmode://...` |
| **Haptic Alerts** | `android.os.Vibrator` | `UIImpactFeedbackGenerator` & `UINotificationFeedbackGenerator` |
| **Hardware PTT** | Volume Down key override | `AVAudioSession` volume listener |

---

## Project Structure

```
ios/
├── TripMode.xcodeproj/          # Standard Xcode project file
│   └── project.pbxproj
├── TripMode/
│   ├── AppDelegate.swift        # Audio session, notifications, lifecycle
│   ├── SceneDelegate.swift      # Universal links & tripmode:// deep links
│   ├── ViewController.swift     # WKWebView, JS bridge, offline handling, PTT
│   ├── Info.plist               # Permissions, background modes, scene manifest
│   ├── TripMode.entitlements    # Associated domains & CarPlay entitlements
│   ├── CarPlay/
│   │   ├── ConvoyCarPlayManager.swift # Real-time convoy state on car display
│   │   └── CarPlaySceneDelegate.swift # CPTemplateApplicationSceneDelegate
│   ├── Base.lproj/
│   │   └── LaunchScreen.storyboard    # Pure OLED black launch screen
│   └── Assets.xcassets/         # App icons (iPhone & CarPlay)
└── README.md
```

---

## Opening in Xcode (macOS)

1. Open the project in Xcode:
   ```bash
   open ios/TripMode.xcodeproj
   ```
2. Select target device:
   - Any physical iPhone running iOS 16.0+, or
   - Any iOS Simulator (e.g. iPhone 15 Pro, iPhone 16 Pro).
3. Under **Signing & Capabilities**:
   - Select your **Development Team** (Apple ID / Apple Developer Program).
4. Press `Cmd + R` to run.

---

## Testing Apple CarPlay

1. In the iOS Simulator:
   - Go to top menu: **I/O -> External Displays -> CarPlay**.
2. A separate CarPlay automotive head-unit screen opens alongside the phone simulator.
3. The Trip Mode CarPlay icon appears on the dashboard with live convoy vanguard distance, maneuvers, and emergency SOS alerts.

---

## Cloud CI/CD (GitHub Actions)

If building from Windows or Linux, the project includes `.github/workflows/ios-build.yml`:
- Runs automatically on push to `ios/**` on a cloud `macos-14` runner.
- Archives the Xcode project and exports `TripMode-unsigned.ipa` and `TripMode.xcarchive` downloadable directly from the GitHub Actions tab.
