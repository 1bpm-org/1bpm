// Point-field sampling. Pure: no DOM, no WebGL. Runs once at startup.
//
// Candidates are a Fibonacci sphere (equal-area). A candidate survives only if its
// 1-degree population texel is non-zero, so oceans and empty land never get a point.
// Survival probability rises with density, so the field is denser *and* brighter where
// people actually live.

export const GRID_W = 360
export const GRID_H = 180

export interface Field {
  /** xyz on the unit sphere, x = cos(lat) sin(lon), y = sin(lat), z = cos(lat) cos(lon) */
  positions: Float32Array
  /** per point: seed in [0,1), density in (0,1] */
  data: Float32Array
  count: number
}

function hash(i: number, salt: number): number {
  let x = Math.imul(i ^ salt, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

function texel(grid: Uint8Array, col: number, row: number): number {
  col = ((col % GRID_W) + GRID_W) % GRID_W
  row = row < 0 ? 0 : row >= GRID_H ? GRID_H - 1 : row
  return grid[row * GRID_W + col]
}

function nearest(grid: Uint8Array, lonDeg: number, latDeg: number): number {
  return texel(grid, Math.floor(lonDeg + 180), Math.floor(90 - latDeg))
}

function bilinear(grid: Uint8Array, lonDeg: number, latDeg: number): number {
  const fx = lonDeg + 180 - 0.5
  const fy = 90 - latDeg - 0.5
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const a = texel(grid, x0, y0)
  const b = texel(grid, x0 + 1, y0)
  const c = texel(grid, x0, y0 + 1)
  const d = texel(grid, x0 + 1, y0 + 1)
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
}

const weight = (v: number) => 0.012 + 0.988 * Math.pow(v, 2.2)

export function sampleField(grid: Uint8Array, target: number, candidates: number): Field {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const RAD = 180 / Math.PI
  const w = new Float32Array(candidates)
  const v = new Float32Array(candidates)
  let sum = 0

  for (let i = 0; i < candidates; i++) {
    const y = 1 - ((i + 0.5) / candidates) * 2
    const r = Math.sqrt(1 - y * y)
    const th = golden * i
    const lat = Math.asin(y) * RAD
    const lon = Math.atan2(Math.cos(th) * r, Math.sin(th) * r) * RAD
    if (nearest(grid, lon, lat) === 0) continue
    const d = Math.max(bilinear(grid, lon, lat), 1) / 255
    v[i] = d
    w[i] = weight(d)
    sum += w[i]
  }

  const k = sum > 0 ? target / sum : 0
  const pos: number[] = []
  const data: number[] = []
  for (let i = 0; i < candidates; i++) {
    if (w[i] === 0 || hash(i, 0x9e3779b9) >= k * w[i]) continue
    const y = 1 - ((i + 0.5) / candidates) * 2
    const r = Math.sqrt(1 - y * y)
    const th = golden * i
    pos.push(Math.cos(th) * r, y, Math.sin(th) * r)
    data.push(hash(i, 0x51ed270b), v[i])
  }
  return { positions: new Float32Array(pos), data: new Float32Array(data), count: pos.length / 3 }
}

/**
 * Index of one existing point to brighten for "I am here": the densest point inside a
 * coarse box around the viewer's approximate longitude (from the UTC offset) and the
 * latitude band of their zone's region. Nothing is created; nothing is sent.
 */
export function pickHere(field: Field, lonDeg: number, latMin: number, latMax: number): number {
  const RAD = 180 / Math.PI
  let best = -1
  let bestV = -1
  for (let i = 0; i < field.count; i++) {
    const x = field.positions[i * 3]
    const y = field.positions[i * 3 + 1]
    const z = field.positions[i * 3 + 2]
    const lat = Math.asin(y) * RAD
    if (lat < latMin || lat > latMax) continue
    let dl = Math.abs(Math.atan2(x, z) * RAD - lonDeg)
    if (dl > 180) dl = 360 - dl
    if (dl > 10) continue
    const d = field.data[i * 2 + 1]
    if (d > bestV) {
      bestV = d
      best = i
    }
  }
  return best
}
