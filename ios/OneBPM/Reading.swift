// The letter and the four reading pages. Plain text, selectable, no globe.
import SwiftUI

struct Item {
    let heading: String?
    let paragraphs: [String]
}

enum Page: String, CaseIterable, Identifiable {
    case letter, practice, session, room, difficulties
    var id: String { rawValue }

    var title: String {
        switch self {
        case .letter: return "The letter"
        case .practice: return "How to sit"
        case .session: return "The session"
        case .room: return "If you open a room"
        case .difficulties: return "When it is hard"
        }
    }

    var link: String {
        switch self {
        case .letter: return "The letter"
        case .practice: return "Practice"
        case .session: return "Session"
        case .room: return "A room"
        case .difficulties: return "When it is hard"
        }
    }

    var lead: String? {
        switch self {
        case .practice: return "There is no correct religion for this, and no incorrect one. The guidelines are about attention and the body. Use them until you do not need them."
        case .letter: return "There have never been this many of us. There has rarely been this much distance."
        default: return nil
        }
    }

    var numbered: Bool { self == .practice }

    var items: [Item] {
        switch self {
        case .letter:
            return [
                "1BPM is a non-profit pause. Fully bootstrapped. No product behind the silence.",
                "We sit at 06:00 UTC and 18:00 UTC because those are the two hours when the fewest people on Earth are in the middle of the night. Asia is awake for one. The Americas are awake for the other. Europe and Africa can often make both. The point is not a perfect meeting. The point is that almost no one is locked out of both.",
                "You do not need an app, a teacher, or a belief. Sit. Or stand. Or walk slowly. Ten minutes is enough. Twenty if you want.",
                "If you run a room — a studio, a school, a shift, a kitchen — you can open it at the bell. Tell people the local time. That is the whole method.",
                "One billion is not a leaderboard. It is a direction: enough people, often enough, that the pause becomes ordinary.",
                "Anyone who feels this is worth doing is already part of it.",
            ].map { Item(heading: nil, paragraphs: [$0]) }
        case .practice:
            return [
                Item(heading: "Pick a duration before you start.", paragraphs: ["Ten minutes is the session. Twenty is the longer one. Do not renegotiate in the middle. When the time ends, stop."]),
                Item(heading: "Let the body be sustainable.", paragraphs: [
                    "Sit, stand, or walk slowly. Feet on the floor, or folded only if the knees will last the full ten minutes. Hands rest. Jaw unclenched. Eyes open with a soft gaze, or closed if that does not cause sleep. Lying down is allowed if sitting hurts; sleep is rest, not a failed sit.",
                    "Do not chase a photogenic posture. Sharp pain, numbness, or joint strain means move. Ordinary stillness-ache can be watched. Scratch what itches. Shift, then return."]),
                Item(heading: "One anchor, not a blank mind.", paragraphs: ["Breath at the nostrils or the belly, or the feet on the floor, or the next step if walking. When attention leaves, notice and come back. That return is the practice. Thoughts may stay in the room. You do not have to follow them or replace them."]),
                Item(heading: "Do not manage the breath unless it is the anchor.", paragraphs: ["Feel it; do not perform it. A few slower cycles at a very agitated start are allowed, then stop controlling. A full-sit breathing technique is a different exercise: allowed, not required, not more advanced."]),
                Item(heading: "Kindness is practical.", paragraphs: ["When you notice you left, do not add a punishment. The sentence is only: Back."]),
                Item(heading: "You do not need an experience.", paragraphs: ["No warmth, vision, insight, tears, or calm is required. If the sit was boring or scattered, it was real. Do not hunt calm."]),
                Item(heading: "Ending.", paragraphs: ["Do not leap. Feel the room for a few breaths. In a group, let silence stay a moment. Do not ask what people saw."]),
            ]
        case .session:
            return [
                "The sit is the ten minutes after 06:00:00 UTC or 18:00:00 UTC. Twenty only if chosen beforehand.",
                "Together means the same two moments, not one shared vision and not one synchronized breath.",
                "Phone face down if that is easy. If it is not, begin anyway.",
                "No mantra required. If someone already prays or counts in a tradition, they may use it, and they still stop when the time ends. The app does not rank faiths or replace them.",
                "Walking is in bounds: short path, slower than errands, attention on the feet, eyes open. Not exercise.",
                "A group needs no leader. If the room wants words, only: the local time, the duration, and that you stop when it ends.",
                "Nothing is owed back to the app.",
            ].map { Item(heading: nil, paragraphs: [$0]) }
        case .room:
            return [
                "Say the local time out loud, and say the other one.",
                "Ten minutes. A visible clock. Stop even if it felt short.",
                "Chairs are enough. A way to leave without apologizing.",
                "No incense required. No dimming required. Enough light to be safe.",
                "Read at most these three lines, or none:\n“We sit for ten minutes.”\n“Attention on the breath, or the feet. When it wanders, come back.”\n“We stop at the bell, even if the room is quiet in a way we like.”",
                "Do not ask for shares afterward. If someone is shaken, a human stays. This app is not a crisis service.",
                "A studio, a school, and a kitchen are the same practice.",
                "No fee is required to sit with 1BPM. A studio’s own class fee is not a payment to 1BPM.",
            ].map { Item(heading: nil, paragraphs: [$0]) }
        case .difficulties:
            return [
                Item(heading: "I can’t stop thinking.", paragraphs: ["You are not supposed to. Come back. Counting the breath from 1 to 10, then restarting, is a legal aid. Losing count means start at 1. Do not keep score."]),
                Item(heading: "I got sleepy.", paragraphs: ["Open the eyes. Sit up. Feel the feet. If the body needs sleep, nap, and use the other bell. Do not win against exhaustion."]),
                Item(heading: "I felt worse.", paragraphs: [
                    "Shorten to five minutes. Open the eyes. Feel the chair and name three things you can see.",
                    "If practice regularly leaves you worse, stop and speak to a clinician. Do not push through. This is not treatment.",
                    "If you are in danger now, call your local emergency number. findahelpline.com lists a free, confidential line in many countries."]),
                Item(heading: "I need a special morning.", paragraphs: ["You do not. A parked car or a break room is enough."]),
                Item(heading: "I missed the bell.", paragraphs: ["Sit later, or wait for the other one. There is no streak."]),
                Item(heading: "I want it deeper.", paragraphs: ["Longer sits are yours to try later. Depth is not a sensation. Hunting it usually means leaving the anchor."]),
                Item(heading: "I am in pain.", paragraphs: ["Move. Sharp pain, chest pain, or trouble breathing: stop. That is medical."]),
                Item(heading: "I don’t know if I’m doing it right.", paragraphs: ["A chosen duration, one anchor, and a return when you notice you left. That is the whole test."]),
            ]
        }
    }

