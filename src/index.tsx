import { Config, createRenderer, registerDefaultShaders } from '@solidtv/solid'
import { FPSCounter, setupFPS, useFocusManager } from '@solidtv/solid/primitives'
import { SdfTextRenderer, WebGlCoreRenderer } from '@solidtv/renderer/webgl'
import type { RendererMain } from '@solidtv/renderer'
import { resolveHost } from './host'
import { appFonts } from './fonts'
import { describeRuntime } from './services/tmdb'
import { colors, layout } from './theme'
import App from './App'
import { installDebug, probeImagePipeline } from './debug'

const host = resolveHost()
console.log(`RUNTIME ${host.platform} ${describeRuntime()}`)

Config.fontSettings.fontFamily = 'lato'
Config.fontSettings.fontSize = 32
Config.fontSettings.color = colors.textPrimary
// Coalesce held-key repeats so navigation never floods the render loop (same 100 ms as L3)
Config.throttleInput = 100
Config.rendererOptions = {
  appWidth: layout.width,
  appHeight: layout.height,
  clearColor: colors.background,
  numImageWorkers: 0,
  // Frame telemetry only when the counter is shown (?fps=1 on the web)
  fpsUpdateInterval: host.showFps ? 300 : 0,
  fontEngines: [SdfTextRenderer],
  renderEngine: WebGlCoreRenderer,
  // Hard ceiling for texture memory (L3: gpuMemory.max 160 MB, target 0.8); the renderer
  // evicts least-recently-used off-screen textures on top of that.
  textureMemory: { criticalThreshold: 160e6, targetThresholdLevel: 0.8 },
  ...host.rendererOptions,
}

// createRenderer's return type covers the DOM renderer too; this app is WebGL-only.
const created = createRenderer(Config.rendererOptions, host.target)
const renderer = created.renderer as RendererMain
const render = created.render
registerDefaultShaders(renderer.stage.shManager)
installDebug(renderer)
if (host.platform === 'tvos') void probeImagePipeline()
host.onRenderer?.(renderer)
if (host.showFps) setupFPS({ renderer })

host.loadFonts(renderer.stage, appFonts(host)).then(() => {
  render(() => {
    useFocusManager(
      {
        Left: ['ArrowLeft', 37],
        Right: ['ArrowRight', 39],
        Up: ['ArrowUp', 38],
        Down: ['ArrowDown', 40],
        Enter: ['Enter', 13],
        Back: ['Backspace', 'Escape', 8, 27],
      },
      host.keyTarget
    )
    return (
      <>
        <App />
        {host.showFps && <FPSCounter mountX={1} x={1910} y={10} />}
      </>
    )
  })
  console.log(`APP rendered on ${host.platform}`)
})
