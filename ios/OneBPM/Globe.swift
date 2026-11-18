// The world: one point draw of real population and one quad for the globe. Two draw calls.
// Buffers are uploaded once; each frame writes a small uniform block.
import MetalKit
import SwiftUI

/// Written by the app model, read by the renderer every frame.
final class GlobeState {
    var palette: Palette = .night
    var phase: Phase = .idle
    var activeIs06 = true
    var sitting = false
    var reducedMotion = false
    fileprivate var bellRequested = false
    fileprivate var hereRequested = false

    /// The bell: one band of light crosses the field once (an opacity pulse under reduce motion).
    func bell() { bellRequested = true }
    /// One existing point brightens for a few seconds.
    func markHere() { hereRequested = true }
}

private struct Uniforms {
    var right = SIMD4<Float>(), up = SIMD4<Float>(), view = SIMD4<Float>()
    var dotColor = SIMD4<Float>(), accent = SIMD4<Float>(), base = SIMD4<Float>()
    var misc = SIMD4<Float>(), layout = SIMD4<Float>(), viewport = SIMD4<Float>(), session = SIMD4<Float>()
}

private let deg: Float = .pi / 180
private let lon06: Float = (13 - 6) * 15 * deg   // where the 06:00 UTC bell lands at 13:00 solar time: 105°E
private let lon18: Float = (13 - 18) * 15 * deg  // and the 18:00 UTC bell: 75°W

/// Exponential approach: frame-rate independent, no overshoot, no bounce.
private func ease(_ c: Float, _ t: Float, _ dt: Float, _ tau: Float) -> Float { c + (t - c) * (1 - exp(-dt / tau)) }

final class GlobeRenderer: NSObject, MTKViewDelegate {
    private let queue: MTLCommandQueue
    private let fieldPipeline: MTLRenderPipelineState
    private let globePipeline: MTLRenderPipelineState
    private let positions: MTLBuffer
    private let data: MTLBuffer
    private let count: Int
    private let hereIndex: Int
    private let state: GlobeState

    private var last: CFTimeInterval = 0
    private var clock: Float = 0
    private let yaw: Float
    private let pitch: Float
    private var zoom: Float
    private var phase: Float = 0
    private var phaseTarget: Float = 0
    private var shownPhase: Phase?
    private var sweep: Float = -1
    private var here: Float = 0

