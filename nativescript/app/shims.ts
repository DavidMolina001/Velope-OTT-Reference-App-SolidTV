// Browser globals the SolidTV HashRouter reads that neither @nativescript/canvas-polyfill
// 3.0.0-alpha.10 nor @solidtv/nativescript 0.1.1's shims provide: `window.location.hash`, a
// `history` whose pushState/replaceState/go/back move a real in-memory stack, and the
// `hashchange` event on `window` the router subscribes to. With these the app's routing code
// is identical on both targets; `history.back()` on the first entry is a no-op, as in a browser.
// Import after '@solidtv/nativescript/shims' (which installs an inert history when none exists).
interface Entry {
  hash: string
  state: unknown
}
type HashListener = (event: { type: 'hashchange'; oldURL: string; newURL: string }) => void

const host = globalThis as unknown as Record<string, unknown>
const win = (host.window ?? (host.window = host)) as Record<string, unknown>

const entries: Entry[] = [{ hash: '', state: null }]
let index = 0
const listeners = new Set<HashListener>()

function normalize(hash: string): string {
  return hash === '' || hash === '#' ? '' : hash.startsWith('#') ? hash : '#' + hash
}
function href(hash: string): string {
  return 'file:///app/index.html' + hash
}
function hashOf(url: string | URL | null | undefined): string {
  if (url === null || url === undefined) return entries[index]!.hash
  const text = String(url)
  const at = text.indexOf('#')
  return at === -1 ? '' : normalize(text.slice(at))
}
function dispatch(oldHash: string, newHash: string): void {
  const event = { type: 'hashchange' as const, oldURL: href(oldHash), newURL: href(newHash) }
  for (const listener of [...listeners]) listener(event)
}
function go(delta: number): void {
  const next = index + delta
  if (delta === 0 || next < 0 || next >= entries.length) return
  const oldHash = entries[index]!.hash
  index = next
  dispatch(oldHash, entries[index]!.hash)
}

const hashLocation = {
  get hash() {
    return entries[index]!.hash
  },
  set hash(value: string) {
    const oldHash = entries[index]!.hash
    const newHash = normalize(value)
    if (newHash === oldHash) return
    entries.splice(index + 1)
    entries.push({ hash: newHash, state: null })
    index = entries.length - 1
    dispatch(oldHash, newHash)
  },
  get href() {
    return href(entries[index]!.hash)
  },
  protocol: 'file:',
  host: '',
  hostname: '',
  port: '',
  origin: 'file://',
  pathname: '/app/index.html',
  search: '',
  assign(url: string) {
    this.hash = hashOf(url)
  },
  replace(url: string) {
    entries[index] = { hash: hashOf(url), state: null }
  },
  reload() {},
  toString() {
    return this.href
  },
}

const hashHistory = {
  get length() {
    return entries.length
  },
  get state() {
    return entries[index]!.state
  },
  scrollRestoration: 'auto',
  pushState(state: unknown, _unused: string, url?: string | URL | null) {
    entries.splice(index + 1)
    entries.push({ hash: hashOf(url), state })
    index = entries.length - 1
  },
  replaceState(state: unknown, _unused: string, url?: string | URL | null) {
    entries[index] = { hash: hashOf(url), state }
  },
  go,
  back: () => go(-1),
  forward: () => go(1),
}

// Route 'hashchange' subscriptions through this module; everything else keeps whatever
// listener API the polyfill's window already has.
const originalAdd = typeof win.addEventListener === 'function' ? (win.addEventListener as Function).bind(win) : undefined
const originalRemove = typeof win.removeEventListener === 'function' ? (win.removeEventListener as Function).bind(win) : undefined
win.addEventListener = (type: string, listener: HashListener, options?: unknown) => {
  if (type === 'hashchange') listeners.add(listener)
  else originalAdd?.(type, listener, options)
}
win.removeEventListener = (type: string, listener: HashListener, options?: unknown) => {
  if (type === 'hashchange') listeners.delete(listener)
  else originalRemove?.(type, listener, options)
}

win.location = hashLocation
host.location = hashLocation
win.history = hashHistory
host.history = hashHistory
