import { Color, Vector2 } from 'three'
import { PointBuilder } from './drawingSystem/PointBuilder'
import Builder from './drawingSystem/Builder'

declare global {
  type Coordinate = [number, number, CoordinateData] | [number, number]

  type CoordinateData = {
    action?: 'push' | 'pop' | 'reset' | 'clear'
    origin?: [number, number]
    translate?: [number, number]
    scale?: [number, number]
    rotate?: number
    strength?: number
    thickness?: number
  }
  type TransformData = {
    origin?: Vector2
    scale?: Vector2
    rotate?: number
    translate?: Vector2
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
