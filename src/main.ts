import './style.css'
import { Bell } from './audio'
import { getCount } from './api'
import { localHalf, MINUTE, runtimeTimeZone, sessionTimes, type Phase, type SessionTimes } from './clock'
import { alsoNext, committedTo, isCommitted, setCommitted } from './commit'
import { t, type CopyKey } from './copy'
import { GRID_H, GRID_W, pickHere, sampleField } from './field'
import { markSitting, remindState, resync as resyncReminders, start as startReminders, turnOff, turnOn } from './reminders'
import { store } from './store'
import { applyTheme as applySharedTheme, type Theme } from './theme'
import { World } from './world'

type Mode = 'approach' | 'orient' | 'wait' | 'sit' | 'after'

const tz = runtimeTimeZone()
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const body = document.body

const el = {
  canvas: $<HTMLCanvasElement>('field'),
  nextDay: $('next-day'),
  nextTime: $('next-time'),
  countdown: $('countdown'),
  alsoLabel: $('also-label'),
  otherTime: $('other-time'),
  zone: $('zone'),
  wait: $<HTMLButtonElement>('wait'),
  begin: $<HTMLButtonElement>('begin'),
  join: $<HTMLButtonElement>('join'),
  full: $<HTMLButtonElement>('full'),
  remind: $<HTMLButtonElement>('remind'),
  stopRemind: $<HTMLButtonElement>('stop-remind'),
  commit: $('commit'),
  count: $('count'),
  countLead: $('count-lead'),
  countRest: $('count-rest'),
  commitBtn: $<HTMLButtonElement>('commit-btn'),
  takeOut: $<HTMLButtonElement>('take-out'),
  alsoNext: $<HTMLButtonElement>('also-next'),
  sound: $<HTMLButtonElement>('sound'),
  notice: $('notice'),
  bellNote: $('bell-note'),
  sit: $('sit'),
  sitLabel: $('sit-label'),
  sitClock: $('sit-clock'),
  breath: $<HTMLButtonElement>('breath'),
  end: $<HTMLButtonElement>('end'),
  after: $('after'),
  share: $<HTMLButtonElement>('share'),
  ret: $<HTMLButtonElement>('return'),
  shareNotice: $('share-notice'),
  durations: Array.from(document.querySelectorAll<HTMLButtonElement>('.dur')),
}

// ---------- state ----------

let mode: Mode = 'approach'
let durationMin = 10
let sit: { startWall: number; startPerf: number; lengthMs: number } | null = null
let lastBellSeen = 0
let lastPhase: Phase | null = null
let current: SessionTimes = sessionTimes(new Date(), tz)
let world: World | null = null
let tickTimer = 0
let afterTimer = 0
let noteTimer = 0
const bell = new Bell()

let soundOn = store.get('1bpm.sound') !== 'off'

// ---------- formatting (all through Intl) ----------

const timeParts = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz })
const whole = new Intl.NumberFormat(undefined)
const two = new Intl.NumberFormat(undefined, { minimumIntegerDigits: 2, useGrouping: false })
const one = new Intl.NumberFormat(undefined, { useGrouping: false })

function renderTime(target: HTMLElement, d: Date): void {
  const frag = document.createDocumentFragment()
  let text = ''
  for (const p of timeParts.formatToParts(d)) {
    if (p.type === 'dayPeriod') {
      if (text) frag.append(text.trimEnd())
      text = ''
      const s = document.createElement('span')
      s.className = 'ampm'
      s.textContent = p.value
      frag.append(s)
    } else text += p.value
  }
  if (text) frag.append(text)
  target.replaceChildren(frag)
}

/** m:ss, or h:mm:ss. Digits localised. */
function clockDigits(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h ? `${one.format(h)}:${two.format(m)}:${two.format(s)}` : `${one.format(m)}:${two.format(s)}`
}

// ---------- modes ----------

function setMode(next: Mode): void {
  mode = next
  body.dataset.mode = next
  el.sit.hidden = next !== 'sit' && next !== 'wait'
  el.after.hidden = next !== 'after'
  world?.setSitting(next === 'sit' || next === 'wait')
  clearTimeout(afterTimer)
  if (next === 'after') afterTimer = window.setTimeout(() => mode === 'after' && setMode('orient'), 90_000)
  if (next !== 'sit') body.dataset.breath = 'false'
  render()
}

