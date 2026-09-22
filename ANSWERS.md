# ANSWERS

**Q1 — How does your focus system pick the next item when the user presses a direction, and
what happens at the very first and last item of a row?**

There is exactly one source of truth, a Solid store in `pages/Home.tsx`: `{ zone, navIndex,
rowIndex, cols[] }` — which plane has focus, and one remembered column per row. A direction
key only mutates that model: up/down move between nav and rows (clamped at the last row),
left/right either move the nav focus (clamped) or step the current row's column. Everything on
screen — ring, row scroll, nav pill — is a signal derived from the model, so a key press
re-renders only the tiles whose `focused` prop actually changed, never the tree; the same code
runs on the web and on Apple TV, where the Siri Remote arrives through a key bridge as the same
`ArrowLeft`/`Enter`/`Backspace` events. At the edges: left clamps at the first item; past the
right end the column becomes a virtual index past the array, with every rendered slot resolving
its movie via `items[slot % count]` — a seamless cycle of the row's 20 titles. No index
can run past the array — the modulo is the lookup, not a special case; rows shorter than the
viewport simply clamp. Verified with real presses on the simulator and on an Apple TV 4K: a 3-title row stops at
column 2, a 20-title row keeps going past column 20 and beyond.

**Q2 — A user scrolls fast through 300+ items on a 3-year-old streaming stick with limited
RAM. What happens in your app, and what did you do to keep it stable?**

Three things bound the work. First, input is coalesced: `Config.throttleInput = 100` drops
same-key repeats inside a 100 ms window, so a held key advances focus at a rate the render loop
can drain — a 50-press flood at 5 ms became 3 accepted steps — and the model is always
consistent because each step is one integer mutation. Second, the render tree is windowed on
both axes: at most ~11 tiles per row and 5 rows exist as components, each window hands
`<For>` stable per-slot objects so sliding creates one tile and destroys one; everything
scrolled out of the window is destroyed, releasing its nodes and texture references (measured:
373 renderer nodes at the top of the catalogue on the web and 185 at the bottom; 270–543 on the
Apple TV simulator across an 11-row walk, flat at 476 while holding Right through 60 titles).
Third, texture memory has a hard ceiling (`textureMemory.criticalThreshold` 160 MB with LRU
eviction of off-screen textures), tiles fetch `w342` posters, not full-res, and translated
containers carry no bounds of their own so the renderer culls tiles individually rather than
freezing whole subtrees. So on a weak stick fast scrolling shows placeholder cards for a frame
or two where decode lags, and memory stays flat at roughly: ~40 tile components × one w342
texture each, plus UI chrome.

**Q3 — What did you deliberately not let the AI do for you, and why?**

The focus model, the recycling windows, the failure-path semantics and the one-codebase
constraint were designed first and held fixed; framework-idiomatic suggestions were treated as
untrusted until exercised in the running app on both targets. That distrust was earned again
here, and this time by the framework's own documentation as much as by generated code: the
SolidTV Apple TV guide describes shims and options that are not in the published packages, the
runtime's fetch polyfill cannot parse JSON, a size-less translated container silently stops
rendering its children once scrolled, and the renderer's text batching drew labels through
opaque overlays. None of that is visible in a diff; every one of them was found by driving the
app with key floods and real Siri Remote presses, reading node counts and render states, and
looking at screenshots (NOTES.md records each). Generated code is at its least reliable
precisely where TV apps live or die — focus edges, recycling, error paths, and now the seam
between a browser app and a native host — which is why those were verified at runtime, gate by
gate, rather than read.
