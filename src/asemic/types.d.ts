import { Color, Vector2 } from 'three'
import { PointBuilder } from './drawingSystem/PointBuilder'
import Builder from './drawingSystem/Builder'

declare global {
  type Coordinate =
    | [number, number, CoordinateData | undefined]
    | [number, number]

  type TransformData = {
    origin?: Coordinate
    translate?: Coordinate
    scale?: [number, number]
    rotate?: number
    mode?: Builder['modeSet']
    reset?: boolean
    grid?: [number, number]
  }
  type CoordinateData = TransformData & {
    strength?: number
    thickness?: number
  }
  type GroupData = {
    curves: PointBuilder[][]
    transform: {
      translate?: Vector2
      rotate?: number
      scale?: Vector2
      origin?: Vector2
    }
  }
}
