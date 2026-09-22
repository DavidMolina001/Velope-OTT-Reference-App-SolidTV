# Velope TV Reference (SolidTV / Apple TV)

Reference implementation for the Velope OTT Developer Test (2026 edition), rebuilt on
**SolidTV** (SolidJS driving the Lightning 3 WebGL renderer) so that ONE `src/` runs on the web
(Vercel, LG/Samsung-ready) and on **Apple TV**, where tvOS has no browser and the app runs in
NativeScript instead. Same UX as the Lightning 3 / Blits reference build: genre nav, 12
carousel rows, infinite fetch-ahead scrolling, details with back-with-state, bounded memory,
coalesced input, visible loading/error states.

> Work in progress: Gate 1 (pipeline proof on both targets) is done; the app itself follows.

## Web

Requires Node 20+ and pnpm 10.

```sh
pnpm install
cp .env.example .env        # add your TMDB v3 key
pnpm dev                    # http://localhost:5173
pnpm build                  # dist/
pnpm typecheck
```

## Apple TV (simulator)

Requires a Mac with Xcode 27 (tvOS 27 platform), pnpm 10, and the `xcodeproj` gem
(`gem install --user-install xcodeproj`). The tvOS host lives in `nativescript/` and is its
own pnpm root; the NativeScript CLI comes from the `tvos` dist-tags as a dev dependency.

```sh
cd nativescript && LC_ALL=en_US.UTF-8 pnpm install && cd ..
xcrun simctl list devices available | grep "Apple TV"
xcrun simctl boot <udid>
sh nativescript/scripts/tvos.sh build      # ns build tvos, with DEVELOPER_DIR + UTF-8 locale set
zsh nativescript/scripts/run-sim.sh <udid> out/   # install, launch, stream the log, screenshot
```

`sh nativescript/scripts/tvos.sh run` is `ns run tvos --emulator --no-hmr` (build + install +
launch with the console attached). If this checkout lives in an iCloud-synced folder
(Desktop/Documents), run `sh nativescript/scripts/icloud-shadow.sh` once first: iCloud tags
bundle folders mid-build and codesign fails otherwise (details in NOTES.md).

The full README (controls, Siri Remote mapping, throttle test, device/App Store steps) is
written at the docs gate.
