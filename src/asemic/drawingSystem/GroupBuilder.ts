import { Vector } from 'p5'
import { Matrix, Matrix3, Vector2 } from 'three'
import { PointVector } from './Keyframes'
import { last } from 'lodash'

const vector = new Vector2()
const vector2 = new Vector2()
export default class GroupBuilder {
  targetCurves: [number, number]
  curves: CurvePoint[][]
  matrix: Matrix3

  translation: Vector2
  rotation: number
  scaling: Vector2

  firstPoint?: CurvePoint
  lastPoint?: CurvePoint

  constructor() {
    this.matrix = new Matrix3()
    this.matrix.makeRotation(0).makeScale(1, 1).makeTranslation(0, 0)
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
  }

  private formCurve(callback: (points: CurvePoint[]) => void) {
    this.eachCurve(curve => {
      const points: CurvePoint[] = []
      callback(points)
      points.forEach(p => p.position.applyMatrix3(this.matrix))
      curve.push(...points)
      this.moveTo(last(curve)!.position)
    })
    return this
  }

  private curveFromPoints(points: Coordinate[]): CurvePoint[] {
    return points.map(point => ({
      position: new Vector2(...point),
      strength: 0,
      curveProgress: 0,
      pointProgress: 0
    }))
  }

  curve() {
    return this.formCurve(points => {
      const newCurve = this.curveFromPoints([
        [0, 0],
        [0.5, 1],
        [1, 0]
      ])
      points.push(...newCurve)
    })
  }

  arc(
    arcEnd: number = 1,
    strength: number = 0,
    intersectAt: number = 0,
    sides: number = 8
  ) {
    vector.set(0, 0.5)
    const intersectAtPoint = new Vector2(0, -0.5)
      .rotateAround({ x: 0, y: 0 }, intersectAt * (Math.PI * 2))
      .add(vector)
    const progress = (rotation: number) =>
      new Vector2(0, -0.5)
        .rotateAround({ x: 0, y: 0 }, rotation * (Math.PI * 2))
        .add(vector)
        .sub(intersectAtPoint)
    return this.formCurve(points => {
      for (let i = 0; i <= Math.floor(arcEnd * sides); i++) {
        points.push({
          position: progress(i / sides),
          strength,
          curveProgress: 0,
          pointProgress: 0
        })
      }
      if (arcEnd < 1) {
        points.push({
          position: progress(arcEnd),
          strength,
          curveProgress: 0,
          pointProgress: 0
        })
      }
    })
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

  moveToPoint(
    curveIndex: number,
    pointIndex: number,
    offset: Coordinate = [0, 0]
  ) {
    if (curveIndex < 0) curveIndex += this.curves.length
    if (pointIndex < 0) pointIndex += this.curves[curveIndex].length
    this.moveTo(this.curves[curveIndex][pointIndex].position)
    this.move(...offset)
    return this
  }

  moveTo(point: Coordinate) {
    this.translation.copy(vector.set(...point))
    this.updateMatrix()
    return this
  }

  moveBy(point: Coordinate) {
    this.translation.add(vector.set(...point))
    this.updateMatrix()
    return this
  }

  move(rotation: number, length: number) {
    this.translation.add(
      vector
        .set(0, length)
        .rotateAround({ x: 0, y: 0 }, -rotation * Math.PI * 2)
    )
    this.updateMatrix()
    return this
  }

  addCurve() {
    this.curves.push([])
    this.targetCurve(-1)
    return this
  }

  resetWarp() {
    this.rotation = 0
    this.scaling.set(1, 1)
    this.translation.set(0, 0)
    this.updateMatrix()
    return this
  }

  warp(r: number = this.rotation, to: Coordinate = [1, 1]) {
    this.rotation = -r * Math.PI * 2
    this.scaling.copy(vector.set(...to))
    this.updateMatrix()
    return this
  }

  private updateMatrix() {
    this.matrix
      .makeRotation(this.rotation)
      .translate(
        ...vector.copy(this.translation).divide(this.scaling).toArray()
      )
      .scale(...this.scaling.toArray())
    return this
  }
}
