import SwiftUI

/// Hairline-bordered, quiet. 44 pt tall.
struct ActButtonStyle: ButtonStyle {
    let palette: Palette
    var dim = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Fonts.grotesk(15))
            .foregroundStyle(dim ? palette.fg2 : palette.fg)
            .frame(minHeight: 44)
            .padding(.horizontal, 20)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 2).stroke(dim ? palette.fg.opacity(0.12) : palette.hair, lineWidth: 1))
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

/// Small text button.
struct QuietButtonStyle: ButtonStyle {
    let palette: Palette
    var on = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Fonts.grotesk(13))
            .foregroundStyle(on ? palette.fg : palette.fg2)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

struct Label12: View {
    let text: String
    let palette: Palette
    var body: some View {
        Text(text.uppercased())
            .font(Fonts.grotesk(12, .medium))
            .tracking(1.7)
            .foregroundStyle(palette.fg2)
    }
}

/// A time as huge numerals, with any AM/PM set small beside it.
struct BigTime: View {
    let date: Date
    let size: CGFloat
    let palette: Palette

    var body: some View {
        let (digits, period) = Self.split(Clock.localTime(date))
        HStack(alignment: .firstTextBaseline, spacing: size * 0.06) {
            Text(digits)
                .font(.system(size: size, weight: .thin))
                .monospacedDigit()
                .tracking(-size * 0.04)
            if let period {
                Text(period).font(.system(size: size * 0.26, weight: .light))
            }
        }
        .foregroundStyle(palette.fg)
        .lineLimit(1)
        .minimumScaleFactor(0.5)
    }

    static func split(_ s: String) -> (String, String?) {
        let f = DateFormatter()
        f.locale = .current
        for p in [f.amSymbol, f.pmSymbol].compactMap({ $0 }) where s.contains(p) {
            return (s.replacingOccurrences(of: p, with: "").trimmingCharacters(in: .whitespaces), p)
        }
        return (s, nil)
    }
}

extension View {
    func readingPadding() -> some View { padding(.horizontal, 24) }
}
