// The seam between the shared app and the two runtimes it boots on.
//
// In a browser the renderer draws into a canvas it appends to #app, keys come from
// `document`, and assets are relative URLs served by Vite. On Apple TV (NativeScript, no
// browser) the host boot file (nativescript/app/app.ts) creates the native Canvas view, turns
// Siri Remote presses into key events through a KeyBridge, and reads assets from the app
// bundle with file:// URLs. Everything runtime-specific is expressed once, here, as an
// `AppHost`; src/ never imports anything from NativeScript.
import type { RendererMain, RendererMainSettings, Stage } from '@solidtv/renderer'
import type { KeyEventTarget } from '@solidtv/solid'
import { loadFonts } from '@solidtv/solid'

export interface SdfFont {
  fontFamily: string
  atlasUrl: string
  atlasDataUrl: string
  metrics?: { ascender: number; descender: number; lineGap: number; unitsPerEm: number }
}

export interface AppHost {
  /** 'web' or 'tvos'; the app deviates only where tvOS mandates it (see PLAN.md). */
  platform: 'web' | 'tvos'
  /** Renderer settings the host requires (canvas, pixel ratios, platform). Merged under the app's own. */
  rendererOptions: Partial<RendererMainSettings>
  /** Where the renderer would append its canvas; the tvOS host passes a stub. */
  target?: HTMLElement
  /** Where the focus manager listens for keydown/keyup; undefined means `document`. */
  keyTarget?: KeyEventTarget
  /** Resolves an asset path relative to public/ (or the bundle) to a URL the renderer can fetch. */
  assetUrl(path: string): string
  /** Registers the MSDF fonts. Resolves once text nodes may be created. */
  loadFonts(stage: Stage, fonts: SdfFont[]): Promise<void>
  /** Called once the renderer exists (the tvOS host binds lifecycle + remote here). */
  onRenderer?(renderer: RendererMain): void
}

declare global {
  // eslint-disable-next-line no-var
  var __VELOPE_HOST__: AppHost | undefined
}

export function webHost(): AppHost {
  const params = new URLSearchParams(window.location.search)
  // ?res=720 renders the identical 1920x1080 coordinate system on a 1280x720 canvas, as the
  // L3 build does; otherwise the scene is fitted to the window (1:1 on a 1080p panel).
  const ratio =
    params.get('res') === '720'
      ? 720 / 1080
      : Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
  return {
    platform: 'web',
    rendererOptions: {
      deviceLogicalPixelRatio: ratio,
      devicePhysicalPixelRatio: 1,
    },
    assetUrl: (path) => import.meta.env.BASE_URL + path,
    loadFonts: (_stage, fonts) => loadFonts(fonts.map((font) => ({ type: 'msdf', ...font }))),
  }
}

export function resolveHost(): AppHost {
  return globalThis.__VELOPE_HOST__ ?? webHost()
}
