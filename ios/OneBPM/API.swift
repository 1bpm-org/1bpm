// The only server the app talks to (the same one as the site). It stores a random id per install
// and the bell it chose. No name, no email, no location.
import Foundation

enum API {
    static let base = URL(string: "https://api.1bpm.org")!

    static var clientId: String {
        if let id = UserDefaults.standard.string(forKey: "clientId") { return id }
        let id = UUID().uuidString.lowercased()
        UserDefaults.standard.set(id, forKey: "clientId")
        return id
    }

    private struct CountReply: Decodable { let count: Int }

    static func count(_ session: String) async throws -> Int {
        var c = URLComponents(url: base.appendingPathComponent("v1/count"), resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "session", value: session)]
        return try await send(URLRequest(url: c.url!))
    }

    /// Count me in (`on`) or take me out. Returns the fresh count for that bell.
    static func setCommitted(_ session: String, _ on: Bool) async throws -> Int {
        var r = URLRequest(url: base.appendingPathComponent("v1/commit"))
        r.httpMethod = on ? "PUT" : "DELETE"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("https://1bpm.org", forHTTPHeaderField: "Origin") // the API accepts writes from 1BPM only
        r.httpBody = try JSONSerialization.data(withJSONObject: ["clientId": clientId, "session": session])
        return try await send(r)
    }

    private static func send(_ r: URLRequest) async throws -> Int {
        var r = r
        r.timeoutInterval = 15
        r.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, res) = try await URLSession.shared.data(for: r)
        guard (res as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(CountReply.self, from: data).count
    }
}
