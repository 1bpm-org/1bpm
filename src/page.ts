// Inner pages: no canvas. Theme, the corner clock, and (on /session) this visitor's two times.
import './style.css'
import { localTimeLabel, sessionTimes } from './clock'
import { start as startReminders } from './reminders'
import { startShell, tz } from './shell'

const stop = startShell(document.getElementById('corner'))

const times = document.getElementById('your-times')
if (times) {
  const s = sessionTimes(new Date(), tz)
  const [a, b] = [s.next, s.other].sort((x, y) => x.getUTCHours() - y.getUTCHours()) // 06:00 UTC first
  times.querySelector('[data-bell="06"]')!.textContent = localTimeLabel(a, tz)
  times.querySelector('[data-bell="18"]')!.textContent = localTimeLabel(b, tz)
  times.querySelector('[data-zone]')!.textContent = s.zoneName
}

void startReminders()
window.addEventListener('pagehide', (e) => !e.persisted && stop())
