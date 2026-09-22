import { For, type Component } from 'solid-js'
import { colors, layout } from '../theme'

export interface NavGenre {
  id: number | null
  name: string
}

interface Props {
  genres: NavGenre[]
  focusedIndex: number
  activeIndex: number
  navFocused: boolean
}

const pillTransition = { x: { duration: 150 }, alpha: { duration: 150 } } as const

const GenreNav: Component<Props> = (props) => (
  <view width={layout.width} height={150}>
    <text x={90} y={46} fontFamily="raleway" fontSize={44} color={colors.accent}>
      VELOPE
    </text>
    <view x={420} y={40}>
      <view
        width={260}
        height={64}
        borderRadius={32}
        color={colors.navPill}
        x={props.focusedIndex * 280}
        alpha={props.navFocused ? 1 : 0}
        transition={pillTransition}
      />
      <For each={props.genres}>
        {(genre, index) => (
          <text
            x={index() * 280}
            y={15}
            width={260}
            contain="width"
            textAlign="center"
            fontSize={30}
            color={index() === props.activeIndex ? colors.accent : colors.textPrimary}
          >
            {genre.name}
          </text>
        )}
      </For>
    </view>
  </view>
)

export default GenreNav
