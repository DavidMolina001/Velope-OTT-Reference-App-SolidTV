// The seam between the shared app and the two runtimes it boots on.
//
// In a browser the renderer draws into a canvas it appends to #app, keys come from
// `document`, and assets are relative URLs served by Vite. On Apple TV (NativeScript, no
// browser) the host boot file (nativescript/app/app.ts) creates the native Canvas view, turns
// Siri Remote presses into key events through a KeyBridge, and reads assets from the app
// bundle with file:// URLs. Everything runtime-specific is expressed once, here, as an
// `AppHost`; src/ never imports anything from NativeScript.
import { loadFonts } from '@solidtv/solid'
import type { AppHost, AppPlayer } from './host.types'

export type { AppHost, AppPlayer, SdfFont } from './host.types'

// A <video> element over the canvas. HLS plays natively where the browser supports it (Safari,
// the TV browsers) and through hls.js elsewhere (Chrome, Firefox), loaded on demand.
function webPlayer(): AppPlayer {
  let video: HTMLVideoElement | undefined
  let hls: { destroy(): void } | undefined
  const stop = () => {
    hls?.destroy()
    hls = undefined
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.remove()
      video = undefined
    }
  }
  return {
    play(url, onClosed) {
      stop()
      const element = document.createElement('video')
      element.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;background:#000;object-fit:contain;z-index:10'
      element.autoplay = true
      element.playsInline = true
      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        stop()
        onClosed()
      }
      element.addEventListener('ended', close)
      element.addEventListener('error', () => {
        console.warn('PLAYER error', element.error?.code, element.error?.message)
        close()
      })
      video = element
      document.body.appendChild(element)
      const isHls = /\.m3u8(\?|$)/.test(url)
      if (isHls && !element.canPlayType('application/vnd.apple.mpegurl')) {
        void import('hls.js').then(({ default: Hls }) => {
          if (video !== element) return
          if (!Hls.isSupported()) {
            console.warn('PLAYER HLS not supported in this browser')
            close()
            return
          }
          const instance = new Hls()
          hls = instance
          instance.on(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean; details?: string }) => {
            if (data.fatal) {
              console.warn('PLAYER hls.js fatal', data.details)
              close()
            }
          })
          instance.loadSource(url)
          instance.attachMedia(element)
        })
      } else {
        element.src = url
      }
      void element.play().catch(() => undefined)
    },
    togglePause() {
      if (!video) return
      if (video.paused) void video.play().catch(() => undefined)
      else video.pause()
    },
    stop,
  }
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
    showFps: params.has('fps'),
    rendererOptions: {
      deviceLogicalPixelRatio: ratio,
      devicePhysicalPixelRatio: 1,
    },
    assetUrl: (path) => import.meta.env.BASE_URL + path,
    loadFonts: (_stage, fonts) => loadFonts(fonts.map((font) => ({ type: 'msdf', ...font }))),
    player: webPlayer(),
  }
}

export function resolveHost(): AppHost {
  return globalThis.__VELOPE_HOST__ ?? webHost()
}
