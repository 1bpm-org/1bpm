import { describe, expect, it } from 'vitest'
import { isBell, openForCommit, readable, reminderAt } from './index'
import { b64u, encrypt, makeVapidKeys, senderKey, unb64u, vapidHeader } from './webpush'

const T = (iso: string) => Date.parse(iso)

describe('bells', () => {
  it('only 06:00:00.000Z and 18:00:00.000Z are bells', () => {
    expect(isBell(T('2026-11-18T06:00:00.000Z'))).toBe(true)
    expect(isBell(T('2026-11-18T18:00:00.000Z'))).toBe(true)
    expect(isBell(T('2026-11-18T18:00:00.001Z'))).toBe(false)
    expect(isBell(T('2026-11-18T12:00:00.000Z'))).toBe(false)
  })

  it('commitments are for the coming bell only, withdrawable until it rings', () => {
    const now = T('2026-11-18T12:00:00Z')
    expect(openForCommit(T('2026-11-18T18:00:00Z'), now)).toBe(true)
    expect(openForCommit(T('2026-11-19T06:00:00Z'), now)).toBe(false) // the one after
    expect(openForCommit(T('2026-11-18T06:00:00Z'), now)).toBe(false) // already rang
    expect(openForCommit(T('2026-11-18T18:00:00Z'), T('2026-11-18T18:00:20Z'))).toBe(true) // clock skew
    expect(openForCommit(T('2026-11-18T18:00:00Z'), T('2026-11-18T18:01:00Z'))).toBe(false)
  })

  it('counts are readable for the coming bell and the one that just rang', () => {
    const now = T('2026-11-18T18:04:00Z')
    expect(readable(T('2026-11-18T18:00:00Z'), now)).toBe(true)
    expect(readable(T('2026-11-19T06:00:00Z'), now)).toBe(true)
    expect(readable(T('2026-11-17T18:00:00Z'), now)).toBe(false)
  })

  it('cron instants map to the right reminder', () => {
    expect(reminderAt(T('2026-11-18T05:50:00Z'))).toEqual({ kind: 'soon', bell: T('2026-11-18T06:00:00Z') })
    expect(reminderAt(T('2026-11-18T06:00:03Z'))).toEqual({ kind: 'start', bell: T('2026-11-18T06:00:00Z') })
    expect(reminderAt(T('2026-11-18T17:50:00Z'))).toEqual({ kind: 'soon', bell: T('2026-11-18T18:00:00Z') })
    expect(reminderAt(T('2026-11-18T18:00:00Z'))).toEqual({ kind: 'start', bell: T('2026-11-18T18:00:00Z') })
    expect(reminderAt(T('2026-11-18T05:00:00Z'))).toBeNull()
    expect(reminderAt(T('2026-11-18T06:50:00Z'))).toBeNull()
  })
})

// The browser's side of RFC 8291, written independently from the sender, to check the round trip.
async function uaDecrypt(body: Uint8Array, ua: CryptoKeyPair, uaRaw: Uint8Array, authSecret: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16)
  const idlen = body[20]
  const asRaw = body.slice(21, 21 + idlen)
  const cipher = body.slice(21 + idlen)
  const asKey = await crypto.subtle.importKey('raw', asRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256))
  const enc = new TextEncoder()
  const hk = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8))
  const keyInfo = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaRaw, ...asRaw])
  const ikm = await hk(authSecret, shared, keyInfo, 32)
  const cek = await hk(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hk(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher),
  )
  expect(plain[plain.length - 1]).toBe(2) // last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1))
}

describe('web push', () => {
  it('a browser can decrypt what the worker sends', async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    const uaRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))
    const authSecret = crypto.getRandomValues(new Uint8Array(16))
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: b64u(uaRaw), auth: b64u(authSecret) }
    const message = JSON.stringify({ kind: 'soon', bell: '2026-11-18T18:00:00.000Z' })
    const body = await encrypt(sub, new TextEncoder().encode(message), await senderKey())
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096)
    expect(await uaDecrypt(body, ua, uaRaw, authSecret)).toBe(message)
  })

  it('VAPID token verifies with the advertised public key', async () => {
    const keys = await makeVapidKeys()
    const header = await vapidHeader('https://updates.push.services.mozilla.com/wpush/v2/abc', keys, 'https://1bpm.org', 1_800_000_000)
    const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!
    expect(k).toBe(keys.publicKey)
    const [h, c, s] = jwt.split('.')
    expect(JSON.parse(new TextDecoder().decode(unb64u(c)))).toEqual({ aud: 'https://updates.push.services.mozilla.com', exp: 1_800_000_000 + 43200, sub: 'https://1bpm.org' })
    const pub = await crypto.subtle.importKey('raw', unb64u(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(s), new TextEncoder().encode(`${h}.${c}`))
    expect(ok).toBe(true)
  })
})
