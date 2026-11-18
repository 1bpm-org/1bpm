// Day (06:00–17:59 on the visitor's own clock) or night. The inline head script sets it before paint;
// this keeps it right while a page stays open across 06:00 or 18:00.
import { localHalf } from './clock'

export type Theme = 'day' | 'night'

let current: Theme | null = null

export function applyTheme(now: Date, tz: string, onChange?: (t: Theme) => void): Theme {
  const next = localHalf(now, tz)
  if (next === current) return next
  current = next
  document.documentElement.dataset.theme = next
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = next === 'day' ? '#f4f1ea' : '#07080a'
  document.querySelectorAll<HTMLImageElement>('img.emblem').forEach((img) => (img.src = `/brand/planet-${next}.webp`))
  onChange?.(next)
  return next
}
