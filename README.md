# Velope TV Reference (SolidTV / Apple TV)

Reference implementation for the Velope OTT Developer Test (2026 edition), rebuilt on
**SolidTV** (SolidJS driving the Lightning 3 WebGL renderer) so that ONE `src/` runs on the
web (Vercel, LG/Samsung-ready) and on **Apple TV**. tvOS has no browser, so there the app runs
inside NativeScript and draws into a native WebGL view through `@solidtv/nativescript`.

Same experience as the Lightning 3 / Blits reference build: keyboard- or Siri-Remote-driven
movie browser against The Movie Database with a genre nav, 12 carousel rows that keep
fetching to the right and cycle once TMDB is exhausted, a details screen with exact
back-with-state, bounded memory, coalesced input, and visible loading/error states throughout.

## Web

Requires Node 20+ and pnpm 10.

```sh
pnpm install
cp .env.example .env        # then add your TMDB key (below)
pnpm dev                    # Vite dev server on http://localhost:5173
pnpm build                  # production bundle in dist/
pnpm typecheck              # strict tsc over src/
```

### TMDB key

Register a free API key at https://developer.themoviedb.org/docs/getting-started and put the
v3 key (32-char hex) in `.env`:

```
VITE_TMDB_API_KEY=your_key_here
```

The key is only ever read from the environment at build time; nothing is committed. Both
builds read the same file (Vite for the web, `nativescript/webpack.config.js` for tvOS) and
expose it as `import.meta.env.VITE_TMDB_API_KEY`. Without a key the app boots into its error
screen with a message telling you exactly this.

### Deploying to Vercel

Import the repository in the Vercel dashboard; `vercel.json` sets the Vite build
(`pnpm build`, output `dist`). Add the environment variable `VITE_TMDB_API_KEY` (or plain
`TMDB_API_KEY`, which Vercel prefers since the value is public in the bundle anyway) in the
project settings, then redeploy once. Every push to `main` redeploys.

## Apple TV (simulator)

Requires a Mac with **Xcode 27** and the tvOS platform (Xcode 26.4 should also work: that is
what the SolidTV guide was written against), pnpm 10, and the `xcodeproj` gem
(`gem install --user-install xcodeproj`; the NativeScript CLI merges xcconfig files with it).
CocoaPods is not needed. The tvOS host lives in `nativescript/` and is its own pnpm root; the
NativeScript CLI comes from the `tvos` dist-tags as a dev dependency, nothing is installed
globally.

1. Point the command line tools at Xcode and accept the license, once:

   ```sh
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   xcrun simctl list runtimes | grep tvOS      # if empty: xcodebuild -downloadPlatform tvOS
   ```

   (Without the switch, the scripts below still work: they export
   `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` themselves.)

