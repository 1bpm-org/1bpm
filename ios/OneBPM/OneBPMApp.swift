import SwiftUI
import UserNotifications

@main
struct OneBPMApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = AppModel()
    @AppStorage("onboarded") private var onboarded = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if onboarded {
                    HomeView()
                } else {
                    OnboardingView { onboarded = true }
                }
            }
            .environmentObject(model)
            .environmentObject(model.reminders)
            .preferredColorScheme(model.palette.isDay ? .light : .dark)
            .onAppear { delegate.model = model }
            .onChange(of: scenePhase) { _, phase in if phase == .active { model.resume() } }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    weak var model: AppModel?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    /// In the app: never a banner during a sit; the app rings the end of the sit itself.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        let sitting = await MainActor.run { model?.isSitting ?? false }
        if sitting || notification.request.identifier == "sit-end" { return [] }
        return [.banner, .sound, .list]
    }

    /// Tapping a notice opens the app on home; the clock works out the phase.
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {}
}