/** `ring`: strike to open the sit. False when the shared bell has just rung for it. */
function startSit(lengthMs: number, startWall = Date.now(), ring = true): void {
  sit = { startWall, startPerf: performance.now() - (Date.now() - startWall), lengthMs }
  markSitting(startWall + lengthMs)
  if (ring && soundOn) bell.strike()
  el.breath.setAttribute('aria-pressed', 'false')
  if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
  setMode('sit')
  el.end.focus({ preventScroll: true })
  schedule()
}

function waitForBell(): void {
  markSitting(current.next.getTime() + durationMin * MINUTE)
  setMode('wait')
  el.end.focus({ preventScroll: true })
}

function finishSit(completed: boolean): void {
  if (!sit) return
  const elapsed = performance.now() - sit.startPerf
  sit = null
  markSitting(null)
  if (completed && soundOn) bell.strike(undefined, 0.55)
  setMode(completed || elapsed >= MINUTE ? 'after' : 'orient')
  ;(mode === 'after' ? el.share : el.begin).focus({ preventScroll: true })
}

function endAny(): void {
  if (mode === 'sit') finishSit(false)
  else if (mode === 'wait') {
    markSitting(null)
    setMode('orient')
    el.wait.focus({ preventScroll: true })
  } else if (mode === 'after') setMode('orient')
}

function onBell(at: number): void {
  world?.bell()
  const audible = soundOn && bell.armed
  if (audible && bell.scheduledFor !== at) bell.strike()
  if (!audible) note(t('soundOff'))
  if (mode === 'wait') startSit(durationMin * MINUTE, at, false)
}

function note(text: string): void {
  el.bellNote.textContent = text
  el.bellNote.classList.add('on')
  clearTimeout(noteTimer)
  noteTimer = window.setTimeout(() => el.bellNote.classList.remove('on'), 9000)
}

// ---------- the tick ----------

function render(): void {
  const s = current
  const now = Date.now()
  const untilNext = s.next.getTime() - now

  renderTime(el.nextTime, s.next)
  renderTime(el.otherTime, s.other)
  el.nextDay.textContent = t(s.nextDay)
  el.alsoLabel.textContent = t(s.otherDay === 'today' ? 'alsoToday' : 'alsoTomorrow')
  el.zone.textContent = t('yourTime', { zone: s.zoneName })

  const live = s.phase === 'live' && s.liveSecondsLeft !== null
  el.countdown.textContent = clockDigits(untilNext)
  el.wait.hidden = el.begin.hidden = live
  el.join.hidden = el.full.hidden = !live
  if (live) {
    el.join.textContent = t('joinSit', { n: Math.ceil(s.liveSecondsLeft! / 60) })
    el.full.textContent = t('startFull', { n: durationMin })
  }

  renderCount()
  renderRemind()

  body.dataset.soon = String(s.phase === 'approaching' && mode !== 'sit')
  body.style.setProperty('--soon', String(Math.min(1, Math.max(0, 1 - untilNext / (10 * MINUTE)))))

  if (mode === 'sit' && sit) {
    el.sitLabel.textContent = ''
    el.sitClock.textContent = clockDigits(sit.lengthMs - (performance.now() - sit.startPerf))
  } else if (mode === 'wait') {
    el.sitLabel.textContent = t('untilBell', { time: s.nextLocalLabel })
    el.sitClock.textContent = clockDigits(untilNext)
  }
}

// ---------- day / night ----------

let theme: Theme | null = null

/** Day from 06:00 to 18:00 on the visitor's own clock, night otherwise. */
function applyTheme(now: Date): void {
  theme = applySharedTheme(now, tz, (next) => world?.setTheme(next))
}

function tick(): void {
  const now = Date.now()
  applyTheme(new Date(now))
  current = sessionTimes(new Date(now), tz)
  const s = current
  const lastBell = s.lastBell.getTime()

  if (lastBellSeen && lastBell !== lastBellSeen && now - lastBell < 20_000) onBell(lastBell)
  lastBellSeen = lastBell

  if (s.phase !== lastPhase) {
    world?.setPhase(s.phase, lastPhase === null)
    lastPhase = s.phase
  }
  world?.setActiveSession(s.phase === 'live' || s.phase === 'after' ? (s.next.getUTCHours() === 6 ? '18:00' : '06:00') : s.nextUtcLabel)

  // Queue the strike on the audio clock shortly before the bell: sample-accurate, timer-independent.
  const untilNext = s.next.getTime() - now
  if (soundOn && bell.armed && untilNext < 90_000 && bell.scheduledFor !== s.next.getTime()) bell.strike(s.next.getTime())

  if (mode === 'sit' && sit && performance.now() - sit.startPerf >= sit.lengthMs) finishSit(true)
  followTarget()
  render()
  schedule()
}

