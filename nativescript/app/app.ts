// The tvOS host around the shared app in ../../src. Boot order matters at the top: the
// polyfill first, because the renderer and the router read browser globals at import; then
// the host package's shim (an inert window.history), then this project's ./shims, which
// replaces it with a location + history + hashchange the HashRouter can actually drive.
import '@nativescript/canvas-polyfill'
import '@solidtv/nativescript/shims'
import './shims'
import { Application, Color, File, GridLayout, Screen, knownFolders, path } from '@nativescript/core'
import { isTvOS } from '@nativescript/core/platform'
import { Canvas } from '@nativescript/canvas'
import { KeyBridge, bindLifecycle, bindRemote, loadSdfFont, rendererSettings, stubTarget } from '@solidtv/nativescript'
import type { AppHost, AppPlayer } from '../../src/host.types'
import { createFairPlaySession, type FairPlaySession } from './fairplay'
import { STREAMS } from '../../src/state/playback'

// On a device the CLI cannot stream the console: every line also goes to
// Library/Caches/velope-log.txt in the app's container, for `xcrun devicectl device copy from`
// (see README). The published host has no mirrorConsole yet, so this is the same idea inline.
const logFile = File.fromPath(path.join(knownFolders.temp().path, 'velope-log.txt'))
logFile.writeTextSync('')
for (const level of ['log', 'warn', 'error'] as const) {
  const original = console[level].bind(console)
  console[level] = (...args: unknown[]) => {
    original(...args)
    try {
      logFile.appendTextSync(`${new Date().toISOString().slice(11, 23)} ${level.toUpperCase()} ${args.map(String).join(' ')}\n`)
    } catch {
      // logging must never break the app
    }
  }
}
console.log('BOOT start')

