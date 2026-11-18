// Two palettes, chosen by the half of the day on the visitor's own clock. One accent, amber.
import SwiftUI

struct Palette {
    let bg: Color
    let fg: Color
    let accent: Color
    // For Metal: sRGB components, written to the framebuffer as they are.
    let bgRGB: SIMD3<Float>
    let dotRGB: SIMD3<Float>
    let accentRGB: SIMD3<Float>
    let globeRGB: SIMD3<Float>
    let isDay: Bool

    var fg2: Color { fg.opacity(0.62) }
    var fg3: Color { fg.opacity(0.42) }
    var hair: Color { fg.opacity(0.16) }

    static let night = Palette(hex: 0x07080A, fg: 0xF4F1EA, accent: 0xC8A571, globe: 0x0B0C0F, isDay: false)
    static let day = Palette(hex: 0xF4F1EA, fg: 0x07080A, accent: 0x9A7642, globe: 0xE9E4D8, isDay: true)

    init(hex bg: UInt32, fg: UInt32, accent: UInt32, globe: UInt32, isDay: Bool) {
        self.bg = Color(rgb: bg)
        self.fg = Color(rgb: fg)
        self.accent = Color(rgb: accent)
        self.bgRGB = rgb(bg)
        self.dotRGB = rgb(fg)
        self.accentRGB = rgb(accent)
        self.globeRGB = rgb(globe)
        self.isDay = isDay
    }
}

private func rgb(_ v: UInt32) -> SIMD3<Float> {
    SIMD3(Float((v >> 16) & 0xFF) / 255, Float((v >> 8) & 0xFF) / 255, Float(v & 0xFF) / 255)
}

extension Color {
    init(rgb v: UInt32) {
        self.init(.sRGB, red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
}

enum Fonts {
    /// Precise grotesk for times and labels.
    static func grotesk(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight) }
    /// Modern serif for reading.
    static func serif(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight, design: .serif) }
}
