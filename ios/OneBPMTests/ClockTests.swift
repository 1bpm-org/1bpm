import XCTest
@testable import OneBPM

final class ClockTests: XCTestCase {
    let gb = Locale(identifier: "en_GB") // 24-hour labels keep the assertions unambiguous
    func d(_ s: String) -> Date { ISO8601DateFormatter().date(from: s)! }
    func tz(_ id: String) -> TimeZone { TimeZone(identifier: id)! }
    func label(_ date: Date, _ zone: String) -> String { Clock.localTime(date, tz: tz(zone), locale: gb) }

    func testBellsAreExact() {
        let s = Clock.times(d("2026-11-18T12:00:00Z"), tz: tz("UTC"))
        XCTAssertEqual(Clock.isoString(s.next), "2026-11-18T18:00:00.000Z")
        XCTAssertEqual(Clock.isoString(s.other), "2026-11-19T06:00:00.000Z")
        XCTAssertFalse(s.nextIs06)
    }

    func testPhases() {
        XCTAssertEqual(Clock.phase(d("2026-11-18T17:49:59Z")).0, .idle)
        XCTAssertEqual(Clock.phase(d("2026-11-18T17:50:00Z")).0, .approaching)
        let live = Clock.phase(d("2026-11-18T18:00:00Z"))
        XCTAssertEqual(live.0, .live)
        XCTAssertEqual(live.1, 600)
        XCTAssertEqual(Clock.phase(d("2026-11-18T18:04:30Z")).1, 330)
        XCTAssertEqual(Clock.phase(d("2026-11-18T18:10:00Z")).0, .after)
        XCTAssertEqual(Clock.phase(d("2026-11-18T18:13:00Z")).0, .idle)
    }

    func testZonesInNovember() {
        let now = d("2026-11-18T12:00:00Z")
        let a = Clock.times(now, tz: tz("Pacific/Auckland"))
        XCTAssertEqual(label(a.next, "Pacific/Auckland"), "07:00")
        XCTAssertTrue(a.nextIsToday) // 01:00 on the 19th locally
        XCTAssertEqual(label(a.other, "Pacific/Auckland"), "19:00")

        let k = Clock.times(now, tz: tz("Asia/Kolkata"))
        XCTAssertEqual(label(k.next, "Asia/Kolkata"), "23:30")
        XCTAssertFalse(k.otherIsToday)

        XCTAssertEqual(label(Clock.times(now).next, "Europe/London"), "18:00")
        XCTAssertEqual(label(Clock.times(now).next, "America/Los_Angeles"), "10:00")
        XCTAssertEqual(label(Clock.times(now).other, "America/Sao_Paulo"), "03:00")
    }

    func testDST() {
        let july = Clock.times(d("2026-07-01T12:00:00Z"))
        XCTAssertEqual(label(july.next, "Europe/London"), "19:00")
        XCTAssertEqual(label(july.next, "America/Los_Angeles"), "11:00")
        XCTAssertEqual(label(july.next, "Pacific/Auckland"), "06:00")
        // London on the night the clocks go forward: 00:30 GMT, the bell is already in BST.
        let spring = Clock.times(d("2026-03-29T00:30:00Z"), tz: tz("Europe/London"))
        XCTAssertEqual(label(spring.next, "Europe/London"), "07:00")
        XCTAssertEqual(spring.zoneName, "BST")
        // Los Angeles the morning the clocks go back.
        let fall = Clock.times(d("2026-11-01T07:00:00Z"), tz: tz("America/Los_Angeles"))
        XCTAssertEqual(label(fall.next, "America/Los_Angeles"), "10:00")
        XCTAssertTrue(fall.otherIsToday)
    }

    func testDayAndNight() {
        XCTAssertFalse(Clock.isDay(d("2026-11-18T05:59:59Z"), tz: tz("Europe/London")))
        XCTAssertTrue(Clock.isDay(d("2026-11-18T06:00:00Z"), tz: tz("Europe/London")))
        XCTAssertFalse(Clock.isDay(d("2026-11-18T12:00:00Z"), tz: tz("Pacific/Auckland")))
    }

    func testDigits() {
        XCTAssertEqual(Clock.digits(9 * 60 + 5), "9:05")
        XCTAssertEqual(Clock.digits(2 * 3600 + 3 * 60 + 4.2), "2:03:05")
    }

    func testFieldKeepsOnlyPopulatedCells() {
        var grid = [UInt8](repeating: 0, count: 360 * 180)
        for row in 40..<60 { for col in 200..<240 { grid[row * 360 + col] = 200 } }
        let f = FieldBuilder.sample(grid: grid, target: 2000, candidates: 200_000)
        XCTAssertGreaterThan(f.positions.count, 500)
        for p in f.positions {
            let lat = asin(Double(p.y)) * 180 / .pi
            let lon = atan2(Double(p.x), Double(p.z)) * 180 / .pi
            XCTAssert(lat <= 50.5 && lat >= 29.5 && lon >= 19.5 && lon <= 60.5, "\(lat) \(lon)")
        }
    }
}
