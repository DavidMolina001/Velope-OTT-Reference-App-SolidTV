import type { Component } from 'solid-js'
import { colors } from '../theme'

interface Props {
  x?: number
  y: number
  width: number
  label: string
  focused: boolean
  pressed: boolean
}

const scaleTransition = { scale: { duration: 120 } } as const

const ActionButton: Component<Props> = (props) => (
  <view
    x={props.x ?? 0}
    y={props.y}
    width={props.width}
    height={76}
    borderRadius={38}
    color={props.focused ? colors.accent : colors.surfaceButton}
    scale={props.pressed ? 0.94 : props.focused ? 1.05 : 1}
    transition={scaleTransition}
  >
    <text x={props.width / 2} y={20} mountX={0.5} fontSize={30} color={props.focused ? colors.background : colors.textPrimary}>
      {props.label}
    </text>
  </view>
)

export default ActionButton
