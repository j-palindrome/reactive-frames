import { Color, Vector2 } from 'three'
import { PointBuilder } from './drawingSystem/PointBuilder'
import Builder from './drawingSystem/Builder'

declare global {
  type Coordinate =
    | [number, number, CoordinateData | undefined]
    | [number, number]
  type CoordinateData = {
    mode?: Builder['modeSet']
    strength?: number
    thickness?: number
    origin?: Coordinate
    translate?: Coordinate
    scale?: [number, number]
    rotate?: number
    reset?: boolean
    grid?: [number, number]
  }

  type KeyframeData = {
    groups: PointBuilder[][][]
    position?: Vector2
    scale?: Vector2
    rotation?: number
  }
}
