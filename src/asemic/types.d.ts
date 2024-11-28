import { Color, Vector2 } from 'three'
import { PointBuilder } from './drawingSystem/PointBuilder'
import Builder from './drawingSystem/Builder'

declare global {
  type Coordinate =
    | [number, number, PreTransformData & CoordinateMetaData]
    | [number, number]

  type TargetGroups = { groups?: TargetInfo; frames?: TargetInfo }

  type TransformData = {
    translate: PointBuilder
    scale: PointBuilder
    rotate: number
  }

  type PreTransformData = {
    push?: true
    reset?: true | 'last' | 'pop'
    translate?: [number, number] | PointBuilder
    scale?: [number, number] | number | PointBuilder
    rotate?: number
    origin?: [number, number] | PointBuilder
    remap?: [[number, number] | PointBuilder, [number, number] | PointBuilder]
  }

  type CoordinateMetaData = {
    strength?: number
    thickness?: number
    color?: [number, number, number]
    alpha?: number
  }

  type GroupData = {
    curves: PointBuilder[][]
    transform: TransformData
    settings: CoordinateMetaData
  }

  type FrameData = {
    groups: GroupData[]
    transform: TransformData
    settings: CoordinateMetaData
    frameSettings: { duration: number; strength: number }
  }

  type ParserData = {
    args: string[]
    namedArgs: Record<string, { type: string; aliases: string[] }>
    aliases: string[]
  }
}
