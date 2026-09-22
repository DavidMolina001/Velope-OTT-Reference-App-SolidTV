# PLAN

## Constraints designed for

A TV app is a memory-, CPU- and network-constrained appliance: single-digit-GB devices, slow
GPUs, D-pad-only input, hotel-room networks. Every decision below follows from four rules:
keep the render tree bounded, never block the render loop, never trust the network, and keep
exactly one source of truth for focus.

This is the SolidTV sibling of the Lightning 3 / Blits and Lightning 2 reference builds. It
keeps their UX and their services design and adds one more constraint: the same `src/` must
run on the web and inside NativeScript on Apple TV, where there is no browser at all.

## Architecture

Four layers, one-way data flow:

1. **Host seam** (`src/host.ts`) — everything a runtime differs in is one object, `AppHost`:
   the renderer settings it requires (canvas, pixel ratios, `Platform`), where the focus
   manager listens for keys, how an asset path becomes a URL, how the two MSDF fonts are
   registered, and the video player (a `<video>` element with Shaka Player / hls.js on the web, a
   full-screen `AVPlayerViewController` on Apple TV). `play()` takes an ordered list of streams
   and plays the first the runtime can start: DASH + Widevine where a CDM exists, the clear HLS
   stream everywhere else, so one details page serves both. The web host is derived from `window`; the tvOS boot file
   (`nativescript/app/app.ts`) builds one from `@solidtv/nativescript`'s `rendererSettings`,
   `KeyBridge` (Siri Remote → key events), `loadSdfFont` and the lifecycle binding, then
   imports `src/index` unchanged. `src/` never imports NativeScript.

2. **Data** (`services/`) — `tmdb.ts` owns all network access: every request carries a
   composed abort signal (8 s timeout + the caller's), responses are cached in a promise map
   (in-flight requests dedupe; failures are evicted so retry refetches), and poster URLs are
   built from `/configuration`, choosing the smallest size that covers the on-screen width —
   tiles fetch `w342`, details `w500`, never full-res. `rows.ts` defines 12 collections
   (sort/decade variations) applied to any genre; each row fetches exactly one discover page
   (20 titles) and never fetches again — the carousel loops that set (product direction; the
   L3 fetch-ahead code path is kept but inert, `ROW_PAGES`). Both files are the L3 build's,
   with one runtime-driven change: JSON goes through `XMLHttpRequest` with
   `responseType = 'json'`, because NativeScript's fetch polyfill hands its Response an
   already-parsed object (NOTES.md).

3. **Focus/input engine** (`pages/Home.tsx`) — a single explicit model in a Solid store:
   `{ zone: 'nav' | 'grid', navIndex, rowIndex, cols[] }` (one remembered column per row).
   All key handling lives on Home's root view (`onUp`/`onDown`/`onLeft`/`onRight`/`onEnter`/
   `onBack`) and only mutates this model; every visual (ring, scroll offsets, nav pill) derives
   from it through fine-grained signals, so a key press updates the two tiles whose `focused`
   changed, never the tree. Vertical movement clamps; horizontal movement clamps left at zero
   and loops to the right — past the last of the row's 20 titles the column becomes a virtual
   index with each slot resolving its movie by `items[slot % count]`. Details has the same shape in miniature (`buttonIndex`).
   `Config.throttleInput = 100` coalesces held-key repeats at the framework level, on both
   targets (the tvOS KeyBridge repeats a held button keyboard-style at 80 ms).

   SolidTV's `Row`/`Column` primitives were deliberately not used: they manage focus among
   their children themselves, which would scatter the model. Layout is absolute, as in the L3
   templates (`x = slot * 240`, `y = row * 470`).

4. **Views** (`components/`) — prop-driven and stateless with respect to app logic. A tile
   knows how to look focused; it never decides whether it is.

## Memory model (the CTV core)

Windowed rendering on both axes, in app code, driven by the focus model:

- A row renders only `scrollCol − 2 … scrollCol + 9` of its items (≤ 11 tiles alive). The
  window is a memo that hands `<For>` one stable object per slot, so a tile stays bound to its
  slot while the window slides: one tile created and one destroyed per step, never a rebuild.
- The grid renders only `rowIndex − 1 … rowIndex + 3` of its 12 rows (≤ 5 rows alive), keyed by
  the row's store identity so status/items patches never recreate a row.
- Everything outside a window is **destroyed** (not hidden), which releases its renderer nodes
  and texture references.
- The renderer's texture manager gets an explicit ceiling (`textureMemory.criticalThreshold`
  160 MB, target 0.8) and evicts least-recently-used off-screen textures on top of that.
