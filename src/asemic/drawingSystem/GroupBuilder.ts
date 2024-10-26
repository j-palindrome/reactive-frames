import { Vector } from 'p5'
import {
  Matrix,
  Matrix3,
  QuadraticBezier,
  QuadraticBezierCurve,
  Vector2
} from 'three'
import { PointVector } from './Keyframes'
import { last, max, maxBy, min, minBy } from 'lodash'
import { bezier2JS } from '../../../util/src/geometry'

const vector = new Vector2()
const vector2 = new Vector2()
export default class GroupBuilder {
  targetCurves: [number, number]
  curves: CurvePoint[][]

  translation: Vector2
  rotation: number
  scaling: Vector2

  firstPoint?: CurvePoint
  lastPoint?: CurvePoint

  constructor() {
    this.curves = []
    this.targetCurves = [0, 0]
    this.translation = new Vector2(0, 0)
    this.rotation = 0
    this.scaling = new Vector2(1, 1)
  }

  targetCurve(from: number, to?: number) {
    if (from < 0) from += this.curves.length
    if (to === undefined) to = from
    else if (to < 0) to += this.curves.length
    this.targetCurves = [from, to]
    return this
  }

  eachCurve(callback: (curve: CurvePoint[]) => void) {
    for (let i = this.targetCurves[0]; i <= this.targetCurves[1]; i++) {
      callback(this.curves[i])
    }
    return this
  }

  debug() {
    console.log(
      this.curves[this.targetCurves[0]].map(x =>
        x.position
          .toArray()
          .map(x => x.toFixed(2))
          .join(', ')
      )
    )
    return this
  }

  // moveToPoint(
  //   curveIndex: number,
  //   pointIndex: number,
  //   offset: Coordinate = [0, 0]
  // ) {
  //   if (curveIndex < 0) curveIndex += this.curves.length
  //   if (pointIndex < 0) pointIndex += this.curves[curveIndex].length
  //   this.moveTo(this.curves[curveIndex][pointIndex].position)
  //   this.move(...offset)
  //   return this
  // }

  // moveTo(point: Coordinate) {
  //   this.translation.copy(vector.set(...point))
  //   this.updateMatrix()
  //   return this
  // }

  // moveBy(point: Coordinate) {
  //   this.translation.add(vector.set(...point))
  //   this.updateMatrix()
  //   return this
  // }

  // move(rotation: number, length: number) {
  //   this.translation.add(
  //     vector
  //       .set(0, length)
  //       .rotateAround({ x: 0, y: 0 }, -rotation * Math.PI * 2)
  //   )
  //   this.updateMatrix()
  //   return this
  // }

  private curveFromPoints(points: Coordinate[]): CurvePoint[] {
    return points.map(point => ({
      position: new Vector2(...point),
      strength: 0,
      curveProgress: 0,
      pointProgress: 0
    }))
  }

  new(origin: Coordinate) {
    this.curves.push(this.curveFromPoints([origin]))
    this.targetCurve(-1)
    return this
  }

  curve(endPoint: Coordinate, height: number) {
    return this.eachCurve(curve => {
      const points = [new Vector2(0.5, 1), new Vector2(1, 0)]

      const lastPoint = last(curve)!.position
      const scale = new Vector2(...endPoint).distanceTo(lastPoint)
      const rotate = new Vector2(...endPoint).sub(lastPoint).angle()

      curve.push(
        ...this.curveFromPoints(
          points.map(point =>
            point
              .clone()
              .multiply({ x: scale, y: height })
              .add(lastPoint)
              .rotateAround(lastPoint, rotate)
              .toArray()
          )
        )
      )
    })
  }

  point(coord: Coordinate) {
    return this.eachCurve(curve => curve.push(...this.curveFromPoints([coord])))
  }

  // resetWarp() {
  //   this.rotation = 0
  //   this.scaling.set(1, 1)
  //   this.translation.set(0, 0)
  //   this.updateMatrix()
  //   return this
  // }

  // warp(r: number = this.rotation, to: Coordinate = [1, 1]) {
  //   this.rotation = r * Math.PI * 2
  //   this.scaling.copy(vector.set(...to))
  //   this.updateMatrix()
  //   return this
  // }

  letter(type: keyof GroupBuilder['letters']) {
    return this.letters[type]()
  }

  // private updateMatrix() {
  //   this.matrix
  //     .makeScale(...this.scaling.toArray())
  //     .rotate(this.rotation)
  //     .translate(...vector.copy(this.translation).toArray())
  //   return this
  // }

  letters: Record<string, () => GroupBuilder> = {
    //.curve([0.2, 0.5], 0.5)
    a: () => this.new([0.5, 0.5]).curve([0.707, 1], 0.5)
  }
}
