// TMDB access. Ported from the L3 reference build: every request carries a timeout (8 s) plus
// the caller's abort signal, responses are cached in a promise map (in-flight requests dedupe;
// failures are evicted so retry refetches), and poster URLs are built from /configuration,
// choosing the smallest size that covers the on-screen width.
//
// Runtime notes (both targets run this file unchanged):
// - No `URL`/`URLSearchParams`: query strings are built by hand so the code does not depend on
//   which WHATWG globals the NativeScript runtime installs.
// - `AbortSignal.any`/`AbortSignal.timeout` are used when present and replaced by a small
//   AbortController + setTimeout composition when not (NativeScript V8 lacks both).
// - `DOMException` may not exist: abort errors are recognised by name.

const BASE_URL = import.meta.env.VITE_TMDB_BASE_URL ?? 'https://api.themoviedb.org'
const API_KEY = import.meta.env.VITE_TMDB_API_KEY ?? ''
const REQUEST_TIMEOUT_MS = 8000

export interface Genre {
  id: number
  name: string
}

export interface Movie {
  id: number
  title: string
  year: string
  overview: string
  posterPath: string | null
}

interface GenreListResponse {
  genres: Genre[]
}

interface DiscoverResult {
  id: number
  title: string
  release_date: string
  overview: string
  poster_path: string | null
}

interface DiscoverResponse {
  results: DiscoverResult[]
}

interface ImageConfigResponse {
  images: {
    secure_base_url: string
    poster_sizes: string[]
  }
}

const responseCache = new Map<string, Promise<unknown>>()

function toQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(params[key] ?? ''))
    .join('&')
}

// One signal that aborts on the timeout or when the caller aborts, whichever comes first.
function timeoutSignal(callerSignal: AbortSignal | undefined, ms: number): AbortSignal {
  const Signal = AbortSignal as typeof AbortSignal & {
    any?: (signals: AbortSignal[]) => AbortSignal
    timeout?: (ms: number) => AbortSignal
  }
  if (typeof Signal.any === 'function' && typeof Signal.timeout === 'function') {
    const signals = [Signal.timeout(ms)]
    if (callerSignal) signals.push(callerSignal)
    return Signal.any(signals)
  }
  const controller = new AbortController()
  const abort = (reason: unknown) => {
    clearTimeout(timer)
    if (!controller.signal.aborted) controller.abort(reason)
  }
  const timer = setTimeout(() => abort(abortError('TimeoutError', `Request timed out after ${ms} ms`)), ms)
  if (callerSignal) {
    if (callerSignal.aborted) abort(callerSignal.reason)
    else callerSignal.addEventListener('abort', () => abort(callerSignal.reason), { once: true })
  }
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  return controller.signal
}

function abortError(name: string, message: string): Error {
  const error = new Error(message)
  error.name = name
  return error
}

// One JSON GET, through XMLHttpRequest on both targets. NativeScript's fetch polyfill builds
// its Response from `xhr.response`, which its XHR has already parsed into an object for JSON
// content types, so `response.json()` there fails with '"[object Object]" is not valid JSON'.
// XHR with responseType 'json' returns the parsed object on both runtimes, and `xhr.abort()`
// honours the composed signal the same way fetch would.
function requestJson<T>(url: string, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const onAbort = () => {
      xhr.abort()
      reject(signal.reason ?? abortError('AbortError', 'The request was aborted'))
    }
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    xhr.open('GET', url, true)
    xhr.responseType = 'json'
    xhr.onload = () => {
      signal.removeEventListener('abort', onAbort)
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`TMDB responded with status ${xhr.status}`))
        return
      }
      try {
        const body: unknown = xhr.response
        resolve((typeof body === 'string' ? JSON.parse(body) : body) as T)
      } catch (error) {
        reject(error)
      }
    }
    xhr.onerror = () => {
      signal.removeEventListener('abort', onAbort)
      reject(new Error('Network request failed: ' + url))
    }
    xhr.send()
  })
}

function fetchJson<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  if (API_KEY === '') {
    return Promise.reject(new Error('Missing VITE_TMDB_API_KEY. Copy .env.example to .env and add your TMDB key.'))
  }
  const cacheKey = BASE_URL + path + '?' + toQuery({ ...params, api_key: API_KEY })

  const cached = responseCache.get(cacheKey)
  if (cached) return cached as Promise<T>

  const request = requestJson<T>(cacheKey, timeoutSignal(signal, REQUEST_TIMEOUT_MS)).catch((error: unknown) => {
    responseCache.delete(cacheKey)
    throw error
  })

  responseCache.set(cacheKey, request)
  return request
}

export function getGenres(signal?: AbortSignal): Promise<Genre[]> {
  return fetchJson<GenreListResponse>('/3/genre/movie/list', {}, signal).then((data) => data.genres)
}

export function discoverMovies(params: Record<string, string>, page: number, signal?: AbortSignal): Promise<Movie[]> {
  return fetchJson<DiscoverResponse>('/3/discover/movie', { ...params, page: String(page) }, signal).then((data) =>
    data.results.map(toMovie)
  )
}

function toMovie(result: DiscoverResult): Movie {
  return {
    id: result.id,
    title: result.title,
    year: result.release_date ? result.release_date.slice(0, 4) : '—',
    overview: result.overview,
    posterPath: result.poster_path,
  }
}

let imageConfig = {
  baseUrl: 'https://image.tmdb.org/t/p/',
  posterSizes: ['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original'],
}

export function loadImageConfig(signal?: AbortSignal): Promise<void> {
  return fetchJson<ImageConfigResponse>('/3/configuration', {}, signal).then((data) => {
    imageConfig = {
      baseUrl: data.images.secure_base_url,
      posterSizes: data.images.poster_sizes,
    }
  })
}

// Smallest TMDB size that still covers the on-screen width, so tiles never fetch full-res art
export function posterUrl(posterPath: string | null, displayWidth: number): string | undefined {
  if (!posterPath) return undefined
  const size = imageConfig.posterSizes.find((s) => Number(s.slice(1)) >= displayWidth) ?? 'original'
  return imageConfig.baseUrl + size + posterPath
}

export function isAbortError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name
  return name === 'AbortError' || name === 'TimeoutError'
}

// What this runtime provides, logged once at boot (the tvOS answer goes into NOTES.md).
export function describeRuntime(): string {
  const Signal = typeof AbortSignal === 'undefined' ? undefined : (AbortSignal as { any?: unknown; timeout?: unknown })
  return [
    `fetch=${typeof fetch}`,
    `XMLHttpRequest=${typeof XMLHttpRequest}`,
    `AbortController=${typeof AbortController}`,
    `AbortSignal.any=${typeof Signal?.any}`,
    `AbortSignal.timeout=${typeof Signal?.timeout}`,
    `DOMException=${typeof DOMException}`,
    `URL=${typeof URL}`,
    `URLSearchParams=${typeof URLSearchParams}`,
  ].join(' ')
}
