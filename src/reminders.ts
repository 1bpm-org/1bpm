// Bell reminders. Off by default; permission is asked only from an explicit "Remind me".
// While a page is open, it schedules the next two bells itself. With a service worker and Push,
// the API also sends them when every tab is closed. Both paths go through the same tag, so one bell
// never notifies twice.
import { deletePush, pushKey, putPush } from './api'
import { HOUR, MINUTE } from './clock'
import { store } from './store'

export type RemindState = 'unsupported' | 'off' | 'on' | 'blocked'

const KEY = '1bpm.remind'
const hasSW = () => 'serviceWorker' in navigator && window.isSecureContext

export function remindState(): RemindState {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return Notification.permission === 'granted' && store.get(KEY) === 'on' ? 'on' : 'off'
}

let timers: number[] = []
let isSitting: () => boolean = () => false

/** Turn on from a click. Resolves to the state that resulted. */
export async function turnOn(): Promise<RemindState> {
  if (!('Notification' in window)) return 'unsupported'
  const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  if (p !== 'granted') return p === 'denied' ? 'blocked' : 'off'
  store.set(KEY, 'on')
  await start()
  return 'on'
}

/** Clears the subscription, the server's copy, pending notices and the worker. Immediately. */
export async function turnOff(): Promise<void> {
  store.set(KEY, 'off')
  timers.forEach(clearTimeout)
  timers = []
  if (!hasSW()) return
  const reg = await navigator.serviceWorker.getRegistration('/')
  if (!reg) return
  const sub = await reg.pushManager?.getSubscription().catch(() => null)
  if (sub) {
    await deletePush(sub.endpoint).catch(() => undefined)
    await sub.unsubscribe().catch(() => undefined)
  }
  for (const n of await reg.getNotifications().catch(() => [] as Notification[])) n.close()
  await reg.unregister()
}

/** On every page load: if reminders are on, arm this tab and keep the push subscription current. */
export async function start(sitting?: () => boolean): Promise<void> {
  if (sitting) isSitting = sitting
  if (remindState() !== 'on') return
  armTab()
  if (!hasSW()) return
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    if (!reg.pushManager) return
    await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: await pushKey() })
    await putPush(sub)
  } catch (err) {
    // No push (or no API): this tab's own schedule still rings.
    console.info('1BPM: reminders from this tab only.', err)
  }
}

/** The worker reads this so it stays quiet during a sit. */
export function markSitting(untilMs: number | null): void {
  if (!('caches' in window)) return
  void caches
    .open('1bpm-state')
    .then(async (c) => {
      if (untilMs) await c.put('/sitting', new Response(String(untilMs)))
      else await c.delete('/sitting')
    })
    .catch(() => undefined)
}

function armTab(): void {
  timers.forEach(clearTimeout)
  timers = []
  const now = Date.now()
  const first = Math.floor((now - 6 * HOUR) / (12 * HOUR)) * 12 * HOUR + 6 * HOUR + 12 * HOUR
  for (const bell of [first, first + 12 * HOUR]) {
    for (const [kind, at] of [['soon', bell - 10 * MINUTE], ['start', bell]] as const) {
      if (at > now) timers.push(window.setTimeout(() => fire(kind, bell), at - now))
    }
  }
  // Re-arm after the second bell's reminders are spent.
  timers.push(window.setTimeout(armTab, first + 12 * HOUR + MINUTE - now))
}

async function fire(kind: 'soon' | 'start', bell: number): Promise<void> {
  if (remindState() !== 'on' || isSitting()) return
  if (hasSW()) {
    const reg = await navigator.serviceWorker.getRegistration('/')
    if (reg?.active) {
      reg.active.postMessage({ kind, bell: new Date(bell).toISOString() })
      return
    }
  }
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(bell)
  const n = new Notification('1BPM', {
    body: kind === 'soon' ? `The bell is in 10 minutes · ${time}` : 'The session is starting · 10 minutes',
    tag: `1bpm-${new Date(bell).toISOString()}-${kind}`,
    icon: '/icon-192.png',
  })
  n.onclick = () => {
    window.focus()
    if (location.pathname !== '/') location.href = '/'
    n.close()
  }
}

/** Timers sleep with the tab; re-arm when it wakes. */
export function resync(): void {
  if (remindState() === 'on') armTab()
}
