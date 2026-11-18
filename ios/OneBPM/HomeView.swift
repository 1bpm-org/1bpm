// The world. Approach → orientation → (approaching) → live → sit → after, all one screen.
import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var reminders: Reminders
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var reading = false
    @State private var ready = false
    @State private var debugPage: Page?

    var body: some View {
        let p = model.palette
        GeometryReader { geo in
            let short = geo.size.height < 700
            ZStack {
                p.bg.ignoresSafeArea()

                VStack(spacing: 0) {
                    topBar(p)
                    GlobeView(state: model.globe)
                        .accessibilityHidden(true)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .opacity(model.mode == .approach ? 0 : 1)
                    orientation(p, short: short)
                        .opacity(model.mode == .orient || model.mode == .approach ? 1 : 0)
                        .allowsHitTesting(model.mode == .orient)
                        .accessibilityHidden(model.mode != .orient)
                }

                soon(p)
                if let note = model.bellNote {
                    Text(note).font(Fonts.grotesk(12)).foregroundStyle(p.fg2)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .padding(.top, 70).padding(.horizontal, 24)
                        .transition(.opacity)
                        .accessibilityAddTraits(.updatesFrequently)
                }
                if model.mode == .sit || model.mode == .wait { SitOverlay().transition(.opacity) }
                if model.mode == .after { AfterOverlay().transition(.opacity) }
                if model.mode == .approach { approachMark(p).transition(.opacity) }

                p.bg.ignoresSafeArea().opacity(ready ? 0 : 1).allowsHitTesting(false) // fade from the background colour
            }
            .animation(.easeInOut(duration: 3), value: p.isDay)
        }
        .sheet(isPresented: $reading) { ReadingIndex().environmentObject(model) }
        .sheet(item: $debugPage) { page in NavigationStack { ReadingPage(page: page) }.environmentObject(model) }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.2)) { ready = true }
            #if DEBUG
            // Screenshots in CI: launch with "-page practice" to open a reading page.
            if let name = UserDefaults.standard.string(forKey: "page") { debugPage = Page(rawValue: name) }
            #endif
        }
    }

    private func topBar(_ p: Palette) -> some View {
        HStack {
            HStack(spacing: 10) {
                Image(p.isDay ? "planet-day" : "planet-night").resizable().frame(width: 26, height: 26)
                Text("1BPM").font(Fonts.grotesk(12, .medium)).tracking(2.6)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("1BPM")
            Spacer()
            Button(model.soundOn ? "Sound on" : "Sound off") { model.soundOn.toggle() }
                .buttonStyle(QuietButtonStyle(palette: p, on: model.soundOn))
                .accessibilityAddTraits(model.soundOn ? .isSelected : [])
        }
        .foregroundStyle(p.fg)
        .padding(.horizontal, 24)
        .padding(.top, 8)
        .opacity(model.mode == .approach ? 0 : model.isSitting ? 0.28 : 1)
    }

    private func approachMark(_ p: Palette) -> some View {
        VStack(spacing: 28) {
            Image(p.isDay ? "planet-day" : "planet-night").resizable().frame(width: 180, height: 180)
            Text("1BPM").font(.system(size: 26, weight: .light)).tracking(11)
        }
        .foregroundStyle(p.fg)
        .opacity(ready ? 0.92 : 0)
        .accessibilityHidden(true)
    }

    @ViewBuilder private func soon(_ p: Palette) -> some View {
        if model.times.phase == .approaching && model.mode != .sit {
            let left = model.times.next.timeIntervalSince(model.now)
            VStack(alignment: .leading, spacing: 10) {
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Rectangle().fill(p.fg.opacity(0.06))
                        Rectangle().fill(p.accent.opacity(0.55)).frame(width: g.size.width * min(1, max(0, 1 - left / 600)))
                    }
                }
                .frame(height: 1)
                Text("The bell is soon").font(Fonts.grotesk(12)).foregroundStyle(p.fg2)
            }
            .padding(.horizontal, 24)
            .padding(.top, 52)
            .frame(maxHeight: .infinity, alignment: .top)
            .transition(.opacity)
            .allowsHitTesting(false)
        }
    }

    private func orientation(_ p: Palette, short: Bool) -> some View {
        let t = model.times
        let soon = t.phase == .approaching
        let live = t.phase == .live && t.liveSecondsLeft != nil
        return VStack(alignment: .leading, spacing: 0) {
            Label12(text: "Next session · \(t.nextIsToday ? "Today" : "Tomorrow")", palette: p)
            BigTime(date: t.next, size: short ? 96 : 120, palette: p)
                .accessibilityLabel("Next session \(t.nextIsToday ? "today" : "tomorrow") at \(Clock.localTime(t.next))")
            Text(Clock.digits(t.next.timeIntervalSince(model.now)))
                .font(soon ? .system(size: 28, weight: .light) : Fonts.grotesk(14))
                .monospacedDigit()
                .foregroundStyle(soon ? p.fg : p.fg2)
                .padding(.top, 6)
                .accessibilityLabel("Countdown \(Clock.digits(t.next.timeIntervalSince(model.now)))")
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Label12(text: t.otherIsToday ? "Also today" : "Also tomorrow", palette: p)
                Text(Clock.localTime(t.other)).font(.system(size: 28, weight: .light)).monospacedDigit()
            }
            .padding(.top, short ? 12 : 20)
            HStack(spacing: 20) {
                Text("Your time · \(t.zoneName)")
                Text("06:00 & 18:00 UTC · every day")
            }
            .font(Fonts.grotesk(12))
            .foregroundStyle(p.fg3)
            .padding(.top, 10)
            if !short {
                Text("Twice a day. The same two moments. Whoever is awake.")
                    .font(Fonts.serif(18).italic())
                    .foregroundStyle(p.fg2)
                    .padding(.top, 18)
            }
            commitment(p, live: live).padding(.top, 16)

            HStack(spacing: 10) {
                if live {
                    Button("Join the sit · \(Int((Double(t.liveSecondsLeft ?? 0) / 60).rounded(.up))) min left") { model.joinLive() }
                    Button("Start a full \(model.durationMin)") { model.begin() }
                } else {
                    Button("Wait for the bell") { model.waitForBell() }
                    Button("Begin") { model.begin() }
                }
            }
            .buttonStyle(ActButtonStyle(palette: p))
            .padding(.top, 20)

            secondary(p).padding(.top, 6)
            if let notice = model.notice {
                Text(notice).font(Fonts.grotesk(13)).foregroundStyle(p.fg2).padding(.top, 4)
            }
        }
        .foregroundStyle(p.fg)
        .frame(maxWidth: 560, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.bottom, 12)
    }

    @ViewBuilder private func commitment(_ p: Palette, live: Bool) -> some View {
        if model.countOK {
            VStack(alignment: .leading, spacing: 2) {
                if let n = model.count, n >= 1 {
                    (Text("At least \(n.formatted()) \(n == 1 ? "person" : "people") ").font(Fonts.grotesk(15)).foregroundColor(p.fg)
                        + Text(n == 1 ? "has said they will sit this session." : "have said they will sit this session.")
                        .font(Fonts.grotesk(13)).foregroundColor(p.fg2))
                }
                HStack(spacing: 22) {
                    if model.counted {
                        Text("You’re counted").font(Fonts.grotesk(13)).foregroundStyle(p.fg2).padding(.vertical, 10)
                        if !live {
                            Button("Take me out") { Task { await model.change(false) } }
                                .buttonStyle(QuietButtonStyle(palette: p)).disabled(model.busy)
                        }
                        Button(model.alsoNext ? "✓ Count me in for the next one too" : "Count me in for the next one too") { model.alsoNext.toggle() }
                            .buttonStyle(QuietButtonStyle(palette: p, on: model.alsoNext))
                            .accessibilityAddTraits(model.alsoNext ? .isSelected : [])
                    } else if !live {
                        Button { Task { await model.change(true) } } label: {
                            Text("Count me in").underline(color: p.accent.opacity(0.7))
                        }
                        .buttonStyle(QuietButtonStyle(palette: p, on: true)).disabled(model.busy)
                    }
                }
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }
        }
    }

    private func secondary(_ p: Palette) -> some View {
        HStack(spacing: 20) {
            ForEach([10, 20], id: \.self) { m in
                Button("\(m) min") { model.durationMin = m }
                    .buttonStyle(QuietButtonStyle(palette: p, on: model.durationMin == m))
                    .accessibilityAddTraits(model.durationMin == m ? .isSelected : [])
            }
            switch reminders.state {
            case .off:
                Button("Remind me") { Task { await reminders.turnOn(); if reminders.state == .blocked { model.notice = blockedLine } } }
                    .buttonStyle(QuietButtonStyle(palette: p))
            case .on:
                Button("Stop reminders") { Task { await reminders.turnOff(); model.notice = "Reminders stopped." } }
                    .buttonStyle(QuietButtonStyle(palette: p))
            case .blocked:
                Button("Reminders blocked") { model.notice = blockedLine }
                    .buttonStyle(QuietButtonStyle(palette: p))
            }
            Spacer(minLength: 0)
            Button("Read") { reading = true }.buttonStyle(QuietButtonStyle(palette: p))
        }
        .lineLimit(1)
    }

    private var blockedLine: String { "Notifications are off for 1BPM in Settings. That is the only place to change it." }
}

