package app.tripmode.convoy.car

import android.content.Intent
import androidx.car.app.Screen
import androidx.car.app.Session

class TripModeCarSession : Session() {
    override fun onCreateScreen(intent: Intent): Screen {
        return ConvoyCarScreen(carContext)
    }
}

