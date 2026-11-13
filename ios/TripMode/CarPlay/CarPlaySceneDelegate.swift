import CarPlay

class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        ConvoyCarPlayManager.shared.interfaceController = interfaceController
        let rootTemplate = ConvoyCarPlayManager.shared.buildDashboardTemplate()
        interfaceController.setRootTemplate(rootTemplate, animated: false, completion: nil)
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        if ConvoyCarPlayManager.shared.interfaceController === interfaceController {
            ConvoyCarPlayManager.shared.interfaceController = nil
        }
    }
}
