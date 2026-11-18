import { describe, expect, it } from 'vitest'
import { localHalf, phaseAt, sessionTimes } from './clock'

const L = 'en-GB' // 24-hour labels make the assertions unambiguous

// en-GB writes "7:00" for hour: 'numeric'; pad so expectations read as a 24-hour clock.
const pad = (s: string) => (/^\d:/.test(s) ? `0${s}` : s)

function at(iso: string, tz: string) {
  const s = sessionTimes(new Date(iso), tz, L)
  return { ...s, nextLocalLabel: pad(s.nextLocalLabel), otherLocalLabel: pad(s.otherLocalLabel) }
}

describe('bells are exactly 06:00:00.000Z and 18:00:00.000Z', () => {
  it('next/other instants', () => {
    const s = at('2026-11-18T12:00:00Z', 'UTC')
    expect(s.next.toISOString()).toBe('2026-11-18T18:00:00.000Z')
    expect(s.other.toISOString()).toBe('2026-11-19T06:00:00.000Z')
    expect(s.nextUtcLabel).toBe('18:00')
    expect(s.otherUtcLabel).toBe('06:00')
  })

  it('the bell instant itself is live with a full 600 s', () => {
    const s = at('2026-11-18T06:00:00.000Z', 'UTC')
    expect(s.phase).toBe('live')
    expect(s.liveSecondsLeft).toBe(600)
    expect(s.lastBell.toISOString()).toBe('2026-11-18T06:00:00.000Z')
    expect(s.next.toISOString()).toBe('2026-11-18T18:00:00.000Z')
  })

  it('one millisecond before the bell is approaching', () => {
    expect(at('2026-11-18T05:59:59.999Z', 'UTC').phase).toBe('approaching')
  })
})

describe('phases', () => {
  const t = (iso: string) => phaseAt(Date.parse(iso))
  it('idle → approaching at T−10:00', () => {
    expect(t('2026-11-18T17:49:59.999Z').phase).toBe('idle')
    expect(t('2026-11-18T17:50:00.000Z').phase).toBe('approaching')
  })
  it('live through T+10:00, then after, then idle', () => {
    expect(t('2026-11-18T18:09:59.999Z')).toEqual({ phase: 'live', liveSecondsLeft: 1 })
    expect(t('2026-11-18T18:10:00.000Z').phase).toBe('after')
    expect(t('2026-11-18T18:12:59.999Z').phase).toBe('after')
    expect(t('2026-11-18T18:13:00.000Z').phase).toBe('idle')
  })
  it('counts live seconds down', () => {
    expect(t('2026-11-18T18:04:30.000Z').liveSecondsLeft).toBe(330)
  })
})

describe('local labels across zones (November: southern summer, northern winter)', () => {
  const now = '2026-11-18T12:00:00Z'

  it('Pacific/Auckland (NZDT, +13)', () => {
    const s = at(now, 'Pacific/Auckland')
    expect(s.nextLocalLabel).toBe('07:00') // 18:00Z = 07:00 Thu 19th local
    expect(s.otherLocalLabel).toBe('19:00')
    expect(s.nextDay).toBe('today') // local now is 01:00 on the 19th
    expect(s.otherDay).toBe('today')
    expect(s.zoneName).toMatch(/NZDT|GMT\+13/)
  })

  it('Asia/Kolkata (IST, +5:30, no DST)', () => {
    const s = at(now, 'Asia/Kolkata')
    expect(s.nextLocalLabel).toBe('23:30')
    expect(s.otherLocalLabel).toBe('11:30')
    expect(s.nextDay).toBe('today')
    expect(s.otherDay).toBe('tomorrow')
    expect(s.zoneName).toMatch(/IST|GMT\+5:30/)
  })

  it('Europe/London (GMT)', () => {
    const s = at(now, 'Europe/London')
    expect(s.nextLocalLabel).toBe('18:00')
    expect(s.otherLocalLabel).toBe('06:00')
    expect(s.otherDay).toBe('tomorrow')
    expect(s.zoneName).toBe('GMT')
  })

  it('America/Los_Angeles (PST, −8)', () => {
    const s = at(now, 'America/Los_Angeles')
    expect(s.nextLocalLabel).toBe('10:00')
    expect(s.otherLocalLabel).toBe('22:00')
    expect(s.nextDay).toBe('today')
    expect(s.otherDay).toBe('today')
    expect(s.zoneName).toMatch(/PST|GMT-8/)
  })

  it('America/Sao_Paulo (−3, no DST since 2019)', () => {
    const s = at(now, 'America/Sao_Paulo')
    expect(s.nextLocalLabel).toBe('15:00')
    expect(s.otherLocalLabel).toBe('03:00')
    expect(s.otherDay).toBe('tomorrow')
  })
})

