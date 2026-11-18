// The world: one THREE.Points of real population, one dark unlit sphere. Two draw calls.
// Each frame writes uniforms only. The buffer is uploaded once.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ColorManagement,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Sphere,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { Phase } from './clock'
import type { Field } from './field'
import { FIELD_FRAGMENT, FIELD_VERTEX, GLOBE_FRAGMENT, GLOBE_VERTEX } from './shaders'

const DEG = Math.PI / 180
const PHASE_INDEX: Record<Phase, number> = { idle: 0, approaching: 1, live: 2, after: 3 }

/** The meridians sit where the bell lands in early afternoon, local solar time. */
export const MERIDIAN_LOCAL_HOUR = 13
const LON_06 = (MERIDIAN_LOCAL_HOUR - 6) * 15 * DEG // 105°E
const LON_18 = (MERIDIAN_LOCAL_HOUR - 18) * 15 * DEG // 75°W

// Shader colours are written to the framebuffer as-is: keep them in sRGB, no linear conversion.
ColorManagement.enabled = false

const PAPER = new Color('#f4f1ea')
const ACCENT = new Color('#c8a571') // low-saturation amber
const CLEAR = new Color('#07080a')
const GLOBE = new Color('#0b0c0f')

export interface WorldLayout {
  width: number
  height: number
  /** globe centre as a fraction of the viewport */
  cx: number
  cy: number
  /** globe radius in CSS px */
  radius: number
}

export interface WorldOptions {
  canvas: HTMLCanvasElement
  field: Field
  reducedMotion: boolean
  maxPixelRatio: number
  homeLonDeg: number
  homeLatDeg: number
  hereIndex: number
}

/** Exponential approach: frame-rate independent, no overshoot, no bounce. */
const ease = (current: number, target: number, dt: number, tau: number) =>
  current + (target - current) * (1 - Math.exp(-dt / tau))

export class World {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(30, 1, 0.1, 100)
  private geometry: BufferGeometry
  private globeGeometry = new SphereGeometry(0.994, 72, 48)
  private fieldMaterial: ShaderMaterial
  private globeMaterial: ShaderMaterial
  private shared: Record<string, { value: unknown }>

  private raf = 0
  private last = 0
  private clock = 0 // seconds of motion time; frozen while sitting
  private hidden = document.hidden
  private visibleFraction = 1

  private layout: WorldLayout = { width: 1, height: 1, cx: 0.5, cy: 0.5, radius: 200 }
  private restDistance = 4
  private distance = 4
  private yaw: number
  private pitch: number
  private yawTarget: number
  private pitchTarget: number

  private phase = 0
  private phaseTarget = 0
  private sweep = -1 // bell sweep progress, <0 when idle
  private here = 0
  private sitting = false
  private settleUntil = 0

  private pixelRatio: number
  private downgraded = false
  private deltas: number[] = []
  private windowStart = 0
  private warm = 0

  private dragging = false
  private lastPointer = { x: 0, y: 0 }
  private onDown: (e: PointerEvent) => void
  private onMove: (e: PointerEvent) => void
  private onUp: (e: PointerEvent) => void
  private onVisibility: () => void