    var close: String? {
        switch self {
        case .practice: return "Same time tomorrow is enough. The other bell exists if this one is in the middle of your night."
        case .difficulties: return "The best instruction is the shortest one you will still remember at minute eight: Back."
        default: return nil
        }
    }
}

struct ReadingPage: View {
    @EnvironmentObject private var model: AppModel
    let page: Page

    var body: some View {
        let p = model.palette
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if page != .letter {
                    Text(page.title).font(Fonts.serif(44, .light)).padding(.bottom, 26).accessibilityAddTraits(.isHeader)
                }
                if page == .session { yourTimes(p).padding(.bottom, 30) }
                if let lead = page.lead {
                    Text(lead).font(Fonts.serif(page == .letter ? 27 : 22, .light)).lineSpacing(4).padding(.bottom, 30)
                }
                ForEach(Array(page.items.enumerated()), id: \.offset) { i, item in
                    VStack(alignment: .leading, spacing: 8) {
                        if let h = item.heading {
                            HStack(spacing: 8) {
                                if page.numbered { Text("\(i + 1)").foregroundStyle(p.accent).monospacedDigit() }
                                Text(h)
                            }
                            .font(Fonts.grotesk(15, .medium))
                            .accessibilityAddTraits(.isHeader)
                        }
                        ForEach(item.paragraphs, id: \.self) { para in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                if item.heading == nil && page != .letter {
                                    Rectangle().fill(p.accent.opacity(0.8)).frame(width: 8, height: 1).offset(y: -5)
                                }
                                Text(para).font(Fonts.serif(19)).lineSpacing(6).foregroundStyle(p.fg.opacity(0.9))
                            }
                        }
                    }
                    .padding(.bottom, 24)
                }
                if let close = page.close {
                    Text(close).font(Fonts.serif(19).italic()).lineSpacing(5).padding(.top, 12)
                }
                if page == .letter {
                    Text("The points are where people live: GHS-POP 2025, European Commission Joint Research Centre, summed to one degree. The two faint lines are where each bell falls in the early afternoon.")
                        .font(Fonts.grotesk(12)).foregroundStyle(p.fg3).padding(.top, 30)
                }
            }
            .foregroundStyle(p.fg)
            .textSelection(.enabled)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(24)
            .padding(.top, 20)
        }
        .background(p.bg.ignoresSafeArea())
        .toolbarBackground(p.bg, for: .navigationBar)
    }

    private func yourTimes(_ p: Palette) -> some View {
        let t = model.times
        let (a, b) = t.nextIs06 ? (t.next, t.other) : (t.other, t.next)
        return VStack(alignment: .leading, spacing: 2) {
            ForEach([("06:00 UTC", a), ("18:00 UTC", b)], id: \.0) { label, date in
                HStack(alignment: .firstTextBaseline, spacing: 16) {
                    Label12(text: label, palette: p).frame(width: 110, alignment: .leading)
                    Text(Clock.localTime(date)).font(.system(size: 40, weight: .thin)).monospacedDigit()
                }
            }
            Text("Your time · \(t.zoneName) · 06:00 UTC · 18:00 UTC").font(Fonts.grotesk(12)).foregroundStyle(p.fg3).padding(.top, 8)
        }
    }
}

/// "Read": the letter, the four pages, the footer line, and the way back to the introduction.
struct ReadingIndex: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @AppStorage("onboarded") private var onboarded = true

    var body: some View {
        let p = model.palette
        NavigationStack {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Page.allCases) { page in
                    NavigationLink(value: page) {
                        HStack {
                            Text(page.link).font(Fonts.serif(26, .light))
                            Spacer()
                        }
                        .padding(.vertical, 14)
                        .contentShape(Rectangle())
                    }
                    Rectangle().fill(p.hair).frame(height: 1)
                }
                Spacer()
                Text("Non-profit. No account. No tracking required to sit.").font(Fonts.grotesk(12)).foregroundStyle(p.fg3)
                Button("See the introduction") { dismiss(); onboarded = false }
                    .buttonStyle(QuietButtonStyle(palette: p))
            }
            .foregroundStyle(p.fg)
            .padding(24)
            .background(p.bg.ignoresSafeArea())
            .navigationDestination(for: Page.self) { ReadingPage(page: $0) }
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() }.tint(p.fg) } }
        }
        .preferredColorScheme(p.isDay ? .light : .dark)
    }
}