describe('DST is taken from the zone database, never a fixed offset', () => {
  it('July: London BST, Los Angeles PDT, Auckland NZST', () => {
    const now = '2026-07-01T12:00:00Z'
    expect(at(now, 'Europe/London').nextLocalLabel).toBe('19:00')
    expect(at(now, 'Europe/London').otherLocalLabel).toBe('07:00')
    expect(at(now, 'America/Los_Angeles').nextLocalLabel).toBe('11:00')
    expect(at(now, 'America/Los_Angeles').otherLocalLabel).toBe('23:00')
    expect(at(now, 'Pacific/Auckland').nextLocalLabel).toBe('06:00')
    expect(at(now, 'Asia/Kolkata').nextLocalLabel).toBe('23:30')
    expect(at(now, 'America/Sao_Paulo').nextLocalLabel).toBe('15:00')
  })

  it('London on the night the clocks go forward (2026-03-29 01:00Z)', () => {
    const s = at('2026-03-29T00:30:00Z', 'Europe/London') // 00:30 GMT
    expect(s.next.toISOString()).toBe('2026-03-29T06:00:00.000Z')
    expect(s.nextLocalLabel).toBe('07:00') // already BST at the bell
    expect(s.otherLocalLabel).toBe('19:00')
    expect(s.zoneName).toBe('BST')
  })

  it('Los Angeles on the morning the clocks go back (2026-11-01 09:00Z)', () => {
    const s = at('2026-11-01T07:00:00Z', 'America/Los_Angeles') // 00:00 PDT
    expect(s.next.toISOString()).toBe('2026-11-01T18:00:00.000Z')
    expect(s.nextLocalLabel).toBe('10:00') // PST by the bell
    expect(s.otherLocalLabel).toBe('22:00')
    expect(s.nextDay).toBe('today')
    expect(s.otherDay).toBe('today')
    expect(s.zoneName).toMatch(/PST|GMT-8/)
  })
})

describe('day/night follows the visitor\'s local clock', () => {
  const half = (iso: string, tz: string) => localHalf(new Date(iso), tz)
  it('switches at 06:00 and 18:00 local', () => {
    expect(half('2026-11-18T05:59:59Z', 'Europe/London')).toBe('night')
    expect(half('2026-11-18T06:00:00Z', 'Europe/London')).toBe('day')
    expect(half('2026-11-18T17:59:59Z', 'Europe/London')).toBe('day')
    expect(half('2026-11-18T18:00:00Z', 'Europe/London')).toBe('night')
  })
  it('the same instant is day in one place and night in another', () => {
    const now = '2026-11-18T12:00:00Z'
    expect(half(now, 'Europe/London')).toBe('day') // 12:00
    expect(half(now, 'Asia/Kolkata')).toBe('day') // 17:30
    expect(half(now, 'Pacific/Auckland')).toBe('night') // 01:00
    expect(half(now, 'America/Los_Angeles')).toBe('night') // 04:00
    expect(half(now, 'America/Sao_Paulo')).toBe('day') // 09:00
  })
})