  constructor(private opts: WorldOptions) {
    const { canvas, field } = opts
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, depth: true })
    this.renderer.setClearColor(CLEAR, 1)
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio)
    this.renderer.setPixelRatio(this.pixelRatio)

    this.yaw = this.yawTarget = opts.homeLonDeg * DEG
    this.pitch = this.pitchTarget = opts.homeLatDeg * DEG

    this.shared = {
      uPhase: { value: 0 },
      uTime: { value: 0 },
      uMotion: { value: opts.reducedMotion ? 0 : 1 },
      uSessionLon: { value: [LON_06, LON_18] },
      uSessionWeight: { value: [1, 0.5] },
      uSweepLon: { value: 0 },
      uSweepAmt: { value: 0 },
      uPulse: { value: 1 },
      uAccent: { value: ACCENT },
    }

    this.geometry = new BufferGeometry()
    this.geometry.setAttribute('position', new BufferAttribute(field.positions, 3))
    this.geometry.setAttribute('aData', new BufferAttribute(field.data, 2))
    this.geometry.boundingSphere = new Sphere(new Vector3(), 1.01)

    this.fieldMaterial = new ShaderMaterial({
      vertexShader: FIELD_VERTEX,
      fragmentShader: FIELD_FRAGMENT,
      uniforms: {
        ...this.shared,
        uViewDir: { value: new Vector3(0, 0, 1) },
        uPixelRatio: { value: this.pixelRatio },
        uRestDistance: { value: 4 },
        uHereId: { value: opts.hereIndex },
        uHereGlow: { value: 0 },
        uPaper: { value: PAPER },
      },
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      depthTest: false,
    })

    this.globeMaterial = new ShaderMaterial({
      vertexShader: GLOBE_VERTEX,
      fragmentShader: GLOBE_FRAGMENT,
      uniforms: { ...this.shared, uBase: { value: GLOBE } },
    })

    const globe = new Mesh(this.globeGeometry, this.globeMaterial)
    globe.renderOrder = 0
    const points = new Points(this.geometry, this.fieldMaterial)
    points.renderOrder = 1
    this.scene.add(globe, points)

    // Drag nudges the view. Touch keeps vertical scroll (touch-action: pan-y in CSS).
    this.onDown = (e) => {
      this.dragging = true
      this.lastPointer = { x: e.clientX, y: e.clientY }
    }
    this.onMove = (e) => {
      if (!this.dragging || this.sitting) return
      const dx = e.clientX - this.lastPointer.x
      const dy = e.clientY - this.lastPointer.y
      this.lastPointer = { x: e.clientX, y: e.clientY }
      const k = 0.9 / Math.max(this.layout.radius, 120)
      this.yawTarget -= dx * k
      this.pitchTarget = Math.min(48 * DEG, Math.max(-38 * DEG, this.pitchTarget + dy * k))
      this.wake()
    }
    this.onUp = () => {
      this.dragging = false
    }
    canvas.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointermove', this.onMove, { passive: true })
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)

    this.onVisibility = () => {
      this.hidden = document.hidden
      this.last = 0
      this.deltas = []
      this.warm = 0
      if (!this.hidden) this.wake()
    }
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  /** Approach: start far away; the camera settles on its own. */
  begin(): void {
    this.distance = this.opts.reducedMotion ? this.restDistance : this.restDistance * 2.6
    this.wake()
  }

  setLayout(layout: WorldLayout): void {
    this.layout = layout
    const { width, height, cx, cy, radius } = layout
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    // Shift the projection so the globe centre lands at (cx, cy) without skewing it.
    this.camera.setViewOffset(width, height, (0.5 - cx) * width, (0.5 - cy) * height, width, height)
    const tanHalf = Math.tan((this.camera.fov * DEG) / 2)
    const tanAlpha = (radius * 2 * tanHalf) / height
    this.restDistance = Math.sqrt(1 + 1 / (tanAlpha * tanAlpha))
    if (!this.last) this.distance = this.restDistance
    this.fieldMaterial.uniforms.uRestDistance.value = this.restDistance
    this.camera.updateProjectionMatrix()
    this.wake()
  }

  /** Ease the field toward a session phase. `instant` jumps (first load, tab resync). */
  setPhase(phase: Phase, instant = false): void {
    let target = PHASE_INDEX[phase]
    if (instant) {
      this.phase = this.phaseTarget = target
    } else {
      while (target < this.phaseTarget - 0.01) target += 4 // only ever move forward round the cycle
      this.phaseTarget = target
    }
    this.wake()
  }

  /** Which meridian is the one that matters now. */
  setActiveSession(utc: '06:00' | '18:00'): void {
    this.shared.uSessionWeight.value = utc === '06:00' ? [1, 0.5] : [0.5, 1]
    this.wake()
  }

  /** The bell: one band of light crosses the field once, then everything holds still. */
  bell(): void {
    this.sweep = 0
    this.wake()
  }

  /** One existing point brightens for a few seconds. */
  markHere(): void {
    if (this.opts.hereIndex < 0) return
    this.here = 1
    this.wake()
  }

  setSitting(sitting: boolean): void {
    this.sitting = sitting
    this.settleUntil = performance.now() + 3500
    this.wake()
  }

  /** 0..1 from page scroll. At 0 the canvas is covered and nothing is drawn. */
  setVisibleFraction(f: number): void {
    const wasVisible = this.visibleFraction > 0.01
    this.visibleFraction = f
    if (!wasVisible && f > 0.01) this.wake()
  }

  private needsMotion(now: number): boolean {
    if (this.hidden || this.visibleFraction <= 0.01) return false
    if (this.dragging || this.sweep >= 0 || this.here > 0.001) return true
    if (Math.abs(this.phaseTarget - this.phase) > 0.002) return true
    if (Math.abs(this.distance - this.restDistance) > 0.001) return true
    if (Math.abs(this.yawTarget - this.yaw) > 0.0005 || Math.abs(this.pitchTarget - this.pitch) > 0.0005) return true
    if (now < this.settleUntil) return true
    // Idle drift, breathing meridians and shimmer need frames. Reduced motion and the sit do not.
    return !this.opts.reducedMotion && !this.sitting
  }

  private wake(): void {
    if (!this.raf && !this.hidden) this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number): void => {
    this.raf = 0
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 1 / 60
    if (this.last) this.measure(now, now - this.last)
    this.last = now

    if (!this.sitting) this.clock += dt
    const motion = this.opts.reducedMotion ? 0 : 1

    this.distance = ease(this.distance, this.restDistance, dt, 1.6)
    this.yaw = ease(this.yaw, this.yawTarget, dt, 0.7)
    this.pitch = ease(this.pitch, this.pitchTarget, dt, 0.7)

    this.phase = ease(this.phase, this.phaseTarget, dt, 1.8)
    if (this.phase >= 4 && this.phaseTarget >= 4) {
      this.phase -= 4
      this.phaseTarget -= 4
    }

    // Bell: 7 s band crossing (or a 3 s opacity pulse under reduced motion).
    let sweepAmt = 0
    let pulse = 1
    if (this.sweep >= 0) {
      this.sweep += dt / (motion ? 7 : 3)
      const s = Math.min(this.sweep, 1)
      if (motion) sweepAmt = Math.sin(Math.PI * s)
      else pulse = 1 + 0.35 * Math.sin(Math.PI * s)
      if (this.sweep >= 1) this.sweep = -1
    }
    if (this.here > 0) this.here = Math.max(0, this.here - dt / 7)

    const drift = motion * 9 * DEG * Math.sin((this.clock * 2 * Math.PI) / 150)
    const yaw = this.yaw + drift
    const cp = Math.cos(this.pitch)
    this.camera.position.set(
      this.distance * cp * Math.sin(yaw),
      this.distance * Math.sin(this.pitch),
      this.distance * cp * Math.cos(yaw),
    )
    this.camera.lookAt(0, 0, 0)

    const u = this.fieldMaterial.uniforms
    ;(u.uViewDir.value as Vector3).copy(this.camera.position).normalize()
    u.uPixelRatio.value = this.pixelRatio
    u.uHereGlow.value = Math.sin((Math.PI / 2) * Math.min(1, this.here * 1.6)) * this.here
    this.shared.uTime.value = this.clock
    this.shared.uPhase.value = this.phase
    this.shared.uSweepLon.value = yaw - 1.25 + 2.5 * Math.min(Math.max(this.sweep, 0), 1)
    this.shared.uSweepAmt.value = sweepAmt
    this.shared.uPulse.value = pulse

    this.renderer.render(this.scene, this.camera)

    if (this.needsMotion(now)) this.raf = requestAnimationFrame(this.frame)
    else this.last = 0
  }

  /** p75 of rAF deltas over ~2 s windows. One sustained miss → pixel ratio 1, for good. */
  private measure(now: number, delta: number): void {
    if (this.downgraded) return
    if (delta > 250) {
      this.deltas = []
      this.windowStart = now
      return
    }
    if (!this.windowStart) this.windowStart = now
    this.deltas.push(delta)
    if (now - this.windowStart < 2000) return
    const sorted = this.deltas.slice().sort((a, b) => a - b)
    const p75 = sorted[Math.floor(sorted.length * 0.75)]
    this.deltas = []
    this.windowStart = now
    if (this.warm++ < 1) return // skip the first window: shader compile, approach
    if (p75 > 20 && this.pixelRatio > 1) {
      this.downgraded = true
      this.pixelRatio = 1
      this.renderer.setPixelRatio(1)
      this.renderer.setSize(this.layout.width, this.layout.height, false)
    }
  }

  get drawCalls(): number {
    return this.renderer.info.render.calls
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    const canvas = this.opts.canvas
    canvas.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.geometry.dispose()
    this.globeGeometry.dispose()
    this.fieldMaterial.dispose()
    this.globeMaterial.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
