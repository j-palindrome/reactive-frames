import { Color, Vector2 } from 'three'
import { PointVector } from './drawingSystem/pointVector'

declare global {
  type Coordinate = [number, number]

  type KeyframeData = {
    groups: PointVector[][][]
    position?: Vector2
    scale?: Vector2
    rotation?: number
  }
}
