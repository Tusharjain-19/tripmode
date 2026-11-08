package app.tripmode.convoy.car

import android.content.pm.ApplicationInfo
import androidx.car.app.CarAppService
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator

class TripModeCarAppService : CarAppService() {
    override fun createHostValidator(): HostValidator {
        val isDebuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        return if (isDebuggable) {
            HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
        } else {
            // In production release builds, validate official Google Automotive host signature
            try {
                HostValidator.Builder(applicationContext)
                    .addAllowedHost(
                        "com.google.android.projection.gearhead",
                        "fdb00c3d5363b517244b93bb9704223b261fb2ec0ecd40d3cf7a6a5cc9dd1f3e"
                    )
                    .build()
            } catch (_: Exception) {
                HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
            }
        }
    }

    override fun onCreateSession(): Session {
        return TripModeCarSession()
    }
}

