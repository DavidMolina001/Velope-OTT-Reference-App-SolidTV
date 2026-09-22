import { createEffect, createMemo, For, Show, type Component } from 'solid-js'
import type { ElementNode } from '@solidtv/solid'
import MovieTile from './MovieTile'
import { colors, easing, layout } from '../theme'
import type { Row, RowItem } from '../services/rows'

interface Props {
  row: Row
  y: number
  focusedCol: number
  rowFocused: boolean
}

const { tileStep: TILE_STEP, visibleTiles: VISIBLE_TILES, recycleBuffer: RECYCLE_BUFFER } = layout
const SKELETON_SLOTS = [0, 1, 2, 3, 4, 5, 6]
const scrollTransition = { x: { duration: 200, easing } } as const
const ringTransition = { alpha: { duration: 150 } } as const

// Only tiles in or near the viewport exist; the rest are destroyed and their textures released.
// Slots are virtual: while more pages exist the row simply grows; once exhausted (and longer
// than the viewport) it cycles through the items by modulo. Short rows clamp.
const CarouselRow: Component<Props> = (props) => {
  let scroller: ElementNode | undefined
  let currentX = 0
  // One stable object per slot, so <For> keeps a tile bound to its slot while the window slides
  // (a fresh object per recompute would recreate every tile on every step).
  const slotItems = new Map<number, RowItem>()

  const window = createMemo(() => {
    const items = props.row.items
    const count = items.length
    if (count === 0) {
      slotItems.clear()
      return { items: [] as RowItem[], scrollCol: 0 }
    }
    const cycling = props.row.exhausted && count > VISIBLE_TILES
    const scrollCol = cycling ? props.focusedCol : Math.min(props.focusedCol, Math.max(0, count - VISIBLE_TILES))
    const from = Math.max(0, scrollCol - RECYCLE_BUFFER)
    const to = cycling ? scrollCol + VISIBLE_TILES + RECYCLE_BUFFER : Math.min(scrollCol + VISIBLE_TILES + RECYCLE_BUFFER, count)
    for (const slot of [...slotItems.keys()]) if (slot < from || slot >= to) slotItems.delete(slot)
    const windowItems: RowItem[] = []
    for (let slot = from; slot < to; slot++) {
      let entry = slotItems.get(slot)
      if (!entry) {
        const source = items[slot % count]!
        entry = { ...source, key: String(slot), index: slot }
        slotItems.set(slot, entry)
      }
      windowItems.push(entry)
    }
    return { items: windowItems, scrollCol }
  })

  // Jumps past the recycle buffer (row re-creation, genre switch) snap instead of animating over
  // destroyed tiles; single steps keep the 200 ms glide.
  createEffect(() => {
    const targetX = -window().scrollCol * TILE_STEP
    if (!scroller || targetX === currentX) return
    if (Math.abs(targetX - currentX) > RECYCLE_BUFFER * TILE_STEP) scroller.lng.x = targetX
    else scroller.x = targetX
    currentX = targetX
  })

  // The scroller and the wrapper are pure translations with an explicit ZERO size. A <view>
  // without a size inherits its parent's, and a 1830-wide node at x = -2400 is entirely
  // off-screen: the renderer then marks it OutOfBounds and defers updating its children, so a
  // scrolled row (or a scrolled grid) goes blank. A zero-size node takes its parent's render
  // state instead, which is how Blits' size-less elements behave.
  return (
    <view y={props.y} width={layout.width} height={440}>
      <text x={90} fontFamily="raleway" fontSize={34} color={colors.textRow}>
        {props.row.title}
      </text>
      <view x={90} y={64} width={0} height={0}>
        <Show when={props.row.status === 'ready'}>
          <view ref={scroller} width={0} height={0} transition={scrollTransition}>
            <For each={window().items}>
              {(item) => <MovieTile item={item} x={item.index * TILE_STEP} focused={props.rowFocused && item.index === props.focusedCol} />}
            </For>
          </view>
        </Show>
        <Show when={props.row.status === 'pending' || props.row.status === 'loading'}>
          <view width={0} height={0}>
            <view
              x={-6}
              y={-6}
              width={232}
              height={342}
              borderRadius={16}
              color={colors.focusRing}
              alpha={props.rowFocused ? 1 : 0}
              transition={ringTransition}
            />
            <For each={SKELETON_SLOTS}>
              {(slot) => <view x={slot * TILE_STEP} width={layout.tileWidth} height={layout.tileHeight} borderRadius={12} color={colors.surface} alpha={0.55} />}
            </For>
          </view>
        </Show>
        <Show when={props.row.status === 'error'}>
          <view y={120} width={0} height={0}>
            <text fontSize={32} color={colors.textPrimary}>
              This row failed to load.
            </text>
            <text y={50} fontSize={26} color={props.rowFocused ? colors.accent : colors.textMuted}>
              Press Enter to retry
            </text>
          </view>
        </Show>
      </view>
    </view>
  )
}

export default CarouselRow
