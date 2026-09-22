import { createEffect, createMemo, For, on, onCleanup, onMount, Show, type Component } from 'solid-js'
import { createStore } from 'solid-js/store'
import GenreNav, { type NavGenre } from '../components/GenreNav'
import CarouselRow from '../components/CarouselRow'
import SplashScreen from '../components/SplashScreen'
import ErrorScreen from '../components/ErrorScreen'
import { getGenres, loadImageConfig, isAbortError } from '../services/tmdb'
import { buildRows, fetchRowItems, fetchRowPage, extendRowItems, MAX_DISCOVER_PAGE, type Row } from '../services/rows'
import { colors, easing, layout } from '../theme'
import { exposeDebug } from '../debug'

const NAV_GENRE_COUNT = 4
const ROW_PREFETCH_AHEAD = 3
const ROW_PREFETCH_BEHIND = 1
const EXTEND_WHEN_TILES_LEFT = 12
const { rowStep: ROW_STEP, visibleTiles: VISIBLE_TILES } = layout

type Phase = 'loading' | 'ready' | 'error'
type Zone = 'nav' | 'grid'

// The single explicit focus model of the L3 build: which plane has focus, and one remembered
// column per row. Every visual derives from it; the key handlers (Gate 3) only mutate it.
interface HomeState {
  phase: Phase
  errorMessage: string
  zone: Zone
  navIndex: number
  activeGenreIndex: number
  genres: NavGenre[]
  rows: Row[]
  rowIndex: number
  cols: number[]
}

const gridTransition = { y: { duration: 250, easing } } as const

let inflight = new AbortController()
const extending = new Set<string>()

const Home: Component = () => {
  const [state, setState] = createStore<HomeState>({
    phase: 'loading',
    errorMessage: '',
    zone: 'nav',
    navIndex: 0,
    activeGenreIndex: 0,
    genres: [],
    rows: [],
    rowIndex: 0,
    cols: [],
  })

  const activeGenreId = () => state.genres[state.activeGenreIndex]?.id ?? null

  // Only rows in or near the viewport exist; off-screen rows are destroyed with their textures
  const visibleRows = createMemo(() => {
    const from = Math.max(0, state.rowIndex - ROW_PREFETCH_BEHIND)
    return state.rows.slice(from, state.rowIndex + ROW_PREFETCH_AHEAD + 1)
  })

  async function boot(): Promise<void> {
    setState({ phase: 'loading' })
    inflight = new AbortController()
    try {
      const [genreList] = await Promise.all([getGenres(inflight.signal), loadImageConfig(inflight.signal)])
      setState('genres', [{ id: null, name: 'All' }, ...genreList.slice(0, NAV_GENRE_COUNT)])
      applyGenre()
      await loadRow(0)
      setState('phase', 'ready')
      loadRowsAround(0)
    } catch (error) {
      if (isAbortError(error)) return
      setState({ phase: 'error', errorMessage: error instanceof Error ? error.message : String(error) })
    }
  }

  function applyGenre(): void {
    inflight.abort()
    inflight = new AbortController()
    const rows = buildRows(activeGenreId())
    setState({ rows, cols: rows.map(() => 0), rowIndex: 0 })
  }

  function loadRowsAround(index: number): void {
    const first = Math.max(0, index - ROW_PREFETCH_BEHIND)
    const last = Math.min(state.rows.length - 1, index + ROW_PREFETCH_AHEAD)
    for (let rowNumber = first; rowNumber <= last; rowNumber++) void loadRow(rowNumber)
  }

  async function loadRow(index: number): Promise<void> {
    const row = state.rows[index]
    if (!row || row.status === 'loading' || row.status === 'ready') return
    const rowId = row.id
    patchRow(index, rowId, { status: 'loading' })
    try {
      const { items, nextPage } = await fetchRowItems(activeGenreId(), index, inflight.signal)
      patchRow(index, rowId, { status: 'ready', items, nextPage })
    } catch (error) {
      patchRow(index, rowId, { status: isAbortError(error) ? 'pending' : 'error' })
    }
  }

  // Every row mutation is guarded by row id, so a late response from an abandoned genre can
  // never write into the new one. Store updates keep the row's identity (fine-grained).
  function patchRow(index: number, id: string, patch: Partial<Row>): void {
    const current = state.rows[index]
    if (!current || current.id !== id) return
    setState('rows', index, patch)
  }

  // Rows grow to the right by fetching further pages; once TMDB is exhausted they cycle
  // seamlessly. The left end is fixed, and rows shorter than the viewport simply clamp.
  function stepColumn(direction: number): void {
    const row = state.rows[state.rowIndex]
    if (!row || row.items.length === 0) return
    const col = state.cols[state.rowIndex] ?? 0
    if (direction < 0) {
      setState('cols', state.rowIndex, Math.max(0, col - 1))
      return
    }
    const count = row.items.length
    const cycling = row.exhausted && count > VISIBLE_TILES
    if (col + 1 < count || cycling) setState('cols', state.rowIndex, col + 1)
    if (!row.exhausted && count - col <= EXTEND_WHEN_TILES_LEFT) void extendRow(state.rowIndex)
  }

  async function extendRow(index: number): Promise<void> {
    const row = state.rows[index]
    if (!row || row.status !== 'ready' || row.exhausted || extending.has(row.id)) return
    if (row.nextPage > MAX_DISCOVER_PAGE) {
      patchRow(index, row.id, { exhausted: true })
      return
    }
    const rowId = row.id
    extending.add(rowId)
    try {
      const fresh = await fetchRowPage(activeGenreId(), index, row.nextPage, inflight.signal)
      const current = state.rows[index]
      if (!current || current.id !== rowId) return
      const items = extendRowItems(current.items, fresh, index)
      patchRow(index, rowId, { items, nextPage: current.nextPage + 1, exhausted: items.length === current.items.length })
    } catch {
      // Aborted or failed: leave the row as is; the next scroll step retries
    } finally {
      extending.delete(rowId)
    }
  }

  function activateGenre(): void {
    if (state.navIndex === state.activeGenreIndex) return
    setState('activeGenreIndex', state.navIndex)
    applyGenre()
    loadRowsAround(0)
  }

  createEffect(on(() => state.rowIndex, (index) => loadRowsAround(index), { defer: true }))

  onMount(() => void boot())
  onCleanup(() => inflight.abort())

  // Exposed for the next gates (key handling) and for verification hooks.
  void stepColumn
  void activateGenre
  exposeDebug('home', { state, setState })

  return (
    <view width={layout.width} height={layout.height} color={colors.background}>
      <view y={layout.navHeight} width={layout.width} height={layout.height - layout.navHeight} clipping>
        <view y={-state.rowIndex * ROW_STEP} transition={gridTransition}>
          <For each={visibleRows()}>
            {(row) => (
              <CarouselRow
                row={row}
                y={row.index * ROW_STEP}
                focusedCol={state.cols[row.index] ?? 0}
                rowFocused={state.zone === 'grid' && row.index === state.rowIndex}
              />
            )}
          </For>
        </view>
      </view>
      <GenreNav genres={state.genres} focusedIndex={state.navIndex} activeIndex={state.activeGenreIndex} navFocused={state.zone === 'nav'} />
      <Show when={state.phase === 'loading'}>
        <SplashScreen active={state.phase === 'loading'} />
      </Show>
      <Show when={state.phase === 'error'}>
        <ErrorScreen message={state.errorMessage} />
      </Show>
    </view>
  )
}

export default Home
