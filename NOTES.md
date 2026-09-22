# NOTES

Pitfalls hit while building, recorded as they happened (finalised at the docs gate).

1. **The published SolidTV Apple TV stack is behind its own deployment guide.** The guide and
   the demo app's `nativescript/` project use `bindCanvas`, `mirrorConsole`, full browser shims,
   `chainSolidTV` options (`env`, `alias`, `hexColors`) and `Config.preventDefaultOnHandledKeys`.
   None of that is in `@solidtv/nativescript` 0.1.1 / `@solidtv/solid` 1.6.3 on npm
   (2026-09-22); the guide itself says those come in later releases. This build uses the API
   0.1.1's README documents: `createRenderer(rendererSettings(canvas, Screen.mainScreen),
   stubTarget)`, `useFocusManager(keyMap, bridge)`, `loadSdfFont` for bundle fonts, and
   `e.preventDefault()` in every Back handler the app consumes (so an unhandled Menu on the root
   screen still exits to the tvOS Home screen). The runtime seam is `src/host.ts`.
2. **`import.meta.env` does not exist under webpack.** `nativescript/webpack.config.js` defines it
   with a DefinePlugin from `../.env` (VITE_* only) so `src/` reads the key the same way on both
   targets. Verified in the emitted bundle.
3. **tvOS 27 SDK requires the UIScene lifecycle.** Built with Xcode 27, the app trapped at launch
   in `__UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` right after the first
   console line. NativeScript core 9.2 switches to its scene delegate when
   `UIApplicationSceneManifest` is in `App_Resources/tvOS/Info.plist`; that key alone fixes it
   (the demo's plist, written for Xcode 26.4, does not have it).
4. **iCloud-synced checkouts break codesign.** "resource fork, Finder information, or similar
   detritus not allowed": iCloud Drive tags every `.app`/`.framework` folder Xcode creates with
   Finder metadata seconds after it appears, and `xattr -cr` is a race. Fix in
   `nativescript/scripts/icloud-shadow.sh` (a shadow project outside iCloud with the sources
   symlinked; `scripts/tvos.sh` uses it when present). Symlinking only `platforms/` and
   `node_modules/` was not enough: the CLI then generates broken relative paths.
5. **Xcode 27 has no Simulator.app** (`Contents/Applications` ships DeviceHub instead); the
   simulators run headless through `simctl`, and `simctl io <udid> screenshot` works. With
   `xcode-select` still on the Command Line Tools, every `xcodebuild`/`xcrun`/`ns` call needs
   `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` (the scripts export it).