/** Next tick on the next wall-clock second, or at the sit's end if sooner. */
function schedule(): void {
  clearTimeout(tickTimer)
  let wait = 1000 - (Date.now() % 1000) + 4
  if (sit) wait = Math.min(wait, Math.max(0, sit.lengthMs - (performance.now() - sit.startPerf)) + 4)
  tickTimer = window.setTimeout(tick, wait)
}

// ---------- the world ----------

function regionLat(zone: string): [number, number] {
  const r = zone.split('/')[0]
  if (r === 'Europe') return [36, 62]
  if (r === 'Africa') return [-34, 34]
  if (r === 'Asia') return [0, 50]
  if (r === 'Australia') return [-40, -12]
  if (r === 'Pacific') return [-48, 22]
  if (r === 'America') return [-40, 55]
  return [-55, 65]
}

async function loadGrid(url: string): Promise<Uint8Array> {
  const blob = await (await fetch(url)).blob()
  let source: CanvasImageSource
  try {
    source = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  } catch {
    const img = new Image()
    img.src = URL.createObjectURL(blob)
    await img.decode()
    source = img
  }
  const c = document.createElement('canvas')
  c.width = GRID_W
  c.height = GRID_H
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0)
  const rgba = ctx.getImageData(0, 0, GRID_W, GRID_H).data
  const grid = new Uint8Array(GRID_W * GRID_H)
  for (let i = 0; i < grid.length; i++) grid[i] = rgba[i * 4]
  return grid
}

const orientEl = document.querySelector<HTMLElement>('.orient')!
new ResizeObserver(() => layout()).observe(orientEl)

function isPhone(): boolean {
  const coarse = matchMedia('(pointer: coarse)').matches
  return (coarse && Math.min(screen.width, screen.height) < 700) || (navigator.hardwareConcurrency || 8) <= 2
}

function layout(): void {
  if (!world) return
  const w = el.canvas.clientWidth || window.innerWidth
  const h = el.canvas.clientHeight || window.innerHeight
  const narrow = w <= 760 || w / h < 0.8
  if (!narrow) {
    world.setLayout({ width: w, height: h, cx: 0.69, cy: 0.47, radius: Math.min(h * 0.4, w * 0.28) })
    return
  }
  // Globe above, type below: fit the globe into the space the type leaves free.
  const top = 64
  const textTop = orientEl.getBoundingClientRect().top + window.scrollY
  const room = Math.max(0, textTop - top - 12)
  const radius = Math.max(Math.min(w * 0.42, room * 0.47), w * 0.15)
  world.setLayout({ width: w, height: h, cx: 0.5, cy: (top + Math.max(room, radius * 2) / 2) / h, radius })
}

async function initWorld(): Promise<void> {
  try {
    const grid = await loadGrid('/population.png')
    const phone = isPhone()
    const field = sampleField(grid, phone ? 10_000 : 32_000, phone ? 450_000 : 1_100_000)
    const [latMin, latMax] = regionLat(tz)
    const homeLon = -new Date().getTimezoneOffset() / 4
    world = new World({
      canvas: el.canvas,
      field,
      reducedMotion,
      maxPixelRatio: phone ? 1 : 1.5,
      homeLonDeg: homeLon,
      homeLatDeg: Math.max(-22, Math.min(28, (latMin + latMax) / 2)),
      hereIndex: pickHere(field, homeLon, latMin, latMax),
      theme: theme ?? localHalf(new Date(), tz),
    })
    layout()
    world.setPhase(current.phase, true)
    lastPhase = current.phase
    world.setSitting(mode === 'sit' || mode === 'wait')
    world.begin()
    if (import.meta.env.DEV) (window as unknown as { __world?: World }).__world = world
  } catch (err) {
    console.warn('1BPM: no WebGL field; the page works without it.', err)
    world?.dispose()
    world = null
    body.classList.add('no-gl')
  }
}

