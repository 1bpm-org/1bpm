// Pure session clock. No DOM, no WebGL. Every time string goes through Intl.

export type Phase = 'idle' | 'approaching' | 'live' | 'after'
export type UtcLabel = '06:00' | '18:00'

export const HOUR = 3_600_000
export const MINUTE = 60_000
const HALF_DAY = 12 * HOUR
const FIRST_BELL = 6 * HOUR // 06:00Z; the other is 12 h later

/** Window before a bell that counts as "approaching". */
export const APPROACH_MS = 10 * MINUTE
/** Shared sit after each bell. */
export const LIVE_MS = 10 * MINUTE
/** Short settling period after the shared sit. */
export const AFTER_MS = 3 * MINUTE

export interface SessionTimes {
  next: Date
  other: Date
  nextLocalLabel: string
  otherLocalLabel: string
  nextUtcLabel: UtcLabel
  otherUtcLabel: UtcLabel
  zoneName: string
  phase: Phase
  liveSecondsLeft: number | null
  /** The most recent bell at or before `now`. */
  lastBell: Date
  /** Whether `next` falls on the viewer's local today or tomorrow. */
  nextDay: 'today' | 'tomorrow'
  /** Whether `other` falls on the viewer's local today or tomorrow. */
  otherDay: 'today' | 'tomorrow'
}

function utcLabel(d: Date): UtcLabel {
  return d.getUTCHours() === 6 ? '06:00' : '18:00'
}

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(locale: string | undefined, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale ?? ''}|${JSON.stringify(opts)}`
  let f = fmtCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts)
    fmtCache.set(key, f)
  }
  return f
}

export function localTimeLabel(d: Date, timeZone: string, locale?: string): string {
  return fmt(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(d)
}

/** Short zone name as the runtime spells it for this instant (DST-aware): "PST", "GMT+5:30", "NZDT". */
export function zoneLabel(d: Date, timeZone: string, locale?: string): string {
  const parts = fmt(locale, { timeZone, timeZoneName: 'short', hour: 'numeric' }).formatToParts(d)
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone
}

/** Calendar date of an instant in a zone, as a comparable YYYY-MM-DD key. */
export function localDateKey(d: Date, timeZone: string): string {
  const parts = fmt('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function dayRelation(target: Date, now: Date, timeZone: string): 'today' | 'tomorrow' {
  return localDateKey(target, timeZone) === localDateKey(now, timeZone) ? 'today' : 'tomorrow'
}

/** Most recent bell at or before t (ms since epoch). */
export function lastBellAt(t: number): number {
  return Math.floor((t - FIRST_BELL) / HALF_DAY) * HALF_DAY + FIRST_BELL
}

export function phaseAt(t: number): { phase: Phase; liveSecondsLeft: number | null } {
  const last = lastBellAt(t)
  const since = t - last
  const until = last + HALF_DAY - t
  if (since < LIVE_MS) return { phase: 'live', liveSecondsLeft: Math.ceil((LIVE_MS - since) / 1000) }
  if (since < LIVE_MS + AFTER_MS) return { phase: 'after', liveSecondsLeft: null }
  if (until <= APPROACH_MS) return { phase: 'approaching', liveSecondsLeft: null }
  return { phase: 'idle', liveSecondsLeft: null }
}

export function sessionTimes(now: Date, timeZone: string, locale?: string): SessionTimes {
  const t = now.getTime()
  const last = lastBellAt(t)
  const next = new Date(last + HALF_DAY)
  const other = new Date(last + 2 * HALF_DAY)
  const { phase, liveSecondsLeft } = phaseAt(t)
  return {
    next,
    other,
    nextLocalLabel: localTimeLabel(next, timeZone, locale),
    otherLocalLabel: localTimeLabel(other, timeZone, locale),
    nextUtcLabel: utcLabel(next),
    otherUtcLabel: utcLabel(other),
    zoneName: zoneLabel(next, timeZone, locale),
    phase,
    liveSecondsLeft,
    lastBell: new Date(last),
    nextDay: dayRelation(next, now, timeZone),
    otherDay: dayRelation(other, now, timeZone),
  }
}

/** Runtime IANA zone, never a fixed offset. */
export function runtimeTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