struct SitOverlay: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let p = model.palette
        ZStack {
            if model.breath { breathLine(p) }
            VStack {
                Spacer()
                HStack(alignment: .center) {
                    Group {
                        if model.mode == .wait {
                            Text("The bell at \(Clock.localTime(model.times.next))  ") + Text(Clock.digits(model.times.next.timeIntervalSince(model.now)))
                        } else if let sit = model.sit {
                            Text(Clock.digits(sit.end.timeIntervalSince(model.now)))
                        }
                    }
                    .font(Fonts.grotesk(13)).monospacedDigit().foregroundStyle(p.fg3)
                    Spacer()
                    if model.mode == .sit {
                        Button("Breath") { model.breath.toggle() }
                            .buttonStyle(QuietButtonStyle(palette: p, on: model.breath))
                            .accessibilityAddTraits(model.breath ? .isSelected : [])
                            .padding(.trailing, 18)
                    }
                    Button("End") { model.end() }
                        .buttonStyle(ActButtonStyle(palette: p, dim: true))
                        .frame(width: 96)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 20)
            }
        }
    }

    /// 4 s in, 6 s out. A pace, not a doctrine. Under reduce motion: brightness only.
    private func breathLine(_ p: Palette) -> some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 10)
            let x = t < 4 ? t / 4 : 1 - (t - 4) / 6
            let e = 0.5 - 0.5 * cos(.pi * x)
            Rectangle()
                .fill(p.fg)
                .frame(width: 280, height: 1)
                .scaleEffect(x: reduceMotion ? 1 : 0.12 + 0.88 * e, y: 1)
                .opacity(reduceMotion ? 0.08 + 0.42 * e : 0.4)
        }
        .accessibilityHidden(true)
    }
}

struct AfterOverlay: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        let p = model.palette
        VStack(alignment: .leading, spacing: 24) {
            Spacer()
            Text("You sat.").font(Fonts.serif(56, .light)).foregroundStyle(p.fg)
            HStack(spacing: 24) {
                ShareLink(item: model.shareText) { Text("Tell one person the time.") }
                    .buttonStyle(ActButtonStyle(palette: p))
                Button("Return") { model.end() }.buttonStyle(QuietButtonStyle(palette: p))
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 40)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.bg.opacity(0.001))
    }
}
