// 1BPM API: honest commitment counts and bell reminders. Cloudflare Worker + D1.
//
//   GET    /v1/count?session=ISO     { session, count }   cached ~20 s at the edge
//   PUT    /v1/commit                { clientId, session } → { count }
//   DELETE /v1/commit                { clientId, session } → { count }   only before the bell
//   GET    /v1/push/key              { key }   VAPID public key
//   PUT    /v1/push                  { endpoint, keys: { p256dh, auth } }
//   DELETE /v1/push                  { endpoint }
//   cron   05:50, 06:00, 17:50, 18:00 UTC: send reminders; prune old rows

import { encrypt, makeVapidKeys, senderKey, unb64u, vapidHeader, type Subscription, type VapidKeys } from './webpush'

export interface Env {
  DB: D1Database
  ORIGINS: string // comma-separated origins allowed to write
  SELF?: Fetcher // service binding to this worker, for fanning out large sends
  ALLOW_ANY_PUSH?: string // dev only: accept non-browser push endpoints
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const HALF_DAY = 12 * HOUR
const FIRST_BELL = 6 * HOUR
const SKEW = 30_000 // tolerated client clock error at the bell
const KEEP = 48 * HOUR
const BATCH = 20 // pushes per invocation (CPU and subrequest limits)
const FAN = 40 // child invocations per invocation
const SUBJECT = 'https://1bpm.org'
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com']

// ---------- bells ----------

export function isBell(t: number): boolean {
  return Number.isInteger(t) && t > 0 && (t - FIRST_BELL) % HALF_DAY === 0
}

/** A commitment (or a withdrawal) is only for the coming bell. */
export function openForCommit(session: number, now: number): boolean {
  return isBell(session) && session > now - SKEW && session - now <= HALF_DAY + SKEW
}

/** Counts are readable for the coming bell and the one that just rang. */
export function readable(session: number, now: number): boolean {
  return isBell(session) && session > now - HALF_DAY - SKEW && session - now <= HALF_DAY + SKEW
}

function parseSession(s: unknown): number | null {
  if (typeof s !== 'string' || s.length > 40) return null
  const t = Date.parse(s)
  return isBell(t) ? t : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// ---------- http helpers ----------

function allowedOrigin(req: Request, env: Env): boolean {
  return env.ORIGINS.split(',').map((s) => s.trim()).includes(req.headers.get('Origin') ?? '')
}

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return allowedOrigin(req, env)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, PUT, DELETE', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
    : { 'Access-Control-Allow-Origin': '*', Vary: 'Origin' }
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  if (!(req.headers.get('Content-Type') ?? '').startsWith('application/json')) return null
  const text = await req.text()
  if (text.length > 1024) return null
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

// ---------- meta: keys the worker makes for itself ----------

const memo = new Map<string, string>()
async function meta(env: Env, k: string, make: () => Promise<string>): Promise<string> {
  const hit = memo.get(k)
  if (hit) return hit
  let row = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind(k).first<{ v: string }>()
  if (!row) {
    await env.DB.prepare('INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)').bind(k, await make()).run()
    row = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind(k).first<{ v: string }>()
  }
  memo.set(k, row!.v)
  return row!.v
}

const randomHex = async () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')
const vapid = async (env: Env): Promise<VapidKeys> => JSON.parse(await meta(env, 'vapid', async () => JSON.stringify(await makeVapidKeys())))

// ---------- rate limit ----------

async function underLimit(req: Request, env: Env, now: number): Promise<boolean> {
  const salt = await meta(env, 'salt', randomHex)
  const ip = req.headers.get('CF-Connecting-IP') ?? 'local'
  const check = async (span: number, max: number) => {
    const slot = Math.floor(now / span)
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${ip}|${span}|${slot}`))
    const bucket = [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const row = await env.DB.prepare('INSERT INTO hits (bucket, n, expires) VALUES (?, 1, ?) ON CONFLICT (bucket) DO UPDATE SET n = n + 1 RETURNING n')
      .bind(bucket, (slot + 1) * span)
      .first<{ n: number }>()
    return (row?.n ?? 0) <= max
  }
  return (await check(MINUTE, 10)) && (await check(HOUR, 40))
}

// ---------- counts ----------

async function countFor(env: Env, iso: string): Promise<number> {
  const row = await env.DB.prepare('SELECT count(*) AS n FROM commitments WHERE session_start = ?').bind(iso).first<{ n: number }>()
  return row?.n ?? 0
}

function countKey(origin: string, iso: string): Request {
  return new Request(`${origin}/v1/count?session=${encodeURIComponent(iso)}`)
}

async function edgeCache(): Promise<Cache | null> {
  try {
    return (caches as unknown as { default: Cache }).default
  } catch {
    return null
  }
}

// ---------- push ----------

function validSubscription(body: Record<string, unknown>, env: Env): Subscription | null {
  const endpoint = body.endpoint
  const keys = body.keys as Record<string, unknown> | undefined
  if (typeof endpoint !== 'string' || endpoint.length > 1000 || !keys) return null
  const { p256dh, auth } = keys
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 100 || auth.length > 40) return null
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return null
  }
  const known = url.protocol === 'https:' && PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))
  if (!known && env.ALLOW_ANY_PUSH !== '1') return null
  try {
    const k = unb64u(p256dh)
    if (k.length !== 65 || k[0] !== 4 || unb64u(auth).length !== 16) return null
  } catch {
    return null
  }
  return { endpoint, p256dh, auth }
}

interface Job {
  kind: 'soon' | 'start'
  bell: string
  offset: number
  limit: number
}

/** Send one slice directly, or split it across child invocations so no invocation exceeds its limits. */
async function dispatch(env: Env, job: Job): Promise<void> {
  if (job.limit <= BATCH) return sendSlice(env, job)
  const step = Math.max(BATCH, Math.ceil(job.limit / FAN))
  const children: Job[] = []
  for (let o = 0; o < job.limit; o += step) children.push({ ...job, offset: job.offset + o, limit: Math.min(step, job.limit - o) })
  if (!env.SELF) {
    for (const c of children) await dispatch(env, c)
    return
  }
  const secret = await meta(env, 'internal', randomHex)
  await Promise.all(
    children.map((c) =>
      env.SELF!.fetch('https://self/v1/internal/send', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Internal': secret }, body: JSON.stringify(c) }),
    ),
  )
}

async function sendSlice(env: Env, job: Job): Promise<void> {
  const { results } = await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push ORDER BY id LIMIT ? OFFSET ?').bind(job.limit, job.offset).all<Subscription & { id: number }>()
  if (!results.length) return
  const keys = await vapid(env)
  const sender = await senderKey()
  const payload = new TextEncoder().encode(JSON.stringify({ kind: job.kind, bell: job.bell }))
  const auth = new Map<string, string>()
  const nowSec = Math.floor(Date.now() / 1000)
  const gone: number[] = []
  await Promise.all(
    results.map(async (sub) => {
      try {
        const origin = new URL(sub.endpoint).origin
        if (!auth.has(origin)) auth.set(origin, await vapidHeader(sub.endpoint, keys, SUBJECT, nowSec))
        const res = await fetch(sub.endpoint, {
          method: 'POST',
          headers: { Authorization: auth.get(origin)!, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '600', Urgency: 'high' },
          body: await encrypt(sub, payload, sender),
        })
        if (res.status === 404 || res.status === 410) gone.push(sub.id)
        else if (!res.ok) console.warn('push refused', res.status, (await res.text()).slice(0, 200))
      } catch (err) {
        console.warn('push failed', String(err))
      }
    }),
  )
  if (gone.length) await env.DB.prepare(`DELETE FROM push WHERE id IN (${gone.map(() => '?').join(',')})`).bind(...gone).run()
}

/** Which reminder a cron instant is for, if any: T−10 min ("soon") or the bell ("start"). */
export function reminderAt(t: number): { kind: 'soon' | 'start'; bell: number } | null {
  const m = Math.round(t / MINUTE) * MINUTE
  if (isBell(m)) return { kind: 'start', bell: m }
  if (isBell(m + 10 * MINUTE)) return { kind: 'soon', bell: m + 10 * MINUTE }
  return null
}

// ---------- worker ----------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const h = cors(req, env)
    const now = Date.now()
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })

    if (url.pathname === '/v1/count' && req.method === 'GET') {
      const t = parseSession(url.searchParams.get('session'))
      if (t === null || !readable(t, now)) return json({ error: 'session' }, 400, h)
      const iso = new Date(t).toISOString()
      const cache = await edgeCache()
      const key = countKey(url.origin, iso)
      const cached = await cache?.match(key)
      if (cached) {
        const r = new Response(cached.body, cached)
        for (const [k, v] of Object.entries(h)) r.headers.set(k, v)
        return r
      }
      const res = new Response(JSON.stringify({ session: iso, count: await countFor(env, iso) }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=0, s-maxage=20' },
      })
      await cache?.put(key, res.clone())
      for (const [k, v] of Object.entries(h)) res.headers.set(k, v)
      return res
    }

    if (url.pathname === '/v1/commit' && (req.method === 'PUT' || req.method === 'DELETE')) {
      if (!allowedOrigin(req, env)) return json({ error: 'origin' }, 403, h)
      const body = await readBody(req)
      const t = parseSession(body?.session)
      const clientId = body?.clientId
      if (t === null || typeof clientId !== 'string' || !UUID.test(clientId)) return json({ error: 'body' }, 400, h)
      if (!openForCommit(t, now)) return json({ error: 'closed' }, 409, h)
      if (!(await underLimit(req, env, now))) return json({ error: 'slow down' }, 429, h)
      const iso = new Date(t).toISOString()
      if (req.method === 'PUT') {
        await env.DB.prepare('INSERT OR IGNORE INTO commitments (client_id, session_start, created_at) VALUES (?, ?, ?)')
          .bind(clientId, iso, new Date(now).toISOString())
          .run()
      } else {
        await env.DB.prepare('DELETE FROM commitments WHERE client_id = ? AND session_start = ?').bind(clientId, iso).run()
      }
      await (await edgeCache())?.delete(countKey(url.origin, iso))
      return json({ session: iso, count: await countFor(env, iso) }, 200, h)
    }

    if (url.pathname === '/v1/push/key' && req.method === 'GET') {
      return json({ key: (await vapid(env)).publicKey }, 200, { ...h, 'Cache-Control': 'public, max-age=3600' })
    }

    if (url.pathname === '/v1/push' && (req.method === 'PUT' || req.method === 'DELETE')) {
      if (!allowedOrigin(req, env)) return json({ error: 'origin' }, 403, h)
      const body = await readBody(req)
      if (!body) return json({ error: 'body' }, 400, h)
      if (!(await underLimit(req, env, now))) return json({ error: 'slow down' }, 429, h)
      if (req.method === 'DELETE') {
        if (typeof body.endpoint !== 'string') return json({ error: 'body' }, 400, h)
        await env.DB.prepare('DELETE FROM push WHERE endpoint = ?').bind(body.endpoint).run()
        return json({ ok: true }, 200, h)
      }
      const sub = validSubscription(body, env)
      if (!sub) return json({ error: 'subscription' }, 400, h)
      await env.DB.prepare(
        'INSERT INTO push (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth',
      )
        .bind(sub.endpoint, sub.p256dh, sub.auth, new Date(now).toISOString())
        .run()
      return json({ ok: true }, 200, h)
    }

    if (url.pathname === '/v1/internal/send' && req.method === 'POST') {
      if (req.headers.get('X-Internal') !== (await meta(env, 'internal', randomHex))) return json({ error: 'no' }, 403, {})
      await dispatch(env, (await req.json()) as Job)
      return json({ ok: true }, 200, {})
    }

    return json({ error: 'not found' }, 404, h)
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const r = reminderAt(event.scheduledTime)
    if (r) {
      const total = (await env.DB.prepare('SELECT count(*) AS n FROM push').first<{ n: number }>())?.n ?? 0
      if (total) ctx.waitUntil(dispatch(env, { kind: r.kind, bell: new Date(r.bell).toISOString(), offset: 0, limit: total }))
    }
    const cutoff = new Date(event.scheduledTime - KEEP).toISOString()
    ctx.waitUntil(
      env.DB.batch([
        env.DB.prepare('DELETE FROM commitments WHERE session_start < ?').bind(cutoff),
        env.DB.prepare('DELETE FROM hits WHERE expires < ?').bind(event.scheduledTime),
      ]),
    )
  },
}
