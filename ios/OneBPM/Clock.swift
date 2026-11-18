// The session clock. Pure Foundation: no UI, no Metal. Same rules as src/clock.ts on the site.
import Foundation

enum Phase: Int {
    case idle = 0, approaching, live, after
}

struct SessionTimes {
    let next: Date
    let other: Date
    let lastBell: Date
    let phase: Phase
    let liveSecondsLeft: Int?
    let nextIsToday: Bool
    let otherIsToday: Bool
    let zoneName: String

    var nextIs06: Bool { Clock.isSixUTC(next) }
}

enum Clock {
    static let minute: TimeInterval = 60
    static let hour: TimeInterval = 3600
    static let halfDay: TimeInterval = 12 * 3600
    static let firstBell: TimeInterval = 6 * 3600 // 06:00Z; the other is 12 h later
    static let approach: TimeInterval = 10 * 60
    static let live: TimeInterval = 10 * 60
    static let after: TimeInterval = 3 * 60

    /// Most recent bell at or before `t`.
    static func lastBell(_ t: Date) -> Date {
        let s = t.timeIntervalSince1970
        return Date(timeIntervalSince1970: (((s - firstBell) / halfDay).rounded(.down)) * halfDay + firstBell)
    }

    static func phase(_ t: Date) -> (Phase, Int?) {
        let last = lastBell(t)
        let since = t.timeIntervalSince(last)
        let until = last.addingTimeInterval(halfDay).timeIntervalSince(t)
        if since < live { return (.live, Int((live - since).rounded(.up))) }
        if since < live + after { return (.after, nil) }
        if until <= approach { return (.approaching, nil) }
        return (.idle, nil)
    }

    static func times(_ now: Date, tz: TimeZone = .current) -> SessionTimes {
        let last = lastBell(now)
        let next = last.addingTimeInterval(halfDay)
        let other = last.addingTimeInterval(2 * halfDay)
        let (phase, left) = phase(now)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        return SessionTimes(
            next: next, other: other, lastBell: last, phase: phase, liveSecondsLeft: left,
            nextIsToday: cal.isDate(next, inSameDayAs: now),
            otherIsToday: cal.isDate(other, inSameDayAs: now),
            zoneName: zoneName(next, tz: tz))
    }

    static func isSixUTC(_ d: Date) -> Bool {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal.component(.hour, from: d) == 6
    }

    /// Local wall time of an instant, the way this locale writes it ("18:00", "6:00 PM").
    static func localTime(_ d: Date, tz: TimeZone = .current, locale: Locale = .current) -> String {
        let f = DateFormatter()
        f.locale = locale
        f.timeZone = tz
        f.setLocalizedDateFormatFromTemplate("jmm")
        return f.string(from: d)
    }

    /// Short zone name for that instant, DST-aware: "GMT", "BST", "PST", "GMT+5:30".
    static func zoneName(_ d: Date, tz: TimeZone = .current) -> String {
        tz.abbreviation(for: d) ?? tz.identifier
    }

    /// 06:00–17:59 on the visitor's clock is day; the rest is night.
    static func isDay(_ now: Date, tz: TimeZone = .current) -> Bool {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        let h = cal.component(.hour, from: now)
        return h >= 6 && h < 18
    }

    /// h:mm:ss, or m:ss inside the hour.
    static func digits(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds.rounded(.up)))
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    /// "2026-11-18T18:00:00.000Z": the form the API and the site use for a bell.
    static func isoString(_ d: Date) -> String { iso.string(from: d) }
}
