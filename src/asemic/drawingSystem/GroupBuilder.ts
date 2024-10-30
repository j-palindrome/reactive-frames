import { last, range } from 'lodash'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { PointVector } from './PointVector'
import Builder from './Builder'

const vector = new Vector2()
const vector2 = new Vector2()

const fixNumber = (number: number) => {
  const str = number.toString()
  if (str.match(/\.\d{10}/)) return number.toFixed(2)
  return str
}
export default class GroupBuilder extends Builder {
  targetCurves: [number, number] = [0, 0]
  curves: PointVector[][] = []

  constructor() {
    super()
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
      this.curves[this.targetCurves[0]]
        .map(x =>
          x
            .toArray()
            .map(x => x.toFixed(2))
            .join(',')
        )
        .join(', ')
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
    this.addToLog('new', [origin])
    origin = this.getRelative(origin)
    this.curves.push([])
    this.targetCurve(-1)
    this.addToCurve(this.curves[this.targetCurves[0]], [origin])
    return this
  }

  newIntersect(progress: number, target: number = -1) {
    this.addToLog('newIntersect', undefined, [progress, target])
    target = target < 0 ? target + this.curves.length : target
    const intersect = this.makeCurvePath(this.curves[target]).getPointAt(
      progress
    )

    this.curves.push([])
    this.targetCurve(-1)
    this.addToCurve(this.curves[this.targetCurves[0]], [
      [intersect.x, intersect.y]
    ])

    return this
  }

  arc(centerPoint: Coordinate, amount: number) {
    this.addToLog('arc', [centerPoint], [amount])
    centerPoint = this.getRelative(centerPoint)
    return this.eachCurve(curve => {
      const lastPoint = last(curve)!
      vector.set(...centerPoint)
      const points: Coordinate[] = []
      let progress =
        (curve.length === 1 ? 1 / 16 : 1 / 8) * (amount < 0 ? -1 : 1)
      // let progress = (1 / 8 / 2) * (amount < 0 ? -1 : 1)
      while (amount < 0 ? progress >= amount : progress <= amount) {
        points.push(
          vector2
            .copy(lastPoint)
            .rotateAround(vector, progress * Math.PI * 2)
            .toArray()
        )
        progress += (1 / 8) * (amount < 0 ? -1 : 1)
      }
      progress -= (1 / 8) * (amount < 0 ? -1 : 1)
      if (amount < 0 ? progress >= amount : progress <= amount) {
        points.push(
          vector2
            .copy(lastPoint)
            .rotateAround(vector, amount * Math.PI * 2)
            .toArray()
        )
      }
      this.addToCurve(curve, points)
    })
  }

  line(endPoint: Coordinate) {
    this.addToLog('line', [endPoint])
    this.logEnabled = false
    this.curve(endPoint, 0)
    this.logEnabled = true
    return this
  }

  curve(endPoint: Coordinate, height: number, skew: number = 0.5) {
    this.addToLog('curve', [endPoint, height], [skew])
    endPoint = this.getRelative(endPoint)
    return this.eachCurve(curve => {
      const lastPoint = last(curve)!
      const end = new Vector2(1, 0)
      const scale = new Vector2(...endPoint).distanceTo(lastPoint)
      const points = [new Vector2(skew, height), end]
      const rotate = new Vector2(...endPoint).sub(lastPoint).angle()

      this.addToCurve(
        curve,
        points.map(point =>
          point
            .clone()
            .multiply({ x: scale, y: scale })
            .add(lastPoint)
            .rotateAround(lastPoint, rotate)
            .toArray()
        )
      )
    })
  }

  private getLastPoint() {
    return (
      last(this.curves[this.targetCurves[0]]) ??
      new PointVector([0, 0], this.curves[0], 0)
    )
  }

  points(coords: Coordinate[]) {
    this.addToLog('points', coords)
    return this.eachCurve(curve => {
      this.addToCurve(
        curve,
        coords.map(x => this.getRelative(x))
      )
    })
  }

  point(coord: Coordinate) {
    this.addToLog('point', [coord])
    return this.eachCurve(curve => {
      this.addToCurve(curve, [this.getRelative(coord)])
    })
  }

