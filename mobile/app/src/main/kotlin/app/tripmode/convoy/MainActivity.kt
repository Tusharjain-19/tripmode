package app.tripmode.convoy

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkRequest
import androidx.core.app.NotificationCompat

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar

    private val defaultBaseUrl = "https://tripmode-orcin.vercel.app"
    private val PERMISSION_REQUEST_CODE = 1001
    private val NOTIFICATION_PERMISSION_CODE = 1002
    private val CHANNEL_ID = "trip_mode_convoy_alerts"
    private var isOfflineState = false

    private val offlineHtml = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
          <title>Offline - Trip Mode</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
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
    """.trimIndent()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Keep phone screen awake during convoy driving
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // 2. Set up notification channel for system alerts & convoy push notifications
        createNotificationChannel()

        // 3. Request runtime permissions for GPS location, Push-to-Talk audio, and Notifications
        checkConvoyPermissions()

        // 4. Build Root Layout with System Window Insets to prevent status bar overlap
        val rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(0xFF000000.toInt()) // Pure black OLED default
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.statusBarColor = 0xFF000000.toInt()
        }

        rootLayout.setOnApplyWindowInsetsListener { view, insets ->
            val topInset = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                insets.getInsets(android.view.WindowInsets.Type.statusBars()).top
            } else {
                @Suppress("DEPRECATION")
                insets.systemWindowInsetTop
            }
            view.setPadding(0, topInset, 0, 0)
            insets
        }

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                8
            )
            isIndeterminate = false
            max = 100
            visibility = View.VISIBLE
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        rootLayout.addView(webView)
        rootLayout.addView(progressBar)
        setContentView(rootLayout)

        setupWebView()

        // 5. Monitor network connectivity to automatically recover when signal returns
        registerNetworkMonitor()

        // 6. Handle initial deep link intent if app was opened via link
        val initialUrl = resolveIntentUrl(intent) ?: defaultBaseUrl
        webView.loadUrl(initialUrl)
    }

    private fun registerNetworkMonitor() {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        try {
            val builder = NetworkRequest.Builder()
            connectivityManager.registerNetworkCallback(builder.build(), object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    runOnUiThread {
                        if (isOfflineState) {
                            isOfflineState = false
                            val targetUrl = resolveIntentUrl(intent) ?: defaultBaseUrl
                            webView.loadUrl(targetUrl)
                        }
                    }
                }
            })
        } catch (_: Exception) {
            // Graceful fallback
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val deepLinkUrl = resolveIntentUrl(intent)
        if (deepLinkUrl != null) {
            webView.loadUrl(deepLinkUrl)
        }
    }

    private fun resolveIntentUrl(intent: Intent?): String? {
        val data: Uri = intent?.data ?: return null
        val scheme: String = data.scheme ?: return null

        // Handle custom scheme: tripmode://join/ABC123 -> https://tripmode-orcin.vercel.app/join/ABC123
        if (scheme == "tripmode") {
            val path = data.path ?: ""
            val host = data.host ?: ""
            return if (host.isNotEmpty()) {
                "$defaultBaseUrl/$host$path"
            } else {
                "$defaultBaseUrl$path"
            }
        }

        // Handle standard HTTPS App Links
        if (scheme == "https" || scheme == "http") {
            return data.toString()
        }

        return null
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.setGeolocationEnabled(true)
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.displayZoomControls = false
        settings.builtInZoomControls = false

        // Bridge for Web App to trigger Native Push Notifications and Haptic Vibration
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidBridge")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                // Automatically grant geolocation inside the verified app container
                callback?.invoke(origin, true, true)
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                // Grant microphone permission for in-app Push-to-Talk
                runOnUiThread {
                    request?.grant(request.resources)
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url ?: return false
                val host = url.host ?: ""

                // Keep all Trip Mode navigation inside this native WebView
                if (host.contains("tripmode") || host.contains("vercel.app") || host == "localhost" || host == "10.0.2.2") {
                    return false
                }

                // External links open in external browser
                try {
                    val browserIntent = Intent(Intent.ACTION_VIEW, url)
                    startActivity(browserIntent)
                    return true
                } catch (_: Exception) {
                    return false
                }
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    isOfflineState = true
                    view?.loadDataWithBaseURL(null, offlineHtml, "text/html", "UTF-8", null)
                }
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Trip Mode Convoy Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Realtime convoy alerts, emergency road notices, and admin push announcements"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 100, 250)
                val audioAttributes = AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                    .build()
                setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), audioAttributes)
            }
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    fun showNativeNotification(title: String, body: String, tone: String?, targetUrl: String?) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_PERMISSION_CODE)
                return
            }
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (!targetUrl.isNullOrEmpty()) {
                data = Uri.parse(targetUrl)
            }
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            System.currentTimeMillis().toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val vibrationPattern = when (tone) {
            "alert" -> longArrayOf(0, 300, 150, 300, 150, 500)
            "caution" -> longArrayOf(0, 200, 100, 200)
            else -> longArrayOf(0, 150, 80, 150)
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_LIGHTS)
            .setSound(soundUri)
            .setVibrate(vibrationPattern)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setCategory(if (tone == "alert") NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_MESSAGE)
            .build()

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notifId = (System.currentTimeMillis() % 100000).toInt()
        notificationManager.notify(notifId, notification)
    }

    private fun checkConvoyPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val permissionsList = mutableListOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.RECORD_AUDIO
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permissionsList.add(Manifest.permission.POST_NOTIFICATIONS)
            }
            val needRequest = permissionsList.any { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
            if (needRequest) {
                requestPermissions(permissionsList.toTypedArray(), PERMISSION_REQUEST_CODE)
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST_CODE && grantResults.isNotEmpty()) {
            webView.reload()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    inner class WebAppInterface(private val context: Context) {
        @JavascriptInterface
        fun isNativeApp(): Boolean = true

        @JavascriptInterface
        fun getAppVersion(): String = "1.0.0"

        @JavascriptInterface
        fun postNotification(title: String, body: String, tone: String?, targetUrl: String?) {
            runOnUiThread {
                showNativeNotification(title, body, tone, targetUrl)
            }
        }

        @JavascriptInterface
        fun share(title: String, text: String, url: String) {
            runOnUiThread {
                val fullMessage = if (text.isNotEmpty() && !text.contains(url)) {
                    "$text\n$url"
                } else if (text.isNotEmpty()) {
                    text
                } else {
                    url
                }
                val sendIntent = Intent().apply {
                    action = Intent.ACTION_SEND
                    putExtra(Intent.EXTRA_TEXT, fullMessage)
                    putExtra(Intent.EXTRA_SUBJECT, title)
                    type = "text/plain"
                }
                val shareIntent = Intent.createChooser(sendIntent, title)
                startActivity(shareIntent)
            }
        }

        @JavascriptInterface
        fun vibrate(durationMs: Long) {
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(durationMs)
            }
        }
    }
}
