// 1BPM service worker. Registered only after someone turns reminders on.
// It shows bell reminders and nothing else: no fetch handler, no offline cache.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

const MINUTE = 60_000

// From the API, when no tab may be open.
self.addEventListener('push', (e) => {
  let data = null
  try {
    data = e.data && e.data.json()
  } catch {}
  if (data) e.waitUntil(remind(data.kind, Date.parse(data.bell)))
})

// From an open tab's own schedule.
self.addEventListener('message', (e) => {
  const d = e.data || {}
  if (d.kind && d.bell) e.waitUntil(remind(d.kind, Date.parse(d.bell)))
})

async function remind(kind, bell) {
  if (!(bell > 0) || (kind !== 'soon' && kind !== 'start')) return
  const now = Date.now()
  if (kind === 'soon' && now > bell) return // the bell already rang
  if (kind === 'start' && now > bell + 10 * MINUTE) return // the session is over
  if (await sitting(now)) return // never during a sit

  const tag = `1bpm-${new Date(bell).toISOString()}-${kind}`
  const state = await caches.open('1bpm-state')
  if (await state.match('/notified/' + tag)) return // the other path already did
  await state.put('/notified/' + tag, new Response('1'))

  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(bell)
  await self.registration.showNotification('1BPM', {
    body: kind === 'soon' ? `The bell is in 10 minutes · ${time}` : 'The session is starting · 10 minutes',
    tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { bell },
  })
  prune(state, now)
}

async function sitting(now) {
  const state = await caches.open('1bpm-state')
  const r = await state.match('/sitting')
  return !!r && Number(await r.text()) > now
}

async function prune(state, now) {
  for (const req of await state.keys()) {
    const m = req.url.match(/1bpm-(.+Z)-/)
    if (m && Date.parse(m[1]) < now - 24 * 60 * MINUTE) await state.delete(req)
  }
}

// Focus an open 1BPM tab on the home page, or open one. The page works out the phase itself.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const home = tabs.find((c) => new URL(c.url).pathname === '/')
      if (home) return home.focus()
      if (tabs[0]) {
        try {
          await tabs[0].focus()
          return await tabs[0].navigate('/')
        } catch {}
      }
      return self.clients.openWindow('/')
    })(),
  )
})
