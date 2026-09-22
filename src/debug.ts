// Verification hooks, dev builds only: `globalThis.__velope` exposes the app state and a
// renderer node count so the running app can be inspected from a console (web DevTools) or a
// script (the tvOS simulator's log). Production bundles carry none of this.
import type { RendererMain } from '@solidtv/renderer'

interface VelopeDebug {
  renderer?: RendererMain
  pages: Record<string, unknown>
  countNodes(): number
}

declare global {
  // eslint-disable-next-line no-var
  var __velope: VelopeDebug | undefined
}

function countNodes(node: { children?: readonly unknown[] } | undefined): number {
  if (!node) return 0
  let count = 1
  for (const child of node.children ?? []) count += countNodes(child as { children?: readonly unknown[] })
  return count
}

export function installDebug(renderer: RendererMain): void {
  if (!import.meta.env.DEV) return
  globalThis.__velope = {
    renderer,
    pages: {},
    countNodes: () => countNodes(renderer.root as unknown as { children?: readonly unknown[] }),
  }
}

export function exposeDebug(name: string, value: unknown): void {
  if (!import.meta.env.DEV || !globalThis.__velope) return
  globalThis.__velope.pages[name] = value
}

// Dev-only probe of the image pipeline on a runtime: fetch one known poster, decode it the two
// ways the renderer can (createImageBitmap from a blob, an Image element), log every step with
// a timeout so a silent hang shows up as one. Used to diagnose posters on a real Apple TV.
export async function probeImagePipeline(): Promise<void> {
  if (!import.meta.env.DEV) return
  const url = 'https://image.tmdb.org/t/p/w92/3bhkrj58Vtu7enYsRolD1fZdja1.jpg'
  const t0 = performance.now()
  const ms = () => Math.round(performance.now() - t0)
  const within = <T,>(label: string, p: Promise<T>): Promise<T> =>
    Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after 8 s`)), 8000))])
  try {
    const response = await within('fetch', fetch(url))
    console.log(`PROBE fetch status=${response.status} t=${ms()}`)
    const blob = await within('blob', response.blob())
    console.log(`PROBE blob size=${blob.size} type=${blob.type} t=${ms()}`)
    const bitmap = await within('createImageBitmap', createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' } as ImageBitmapOptions))
    console.log(`PROBE createImageBitmap ${bitmap.width}x${bitmap.height} t=${ms()}`)
  } catch (error) {
    console.warn(`PROBE bitmap path failed: ${String(error)} t=${ms()}`)
  }
  try {
    await within(
      'Image',
      new Promise<void>((resolve, reject) => {
        const image = new Image()
        image.onload = () => {
          console.log(`PROBE Image onload ${image.width}x${image.height} t=${ms()}`)
          resolve()
        }
        image.onerror = (event) => reject(new Error(`Image onerror ${String(event)}`))
        image.src = url
      })
    )
  } catch (error) {
    console.warn(`PROBE Image path failed: ${String(error)} t=${ms()}`)
  }
}
