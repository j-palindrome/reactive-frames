import { Color, Vector2 } from 'three'
import { PointVector } from './drawingSystem/PointVector'
import Builder from './drawingSystem/Builder'

declare global {
  type Coordinate =
    | [number, number]
    | [number, number, { mode?: Builder['modeSet']; strength?: number }]

  type OpenCoordinate = Coordinate | number

  type KeyframeData = {
    groups: PointVector[][][]
    position?: Vector2
    scale?: Vector2
    rotation?: number
  }
}
