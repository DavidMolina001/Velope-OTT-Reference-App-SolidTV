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
