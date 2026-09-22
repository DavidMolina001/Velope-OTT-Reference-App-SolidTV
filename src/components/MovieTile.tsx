import { createSignal, type Component } from 'solid-js'
import { colors, layout } from '../theme'
import { posterUrl } from '../services/tmdb'
import type { RowItem } from '../services/rows'

interface Props {
  item: RowItem
  x: number
  focused: boolean
}

// Transition settings are read once at creation, so they live outside the component.
const scaleTransition = { scale: { duration: 150 } } as const
const ringTransition = { alpha: { duration: 150 } } as const
const placeholderTransition = { alpha: { duration: 200 } } as const

// A tile knows how to look focused; it never decides whether it is. The poster node is always
// renderable (the renderer only loads textures for renderable nodes); the placeholder sits on
// top and fades out once the poster has loaded.
const MovieTile: Component<Props> = (props) => {
  const [posterLoaded, setPosterLoaded] = createSignal(false)
  const posterSrc = () => posterUrl(props.item.posterPath, layout.tileWidth)
  const monogram = () => props.item.title.charAt(0).toUpperCase()
  return (
    <view x={props.x} width={layout.tileWidth} height={410}>
      <view width={layout.tileWidth} height={layout.tileHeight} scale={props.focused ? 1.06 : 1} transition={scaleTransition}>
        <view
          x={-6}
          y={-6}
          width={232}
          height={342}
          borderRadius={16}
          color={colors.focusRing}
          alpha={props.focused ? 1 : 0}
          transition={ringTransition}
        />
        <view width={layout.tileWidth} height={layout.tileHeight} borderRadius={12} color={colors.surface} />
        <view
          width={layout.tileWidth}
          height={layout.tileHeight}
          borderRadius={12}
          color={0xffffffff}
          src={posterSrc()}
          onEvent={{
            loaded: () => setPosterLoaded(true),
            failed: (_node: unknown, info: unknown) => import.meta.env.DEV && console.warn(`POSTER failed ${posterSrc()} ${JSON.stringify(info)}`),
          }}
        />
        <view
          width={layout.tileWidth}
          height={layout.tileHeight}
          borderRadius={12}
          color={colors.surface}
          alpha={posterLoaded() ? 0 : 1}
          transition={placeholderTransition}
        >
          <text x={110} y={165} mount={0.5} fontSize={96} color={colors.monogram}>
            {monogram()}
          </text>
        </view>
      </view>
      <text y={344} fontSize={26} width={layout.tileWidth} contain="width" maxLines={1} color={colors.textPrimary}>
        {props.item.title}
      </text>
      <text y={378} fontSize={22} color={colors.textMuted}>
        {props.item.year}
      </text>
    </view>
  )
}

export default MovieTile