- Translated containers (the row scroller, the grid) have an explicit zero size so the
  renderer culls their *children* individually instead of deferring the whole subtree once the
  container's own bounds leave the screen (NOTES.md; this one cost a day of blank rows).

Net effect: ~40 tile components / a few hundred renderer nodes alive regardless of how far the
user scrolls. Measured: web 373 nodes at the top of the catalogue and 185 at the last row;
Apple TV simulator 270–543 across an 11-row walk, constant at 476 while holding Right through
60 titles. Data (plain JS objects) is cached per genre so revisits are instant, but pixels are
never retained off-screen.

## Network model

Loading, error and retry are modeled as row state (`pending → loading → ready | error`), so a
slow or dead network degrades one row at a time — skeleton cards while loading (focus ring
still visible on the focused row), an inline "press Enter to retry" on failure — and the boot
path has its own splash and full-screen retry. There is no state in which the screen is blank.
Genre switches abort all in-flight requests before starting new ones, and every row mutation
is guarded by row id, so a late response from an abandoned genre can never write into the new
one. Home's cleanup aborts anything still pending at app teardown; while the user sits on the
details page, row prefetches deliberately keep filling the cache. All of it was exercised with
`tools/tmdb-mock.server.mjs` on both targets.

## Back-with-state

Home is a `KeepAliveRoute`, so the page instance (and with it the whole focus model and
loaded rows) survives navigation to details: its nodes stay in the renderer tree, hidden.
Back restores genre, row, column and scroll exactly, at zero cost; Home re-focuses its root when
the route's `isAlive` flips back (autofocus only fires on creation). Details is deliberately
disposable: it receives its title through a module signal and is destroyed on exit. Routing is
SolidTV's `HashRouter` on both targets; on tvOS the host supplies the `window.location`,
history stack and `hashchange` event it reads (`nativescript/app/shims.ts`), so
`history.back()` behaves like a browser's, including the no-op on the first entry.

## Differences from the L3 app

- **Playback is real**: "Play now" plays a Widevine-protected DASH stream on the web and the
  clear Big Buck Bunny HLS on Apple TV (no Widevine on Apple platforms) through the runtime's
  native player (L3 showed a hint). Back/Menu stops it and returns to the details screen.
- **One page per row, then loop** (product direction, as in the LNG2 build): predictable
  network cost and a loop the user actually encounters, instead of L3's fetch-ahead.
- **Menu contract** (tvOS-mandated): a handled Back/Menu calls `preventDefault()` (details → grid, grid →
  nav); in the nav it is left unhandled so the system returns to the Home screen. In a browser
  the unhandled Back is simply a no-op.
- **Fonts** load through the host (`loadSdfFont` from the app bundle) instead of URLs served by
  Vite; same two atlases.
- **No pointer input, no SVG, no image workers** on tvOS — none are used.

## Trade-offs and assumptions

- **Genre activates on Enter**, not on nav focus — browsing the nav shouldn't fire five
  discover queries; explicit selection is standard TV UX.
- **Rows are fixed collections × genre filter** rather than editorially distinct queries —
  uniform, cacheable, and guarantees 12 rows for every genre.
- **One page, then loop**: a row is its first discover page — 20 titles — and scrolling right
  past the end cycles those same titles seamlessly. Rows with fewer titles than fit on screen
  simply clamp.
- **Reload-based 720p** via `?res=720` on the web; the coordinate system never changes, only
  the canvas. The Apple TV 4K simulator is 1080p; the host derives the logical ratio from the
  screen, so a 720p device scales the same way.
- **Published packages only**: the SolidTV Apple TV guide describes an API newer than what is
  on npm (NOTES.md). The build uses what `@solidtv/nativescript` 0.1.1 documents and keeps the
  runtime differences behind `AppHost`, so upgrading to the guide's `bindCanvas` path later is
  a change to the boot file, not to `src/`.
- **5 genres** = "All" + the first four from `/genre/movie/list`; details renders from data it
  already has (poster path, title, year, overview) instead of a second API call.

## Verification mechanics

- Web: real key events (`KeyboardEvent` with a defined `keyCode`) dispatched on `document`,
  the dev-only `__velope` hook for state and renderer node counts, `?fps=1` for the throttle
  test.
- Apple TV: `scripts/run-sim.sh` (install, launch, unified log, screenshot) and
  `scripts/remote-sim.sh` (real Siri Remote presses through an XCUITest driver, including a
  Menu press that must leave the app). Dev builds log `FOCUS …` on every model change.