2. Install the host's dependencies (a UTF-8 locale is required on every `ns` command, or the
   xcodeproj gem fails reading the xcconfig files; the scripts set it):

   ```sh
   cd nativescript && LC_ALL=en_US.UTF-8 pnpm install && cd ..
   ```

   **If this checkout lives in an iCloud-synced folder** (Desktop or Documents with "Desktop &
   Documents Folders" on), run `sh nativescript/scripts/icloud-shadow.sh` once and install from
   the folder it prints instead. iCloud tags every `.app`/`.framework` Xcode creates with Finder
   metadata mid-build and codesign then fails ("resource fork, Finder information, or similar
   detritus not allowed"); the script keeps everything the build generates outside iCloud. A
   checkout in `~/Developer` needs none of this.

3. Boot an Apple TV simulator:

   ```sh
   xcrun simctl list devices available | grep "Apple TV"
   xcrun simctl boot <udid>
   ```

4. Build, install and run:

   ```sh
   sh nativescript/scripts/tvos.sh run        # ns run tvos --emulator --no-hmr, console attached
   ```

   or build only (`sh nativescript/scripts/tvos.sh build`, the app lands in
   `platforms/tvos/build/Debug-appletvsimulator/VelopeTV.app`) and then
   `zsh nativescript/scripts/run-sim.sh <udid> <out-dir>` to install, launch, stream the unified
   log until the app reports `APP rendered`, and take a screenshot.

Xcode 27 ships no Simulator.app (the simulators run headless; `xcrun simctl io <udid>
screenshot out.png` captures the screen). Real Siri Remote presses can be scripted through the
XCUITest driver in `nativescript/remote-driver` (generate its project once with
`ruby generate.rb`):

```sh
zsh nativescript/scripts/remote-sim.sh <udid> out/ "down right right select wait:2000 menu"
```

Dev builds log a `FOCUS zone=… row=… col=… items=… nodes=…` line on every focus change, so
the simulator's console is enough to verify navigation without a screen.

### On a physical Apple TV / App Store (documented, not executed)

Pair the TV with Xcode (Settings → Remotes and Devices → Remote App and Devices on the TV,
then Window → Devices and Simulators in Xcode), put your team id in both
`nativescript/App_Resources/{iOS,tvOS}/build.xcconfig` as `DEVELOPMENT_TEAM = …;` (a free
personal team runs on your own device), run one `xcodebuild … -allowProvisioningUpdates`
build so Xcode registers the device, then `pnpm exec ns run tvos --device <identifier>
--no-hmr --no-watch` from the host folder. App Store distribution needs a paid Apple Developer
team; the export to App Store Connect has not been exercised by this build.

## Controls

| Key (web) | Siri Remote | Action |
| --- | --- | --- |
| Arrow Up / Down | Swipe/click up / down | Move between the genre nav and rows |
| Arrow Left / Right | Swipe/click left / right | Move within a row or the nav; rows keep fetching more titles to the right and cycle once TMDB is exhausted, left stops at the first item |
| Enter | Select (click) | Activate genre / open details / retry a failed load |
| Backspace or Escape | Menu | Back from details (restoring exact genre + position); in the grid, back to the nav |

Focus starts on **All** in the nav. Holding an arrow key scrolls quickly; repeats are
coalesced (100 ms input throttle) so navigation can never flood the render loop.

**Menu on Apple TV** follows the platform contract: a press the app handles stays in the app
(details → grid, grid → nav); a press in the nav, the root of the app, is left to the system
and returns to the tvOS Home screen, as App Review expects.

## Resolution and diagnostics

- The scene is authored at 1920×1080. On the web it is fitted to the window (1:1 on a 1080p
  panel); append `?res=720` to render the identical coordinate system on a 1280×720 canvas
  (stage scaling; reload-based by design). The Apple TV 4K simulator is 1080p; the renderer's
  logical ratio is derived from the screen (`rendererSettings`), so a 720p device would scale
  the same way.
- Append `?fps=1` on the web to show the FPS counter (top-right).
- `tools/tmdb-mock.server.mjs` is a TMDB stand-in for fault injection: it proxies the real API
  and flips failures, delays, short rows and exhaustion at runtime (see its header). Point the
  app at it with `VITE_TMDB_BASE_URL=http://localhost:8787` in `.env.local` (both builds read
  it; the tvOS Info.plist allows local http for exactly this).

## Reproducing the 6× CPU-throttle performance test (web)

1. Open the app with the FPS counter on: `http://localhost:5173/?fps=1`
2. Open Chrome DevTools → **Performance** tab → gear icon → **CPU: 6× slowdown**.
3. Hold **Arrow Right** for ~10 seconds inside a row, riding through the seam where the items
   cycle (with the mock's `/__mock/exhaust?page=3` the seam comes after 40 titles).
4. Hold **Arrow Down** through all 12 rows, then back up into the nav.
5. Switch genres a few times and open/close a details page.

What you should observe: the FPS readout stays at the display rate during scrolling (short
dips only while a new row's components are created), the focus ring never detaches or lands on
a stale tile, and no blank frames appear. For memory: DevTools → **Memory** — heap and GPU
stay flat however far you scroll, because at most 5 rows × 11 tiles exist at any time (see
PLAN.md). A dev build also exposes `__velope.countNodes()` in the console: 373 renderer nodes
at the top of the catalogue, 185 at the last row.

The simulator's GPU is a software renderer and says nothing about a real Apple TV; the
SolidTV demo ran at 60 fps on an Apple TV HD. Measure performance on hardware.

## Known limitations (tvOS-mandated deviations)

- **No video playback** on either target: tvOS has no `<video>`, and native `AVPlayer`
  bridging is out of scope. "Play now" shows the brief on-screen hint of the L3 build.
- **Menu exits from the nav** (see Controls). Everything else is identical to the L3 app.
- The simulator has no real GPU or texture-memory numbers.
- The MSDF font atlases (from the L3 build) miss a few glyphs, e.g. the em dash renders as `?`.

## Dependencies

- `@solidtv/solid` 1.6.3 + `@solidtv/renderer` 1.9.3 — SolidJS bindings over the Lightning 3
  WebGL renderer (`solid-js`, `@solidjs/router` for the hash router it wraps).
- `vite` + `vite-plugin-solid` (dev) — the web build; `typescript` (dev) — strict checks.
- `nativescript/`: `@solidtv/nativescript` 0.1.1 (the tvOS host: renderer settings, Siri
  Remote key bridge, lifecycle), the NativeScript tvOS fork (`nativescript` 9.2.0-tvos.0,
  `@nativescript/core` 9.2.0-tvos.0, `@nativescript/tvos` 9.1.0, `@nativescript/webpack`
  5.0.39-tvos.0) and `@nativescript/canvas` + `canvas-polyfill` 3.0.0-alpha.10 (the first
  build with tvOS slices).

## Project layout

```
src/
  index.tsx              Boot: renderer options, fonts, focus manager, router; same on both targets
  host.ts / host.types   The runtime seam (AppHost): renderer settings, key target, asset URLs, fonts
  App.tsx                HashRouter: Home (kept alive) and Details
  services/tmdb.ts       TMDB access: XHR JSON with timeout+abort, response cache, image sizing
  services/rows.ts       Row collections (12 per genre), row assembly and fetch-ahead pagination
  pages/Home.tsx         The focus engine: single model {zone, rowIndex, cols[]} + all key input
  pages/Details.tsx      Poster, metadata, mock action buttons, back handling
  components/            Prop-driven view components (no state of their own beyond visuals)
  state/selection.ts     The title handed from Home to Details
  debug.ts               Dev-only hooks (__velope: state, node count)
nativescript/
  app/app.ts             tvOS boot: canvas, KeyBridge, remote, lifecycle -> AppHost -> ../src
  app/shims.ts           window.location/history/hashchange for the HashRouter
  webpack.config.js      Bundles ../src for the runtime; defines import.meta.env from ../.env
  App_Resources/         Info.plist (UIScene manifest, local networking), xcconfig
  scripts/               tvos.sh, run-sim.sh, remote-sim.sh, icloud-shadow.sh
  remote-driver/         XCUITest Siri Remote driver (generate.rb + Swift)
tools/tmdb-mock.server.mjs   Fault-injection proxy for TMDB
```

`PLAN.md` describes the architecture and trade-offs; `NOTES.md` lists what the framework and
its guides got wrong and what would be improved with more time; `ANSWERS.md` answers the
test's written questions against this codebase.
