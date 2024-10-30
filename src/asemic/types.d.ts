import { Color, Vector2 } from 'three'
import { PointVector } from './drawingSystem/PointVector'

declare global {
  type Coordinate = [number, number]

  type OpenCoordinate = Coordinate | number

  type KeyframeData = {
    groups: PointVector[][][]
    position?: Vector2
    scale?: Vector2
    rotation?: number
  }
}