    init?(view: MTKView, state: GlobeState, field: Field, hereIndex: Int, homeLonDeg: Float, homeLatDeg: Float) {
        guard let device = view.device, let queue = device.makeCommandQueue(), let library = device.makeDefaultLibrary(),
              !field.positions.isEmpty else { return nil }
        func pipeline(_ v: String, _ f: String) -> MTLRenderPipelineState? {
            let d = MTLRenderPipelineDescriptor()
            d.vertexFunction = library.makeFunction(name: v)
            d.fragmentFunction = library.makeFunction(name: f)
            let c = d.colorAttachments[0]!
            c.pixelFormat = view.colorPixelFormat
            c.isBlendingEnabled = true // premultiplied alpha
            c.sourceRGBBlendFactor = .one
            c.sourceAlphaBlendFactor = .one
            c.destinationRGBBlendFactor = .oneMinusSourceAlpha
            c.destinationAlphaBlendFactor = .oneMinusSourceAlpha
            return try? device.makeRenderPipelineState(descriptor: d)
        }
        guard let fp = pipeline("fieldVertex", "fieldFragment"), let gp = pipeline("globeVertex", "globeFragment") else { return nil }
        let pos = field.positions.map { SIMD4<Float>($0, 1) }
        guard let pb = device.makeBuffer(bytes: pos, length: pos.count * MemoryLayout<SIMD4<Float>>.stride),
              let db = device.makeBuffer(bytes: field.data, length: field.data.count * MemoryLayout<SIMD2<Float>>.stride)
        else { return nil }
        self.queue = queue
        self.fieldPipeline = fp
        self.globePipeline = gp
        self.positions = pb
        self.data = db
        self.count = pos.count
        self.hereIndex = hereIndex
        self.state = state
        self.yaw = homeLonDeg * deg
        self.pitch = max(-22, min(28, homeLatDeg)) * deg
        self.zoom = state.reducedMotion ? 1 : 0.4 // approach: the world arrives from a distance
        super.init()
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    func draw(in view: MTKView) {
        let now = CACurrentMediaTime()
        let dt = last == 0 ? Float(1.0 / 30) : Float(min(now - last, 0.1))
        last = now
        let motion: Float = state.reducedMotion ? 0 : 1
        if !state.sitting { clock += dt }

        // Phase: eased forward round the cycle 0 → 1 → 2 → 3 → 4 ≡ 0.
        if shownPhase != state.phase {
            var target = Float(state.phase.rawValue)
            if shownPhase == nil {
                phase = target
            } else {
                while target < phaseTarget - 0.01 { target += 4 }
            }
            phaseTarget = target
            shownPhase = state.phase
        }
        phase = ease(phase, phaseTarget, dt, 1.8)
        if phase >= 4 && phaseTarget >= 4 { phase -= 4; phaseTarget -= 4 }
        zoom = ease(zoom, 1, dt, 1.6)

        if state.bellRequested { state.bellRequested = false; sweep = 0 }
        if state.hereRequested { state.hereRequested = false; if hereIndex >= 0 { here = 1 } }
        var sweepAmt: Float = 0
        var pulse: Float = 1
        if sweep >= 0 {
            sweep += dt / (motion > 0 ? 7 : 3)
            let s = min(sweep, 1)
            if motion > 0 { sweepAmt = sin(.pi * s) } else { pulse = 1 + 0.35 * sin(.pi * s) }
            if sweep >= 1 { sweep = -1 }
        }
        if here > 0 { here = max(0, here - dt / 7) }

        // Camera direction from the visitor's longitude and a latitude for their region; slow drift.
        let y = yaw + motion * 9 * deg * sin(clock * 2 * .pi / 150)
        let p = pitch
        let v = SIMD3<Float>(cos(p) * sin(y), sin(p), cos(p) * cos(y))
        let right = SIMD3<Float>(cos(y), 0, -sin(y))
        let up = cross(v, right)

        let size = view.drawableSize
        let w = Float(size.width), h = Float(size.height)
        let pal = state.palette
        var u = Uniforms()
        u.right = SIMD4(right, 0)
        u.up = SIMD4(up, 0)
        u.view = SIMD4(v, 0)
        u.dotColor = SIMD4(pal.dotRGB, pal.isDay ? 1 : 0)
        u.accent = SIMD4(pal.accentRGB, pulse)
        u.base = SIMD4(pal.globeRGB, phase)
        u.misc = SIMD4(clock, motion, y - 1.25 + 2.5 * min(max(sweep, 0), 1), sweepAmt)
        u.layout = SIMD4(w / 2, h / 2, min(w, h) * 0.46 * zoom, Float(view.contentScaleFactor))
        u.viewport = SIMD4(w, h, Float(hereIndex), sin(.pi / 2 * min(1, here * 1.6)) * here)
        u.session = state.activeIs06 ? SIMD4(lon06, lon18, 1, 0.5) : SIMD4(lon06, lon18, 0.5, 1)

        // Calm frame rates: the sit draws rarely; the bell and the approach draw smoothly.
        let busy = sweep >= 0 || here > 0 || abs(zoom - 1) > 0.002 || abs(phaseTarget - phase) > 0.002
        view.preferredFramesPerSecond = busy ? 30 : state.sitting ? 6 : motion > 0 ? 30 : 10

        guard let pass = view.currentRenderPassDescriptor, let drawable = view.currentDrawable,
              let buffer = queue.makeCommandBuffer(), let enc = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }
        enc.setRenderPipelineState(globePipeline)
        enc.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 0)
        enc.setFragmentBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 0)
        enc.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
        enc.setRenderPipelineState(fieldPipeline)
        enc.setVertexBuffer(positions, offset: 0, index: 0)
        enc.setVertexBuffer(data, offset: 0, index: 1)
        enc.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 2)
        enc.setFragmentBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 0)
        enc.drawPrimitives(type: .point, vertexStart: 0, vertexCount: count)
        enc.endEncoding()
        buffer.present(drawable)
        buffer.commit()
    }
}

/// The globe as a SwiftUI view. Decorative: hidden from VoiceOver. If Metal or the data is
/// unavailable it draws nothing, and the app is still complete.
struct GlobeView: UIViewRepresentable {
    let state: GlobeState

    final class Coordinator { var renderer: GlobeRenderer? }
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MTKView {
        let view = MTKView(frame: .zero, device: MTLCreateSystemDefaultDevice())
        view.colorPixelFormat = .bgra8Unorm
        view.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.framebufferOnly = true
        view.preferredFramesPerSecond = 30
        view.isPaused = true
        guard view.device != nil else { return view }

        let phone = UIDevice.current.userInterfaceIdiom == .phone
        let zone = TimeZone.current
        let homeLon = Double(zone.secondsFromGMT()) / 240
        let (latMin, latMax) = FieldBuilder.regionLat(zone.identifier)
        let state = self.state
        let coordinator = context.coordinator
        DispatchQueue.global(qos: .userInitiated).async {
            guard let grid = FieldBuilder.loadGrid() else { return }
            let field = FieldBuilder.sample(grid: grid, target: phone ? 12_000 : 28_000, candidates: phone ? 500_000 : 1_000_000)
            let here = FieldBuilder.pickHere(field, lonDeg: homeLon, latMin: latMin, latMax: latMax)
            DispatchQueue.main.async {
                guard let r = GlobeRenderer(view: view, state: state, field: field, hereIndex: here,
                                            homeLonDeg: Float(homeLon), homeLatDeg: Float((latMin + latMax) / 2)) else { return }
                coordinator.renderer = r
                view.delegate = r
                view.isPaused = false
            }
        }
        return view
    }

    func updateUIView(_ view: MTKView, context: Context) {}
}
