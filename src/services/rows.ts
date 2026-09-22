// Row collections and row assembly. Ported 1:1 from the L3 reference build: 12 fixed
// collections (sort/decade variations) applied to any genre, 2–3 discover pages up front,
// dedupe by id, and further pages appended on demand (extendRowItems) as the user scrolls.
import { discoverMovies, type Movie } from './tmdb'

export interface RowItem extends Movie {
  key: string
  index: number
}

export type RowStatus = 'pending' | 'loading' | 'ready' | 'error'

export interface Row {
  id: string
  index: number
  title: string
  status: RowStatus
  items: RowItem[]
  nextPage: number
  exhausted: boolean
}

interface RowCollection {
  title: string
  params: Record<string, string>
}

const COLLECTIONS: RowCollection[] = [
  { title: 'Popular', params: { sort_by: 'popularity.desc' } },
  { title: 'Top Rated', params: { sort_by: 'vote_average.desc', 'vote_count.gte': '300' } },
  { title: 'New Releases', params: { sort_by: 'primary_release_date.desc', 'vote_count.gte': '20' } },
  { title: 'Most Watched', params: { sort_by: 'vote_count.desc' } },
  { title: 'Box Office Hits', params: { sort_by: 'revenue.desc' } },
  { title: 'Crowd Pleasers', params: { sort_by: 'popularity.desc', 'vote_average.gte': '7' } },
  { title: 'Hidden Gems', params: { sort_by: 'vote_average.desc', 'vote_count.gte': '50', 'vote_count.lte': '500' } },
  { title: 'Fresh from the 2020s', params: { sort_by: 'popularity.desc', 'primary_release_date.gte': '2020-01-01' } },
  {
    title: 'Best of the 2010s',
    params: { sort_by: 'popularity.desc', 'primary_release_date.gte': '2010-01-01', 'primary_release_date.lte': '2019-12-31' },
  },
  {
    title: '2000s Throwbacks',
    params: { sort_by: 'popularity.desc', 'primary_release_date.gte': '2000-01-01', 'primary_release_date.lte': '2009-12-31' },
  },
  {
    title: '90s Classics',
    params: { sort_by: 'popularity.desc', 'primary_release_date.gte': '1990-01-01', 'primary_release_date.lte': '1999-12-31' },
  },
  {
    title: '80s Rewind',
    params: { sort_by: 'popularity.desc', 'primary_release_date.gte': '1980-01-01', 'primary_release_date.lte': '1989-12-31' },
  },
]

const MIN_ITEMS_PER_ROW = 30
// The discover endpoint rejects pages beyond 500
export const MAX_DISCOVER_PAGE = 500

export function buildRows(genreId: number | null): Row[] {
  return COLLECTIONS.map((collection, index) => ({
    id: `${genreId ?? 'all'}-${index}`,
    index,
    title: collection.title,
    status: 'pending' as RowStatus,
    items: [] as RowItem[],
    nextPage: 3,
    exhausted: false,
  }))
}

function rowParams(genreId: number | null, rowIndex: number): Record<string, string> {
  const collection = COLLECTIONS[rowIndex]
  if (!collection) throw new Error(`No row collection at index ${rowIndex}`)
  const params = { ...collection.params }
  if (genreId !== null) params.with_genres = String(genreId)
  return params
}

export function fetchRowPage(genreId: number | null, rowIndex: number, page: number, signal: AbortSignal): Promise<Movie[]> {
  return discoverMovies(rowParams(genreId, rowIndex), page, signal)
}

export async function fetchRowItems(
  genreId: number | null,
  rowIndex: number,
  signal: AbortSignal
): Promise<{ items: RowItem[]; nextPage: number }> {
  const params = rowParams(genreId, rowIndex)

  const byId = new Map<number, Movie>()
  const firstPages = await Promise.all([1, 2].map((page) => discoverMovies(params, page, signal)))
  for (const movie of firstPages.flat()) byId.set(movie.id, movie)

  let nextPage = 3
  if (byId.size < MIN_ITEMS_PER_ROW) {
    for (const movie of await discoverMovies(params, 3, signal)) byId.set(movie.id, movie)
    nextPage = 4
  }

  const unique = [...byId.values()]
  if (unique.length === 0) throw new Error('TMDB returned no titles for this row')

  return { items: extendRowItems([], unique, rowIndex), nextPage }
}

// Appends only unseen titles, numbering keys on from the existing tail
export function extendRowItems(existing: RowItem[], fresh: Movie[], rowIndex: number): RowItem[] {
  const known = new Set(existing.map((item) => item.id))
  const additions = fresh.filter((movie) => {
    if (known.has(movie.id)) return false
    known.add(movie.id)
    return true
  })
  return [
    ...existing,
    ...additions.map((movie, offset) => ({
      ...movie,
      key: `${rowIndex}:${existing.length + offset}`,
      index: existing.length + offset,
    })),
  ]
}
