import { last } from 'lodash'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { PointVector } from './PointVector'

export default class GroupBuilder {
  targetCurves: [number, number]
  curves: PointVector[][]

  constructor() {
    this.curves = []
    this.targetCurves = [0, 0]
  }

  targetCurve(from: number, to?: number) {
    if (from < 0) from += this.curves.length
    if (to === undefined) to = from
    else if (to < 0) to += this.curves.length
    this.targetCurves = [from, to]
    return this
  }

  eachCurve(callback: (curve: PointVector[]) => void) {
    for (let i = this.targetCurves[0]; i <= this.targetCurves[1]; i++) {
      callback(this.curves[i])
    }
    return this
  }

  debug() {
    console.log(
      this.curves[this.targetCurves[0]].map(x =>
        x
          .toArray()
          .map(x => x.toFixed(2))
          .join(', ')
      )
    )
    return this
  }

  private addToCurve(curve: PointVector[], points: Coordinate[]) {
    curve.push(
      ...points.map(
        (point, i) => new PointVector(point, curve, i + curve.length)
      )
    )
    return this
  }

  new(origin: Coordinate) {
    this.curves.push([])
    this.targetCurve(-1)
    this.addToCurve(this.curves[this.targetCurves[0]], [origin])
    return this
  }

  curve(endPoint: Coordinate, height: number, skew: number = 0.5) {
    return this.eachCurve(curve => {
      const points = [new Vector2(skew, 1), new Vector2(1, 0)]

      const lastPoint = last(curve)!
      const scale = new Vector2(...endPoint).distanceTo(lastPoint)
      const rotate = new Vector2(...endPoint).sub(lastPoint).angle()

      this.addToCurve(
        curve,
        points.map(point =>
          point
            .clone()
            .multiply({ x: scale, y: height })
            .add(lastPoint)
            .rotateAround(lastPoint, rotate)
            .toArray()
        )
      )
    })
  }

  private makeCurvePath(curve: PointVector[]) {
    const path = new THREE.CurvePath()
    for (let i = 0; i < curve.length - 2; i++) {
      path.add(
        new THREE.QuadraticBezierCurve(
          i === 0 ? curve[i] : curve[i].clone().lerp(curve[i + 1], 0.5),
          curve[i + 1],
          i === curve.length - 3
            ? curve[i + 2]
            : curve[i + 1].clone().lerp(curve[i + 2], 0.5)
        )
      )
    }
    return path
  }

  /**
   * Slide the curve along itself to offset its start point.
   */
  slide(amount: number) {
    return this.eachCurve(curve => {
      const path = this.makeCurvePath(curve)

      const offset = curve[0].clone().sub(path.getPointAt(amount))
      console.log(offset, curve[0].clone(), path.getPointAt(amount))

      curve.forEach(point => point.add(offset))
    })
  }

  point(coord: Coordinate) {
    return this.eachCurve(curve => this.addToCurve(curve, [coord]))
  }

  letter(type: keyof GroupBuilder['letters']) {
    return this.letters[type]()
  }

  letters: Record<string, () => GroupBuilder> = {
    a: () =>
      this.new([0.8, 0.8])
        .curve([0.2, 0.5], -0.4, 0.3)
        .curve([0.8, 0.2], -0.4, 0.5)
        .new([0.8, 0.8])
        .curve([0.8, 0.05], -0.05)
        .slide(0.1),
    b: () => this.new([0.1, 0.9]).curve([0.2, 0.2], 0)
  }
}
