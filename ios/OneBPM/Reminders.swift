// Bell reminders, off by default. Permission is asked only from "Remind me".
// They are scheduled on the phone itself, from the UTC bells, with each local time written for
// its own date (so a DST change is right), and refreshed whenever the app opens.
import UserNotifications

@MainActor
final class Reminders: ObservableObject {
    enum State { case off, on, blocked }
    @Published private(set) var state: State = .off

    private let center = UNUserNotificationCenter.current()
    private let key = "remind"
    private let days = 15 // 15 days × 2 bells × 2 notices = 60, under iOS's 64 pending

    func refresh() async {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .denied: state = .blocked
        case .authorized, .provisional, .ephemeral:
            state = UserDefaults.standard.bool(forKey: key) ? .on : .off
        default: state = .off
        }
        if state == .on { await schedule() }
    }

    func turnOn() async {
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        UserDefaults.standard.set(granted, forKey: key)
        await refresh()
    }

    /// Clears every pending and delivered bell notice, immediately.
    func turnOff() async {
        UserDefaults.standard.set(false, forKey: key)
        let ids = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix("bell-") }
        center.removePendingNotificationRequests(withIdentifiers: ids)
        let shown = await center.deliveredNotifications().map(\.request.identifier).filter { $0.hasPrefix("bell-") }
        center.removeDeliveredNotifications(withIdentifiers: shown)
        await refresh()
    }

    /// Two notices per bell: T−10 minutes and the bell. Nothing else. `quietUntil` skips a sit in progress.
    func schedule(quietFrom: Date? = nil, quietUntil: Date? = nil) async {
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix("bell-") }
        center.removePendingNotificationRequests(withIdentifiers: pending)
        guard state == .on else { return }
        let now = Date()
        var bell = Clock.lastBell(now).addingTimeInterval(Clock.halfDay)
        for _ in 0..<(days * 2) {
            let time = Clock.localTime(bell)
            for (kind, at, body) in [("soon", bell.addingTimeInterval(-10 * 60), "The bell is in 10 minutes · \(time)"),
                                     ("start", bell, "The session is starting · 10 minutes")] {
                guard at > now.addingTimeInterval(1) else { continue }
                if let a = quietFrom, let b = quietUntil, at >= a, at <= b { continue }
                let content = UNMutableNotificationContent()
                content.title = "1BPM"
                content.body = body
                content.sound = UNNotificationSound(named: UNNotificationSoundName("bell.wav"))
                content.threadIdentifier = "bell"
                let trigger = UNTimeIntervalNotificationTrigger(timeInterval: at.timeIntervalSince(now), repeats: false)
                try? await center.add(UNNotificationRequest(identifier: "bell-\(Clock.isoString(bell))-\(kind)", content: content, trigger: trigger))
            }
            bell = bell.addingTimeInterval(Clock.halfDay)
        }
    }

    /// If the phone is put away during a sit and notices are allowed, the end still rings.
    func scheduleSitEnd(at end: Date) async {
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized, end > Date() else { return }
        let content = UNMutableNotificationContent()
        content.title = "1BPM"
        content.body = "The sit is over."
        content.sound = UNNotificationSound(named: UNNotificationSoundName("bell.wav"))
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: end.timeIntervalSinceNow, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: "sit-end", content: content, trigger: trigger))
    }

    func cancelSitEnd() {
        center.removePendingNotificationRequests(withIdentifiers: ["sit-end"])
    }
}
