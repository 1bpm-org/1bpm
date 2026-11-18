// The point field, built once: a Fibonacci sphere, keeping only points over populated 1° cells
// (GHS-POP 2025), denser and brighter where people live. Same sampling as src/field.ts.
import Foundation
import UIKit
import simd

struct Field {
    var positions: [SIMD3<Float>] // x = cos(lat) sin(lon), y = sin(lat), z = cos(lat) cos(lon)
    var data: [SIMD2<Float>]      // seed in [0,1), density in (0,1]
}

enum FieldBuilder {
    static let w = 360, h = 180

    /// The 360×180 density grid from population.png, one byte per cell.
    static func loadGrid() -> [UInt8]? {
        guard let image = UIImage(named: "population.png")?.cgImage else { return nil }
        var grid = [UInt8](repeating: 0, count: w * h)
        let ok = grid.withUnsafeMutableBytes { buf -> Bool in
            guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                      space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
            else { return false }
            ctx.interpolationQuality = .none
            ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        return ok ? grid : nil
    }

    private static func hash(_ i: Int, _ salt: UInt32) -> Float {
        var x = (UInt32(truncatingIfNeeded: i) ^ salt) &* 0x85eb_ca6b
        x ^= x >> 13
        x = x &* 0xc2b2_ae35
        x ^= x >> 16
        return Float(Double(x) / 4_294_967_296)
    }

    private static func texel(_ g: [UInt8], _ col: Int, _ row: Int) -> Double {
        let c = ((col % w) + w) % w
        let r = min(max(row, 0), h - 1)
        return Double(g[r * w + c])
    }

    private static func bilinear(_ g: [UInt8], _ lon: Double, _ lat: Double) -> Double {
        let fx = lon + 180 - 0.5, fy = 90 - lat - 0.5
        let x0 = Int(fx.rounded(.down)), y0 = Int(fy.rounded(.down))
        let tx = fx - Double(x0), ty = fy - Double(y0)
        let a = texel(g, x0, y0), b = texel(g, x0 + 1, y0), c = texel(g, x0, y0 + 1), d = texel(g, x0 + 1, y0 + 1)
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
    }

    static func sample(grid: [UInt8], target: Int, candidates: Int) -> Field {
        let golden = Double.pi * (3 - sqrt(5.0))
        let rad = 180 / Double.pi
        var weights = [Double](repeating: 0, count: candidates)
        var values = [Float](repeating: 0, count: candidates)
        var sum = 0.0
        func point(_ i: Int) -> (Double, Double, Double) {
            let y = 1 - (Double(i) + 0.5) / Double(candidates) * 2
            let r = sqrt(1 - y * y)
            let th = golden * Double(i)
            return (cos(th) * r, y, sin(th) * r)
        }
        for i in 0..<candidates {
            let (x, y, z) = point(i)
            let lat = asin(y) * rad
            let lon = atan2(x, z) * rad
            if texel(grid, Int((lon + 180).rounded(.down)), Int((90 - lat).rounded(.down))) == 0 { continue }
            let d = max(bilinear(grid, lon, lat), 1) / 255
            values[i] = Float(d)
            weights[i] = 0.012 + 0.988 * pow(d, 2.2)
            sum += weights[i]
        }
        let k = sum > 0 ? Double(target) / sum : 0
        var field = Field(positions: [], data: [])
        field.positions.reserveCapacity(target + target / 4)
        field.data.reserveCapacity(target + target / 4)
        for i in 0..<candidates where weights[i] > 0 && Double(hash(i, 0x9e37_79b9)) < k * weights[i] {
            let (x, y, z) = point(i)
            field.positions.append(SIMD3(Float(x), Float(y), Float(z)))
            field.data.append(SIMD2(hash(i, 0x51ed_270b), values[i]))
        }
        return field
    }

    /// One existing point near the viewer's rough longitude (from the UTC offset) and region.
    /// It brightens for a few seconds after "Count me in". Nothing is located; nothing is sent.
    static func pickHere(_ f: Field, lonDeg: Double, latMin: Double, latMax: Double) -> Int {
        var best = -1
        var bestV: Float = -1
        for (i, p) in f.positions.enumerated() {
            let lat = asin(Double(p.y)) * 180 / .pi
            guard lat >= latMin, lat <= latMax else { continue }
            var dl = abs(atan2(Double(p.x), Double(p.z)) * 180 / .pi - lonDeg)
            if dl > 180 { dl = 360 - dl }
            if dl <= 10, f.data[i].y > bestV { bestV = f.data[i].y; best = i }
        }
        return best
    }

    static func regionLat(_ zone: String) -> (Double, Double) {
        switch zone.split(separator: "/").first.map(String.init) ?? "" {
        case "Europe": return (36, 62)
        case "Africa": return (-34, 34)
        case "Asia": return (0, 50)
        case "Australia": return (-40, -12)
        case "Pacific": return (-48, 22)
        case "America": return (-40, 55)
        default: return (-55, 65)
        }
    }
}
