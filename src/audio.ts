// One bell: a short, dry, struck tone. Synthesised (modal partials + a strike transient).
// Never autoplays: the context is created on the first user gesture.

const PARTIALS: [ratio: number, amp: number, decay: number][] = [
  [0.5, 0.22, 2.6], // hum
  [1.0, 1.0, 2.2],
  [1.003, 0.5, 2.0], // slight beating
  [1.19, 0.42, 1.5],
  [1.5, 0.3, 1.2],
  [2.0, 0.34, 1.0],
  [2.52, 0.2, 0.75],
  [3.01, 0.14, 0.55],
  [4.07, 0.08, 0.35],
]
const FUNDAMENTAL = 528

export class Bell {
  private ctx: AudioContext | null = null
  private scheduled: AudioScheduledSourceNode[] = []
  scheduledFor = 0 // wall-clock ms of a strike already queued on the audio clock

  /** Call from a user gesture. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!Ctx) return
        this.ctx = new Ctx({ latencyHint: 'interactive' })
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      // iOS Safari only fully unlocks once something has played inside the gesture.
      const silent = this.ctx.createBufferSource()
      silent.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate)
      silent.connect(this.ctx.destination)
      silent.start()
    } catch {
      this.ctx = null
    }
  }

  get armed(): boolean {
    return !!this.ctx && this.ctx.state === 'running'
  }

  /** Strike now, or at a wall-clock instant (sample-accurate on the audio clock). */
  strike(atWallMs?: number, gain = 1): void {
    const ctx = this.ctx
    if (!ctx) return
    if (ctx.state === 'suspended') {
      // Unlocked in this same gesture but still waking up: strike as soon as it runs.
      void ctx.resume().then(() => ctx.state === 'running' && this.strike(atWallMs, gain))
      return
    }
    if (ctx.state !== 'running') return
    const lead = atWallMs ? Math.max(0, (atWallMs - Date.now()) / 1000) : 0
    const t = ctx.currentTime + lead + 0.01
    if (atWallMs) this.scheduledFor = atWallMs

    const master = ctx.createGain()
    master.gain.value = 0.16 * gain
    master.connect(ctx.destination)

    for (const [ratio, amp, decay] of PARTIALS) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = FUNDAMENTAL * ratio
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(amp, t + 0.003)
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
      osc.connect(g).connect(master)
      osc.start(t)
      osc.stop(t + decay + 0.05)
      this.track(osc)
    }

    // The strike itself: 20 ms of band-passed noise.
    const len = Math.floor(ctx.sampleRate * 0.02)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2
    const noise = ctx.createBufferSource()
    noise.buffer = buf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 3200
    bp.Q.value = 0.8
    const ng = ctx.createGain()
    ng.gain.value = 0.35
    noise.connect(bp).connect(ng).connect(master)
    noise.start(t)
    this.track(noise)
  }

  private track(node: AudioScheduledSourceNode): void {
    this.scheduled.push(node)
    node.onended = () => {
      this.scheduled = this.scheduled.filter((n) => n !== node)
      if (!this.scheduled.length) this.scheduledFor = 0
    }
  }

  /** Silence anything queued or ringing. */
  cancel(): void {
    for (const n of this.scheduled) {
      try {
        n.stop()
      } catch {
        /* already stopped */
      }
    }
    this.scheduled = []
    this.scheduledFor = 0
  }

  dispose(): void {
    this.cancel()
    void this.ctx?.close()
    this.ctx = null
  }
}
