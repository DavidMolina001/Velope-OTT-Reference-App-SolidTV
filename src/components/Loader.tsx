import { createEffect, createSignal, onCleanup, type Component } from 'solid-js'
import { colors } from '../theme'

interface Props {
  x: number
  y: number
  active: boolean
}

const dotTransitions = [
  { alpha: { duration: 300, delay: 200 } },
  { alpha: { duration: 300, delay: 300 } },
  { alpha: { duration: 300, delay: 400 } },
] as const

// Three dots pulsing with staggered delays, as in the L3 build's Loader.
const Loader: Component<Props> = (props) => {
  const [alpha, setAlpha] = createSignal(0)
  let interval: ReturnType<typeof setInterval> | undefined
  createEffect(() => {
    if (interval !== undefined) clearInterval(interval)
    interval = undefined
    if (props.active) interval = setInterval(() => setAlpha((a) => (a === 1 ? 0 : 1)), 800)
  })
  onCleanup(() => interval !== undefined && clearInterval(interval))
  return (
    <view x={props.x} y={props.y}>
      <view width={40} height={40} borderRadius={20} color={colors.loader} alpha={alpha()} transition={dotTransitions[0]} />
      <view x={60} width={40} height={40} borderRadius={20} color={colors.loader} alpha={alpha()} transition={dotTransitions[1]} />
      <view x={120} width={40} height={40} borderRadius={20} color={colors.loader} alpha={alpha()} transition={dotTransitions[2]} />
    </view>
  )
}

export default Loader
