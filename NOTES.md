# NOTES

## Where the framework, its guide and the first attempt were wrong

Each of these was caught by running the app on the simulator and the web, not by reading code.
They are worth knowing about in any SolidTV / NativeScript-on-tvOS project (versions as of
2026-09-22).

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
6. **NativeScript's fetch polyfill cannot parse JSON.** Its XHR pre-parses JSON bodies into an
   object, the polyfill builds the Response from that object, and `response.json()` throws
   `"[object Object]" is not valid JSON`. `services/tmdb.ts` uses XMLHttpRequest with
   `responseType = 'json'` on both targets instead; abort still goes through the composed signal.
   The runtime otherwise has more than the plan feared: `fetch`, `AbortController`,
   `AbortSignal.any`/`timeout`, `DOMException`, `URL` and `URLSearchParams` all exist on
   NativeScript 9.2 tvOS (the app logs a `RUNTIME` line at boot).
7. **A translated container must not inherit its parent's size.** SolidTV gives a `<view>`
   without `width`/`height` its parent's size. A row scroller that inherits 1830 px and sits at
   `x = -2400` is entirely off-screen, the renderer marks it OutOfBounds and defers updating its
   children, and the scrolled row (or the scrolled grid of rows) goes blank on both targets. A
   node with an explicit zero size takes its parent's render state instead (which is what a
   size-less Blits element does, so the L3 layout never hit this). Every pure translation
   container here is `width={0} height={0}`. Found on the simulator with screenshots, confirmed
   on the web by reading the tiles' `renderState`.
8. **Text batching breaks draw order.** With the renderer's `__renderTextBatching__` define on,
   every text node is drawn after the frame's quads, so the nav labels and row titles showed
   through the opaque splash and error screens. Both builds define it `false`.
9. **The MSDF atlases lack some glyphs**, e.g. the em dash TMDB uses in overviews renders as
   `?`. They are the L3 build's atlases; regenerating them needs the msdf tooling, which was not
   available offline. Documented, not fixed.
10. **KeepAlive keeps the cached page in the render tree** (web node count 473 with Details up
    vs 458 on Home). That is the intended zero-cost back-with-state, the L3 `keepAlive`
    equivalent; Home re-focuses its root when `isAlive` flips back to true because `autofocus`
    only fires on creation.

## What would be improved with more time

- **Real-device pass** on an Apple TV (a free personal team is enough): the simulator's
  software GPU says nothing about frame rate or texture memory; the SolidTV demo's 60 fps on
  an Apple TV HD is the only hardware number available.
- **Native playback**: an `AVPlayer` view behind the "Play now" button on tvOS, with the web
  keeping a `<video>` element — the host seam already has the shape for it.
- **Automated runs of the verification scripts**: `remote-sim.sh` sequences and the web key
  floods as a test job, asserting on the `FOCUS` lines and `__velope.countNodes()`.
- **Regenerated MSDF atlases** with a full Latin charset (the em dash).
- **A proper tvOS app icon** (layered `App Icon & Top Shelf Image` brand assets); the
  simulator shows a blank tile today.
- **Upstream reports**: the fetch polyfill's JSON handling to `@nativescript/canvas-polyfill`,
  the guide/npm drift to `solid-tv/nativescript`, and the inherited-size culling trap to
  `solid-tv/solid` (a warning when a translated container inherits its parent's size would
  have saved the longest debugging session of this build).
