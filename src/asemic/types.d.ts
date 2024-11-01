import { Color, Vector2 } from 'three'
import { PointVector } from './drawingSystem/PointVector'
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
              reset?: true
            }
          | undefined
        )
      ]
    | [number, number]

  type OpenCoordinate = Coordinate | number

  type KeyframeData = {
    groups: PointVector[][][]
    position?: Vector2
    scale?: Vector2
    rotation?: number
  }
}
