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
  }
  type CoordinateData = TransformData & {
    mode?: Builder['modeSet']
    strength?: number
    thickness?: number
    reset?: boolean
    grid?: [number, number]
  }
  type GroupData = { curves: PointBuilder[][]; transform: TransformData }
}
