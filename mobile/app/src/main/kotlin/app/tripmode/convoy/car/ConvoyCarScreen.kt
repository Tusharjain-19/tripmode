package app.tripmode.convoy.car

import android.content.Intent
import android.net.Uri
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarColor
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Pane
import androidx.car.app.model.PaneTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

class ConvoyCarScreen(carContext: CarContext) : Screen(carContext) {

    init {
        lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onResume(owner: LifecycleOwner) {
                ConvoyCarState.onStateChanged = {
                    invalidate()
                }
            }

            override fun onPause(owner: LifecycleOwner) {
                ConvoyCarState.onStateChanged = null
            }
        })
    }

    override fun onGetTemplate(): Template {
        // 1. If Emergency SOS is broadcast by convoy member, show immediate alert screen
        if (ConvoyCarState.isSosActive) {
            val driver = ConvoyCarState.sosDriverName ?: "Convoy Vehicle"
            return MessageTemplate.Builder("EMERGENCY SOS: $driver")
                .setTitle("Trip Mode Convoy Alert")
                .addAction(
                    Action.Builder()
                        .setTitle("Acknowledge & Reroute")
                        .setBackgroundColor(CarColor.RED)
                        .setOnClickListener {
                            ConvoyCarState.clearSos()
                            invalidate()
                        }
                        .build()
                )
                .addAction(
                    Action.Builder()
                        .setTitle("Dismiss")
                        .setOnClickListener {
                            ConvoyCarState.clearSos()
                            invalidate()
                        }
                        .build()
                )
                .build()
        }

        // 2. If no trip is currently active, prompt driver to start or join on mobile
        if (!ConvoyCarState.hasActiveTrip) {
            return MessageTemplate.Builder(
                "Open Trip Mode on your phone or join an invite code to view convoy telemetry and turn navigation on this screen."
            )
                .setTitle("Trip Mode Convoy")
                .setHeaderAction(Action.APP_ICON)
                .addAction(
                    Action.Builder()
                        .setTitle("Start on Phone")
                        .setBackgroundColor(CarColor.GREEN)
                        .setOnClickListener {
                            try {
                                val intent = carContext.packageManager.getLaunchIntentForPackage(carContext.packageName)
                                if (intent != null) {
                                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    carContext.startActivity(intent)
                                }
                            } catch (_: Exception) {}
                        }
                        .build()
                )
                .build()
        }

        // 3. Active Convoy Driving Screen: Pane Template
        val paneBuilder = Pane.Builder()

        // Turn instruction / Maneuver row
        val maneuver = ConvoyCarState.nextManeuver ?: "Proceed on planned corridor"
        val distText = ConvoyCarState.distanceToNextM?.let { m ->
            if (m < 1000) "$m m" else String.format("%.1f km", m / 1000f)
        } ?: ""

        paneBuilder.addRow(
            Row.Builder()
                .setTitle(maneuver)
                .addText(if (distText.isNotEmpty()) "In $distText" else "Following convoy route")
                .build()
        )

        // Convoy Gap row
        val gapM = ConvoyCarState.leaderGapMeters
        val gapText = when {
            gapM == null -> "In lead formation"
            gapM < 100 -> "Tight formation (+$gapM m)"
            gapM < 1000 -> "+$gapM m behind leader"
            else -> String.format("+%.1f km behind leader", gapM / 1000f)
        }

        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Convoy Pack")
                .addText("${ConvoyCarState.convoyMembersCount} vehicles active • $gapText")
                .build()
        )

        // Destination & ETA row
        val etaText = ConvoyCarState.etaMinutes?.let { min ->
            if (min >= 60) "${min / 60}h ${min % 60}m" else "$min min"
        } ?: "Live ETA"

        paneBuilder.addRow(
            Row.Builder()
                .setTitle("Destination: ${ConvoyCarState.destinationName}")
                .addText("ETA: $etaText")
                .build()
        )

        // Driver Action: Emergency SOS Button
        paneBuilder.addAction(
            Action.Builder()
                .setTitle("Convoy SOS")
                .setBackgroundColor(CarColor.RED)
                .setOnClickListener {
                    ConvoyCarState.triggerSos("My Vehicle")
                    invalidate()
                }
                .build()
        )

        // Action Strip with Refresh / Recenter
        val actionStrip = ActionStrip.Builder()
            .addAction(
                Action.Builder()
                    .setTitle("Refresh")
                    .setOnClickListener { invalidate() }
                    .build()
            )
            .build()

        return PaneTemplate.Builder(paneBuilder.build())
            .setTitle(ConvoyCarState.tripName)
            .setHeaderAction(Action.APP_ICON)
            .setActionStrip(actionStrip)
            .build()
    }
}

