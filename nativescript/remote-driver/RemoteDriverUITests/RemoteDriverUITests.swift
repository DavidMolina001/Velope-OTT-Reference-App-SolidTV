import XCTest

// Presses Siri Remote buttons on the Apple TV simulator through XCUIRemote: the one scripted
// source of REAL presses there (there is no Simulator.app in Xcode 27 to send keys to). Steps
// come space-separated in TEST_RUNNER_REMOTE_STEPS: up down left right select menu play,
// hold:<button>:<ms>, wait:<ms>, repeat:<button>:<n>. TEST_RUNNER_REMOTE_LAUNCH=launch
// restarts the app first; otherwise the running one is activated. Every press is logged as
// REMOTE_DRIVER ... to the unified log, and the app's process state at the end.
final class RemoteDriverUITests: XCTestCase {
    func testDrive() {
        let env = ProcessInfo.processInfo.environment
        let bundle = env["REMOTE_BUNDLE"] ?? "com.edinburghanalytics.velopetv"
        let steps = (env["REMOTE_STEPS"] ?? "").split(separator: " ").map(String.init)
        let app = XCUIApplication(bundleIdentifier: bundle)
        if env["REMOTE_LAUNCH"] == "launch" { app.launch() } else { app.activate() }
        _ = app.wait(for: .runningForeground, timeout: 10)
        NSLog("REMOTE_DRIVER start state=\(app.state.rawValue) steps=\(steps.count)")
        let remote = XCUIRemote.shared
        func button(_ name: String) -> XCUIRemote.Button? {
            switch name {
            case "up": return .up
            case "down": return .down
            case "left": return .left
            case "right": return .right
            case "select": return .select
            case "menu": return .menu
            case "play": return .playPause
            case "home": return .home
            default: return nil
            }
        }
        for step in steps {
            let parts = step.split(separator: ":").map(String.init)
            switch parts[0] {
            case "wait":
                Thread.sleep(forTimeInterval: (Double(parts[1]) ?? 0) / 1000)
            case "hold":
                if let b = button(parts[1]) { remote.press(b, forDuration: (Double(parts[2]) ?? 0) / 1000) }
            case "repeat":
                if let b = button(parts[1]) {
                    let n = Int(parts[2]) ?? 1
                    for _ in 0..<n { remote.press(b) }
                }
            default:
                if let b = button(parts[0]) { remote.press(b) }
            }
            NSLog("REMOTE_DRIVER step \(step)")
        }
        Thread.sleep(forTimeInterval: 1)
        NSLog("REMOTE_DRIVER done state=\(app.state.rawValue)")
    }
}