  length(copyCount: number) {
    this.addToLog('length', undefined, [copyCount])
    return this.eachCurve(curve =>
      this.addToCurve(
        curve,
        range(copyCount).map(() => curve[0].toArray())
      )
    )
  }

  letter(type: keyof GroupBuilder['letters']) {
    return this.letters[type]()
  }

  shift(multiplier: Coordinate = [1, 1], adder: Coordinate = [0, 0]) {
    let output = `this`
    this.log.forEach(
      x =>
        (output += `.${x.func}(${
          x.coords
            ? x.coords
                .map(coord =>
                  typeof coord === 'number'
                    ? coord * multiplier[0] + adder[0]
                    : `[${fixNumber(
                        coord[0] * multiplier[0] + adder[0]
                      )}, ${fixNumber(coord[1] * multiplier[1] + adder[1])}]`
                )
                .join(', ')
            : ''
        }${
          x.endArgs
            ? `${x.coords ? ', ' : ''}${x.endArgs
                .map(x => (typeof x === 'string' ? `'${x}'` : x))
                .join(', ')}`
            : ''
        })\n`)
    )
    this.curves = []
    eval(output)
    return this
  }

  private getRelative(move: Coordinate): Coordinate {
    let lastPoint: PointVector
    let point: Coordinate

    const mappedMove: Coordinate = [
      move[0] / this.gridSet[0],
      move[1] / this.gridSet[1]
    ]

    switch (this.modeSet) {
      case 'absolute':
        point = mappedMove
        break
      case 'relative':
        lastPoint = this.getLastPoint()
        point = [lastPoint.x + mappedMove[0], lastPoint.y + mappedMove[1]]
        break
      case 'polar':
        lastPoint = this.getLastPoint()
        point = vector
          .copy(lastPoint)
          .add({ x: mappedMove[0], y: 0 })
          .rotateAround(lastPoint, mappedMove[1] * Math.PI * 2)
          .toArray()
        break
      case 'steer':
        lastPoint = this.getLastPoint()
        const pointBefore =
          this.curves[this.targetCurves[0]][
            this.curves[this.targetCurves[0]].length - 2
          ]
        point = vector
          .copy(lastPoint)
          .add({ x: mappedMove[0], y: 0 })
          .rotateAround(
            lastPoint,
            mappedMove[1] * Math.PI * 2 +
              (!pointBefore
                ? 0
                : vector2.copy(lastPoint).sub(pointBefore).angle())
          )
          .toArray()
        break
    }
    return point
  }

  letters: Record<string, () => GroupBuilder> = {
    a: () =>
      this.new([0.8, 0.8])
        .curve([0.2, 0.5], -0.4, 0.3)
        .curve([0.8, 0.2], -0.4, 0.5)
        .new([0.8, 0.8])
        .curve([0.8, 0.05], -0.05)
        .slide(0.1),
    b: () =>
      this.new([0.1, 0.9])
        .curve([0.1, 0.1], 0)
        .newIntersect(0.5)
        .curve([0.5, -0.2], 0.2)
        .curve([0.1, 0.1], 0.2),
    c: () => this.new([0.8, 0.7]).arc([0.5, 0.5], 0.8),
    d: () =>
      this.new([0.9, 0.9])
        .curve([0.9, 0.1], 0)
        .newIntersect(0.5)
        .curve([-0.5, -0.2], -0.2)
        .curve([0.9, 0.15], -0.2),
    e: () =>
      this.new([0.8, 0.5])
        .points([[0.8, 0.7]])
        .arc([-0.3, -0.2], 0.8)
        .newIntersect(0.55)
        .curve([0.8, 0.5], 0),
    f: () =>
      this.new([70, 70])
        .arc([-20, 0], 0.5)
        .line([0, -50])
        .newIntersect(0.7)
        .line([30, 0])
        .slide(0.2),
    g: () =>
      this.new([70, 60])
        .mode('polar')
        .arc([20, -45], 1)
        .new([0, 0])
        .point([100, -25])
        .mode('absolute')
        .point([35, 20])
  }
}
