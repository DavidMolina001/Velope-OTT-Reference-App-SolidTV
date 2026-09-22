import type { Component } from 'solid-js'
import { colors, layout } from '../theme'

const ErrorScreen: Component<{ message: string }> = (props) => (
  <view width={layout.width} height={layout.height} color={colors.background}>
    <text x={960} y={400} mount={0.5} fontFamily="raleway" fontSize={64} color={colors.textPrimary}>
      Something went wrong
    </text>
    <text x={960} y={470} mountX={0.5} width={1200} contain="width" textAlign="center" fontSize={28} color={colors.textMuted}>
      {props.message}
    </text>
    <view x={830} y={580} width={260} height={76} borderRadius={38} color={colors.accent}>
      <text x={130} y={20} mountX={0.5} fontSize={30} color={colors.background}>
        Retry
      </text>
    </view>
    <text x={960} y={710} mountX={0.5} fontSize={24} color={colors.textMuted}>
      Press Enter to retry
    </text>
  </view>
)

export default ErrorScreen
