// First run: four steps, one idea each. Skip is always there and as visible as Next.
import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var reminders: Reminders
    let done: () -> Void
    @State private var step = 0
    @State private var counted = false
    @State private var line: String?
    @State private var showGuide = false
    @AccessibilityFocusState private var headingFocused: Bool

    var body: some View {
        let p = model.palette
        ZStack {
            p.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    ForEach(0..<4, id: \.self) { i in
                        Rectangle().fill(i <= step ? p.accent.opacity(0.85) : p.hair).frame(height: 1)
                    }
                }
                .frame(maxWidth: 220)
                .accessibilityHidden(true)
                Label12(text: "\(step + 1) of 4", palette: p).padding(.top, 14)

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) { content(p) }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 40)
                        .id(step)
                        .transition(.opacity)
                }
                .scrollBounceBehavior(.basedOnSize)

                HStack(spacing: 10) {
                    Button(step == 3 ? "Enter" : "Next") {
                        if step == 3 { finish() } else { withAnimation(.easeInOut(duration: 0.8)) { step += 1 }; headingFocused = true }
                    }
                    Button("Skip") { finish() }
                }
                .buttonStyle(ActButtonStyle(palette: p))
                .padding(.bottom, 12)
            }
            .foregroundStyle(p.fg)
            .padding(.horizontal, 24)
            .padding(.top, 48)
        }
        .sheet(isPresented: $showGuide) { NavigationStack { ReadingPage(page: .practice) }.environmentObject(model) }
        .onAppear { counted = model.isCommittedToNext() }
    }

    private func finish() {
        UserDefaults.standard.set(true, forKey: "onboarded")
        done()
    }

    private func heading(_ s: String) -> some View {
        Text(s).font(Fonts.serif(38, .light)).fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
            .accessibilityFocused($headingFocused)
    }

    private func para(_ s: String, _ p: Palette) -> some View {
        Text(s).font(Fonts.serif(20)).foregroundStyle(p.fg.opacity(0.86)).lineSpacing(5).fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder private func content(_ p: Palette) -> some View {
        let t = model.times
        switch step {
        case 0:
            heading("There have never been this many of us, and rarely this much distance.")
            para("1BPM is a ten-minute pause at two exact times. No account. No belief required.", p)
        case 1:
            heading("06:00 UTC and 18:00 UTC.")
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    Label12(text: "Next · \(t.nextIsToday ? "Today" : "Tomorrow")", palette: p).frame(width: 130, alignment: .leading)
                    Text(Clock.localTime(t.next)).font(.system(size: 40, weight: .thin)).monospacedDigit()
                }
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    Label12(text: t.otherIsToday ? "Also today" : "Also tomorrow", palette: p).frame(width: 130, alignment: .leading)
                    Text(Clock.localTime(t.other)).font(.system(size: 40, weight: .thin)).monospacedDigit()
                }
                Text("Your time · \(TimeZone.current.identifier) (\(t.zoneName))").font(Fonts.grotesk(12)).foregroundStyle(p.fg3).padding(.top, 6)
            }
            para("Asia is awake for one. The Americas for the other. Almost no one is locked out of both.", p)
        case 2:
            heading("Pick 10 or 20 minutes before you start.")
            para("One anchor: the breath, or the feet. When attention leaves, come back. Stopping on time is the practice.", p)
            Button { showGuide = true } label: { Text("Read the guidelines").underline(color: p.accent.opacity(0.7)) }
                .buttonStyle(QuietButtonStyle(palette: p, on: true))
        default:
            heading("Being counted, and being told.")
            para("You can say you will sit the next session. The app will show “at least X people,” because anyone without it can still sit and will not be counted.", p)
            VStack(alignment: .leading, spacing: 4) {
                Toggle("Remind me", isOn: Binding(
                    get: { reminders.state == .on },
                    set: { on in Task {
                        line = nil
                        if on { await reminders.turnOn() } else { await reminders.turnOff() }
                        if reminders.state == .blocked { line = "Notifications are off for 1BPM in Settings. That is the only place to change it." }
                    } }))
                Toggle("Count me in for the next session", isOn: Binding(
                    get: { counted },
                    set: { on in Task {
                        line = nil
                        if await model.commitNext(on) { counted = on } else { line = "The count is unavailable." }
                    } }))
            }
            .font(Fonts.grotesk(15))
            .tint(p.accent)
            .padding(.top, 8)
            if let line { Text(line).font(Fonts.grotesk(13)).foregroundStyle(p.fg2) }
        }
    }
}
