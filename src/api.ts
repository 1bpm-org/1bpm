// The only server this site talks to. It stores a random id per browser and the bell it chose. Nothing else.
import { store } from './store'

export const API: string = import.meta.env.VITE_API ?? (import.meta.env.DEV ? 'http://localhost:8787' : 'https://api.1bpm.org')

export function clientId(): string {
  let id = store.get('1bpm.client')
  if (!id) {
    id = crypto.randomUUID()
    store.set('1bpm.client', id)
  }
  return id
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined })
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return (await res.json()) as T
}

export const getCount = (session: string) => call<{ count: number }>(`/v1/count?session=${encodeURIComponent(session)}`).then((r) => r.count)

export const putCommit = (session: string, on: boolean) =>
  call<{ count: number }>('/v1/commit', { method: on ? 'PUT' : 'DELETE', body: JSON.stringify({ clientId: clientId(), session }) }).then((r) => r.count)

export const pushKey = () => call<{ key: string }>('/v1/push/key').then((r) => r.key)

export const putPush = (sub: PushSubscription) => call('/v1/push', { method: 'PUT', body: JSON.stringify(sub.toJSON()) })

export const deletePush = (endpoint: string) => call('/v1/push', { method: 'DELETE', body: JSON.stringify({ endpoint }) })
