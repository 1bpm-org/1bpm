// What every page shares: the day/night theme and the small, always-correct "next session" corner.
import { runtimeTimeZone, sessionTimes } from './clock'
import { t } from './copy'
import { applyTheme } from './theme'

export const tz = runtimeTimeZone()

/** Keeps the theme and the corner clock right, ticking on the next whole minute. Returns a stop function. */
export function startShell(corner: HTMLElement | null): () => void {
  let timer = 0
  const tick = () => {
    const now = new Date()
    applyTheme(now, tz)
    if (corner) corner.textContent = t('cornerNext', { time: sessionTimes(now, tz).nextLocalLabel })
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
  }
  tick()
  const wake = () => {
    if (document.hidden) return
    clearTimeout(timer)
    tick()
  }
  document.addEventListener('visibilitychange', wake)
  return () => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', wake)
  }
}
