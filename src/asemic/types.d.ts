import { Color, Vector2 } from 'three'
import { PointVector } from './Keyframes'

declare global {
  type CurvePoint = {
    position: PointVector
    thickness?: number
    alpha?: number
    color?: Color
  }

  type KeyframeData = {
    curves: CurvePoint[][]
    position?: Vector2
    scale?: Vector2
    rotation?: number
  }
}
