// Web Push with no library: RFC 8291 (aes128gcm message encryption) and RFC 8292 (VAPID).
// WebCrypto only, so it runs in a Worker and in Node 20+ for the tests.

const enc = new TextEncoder()

export function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function unb64u(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

export interface VapidKeys {
  publicKey: string // base64url, uncompressed P-256 point
  privateJwk: JsonWebKey
}

export async function makeVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  return {
    publicKey: b64u((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
    privateJwk: (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey,
  }
}

/** One ES256 VAPID token per push-service origin. */
export async function vapidHeader(endpoint: string, keys: VapidKeys, subject: string, nowSec: number): Promise<string> {
  const aud = new URL(endpoint).origin
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: subject })))
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`))
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${keys.publicKey}`
}

export interface Subscription {
  endpoint: string
  p256dh: string
  auth: string
}

/** A sender-side ECDH key. One per batch is fine: each message gets its own random salt. */
export async function senderKey(): Promise<{ pair: CryptoKeyPair; raw: Uint8Array }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  return { pair, raw: new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer) }
}

/** The aes128gcm body for one subscription (RFC 8291 §3–4, one record, no padding). */
export async function encrypt(sub: Subscription, payload: Uint8Array, sender: { pair: CryptoKeyPair; raw: Uint8Array }): Promise<Uint8Array> {
  const uaPublic = unb64u(sub.p256dh)
  const authSecret = unb64u(sub.auth)
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0], sender.pair.privateKey, 256))

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, sender.raw), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(payload, new Uint8Array([2]))))

  const header = new Uint8Array(21)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = sender.raw.length
  return concat(header, sender.raw, cipher)
}