function bundleImageDataUrl(fileUrl: string): string {
  const filePath = fileUrl.replace(/^file:\/\//, '')
  const data = File.fromPath(filePath).readSync() as NSData
  return 'data:image/png;base64,' + data.base64EncodedStringWithOptions(0 as NSDataBase64EncodingOptions)
}

function boot(canvas: Canvas): void {
  // The Siri Remote goes into the bridge; the app's focus manager listens on the bridge.
  const bridge = new KeyBridge()
  const appPath = knownFolders.currentApp().path
  const host: AppHost = {
    platform: 'tvos',
    // 1920x1080 logical onto the screen's points and pixels, WebGL2, SDF text, no image
    // workers, the host's Platform for canvas sizing; the app merges its own settings over it.
    rendererOptions: {
      ...rendererSettings(canvas, Screen.mainScreen),
      // On a real Apple TV the polyfill's fetch of an image never resolves (the simulator hides
      // this), so the renderer's fetch + createImageBitmap path shows placeholders forever. 'none'
      // makes it decode through an Image element, which the polyfill backs natively on both.
      // ('none' is not in the renderer's type; anything but basic/options/full takes that path.)
      createImageBitmapSupport: 'none' as unknown as 'basic',
    },
    target: stubTarget,
    keyTarget: bridge,
    // Assets are files in the app bundle (webpack copies public/fonts to fonts/).
    assetUrl: (path) => 'file://' + appPath + '/' + path,
    // The polyfill mis-decodes json XHR responses from file URLs; loadSdfFont routes the atlas
    // data through a blob. Text nodes must not exist before this resolves.
    // With the renderer decoding through Image elements (see rendererOptions), a file:// atlas
    // does not load (Image only takes http(s) and data: URLs on the polyfill), so the atlas PNG
    // is read from the bundle and handed over as a base64 data URL.
    loadFonts: (stage, fonts) =>
      Promise.all(fonts.map((font) => loadSdfFont(stage, { ...font, atlasUrl: bundleImageDataUrl(font.atlasUrl) }))).then(() => undefined),
    onRenderer: (renderer) => {
      // Pause the render loop in the background (Apple kills apps that draw there) and
      // release held keys on suspend.
      bindLifecycle(renderer, bridge, Application)
      // The lifecycle as the log sees it: the suspend, whether the render loop had stopped half
      // a second later, and the resume.
      Application.on('suspend', () => {
        console.log('LIFECYCLE suspend')
        setTimeout(() => console.log(`LIFECYCLE paused=${String(renderer.isPaused)}`), 500)
      })
      Application.on('resume', () => console.log(`LIFECYCLE resume paused=${String(renderer.isPaused)}`))
      if (isTvOS) {
        // Menu (Backspace) the app leaves unhandled passes through to the system and exits.
        bindRemote(bridge, Application.ios.window, {
          onPress: (press) => {
            if (press.phase !== 'up') console.log(`REMOTE ${press.key} ${press.phase} handled=${press.handled} passed=${press.passed}`)
          },
        })
      }
    },
  }
  host.player = tvPlayer()
  globalThis.__VELOPE_HOST__ = host
  // Device diagnostics: `xcrun devicectl device process launch --environment-variables
  // '{"VELOPE_PLAY":"1"}'` starts playback straight after boot, so the DRM path can be checked
  // on hardware without driving the UI (the Siri Remote cannot be scripted on a device).
  if (NSProcessInfo.processInfo.environment.objectForKey('VELOPE_PLAY')) {
    setTimeout(() => {
      console.log('PLAYER autoplay (VELOPE_PLAY)')
      host.player?.play(STREAMS, () => console.log('PLAYER autoplay closed'))
    }, 3000)
  }
  // The app's own entry, unchanged: it reads the host from the global set above.
  import('../../src/index')
    .then(() => console.log('ENTRY loaded'))
    .catch((error: unknown) => {
      console.error('The app entry failed to load', error)
    })
}

// Full-screen AVPlayerViewController over the app. It owns the Siri Remote while presented
// (play/pause, scrubbing, Menu to leave); the app learns it is gone by polling the presentation,
// and tears it down itself when the item plays to its end.
//
// Streams are tried in order: the first candidate this runtime can play is loaded, and if its
// item fails (a FairPlay licence this box cannot get, a dead URL) the next one takes over in
// the same presented player.
function tvPlayer(): AppPlayer {
  let controller: AVPlayerViewController | undefined
  let poll: ReturnType<typeof setInterval> | undefined
  let statusPoll: ReturnType<typeof setInterval> | undefined
  let endObserver: unknown
  let fairplay: FairPlaySession | undefined
  const clearStatusPoll = () => {
    if (statusPoll !== undefined) clearInterval(statusPoll)
    statusPoll = undefined
  }
  const cleanup = () => {
    if (poll !== undefined) clearInterval(poll)
    poll = undefined
    clearStatusPoll()
    if (endObserver) NSNotificationCenter.defaultCenter.removeObserver(endObserver)
    endObserver = undefined
    fairplay?.dispose()
    fairplay = undefined
    controller = undefined
  }
  return {
    // AVPlayer plays HLS (clear or FairPlay) and progressive MP4: no DASH, no Widevine.
    canPlay(stream) {
      if (stream.drm) return false
      return !/\.mpd(\?|$)/i.test(stream.url)
    },
    play(streams, onClosed) {
      this.stop()
      const candidates = streams.filter((candidate) => this.canPlay(candidate))
      const root = Application.ios.window.rootViewController
      if (candidates.length === 0 || !root) {
        console.warn('PLAYER no playable stream for AVPlayer')
        onClosed()
        return
      }
      const vc = AVPlayerViewController.new()
      controller = vc
      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        const current = controller
        cleanup()
        if (current && current.presentingViewController) current.dismissViewControllerAnimatedCompletion(true, () => undefined)
        onClosed()
      }

      // Loads one candidate into the presented controller; a failed item moves to the next.
      const attempt = (index: number): void => {
        try {
          load(index)
        } catch (error: unknown) {
          console.warn(`PLAYER could not start candidate ${index}: ${String(error)}`)
          if (index + 1 < candidates.length) attempt(index + 1)
          else close()
        }
      }

      const load = (index: number): void => {
        const stream = candidates[index]
        if (!stream || controller !== vc) {
          if (!stream) console.warn('PLAYER every stream failed')
          close()
          return
        }
        clearStatusPoll()
        if (endObserver) NSNotificationCenter.defaultCenter.removeObserver(endObserver)
        endObserver = undefined
        fairplay?.dispose()
        fairplay = undefined

        console.log(`PLAYER trying ${stream.label}`)
        const asset = AVURLAsset.URLAssetWithURLOptions(NSURL.URLWithString(stream.url), null)
        if (stream.fairplay) {
          fairplay = createFairPlaySession(stream.fairplay)
          fairplay.attach(asset)
        }
        const item = AVPlayerItem.playerItemWithAsset(asset)
        const player = AVPlayer.playerWithPlayerItem(item)
        vc.player = player
        endObserver = NSNotificationCenter.defaultCenter.addObserverForNameObjectQueueUsingBlock(
          AVPlayerItemDidPlayToEndTimeNotification,
          item,
          null,
          () => {
            console.log('PLAYER ended')
            close()
          }
        )
        player.play()
        // AVPlayerItem reports a bad stream (or an unobtainable key) asynchronously; watch for
        // it until the item is playing, then stop watching.
        statusPoll = setInterval(() => {
          if (controller !== vc) return
          if (item.status === AVPlayerItemStatus.Failed) {
            const reason = item.error ? item.error.localizedDescription : 'unknown error'
            console.warn(`PLAYER ${stream.label} failed: ${reason}`)
            clearStatusPoll()
            attempt(index + 1)
          } else if (item.status === AVPlayerItemStatus.ReadyToPlay) {
            console.log(`PLAYER playing ${stream.label}`)
            clearStatusPoll()
          }
        }, 300)
      }

      root.presentViewControllerAnimatedCompletion(vc, true, () => {
        attempt(0)
        // Menu inside the player dismisses it without telling us: notice the dismissal.
        poll = setInterval(() => {
          if (controller === vc && vc.presentingViewController == null) {
            console.log('PLAYER dismissed')
            close()
          }
        }, 300)
      })
    },
    togglePause() {
      const player = controller?.player
      if (!player) return
      if (player.rate > 0) player.pause()
      else player.play()
    },
    stop() {
      const current = controller
      cleanup()
      if (current) {
        current.player?.pause()
        if (current.presentingViewController) current.dismissViewControllerAnimatedCompletion(true, () => undefined)
      }
    },
  }
}

function createRootView(): GridLayout {
  const root = new GridLayout()
  root.backgroundColor = new Color('#0b0e17')
  const canvas = new Canvas()
  // Percent sizes size both the layout and the backing surface, and the overflow keeps the
  // canvas out from under tvOS's title-safe insets.
  canvas.width = '100%'
  canvas.height = '100%'
  canvas.iosOverflowSafeArea = true
  canvas.on('ready', () => {
    // The plugin's ready callback swallows exceptions: a throw here would be a silent blank screen.
    try {
      boot(canvas)
    } catch (error: unknown) {
      console.error('Boot failed', error)
    }
  })
  root.addChild(canvas)
  return root
}

Application.run({ create: createRootView })
