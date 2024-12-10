import { Color, Vector2 } from 'three'
import { PointBuilder } from './drawingSystem/PointBuilder'
import Builder from './drawingSystem/Builder'

declare global {
  type Coordinate = [number, number, CoordinateData] | [number, number]

  type TransformData = {
    translate: Vector2
    scale: Vector2
    rotate: number
  }

  type PreTransformData = {
    push?: true
    reset?: true | 'last' | 'pop' | 'group'
    translate?: [number, number] | PointBuilder
    scale?: [number, number] | number | PointBuilder
    rotate?: number
    origin?: [number, number] | PointBuilder
    remap?: [[number, number] | PointBuilder, [number, number] | PointBuilder]
  }

  type CoordinateSettings = {
    strength?: number
    thickness?: number
    color?: [number, number, number]
    alpha?: number
  }

  type CoordinateData = PreTransformData & CoordinateSettings

  type GroupData = {
    curves: PointBuilder[][]
    transform: TransformData
  }
}
