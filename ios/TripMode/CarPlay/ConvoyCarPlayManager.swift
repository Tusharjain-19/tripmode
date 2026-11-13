import Foundation
import CarPlay

class ConvoyCarPlayManager {
    static let shared = ConvoyCarPlayManager()

    var interfaceController: CPInterfaceController?

    // Convoy State Cache
    private(set) var isActive: Bool = false
    private(set) var tripId: String = ""
    private(set) var tripName: String = "No Active Convoy"
    private(set) var destination: String = "Standby"
    private(set) var memberCount: Int = 1
    private(set) var gapMeters: Int? = nil
    private(set) var currentManeuver: String? = nil
    private(set) var maneuverDistanceM: Int? = nil
    private(set) var etaMinutes: Int? = nil
    private(set) var sosDriver: String? = nil

    private init() {}

    func updateConvoy(
        active: Bool,
        id: String,
        name: String,
        dest: String,
        members: Int,
        gapM: Int?,
        maneuver: String?,
        distM: Int?,
        etaMin: Int?
    ) {
        self.isActive = active
        self.tripId = id
        self.tripName = name.isEmpty ? "Road Trip Convoy" : name
        self.destination = dest.isEmpty ? "Convoy Destination" : dest
        self.memberCount = max(1, members)
        self.gapMeters = gapM
        self.currentManeuver = maneuver
        self.maneuverDistanceM = distM
        self.etaMinutes = etaMin

        refreshCarPlayTemplate()
    }

    func triggerSos(driver: String) {
        self.sosDriver = driver
        presentSosAlert(driver: driver)
    }

    func clearSos() {
        self.sosDriver = nil
        refreshCarPlayTemplate()
    }

    func buildDashboardTemplate() -> CPInformationTemplate {
        var items: [CPInformationItem] = []

        if let sos = sosDriver {
            items.append(CPInformationItem(title: "EMERGENCY SOS", detail: "Alert triggered by \(sos). Check convoy."))
        }

        items.append(CPInformationItem(title: "Convoy", detail: tripName))
        items.append(CPInformationItem(title: "Destination", detail: destination))

        let membersDetail = "\(memberCount) vehicle\(memberCount == 1 ? "" : "s") in convoy"
        items.append(CPInformationItem(title: "Formation", detail: membersDetail))

        if let gap = gapMeters {
            let gapText = gap >= 1000 ? String(format: "%.1f km", Double(gap) / 1000.0) : "\(gap) m"
            items.append(CPInformationItem(title: "Vanguard Gap", detail: gapText))
        }

        if let maneuver = currentManeuver, !maneuver.isEmpty {
            let distText = maneuverDistanceM != nil ? "in \(maneuverDistanceM!) m" : ""
            items.append(CPInformationItem(title: "Next Maneuver", detail: "\(maneuver) \(distText)".trimmingCharacters(in: .whitespaces)))
        }

        if let eta = etaMinutes {
            items.append(CPInformationItem(title: "Convoy ETA", detail: "\(eta) min"))
        }

        let actionButton = CPTextButton(title: "Refresh Convoy", textStyle: .confirm) { [weak self] _ in
            self?.refreshCarPlayTemplate()
        }

        let template = CPInformationTemplate(
            title: "Trip Mode",
            layout: .twoColumn,
            items: items,
            actions: [actionButton]
        )
        return template
    }

    func refreshCarPlayTemplate() {
        guard let controller = interfaceController else { return }
        let template = buildDashboardTemplate()
        controller.setRootTemplate(template, animated: false, completion: nil)
    }

    private func presentSosAlert(driver: String) {
        guard let controller = interfaceController else { return }
        let dismissAction = CPAlertAction(title: "Acknowledge", style: .default) { [weak self] _ in
            controller.dismissTemplate(animated: true, completion: nil)
            self?.clearSos()
        }
        let alert = CPAlertTemplate(
            titleVariants: ["EMERGENCY SOS", "CONVOY ALERT"],
            actions: [dismissAction]
        )
        controller.presentTemplate(alert, animated: true, completion: nil)
    }
}
