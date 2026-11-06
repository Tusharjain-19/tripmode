package app.tripmode.convoy

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar

    private val defaultBaseUrl = "https://tripmode-orcin.vercel.app"
    private val PERMISSION_REQUEST_CODE = 1001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. Keep phone screen awake during convoy driving
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // 2. Request runtime permissions for GPS location & Push-to-Talk audio
        checkConvoyPermissions()

        // 3. Build Root Layout
        val rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(0xFF16201B.toInt()) // Trip Mode Dark Surface default
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

        // 4. Handle initial deep link intent if app was opened via link
        val initialUrl = resolveIntentUrl(intent) ?: defaultBaseUrl
        webView.loadUrl(initialUrl)
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

        // Handle custom scheme: tripmode://join/ABC123 -> https://tripmode.app/join/ABC123
        if (scheme == "tripmode") {
            val path = data.path ?: ""
            val host = data.host ?: ""
            return if (host.isNotEmpty()) {
                "$defaultBaseUrl/$host$path"
            } else {
                "$defaultBaseUrl$path"
            }
        }

        // Handle standard HTTPS App Links (e.g. https://tripmode.app/join/ABC123)
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
        }
    }

    private fun checkConvoyPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val permissions = arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.RECORD_AUDIO
            )
            val needRequest = permissions.any { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
            if (needRequest) {
                requestPermissions(permissions, PERMISSION_REQUEST_CODE)
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
}
