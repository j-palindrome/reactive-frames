import { Color, Vector2 } from 'three'
import { PointBuilder } from './drawingSystem/PointBuilder'
import Builder from './drawingSystem/Builder'

declare global {
  type Coordinate =
    | [
        number,
        number,
        (
          | {
              mode?: Builder['modeSet']
              strength?: number
              thickness?: number
              origin?: Coordinate
              grid?: [number, number]
              scale?: [number, number]
              rotation?: number
              reset?: boolean
            }
          | undefined
        )
      ]
    | [number, number]

  type OpenCoordinate = Coordinate | number

  type KeyframeData = {
    groups: PointBuilder[][][]
    position?: Vector2
    scale?: Vector2
    rotation?: number
  }
}
