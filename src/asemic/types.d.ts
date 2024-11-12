import { Color, Vector2 } from 'three'
import { PointBuilder } from './drawingSystem/PointBuilder'
import Builder from './drawingSystem/Builder'

declare global {
  type Coordinate = [number, number, CoordinateData] | [number, number]

  type TransformData = {
    translate: Vector2
    scale: Vector2
    rotate: number
    origin: Vector2
  }

  type CoordinateTransform = {
    push?: true
    reset?: true | 'last' | 'pop'
    translate?: [number, number]
    scale?: [number, number] | number
    rotate?: number
    origin?: [number, number]
    remap?: [[number, number], [number, number]]
  }

  type CoordinateData = CoordinateTransform & {
    strength?: number
    thickness?: number
    color?: [number, number, number]
    alpha?: number
  }

  type GroupData = {
    curves: PointBuilder[][]
    transform: TransformData
  }
}
