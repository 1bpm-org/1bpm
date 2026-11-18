// Everything the screens show, ticking on the wall-clock second. Same rules as src/main.ts.
import SwiftUI
import UIKit

enum Mode { case approach, orient, wait, sit, after }

struct Sit {
    let start: Date
    let length: TimeInterval
    var end: Date { start.addingTimeInterval(length) }
}

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var now = Date()
    @Published private(set) var times = Clock.times(Date())
    @Published private(set) var mode: Mode = .approach
    @Published var durationMin = 10
    @Published private(set) var sit: Sit?
    @Published var breath = false
    @Published var soundOn: Bool { didSet { UserDefaults.standard.set(!soundOn, forKey: "soundOff"); if !soundOn { bell.cancel() } } }
    @Published private(set) var bellNote: String?
    @Published var notice: String?

    // At least X people
    @Published private(set) var count: Int?
    @Published private(set) var countOK = false
    @Published private(set) var busy = false
    @Published private(set) var committedTo: String? = UserDefaults.standard.string(forKey: "committed")
    @Published var alsoNext: Bool = UserDefaults.standard.bool(forKey: "alsoNext") {
        didSet { UserDefaults.standard.set(alsoNext, forKey: "alsoNext") }
    }

    let globe = GlobeState()
    let reminders = Reminders()
    private let bell = Bell()
    private var timer: Timer?
    private var afterTimer: Timer?
    private var noteTimer: Timer?
    private var target = ""
    private var lastPoll = Date.distantPast
    private var lastBellSeen: Date

    var palette: Palette { Clock.isDay(now) ? .day : .night }

    init() {
        soundOn = !UserDefaults.standard.bool(forKey: "soundOff")
        lastBellSeen = Clock.lastBell(Date())
        tick()
        Task { await reminders.refresh() }
        DispatchQueue.main.asyncAfter(deadline: .now() + (UIAccessibility.isReduceMotionEnabled ? 1.4 : 2.7)) { [weak self] in
            if self?.mode == .approach { self?.setMode(.orient) }
        }
    }

    // MARK: the tick

    func tick() {
        now = Date()
        times = Clock.times(now)
        globe.palette = palette
        globe.phase = times.phase
        globe.reducedMotion = UIAccessibility.isReduceMotionEnabled
        let live = times.phase == .live || times.phase == .after
        globe.activeIs06 = live ? !times.nextIs06 : times.nextIs06

        if times.lastBell != lastBellSeen {
            if now.timeIntervalSince(times.lastBell) < 20 { onBell(at: times.lastBell) }
            lastBellSeen = times.lastBell
        }
        if mode == .sit, let sit, now >= sit.end { finishSit(completed: true) }
        followTarget()
        if now.timeIntervalSince(lastPoll) >= 30 { Task { await poll() } }
        schedule()
    }

    /// Next tick on the next whole wall-clock second, or at the sit's end if sooner.
    private func schedule() {
        timer?.invalidate()
        var wait = 1 - now.timeIntervalSince1970.truncatingRemainder(dividingBy: 1) + 0.004
        if let sit { wait = min(wait, max(0, sit.end.timeIntervalSinceNow) + 0.004) }
        let t = Timer(timeInterval: wait, repeats: false) { [weak self] _ in Task { @MainActor in self?.tick() } }
        t.tolerance = 0.002
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    /// Back from the background: resync everything from the wall clock.
    func resume() {
        tick()
        Task { await reminders.refresh() }
    }

    // MARK: modes

    private func setMode(_ m: Mode) {
        withAnimation(.easeInOut(duration: 1.2)) { mode = m }
        globe.sitting = m == .sit || m == .wait
        UIApplication.shared.isIdleTimerDisabled = m == .sit || m == .wait // the end bell needs the app awake
        afterTimer?.invalidate()
        if m == .after {
            afterTimer = Timer.scheduledTimer(withTimeInterval: 90, repeats: false) { [weak self] _ in
                Task { @MainActor in if self?.mode == .after { self?.setMode(.orient) } }
            }
        }
        if m != .sit { breath = false }
    }

    func begin() { startSit(length: TimeInterval(durationMin * 60)) }

    func joinLive() { startSit(length: TimeInterval(times.liveSecondsLeft ?? 0)) }

    func waitForBell() {
        setMode(.wait)
        Task { await reminders.schedule(quietFrom: times.next.addingTimeInterval(-11 * 60), quietUntil: times.next.addingTimeInterval(TimeInterval(durationMin * 60))) }
    }

    /// `ring`: strike to open the sit. False when the shared bell has just rung for it.
    private func startSit(length: TimeInterval, start: Date = Date(), ring: Bool = true) {
        let s = Sit(start: start, length: length)
        sit = s
        if ring && soundOn { bell.strike() }
        setMode(.sit)
        Task {
            await reminders.schedule(quietFrom: s.start, quietUntil: s.end)
            await reminders.scheduleSitEnd(at: s.end)
        }
        schedule()
    }

    private func finishSit(completed: Bool) {
        guard let s = sit else { return }
        sit = nil
        reminders.cancelSitEnd()
        Task { await reminders.schedule() }
        if completed && soundOn { bell.strike(volume: 0.55) }
        let sat = completed || Date().timeIntervalSince(s.start) >= 60 // "You sat." only after a minute
        setMode(sat ? .after : .orient)
    }

    func end() {
        switch mode {
        case .sit: finishSit(completed: false)
        case .wait:
            setMode(.orient)
            Task { await reminders.schedule() }
        case .after: setMode(.orient)
        default: break
        }
    }

    var isSitting: Bool { mode == .sit || mode == .wait }

    private func onBell(at bellTime: Date) {
        globe.bell()
        if soundOn { bell.strike() } else { note("Sound is off.") }
        if mode == .wait { startSit(length: TimeInterval(durationMin * 60), start: bellTime, ring: false) }
    }

    private func note(_ text: String) {
        withAnimation(.easeInOut(duration: 2)) { bellNote = text }
        noteTimer?.invalidate()
        noteTimer = Timer.scheduledTimer(withTimeInterval: 9, repeats: false) { [weak self] _ in
            Task { @MainActor in withAnimation(.easeInOut(duration: 2)) { self?.bellNote = nil } }
        }
    }

    var shareText: String {
        let a = Clock.localTime(times.next), b = Clock.localTime(times.other)
        return "Twice a day, whoever is awake stops for ten minutes, together. Here that is \(a) and \(b). https://1bpm.org"
    }

    // MARK: at least X people
    // X is the number of stored commitments for this bell. Nothing is added, multiplied or guessed.

    private func followTarget() {
        let next = Clock.isoString(times.phase == .live ? times.lastBell : times.next)
        guard next != target else { return }
        let previous = target
        target = next
        count = nil
        countOK = false
        lastPoll = .distantPast
        // "Count me in for the next one too": carried once, then the choice resets.
        if !previous.isEmpty, alsoNext, committedTo == previous {
            alsoNext = false
            Task { await change(true) }
        }
    }

    var counted: Bool { committedTo == target }

    func poll() async {
        guard !isSitting, !target.isEmpty, UIApplication.shared.applicationState == .active else { return }
        lastPoll = Date()
        let asked = target
        if let n = try? await API.count(asked), asked == target {
            count = n
            countOK = true
        }
    }

    func change(_ on: Bool) async {
        busy = true
        defer { busy = false }
        let session = target
        do {
            let n = try await API.setCommitted(session, on)
            committedTo = on ? session : nil
            UserDefaults.standard.set(committedTo, forKey: "committed")
            if !on { alsoNext = false }
            if session == target { count = n; countOK = true }
            if on { globe.markHere() } // one existing point brightens; it is not a map of anyone
        } catch {
            notice = "The count is unavailable."
        }
    }

    /// Onboarding's "Count me in for the next session".
    func commitNext(_ on: Bool) async -> Bool {
        let session = Clock.isoString(times.next)
        guard (try? await API.setCommitted(session, on)) != nil else { return false }
        committedTo = on ? session : nil
        UserDefaults.standard.set(committedTo, forKey: "committed")
        return true
    }

    func isCommittedToNext() -> Bool { committedTo == Clock.isoString(times.next) }
}
