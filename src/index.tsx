// Gate 1 pipeline proof: the smallest app that exercises fonts, focus and the Menu contract on
// both targets. Replaced by the real app from Gate 2 on.
import { createSignal } from 'solid-js'
import { Config, createRenderer, registerDefaultShaders } from '@solidtv/solid'
import { useFocusManager } from '@solidtv/solid/primitives'
import { SdfTextRenderer, WebGlCoreRenderer } from '@solidtv/renderer/webgl'
import type { RendererMain } from '@solidtv/renderer'
import { resolveHost } from './host'
import { appFonts } from './fonts'

const host = resolveHost()

Config.fontSettings.fontFamily = 'lato'
Config.fontSettings.fontSize = 32
Config.fontSettings.color = 0xf2f5ffff
// Coalesce held-key repeats so navigation never floods the render loop (same 100 ms as L3)
Config.throttleInput = 100
Config.rendererOptions = {
  appWidth: 1920,
  appHeight: 1080,
  clearColor: 0x0b0e17ff,
  numImageWorkers: 0,
  fontEngines: [SdfTextRenderer],
  renderEngine: WebGlCoreRenderer,
  ...host.rendererOptions,
}

// createRenderer's return type covers the DOM renderer too; this app is WebGL-only.
const created = createRenderer(Config.rendererOptions, host.target)
const renderer = created.renderer as RendererMain
const render = created.render
registerDefaultShaders(renderer.stage.shManager)
host.onRenderer?.(renderer)

const HelloWorld = () => {
  const [focused, setFocused] = createSignal(false)
  const [presses, setPresses] = createSignal(0)
  return (
    <view
      width={1920}
      height={1080}
      color={0x0b0e17ff}
      // Root screen: a Back/Menu press is left unhandled (no preventDefault, false) so tvOS
      // returns to the Home screen; in a browser this is a no-op.
      onBack={() => false}
    >
      <text x={960} y={380} mountX={0.5} fontFamily="raleway" fontSize={84} color={0x8b6cffff}>
        VELOPE TV
      </text>
      <text x={960} y={490} mountX={0.5} fontSize={32} color={0x8a93adff}>
        {`SolidTV pipeline proof (${host.platform})`}
      </text>
      <view
        autofocus
        x={830}
        y={580}
        width={260}
        height={76}
        borderRadius={38}
        color={focused() ? 0x8b6cffff : 0x232b45ff}
        onFocusChanged={setFocused}
        onEnter={(e: { preventDefault(): void }) => {
          setPresses((n) => n + 1)
          e.preventDefault()
          return true
        }}
      >
        <text x={130} y={38} mountX={0.5} mountY={0.5} fontSize={30} color={focused() ? 0x0b0e17ff : 0xf2f5ffff}>
          {`Enter pressed ${presses()}x`}
        </text>
      </view>
    </view>
  )
}

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
    return <HelloWorld />
  })
  console.log(`APP rendered on ${host.platform}`)
})
