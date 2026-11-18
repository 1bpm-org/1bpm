// One short, dry strike (the same bell the site synthesises, rendered to bell.wav).
// It sounds only when "Sound on" is set, and never loops.
import AVFoundation

final class Bell {
    private var player: AVAudioPlayer?

    private func prepare() -> AVAudioPlayer? {
        if let player { return player }
        guard let url = Bundle.main.url(forResource: "bell", withExtension: "wav") else { return nil }
        // Playback, mixed with whatever else is playing: someone who turned sound on expects to hear the bell.
        try? AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        player = try? AVAudioPlayer(contentsOf: url)
        player?.prepareToPlay()
        return player
    }

    func strike(volume: Float = 1) {
        guard let p = prepare() else { return }
        p.volume = volume
        p.currentTime = 0
        p.play()
    }

    func cancel() { player?.stop() }
}
