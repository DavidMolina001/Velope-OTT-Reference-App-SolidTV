// The seam between the shared app and the two runtimes it boots on.
//
// In a browser the renderer draws into a canvas it appends to #app, keys come from
// `document`, and assets are relative URLs served by Vite. On Apple TV (NativeScript, no
// browser) the host boot file (nativescript/app/app.ts) creates the native Canvas view, turns
// Siri Remote presses into key events through a KeyBridge, and reads assets from the app
// bundle with file:// URLs. Everything runtime-specific is expressed once, here, as an
// `AppHost`; src/ never imports anything from NativeScript.
import { loadFonts } from '@solidtv/solid'
import type { AppHost } from './host.types'

export type { AppHost, SdfFont } from './host.types'

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
    showFps: params.has('fps'),
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