// ---------- at least X people ----------
// X is the number of stored commitments for this bell. Nothing is added, multiplied or guessed.

let target = '' // ISO instant of the bell the count is about: the coming one, or the one ringing now
let count: number | null = null
let countOk = false
let busy = false
let pollTimer = 0
let lastPoll = 0
const POLL_MS = 30_000

function followTarget(): void {
  const s = current
  const next = (s.phase === 'live' ? s.lastBell : s.next).toISOString()
  if (next === target) return
  const previous = target
  target = next
  count = null
  countOk = false
  // "Count me in for the next one too": carried once, then the choice resets.
  if (previous && alsoNext.get() && committedTo() === previous) {
    alsoNext.set(false)
    void setCommitted(target, true)
      .then((n) => accept(target === next ? n : null))
      .catch(() => undefined)
  }
  lastPoll = 0
  void poll()
}

function accept(n: number | null): void {
  if (n === null) return
  count = n
  countOk = true
  renderCount()
}

async function poll(): Promise<void> {
  clearTimeout(pollTimer)
  const quiet = document.hidden || mode === 'sit' || mode === 'wait'
  const wait = lastPoll + POLL_MS - Date.now()
  if (!quiet && wait <= 0 && target) {
    lastPoll = Date.now()
    const asked = target
    try {
      const n = await getCount(asked)
      if (asked === target) accept(n)
    } catch {
      /* show nothing; never a made-up number */
    }
  }
  pollTimer = window.setTimeout(poll, Math.max(wait, POLL_MS))
}

function renderCount(): void {
  const live = current.phase === 'live'
  const counted = isCommitted(target)
  el.commit.hidden = !countOk
  const show = countOk && count !== null && count >= 1
  el.count.hidden = !show
  if (show) {
    const one = new Intl.PluralRules('en').select(count!) === 'one'
    el.countLead.textContent = t(one ? 'countOne' : 'countOther', { x: whole.format(count!) })
    el.countRest.textContent = t(one ? 'countRestOne' : 'countRestOther')
  }
  el.commitBtn.hidden = live && !counted
  el.commitBtn.textContent = t(counted ? 'counted' : 'countMeIn')
  el.commitBtn.setAttribute('aria-pressed', String(counted))
  el.commitBtn.disabled = counted || busy
  el.takeOut.hidden = !counted || live
  el.takeOut.disabled = busy
  el.alsoNext.hidden = !counted
  el.alsoNext.setAttribute('aria-checked', String(alsoNext.get()))
}

async function changeCommitment(on: boolean): Promise<void> {
  busy = true
  renderCount()
  try {
    accept(await setCommitted(target, on))
    if (on) world?.markHere() // one existing point brightens for a few seconds; it is not a map of anyone
  } catch {
    el.notice.textContent = t('countUnavailable')
  } finally {
    busy = false
    renderCount()
  }
}

el.commitBtn.addEventListener('click', () => void changeCommitment(true))
el.takeOut.addEventListener('click', () => void changeCommitment(false))
el.alsoNext.addEventListener('click', () => {
  alsoNext.set(!alsoNext.get())
  renderCount()
})

// ---------- reminders ----------

function renderRemind(): void {
  const state = remindState()
  el.remind.hidden = state === 'unsupported'
  const label: CopyKey = state === 'on' ? 'remindersOn' : state === 'blocked' ? 'remindersBlocked' : 'remindMe'
  el.remind.textContent = t(label)
  el.remind.setAttribute('aria-pressed', String(state === 'on'))
  el.stopRemind.hidden = state !== 'on'
}

el.remind.addEventListener('click', async () => {
  const before = remindState()
  if (before === 'on') return
  const state = before === 'blocked' ? 'blocked' : await turnOn()
  el.notice.textContent = state === 'blocked' ? t('blockedLine') : ''
  renderRemind()
})

el.stopRemind.addEventListener('click', async () => {
  await turnOff()
  el.notice.textContent = t('remindersStopped')
  renderRemind()
  el.remind.focus({ preventScroll: true })
})

// ---------- input ----------

function unlockAudio(): void {
  if (soundOn) bell.unlock()
}
// Capture phase, so the context exists before any button handler that wants to strike.
// pointerdown alone is not a user activation for touch; pointerup, touchend and click are.
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'])
  window.addEventListener(type, unlockAudio, { capture: true, passive: true })

