// The tvOS host around the shared app in ../../src. Boot order matters at the top: the
// polyfill first, because the renderer and the router read browser globals at import; then
// the shim that gives `window.history` the shape the router reads.
import '@nativescript/canvas-polyfill'
import '@solidtv/nativescript/shims'
import { Application, Color, GridLayout, Screen, knownFolders } from '@nativescript/core'
import { isTvOS } from '@nativescript/core/platform'
import { Canvas } from '@nativescript/canvas'
import { KeyBridge, bindLifecycle, bindRemote, loadSdfFont, rendererSettings, stubTarget } from '@solidtv/nativescript'
import type { AppHost } from '../../src/host'

console.log('BOOT start')

function boot(canvas: Canvas): void {
  // The Siri Remote goes into the bridge; the app's focus manager listens on the bridge.
  const bridge = new KeyBridge()
  const appPath = knownFolders.currentApp().path
  const host: AppHost = {
    platform: 'tvos',
    // 1920x1080 logical onto the screen's points and pixels, WebGL2, SDF text, no image
    // workers, the host's Platform for canvas sizing; the app merges its own settings over it.
    rendererOptions: rendererSettings(canvas, Screen.mainScreen),
    target: stubTarget,
    keyTarget: bridge,
    // Assets are files in the app bundle (webpack copies public/fonts to fonts/).
    assetUrl: (path) => 'file://' + appPath + '/' + path,
    // The polyfill mis-decodes json XHR responses from file URLs; loadSdfFont routes the atlas
    // data through a blob. Text nodes must not exist before this resolves.
    loadFonts: (stage, fonts) => Promise.all(fonts.map((font) => loadSdfFont(stage, font))).then(() => undefined),
    onRenderer: (renderer) => {
      // Pause the render loop in the background (Apple kills apps that draw there) and
      // release held keys on suspend.
      bindLifecycle(renderer, bridge, Application)
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
  globalThis.__VELOPE_HOST__ = host
  // The app's own entry, unchanged: it reads the host from the global set above.
  import('../../src/index')
    .then(() => console.log('ENTRY loaded'))
    .catch((error: unknown) => {
      console.error('The app entry failed to load', error)
    })
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
