import type { Component } from 'solid-js'
import Loader from './Loader'
import { colors, layout } from '../theme'

const SplashScreen: Component<{ active: boolean }> = (props) => (
  <view width={layout.width} height={layout.height} color={colors.background}>
    <text x={960} y={440} mount={0.5} fontFamily="raleway" fontSize={84} color={colors.accent}>
      VELOPE TV
    </text>
    <Loader x={880} y={540} active={props.active} />
    <text x={960} y={680} mountX={0.5} fontSize={28} color={colors.textMuted}>
      Loading catalogue...
    </text>
  </view>
)

export default SplashScreen
