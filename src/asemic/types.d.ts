import { Color, Vector2 } from 'three'
import { PointVector } from './drawingSystem/useKeyframes'

declare global {
  type Coordinate = [number, number]

  type CurvePoint = {
    position: PointVector
    thickness?: number
    alpha?: number
    color?: Color
    strength: number
    curveProgress: number
    pointProgress: number
  }

  type KeyframeData = {
    groups: CurvePoint[][][]
    position?: Vector2
    scale?: Vector2
    rotation?: number
  }
}
