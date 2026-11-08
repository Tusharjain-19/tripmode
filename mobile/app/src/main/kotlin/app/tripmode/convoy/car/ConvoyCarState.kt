package app.tripmode.convoy.car

object ConvoyCarState {
    @Volatile
    var hasActiveTrip: Boolean = false

    @Volatile
    var tripId: String = ""

    @Volatile
    var tripName: String = "Convoy Trip"

    @Volatile
    var destinationName: String = "Destination"

    @Volatile
    var convoyMembersCount: Int = 1

    @Volatile
    var leaderGapMeters: Int? = null

    @Volatile
    var nextManeuver: String? = null

    @Volatile
    var distanceToNextM: Int? = null

    @Volatile
    var etaMinutes: Int? = null

    @Volatile
    var isSosActive: Boolean = false

    @Volatile
    var sosDriverName: String? = null

    var onStateChanged: (() -> Unit)? = null

    fun updateConvoy(
        active: Boolean,
        id: String,
        name: String,
        dest: String,
        members: Int,
        gapM: Int?,
        maneuver: String?,
        distM: Int?,
        etaMin: Int?
    ) {
        hasActiveTrip = active
        tripId = id
        tripName = name.ifBlank { "Convoy Trip" }
        destinationName = dest.ifBlank { "Destination" }
        convoyMembersCount = maxOf(1, members)
        leaderGapMeters = gapM
        nextManeuver = maneuver
        distanceToNextM = distM
        etaMinutes = etaMin
        onStateChanged?.invoke()
    }

    fun triggerSos(driver: String) {
        isSosActive = true
        sosDriverName = driver
        onStateChanged?.invoke()
    }

    fun clearSos() {
        isSosActive = false
        sosDriverName = null
        onStateChanged?.invoke()
    }
}