function renderSound(): void {
  el.sound.setAttribute('aria-pressed', String(soundOn))
  el.sound.textContent = t(soundOn ? 'soundOnLabel' : 'soundOffLabel')
}

el.sound.addEventListener('click', () => {
  soundOn = !soundOn
  store.set('1bpm.sound', soundOn ? 'on' : 'off')
  if (soundOn) bell.unlock()
  else bell.cancel()
  renderSound()
})

el.durations.forEach((b) =>
  b.addEventListener('click', () => {
    durationMin = Number(b.dataset.min)
    el.durations.forEach((d) => d.setAttribute('aria-pressed', String(d === b)))
    render()
  }),
)

el.begin.addEventListener('click', () => startSit(durationMin * MINUTE))
el.full.addEventListener('click', () => startSit(durationMin * MINUTE))
el.join.addEventListener('click', () => startSit((current.liveSecondsLeft ?? 0) * 1000))
el.wait.addEventListener('click', waitForBell)
el.end.addEventListener('click', endAny)
el.ret.addEventListener('click', () => {
  setMode('orient')
  el.begin.focus({ preventScroll: true })
})

el.breath.addEventListener('click', () => {
  const on = el.breath.getAttribute('aria-pressed') !== 'true'
  el.breath.setAttribute('aria-pressed', String(on))
  body.dataset.breath = String(on)
})


el.share.addEventListener('click', async () => {
  const text = t('share', { first: current.nextLocalLabel, second: current.otherLocalLabel })
  const url = location.origin + '/'
  try {
    if (navigator.share) {
      await navigator.share({ text, url })
      return
    }
    await navigator.clipboard.writeText(`${text} ${url}`)
    el.shareNotice.textContent = t('copied')
  } catch (e) {
    if ((e as DOMException)?.name !== 'AbortError') el.shareNotice.textContent = `${text} ${url}`
  }
})

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return
  if (e.key === 'Escape') {
    endAny()
    return
  }
  if (e.code !== 'Space' && e.key !== ' ') return
  if (target.closest('button, a')) return // native activation
  if (mode === 'sit' || mode === 'wait') {
    e.preventDefault()
    endAny()
  } else if (mode === 'orient' && window.scrollY < window.innerHeight * 0.4) {
    e.preventDefault()
    if (current.phase === 'live' && current.liveSecondsLeft) startSit(current.liveSecondsLeft * 1000)
    else startSit(durationMin * MINUTE)
  }
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return
  if (sit) sit.startPerf = performance.now() - (Date.now() - sit.startWall) // resync after sleep/throttle
  const before = lastPhase
  tick()
  if (before !== lastPhase) world?.setPhase(current.phase, true)
  resyncReminders()
  void poll()
})

// Canvas recedes as the letter comes up; once covered, nothing is drawn.
let scrollQueued = false
window.addEventListener(
  'scroll',
  () => {
    if (scrollQueued) return
    scrollQueued = true
    requestAnimationFrame(() => {
      scrollQueued = false
      const vh = window.innerHeight
      const x = Math.min(1, Math.max(0, (window.scrollY - 0.12 * vh) / (0.85 * vh)))
      const f = 1 - x * x * (3 - 2 * x)
      el.canvas.style.transition = 'opacity 0.2s linear'
      el.canvas.style.opacity = f.toFixed(3)
      world?.setVisibleFraction(f)
    })
  },
  { passive: true },
)

let resizeQueued = 0
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeQueued)
  resizeQueued = requestAnimationFrame(layout)
})

// ---------- approach ----------

renderSound()
tick()
lastBellSeen = current.lastBell.getTime()
void initWorld()
void startReminders(() => mode === 'sit' || mode === 'wait')

const fontsReady = Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 700))])
void fontsReady.then(() => {
  requestAnimationFrame(() => body.classList.add('ready'))
  window.setTimeout(() => mode === 'approach' && setMode('orient'), reducedMotion ? 1400 : 2700)
})

function teardown(): void {
  clearTimeout(tickTimer)
  clearTimeout(afterTimer)
  clearTimeout(noteTimer)
  clearTimeout(pollTimer)
  world?.dispose()
  world = null
  bell.dispose()
}

window.addEventListener('pagehide', (e) => {
  if (!e.persisted) teardown()
})

if (import.meta.hot) import.meta.hot.dispose(teardown)
