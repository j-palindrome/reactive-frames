import { last, range } from 'lodash'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { PointVector } from './PointVector'
import Builder from './Builder'

const vector = new Vector2()
const vector2 = new Vector2()

const fixNumber = (number: number) => {
  const str = number.toString()
  if (str.match(/\.\d{10}/)) return number.toFixed(2).replace(/\.?0+$/, '')
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
        (point, i) =>
          new PointVector(point, curve, i + curve.length, {
            strength: point[2]?.strength
          })
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

  getIntersect(progress: number, target = -1): Coordinate {
    target = target < 0 ? target + this.curves.length : target
    const curvePath = this.makeCurvePath(this.curves[target])

    const intersect = curvePath.getPointAt(progress)
    return [
      intersect.x * this.gridSet[0],
      intersect.y * this.gridSet[1],
      { mode: 'absolute' }
    ]
  }

  add(point: Coordinate) {
    this.getLastPoint().add({
      x: point[0] / this.gridSet[0],
      y: point[1] / this.gridSet[1]
    })
    return this
  }

  arc(centerPoint: Coordinate, amount: number) {
    this.addToLog('arc', [centerPoint], [amount])
    centerPoint = this.getRelative(centerPoint)
    return this.eachCurve(curve => {
      const lastPoint = last(curve)!
      vector.set(centerPoint[0], centerPoint[1])
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

  /**
   * Make a curve within a triangle @param height tall (scaled to the width of the start->endpoints) and @param skew tilted (0-1).
   */
  curve(endPoint: Coordinate, height: number, skew: number = 0.5) {
    this.addToLog('curve', [endPoint], [height, skew])
    endPoint = this.getRelative(endPoint)

    return this.eachCurve(curve => {
      const lastPoint = last(curve)!
      const end = new Vector2(1, 0)
      const scale = new Vector2(endPoint[0], endPoint[1]).distanceTo(lastPoint)
      const points = [new Vector2(skew, height), end]
      const rotate = new Vector2(endPoint[0], endPoint[1])
        .sub(lastPoint)
        .angle()

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

  /**
   * Make a curve inside a square defined by height and expanded out by width, tilted by skew [0-1].
   * @param height how tall the control points are (scaled to start -> end)
   * @param width how wide the control points are (scaled to start -> end)
   * @param skew how much to rotate the curve by
   */
  curveQuad(endPoint: Coordinate, height = 1, width = 1, skew = 0.5) {
    // endPoint, then two points at a right angle.
    this.addToLog('curveQuad', [endPoint], [height, width, skew])
    endPoint = this.getRelative(endPoint)

    return this.eachCurve(curve => {
      const lastPoint = last(curve)!
      const end = new Vector2(1, 0)
      const scale = new Vector2(endPoint[0], endPoint[1]).distanceTo(lastPoint)
      const points = [
        new Vector2(0.5 - width / 2, height).rotateAround(
          vector.set(0.5, 0),
          (0.5 - skew) * Math.PI
        ),
        new Vector2(0.5 + width / 2, height).rotateAround(
          vector,
          (0.5 - skew) * Math.PI
        ),
        end
      ]
      console.log(points)

      const rotate = new Vector2(endPoint[0], endPoint[1])
        .sub(lastPoint)
        .angle()

      this.addToCurve(
        curve,
        points.map(point =>
          point
            .clone()
            .multiplyScalar(scale)
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
    this.addToLog('points', [coords])
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
    const mapCoord = (coord: Coordinate) =>
      `[${fixNumber(coord[0] * multiplier[0] + adder[0])}, ${fixNumber(
        coord[1] * multiplier[1] + adder[1]
      )}${
        coord[2]
          ? `, ${JSON.stringify(coord[2]).replace(
              /"(\w+)":"(\w+)"/,
              "$1: '$2'"
            )}`
          : ''
      }]`
    let output = `this`
    this.log.forEach(
      x =>
        (output += `.${x.func}(${
          x.coords
            ? x.coords
                .map(coord =>
                  typeof coord === 'number'
                    ? coord * multiplier[0] + adder[0]
                    : typeof coord[0] === 'number'
                    ? mapCoord(coord as Coordinate)
                    : `[${coord
                        .map(x => mapCoord(x as Coordinate))
                        .join(', ')}]`
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
    console.log(output)

    return this
  }

  private getRelative(move: Coordinate): Coordinate {
    let lastPoint: PointVector
    let point: Coordinate

    const mappedMove: Coordinate = [
      (move[0] + (this.originSet?.[0] ?? 0)) / this.gridSet[0],
      (move[1] + (this.originSet?.[1] ?? 0)) / this.gridSet[1]
    ]

    switch (move[2]?.mode ?? this.modeSet) {
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
    return [...point, move[2] ?? {}]
  }

  eval(callback: (self: this) => void) {
    callback(this)
    return this
  }

  letters: Record<string, () => GroupBuilder> = {
    a: () =>
      this.new([80, 80])
        .mode('absolute')
        .curve([20, 50], -0.4, 0.3)
        .curve([80, 20], -0.4, 0.5)
        .new([80, 80])
        .curve([80, 5], -0.05, 0.5)
        .slide(0.1),
    b: () =>
      this.new([10, 90])
        .mode('absolute')
        .line([10, 10])
        .new([10, 50])
        .curve([50, -20, { mode: 'relative' }], 0.2, 0.5)
        .curve([10, 10], 0.2, 0.5),
    c: () => this.new([80, 70]).mode('absolute').arc([50, 50], 0.8),
    d: () =>
      this.new([90, 90])
        .line([0, -70])
        .new([90, 55, { mode: 'absolute' }])
        .curve([-50, -20], -0.3, 0.5)
        .curve([90, 23.5, { mode: 'absolute' }], -0.2, 0.5),
    e: () =>
      this.new([80, 50])
        .mode('absolute')
        .points([[80, 70]])
        .mode('relative')
        .arc([-30, -20], 0.8)
        .new(this.getIntersect(0.55))
        .mode('absolute')
        .line([80, 50]),
    f: () =>
      this.new([70, 70])
        .arc([-20, 0], 0.5)
        .line([0, -50])
        .new(this.getIntersect(0.7))
        .line([30, 0])
        .slide(0.2),
    g: () =>
      this.new([70, 60])
        .mode('polar')
        .arc([20, -45], 1)
        .new([0, 0])
        .point([100, -25])
        .mode('absolute')
        .point([35, 20]),
    h: () =>
      this.new([10, 90])
        .line([0, -80])
        .new(this.getIntersect(0.7))
        .curve([50, 10, { mode: 'absolute' }], 1.5, -0.1),
    i: () =>
      this.new([51, 70])
        .arc([-1, -1], 1)
        .new([-1, -10])
        .line([50, 10, { mode: 'absolute' }]),
    j: () =>
      this.new([51, 76])
        .arc([-1, -1], 1)
        .new([-1, -10])
        .point([10, -60])
        .point([-30, 0])
        .point([0, 15]),
    k: () =>
      this.new([30, 90])
        .line([0, -80])
        .mode('absolute', this.getIntersect(0.5))
        .new([30, 30])
        .point([0, 0, { strength: 1 }])
        .mode('absolute', this.getIntersect(1, -2))
        .point([50, 0])
  }
}
