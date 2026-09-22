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
import { isDash, isHls, type Stream } from './state/playback'

export type { AppHost, AppPlayer, SdfFont } from './host.types'

// A <video> element over the canvas. DASH (with Widevine/PlayReady DRM through EME) plays
// through Shaka Player; HLS plays natively where the browser supports it (Safari, the TV
// browsers) and through hls.js elsewhere (Chrome, Firefox). Both libraries load on demand.
function webPlayer(): AppPlayer {
  let video: HTMLVideoElement | undefined
  let hls: { destroy(): void } | undefined
  let shaka: { destroy(): Promise<void> } | undefined
  // Widevine is what the demo stream's DRM needs; Safari (FairPlay only) has no such CDM.
  const hasWidevine = typeof navigator !== 'undefined' && 'requestMediaKeySystemAccess' in navigator && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  const stop = () => {
    hls?.destroy()
    hls = undefined
    void shaka?.destroy()
    shaka = undefined
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.remove()
      video = undefined
    }
  }
  return {
    canPlay(stream) {
      // FairPlay through EME would need its own key-session code and a Safari-only CDM; the
      // web build plays Widevine or clear content.
      if (stream.fairplay) return false
      if (!stream.drm) return true
      return hasWidevine && 'com.widevine.alpha' in stream.drm
    },
    play(streams, onClosed) {
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
      video = element
      document.body.appendChild(element)
      const candidates = streams.filter((stream) => this.canPlay(stream))
      // Try the candidates in order; a failure to start moves on to the next, a failure of the
      // last one closes the player.
      const attempt = async (index: number): Promise<void> => {
        const stream = candidates[index]
        if (!stream || video !== element) {
          if (!stream) console.warn('PLAYER no playable stream')
          close()
          return
        }
        const next = () => void attempt(index + 1)
        let started = false
        const onError = () => {
          console.warn('PLAYER element error', element.error?.code, element.error?.message)
          if (started) close()
          else next()
        }
        element.addEventListener('error', onError, { once: true })
        try {
          if (stream.drm) {
            // Ask EME up front, so a browser without the CDM (or the pane of a desktop app) does
            // not spend a manifest load on it.
            await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
              { initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] },
            ])
          }
          if (isDash(stream.url)) {
            const { default: shakaLib } = await import('shaka-player')
            if (video !== element) return
            shakaLib.polyfill.installAll()
            const player = new shakaLib.Player()
            shaka = player
            player.addEventListener('error', (event: Event) => {
              const detail = (event as unknown as { detail?: { code?: number; message?: string } }).detail
              console.warn('PLAYER shaka error', detail?.code, detail?.message)
              close()
            })
            await player.attach(element)
            if (stream.drm) player.configure({ drm: { servers: stream.drm } })
            await player.load(stream.url)
          } else if (isHls(stream.url) && !element.canPlayType('application/vnd.apple.mpegurl')) {
            const { default: Hls } = await import('hls.js')
            if (video !== element) return
            if (!Hls.isSupported()) throw new Error('hls.js not supported here')
            const instance = new Hls()
            hls = instance
            await new Promise<void>((resolve, reject) => {
              instance.on(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean; details?: string }) => {
                if (data.fatal) {
                  const error = new Error(`hls.js fatal ${data.details}`)
                  if (started) {
                    console.warn('PLAYER', error.message)
                    close()
                  } else reject(error)
                }
              })
              instance.on(Hls.Events.MANIFEST_PARSED, () => resolve())
              instance.loadSource(stream.url)
              instance.attachMedia(element)
            })
          } else {
            element.src = stream.url
          }
          started = true
          console.log(`PLAYER playing ${stream.label}`)
          void element.play().catch(() => undefined)
        } catch (error) {
          const detail = error as { code?: number; message?: string }
          console.warn(`PLAYER ${stream.label} failed to start: ${detail?.code ?? ''} ${detail?.message ?? String(error)}`)
          element.removeEventListener('error', onError)
          void shaka?.destroy()
          shaka = undefined
          hls?.destroy()
          hls = undefined
          next()
        }
      }
      void attempt(0)
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
