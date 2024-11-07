import { cloneDeep, last, max, maxBy, min, range } from 'lodash'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { PointBuilder } from './PointBuilder'
import Builder from './Builder'
import { lerp } from 'three/src/math/MathUtils.js'
import { KeyframeBuilder } from './KeyframeBuilder'

const vector = new Vector2()
const vector2 = new Vector2()

const fixNumber = (number: number) => {
  const str = number.toString()
  if (str.match(/\.\d{10}/)) return number.toFixed(2).replace(/\.?0+$/, '')
  return str
}
export default class GroupBuilder extends Builder {
  constructor() {
    super()
  }

  lastCurve(callback: (curve: PointBuilder[]) => void) {
    return this.groups(group => {
      callback(group[group.length - 1])
    })
  }

  /**
   * Slide the curve along itself to offset its start point.
   */
  slide(amount: number) {
    this.addToLog('slide', { endArgs: [amount] })
    return this.lastCurve(curve => {
      const path = this.makeCurvePath(curve)

      const offset = curve[0].clone().sub(path.getPointAt(amount))

      curve.forEach(point => point.add(offset))
    })
  }

  private addToCurve(points: Coordinate[]) {
    return this.lastCurve(curve => {
      curve.push(...this.toCurve(points))
      this.lastPoint.set(last(points)![0], last(points)![1])
    })
  }

  new(origin: Coordinate, newGroup: boolean = false) {
    if (newGroup) {
      this.framesSet[0].groups.push([])
      this.target(-1)
      this.clearTransforms()
    }
    this.addToLog('new', { coords: [origin], endArgs: [newGroup] })
    origin = this.getRelative(origin)
    this.framesSet[0].groups[this.targetGroupsSet[0]].push([])
    this.addToCurve([origin])
    return this
  }

  getPoint(curve: number, point: number): PointBuilder {
    if (curve < 0)
      curve += this.framesSet[0].groups[this.targetGroupsSet[0]].length
    if (point < 0)
      point += this.framesSet[0].groups[this.targetGroupsSet[0]][curve].length
    const p = this.framesSet[0].groups[this.targetGroupsSet[0]][curve][point]!
    return p
  }

  arc(centerPoint: Coordinate, amount: number) {
    this.addToLog('arc', { coords: [centerPoint], endArgs: [amount] })
    centerPoint = this.getRelative(centerPoint)

    return this.lastCurve(curve => {
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
      this.addToCurve(points)
    })
  }

  line(endPoint: Coordinate) {
    this.addToLog('line', { coords: [endPoint] })
    this.logEnabled = false
    this.curve(endPoint, [this.gridSet[0] / 2, 0])
    this.logEnabled = true
    return this
  }

  /**
   * Make a curve where the middle points are scaled according to the line from startPoint to endPoint.
   */
  curve(endPoint: Coordinate, ...midPoints: Coordinate[]) {
    this.addToLog('curve', {
      coords: [endPoint],
      otherCoords: midPoints
    })
    endPoint = this.getRelative(endPoint)

    return this.lastCurve(curve => {
      const lastPoint = last(curve)!
      const end = new Vector2(1, 0)
      const scale = new Vector2(endPoint[0], endPoint[1]).distanceTo(lastPoint)
      const points = [
        ...midPoints.map(
          x => new Vector2(x[0] / this.gridSet[0], x[1] / this.gridSet[1])
        ),
        end
      ]
      const rotate = new Vector2(endPoint[0], endPoint[1])
        .sub(lastPoint)
        .angle()

      this.addToCurve(
        points.map((point, i) => {
          const thisPoint: Coordinate = [
            ...point
              .clone()
              .multiplyScalar(scale)
              .add(lastPoint)
              .rotateAround(lastPoint, rotate)
              .toArray(),
            i === points.length - 1 ? end[2] : midPoints[i][2]
          ]
          return thisPoint as Coordinate
        })
      )
    })
  }

  addPoints(...coords: Coordinate[]) {
    this.addToLog('point', { coords })
    return this.lastCurve(curve => {
      for (let coord of coords) {
        this.addToCurve([this.getRelative(coord)])
      }
    })
  }

  length(copyCount: number) {
    this.addToLog('length', { endArgs: [copyCount] })
    return this.lastCurve(curve =>
      this.addToCurve(range(copyCount).map(() => curve[0].toArray()))
    )
  }

  private letter(type: keyof GroupBuilder['letters']) {
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
    this.framesSet[0].groups = []
    eval(output)
    return this
  }

  eval(callback: (self: this) => void) {
    callback(this)
    return this
  }

  protected getLastPoint(index: number = -1): PointBuilder {
    const lastGroup = this.framesSet[0].groups[this.targetGroupsSet[0]]
    const lastCurve = lastGroup[lastGroup.length - 1]
    return lastCurve[lastCurve.length + index]
  }

  text(
    str: string,
    {
      width = this.gridSet[0],
      origin = [0, 0]
    }: { width?: number; origin?: Coordinate } = {}
  ) {
    origin = this.getRelative(origin)

    this.push({ origin: [10, 0] })
    let lineCount = 0
    for (let letter of str) {
      if (this.letters[letter]) {
        this.letter(letter).push({ origin: [10, 0] })
      } else if (letter === '\n') {
        lineCount++
        this.clearMatrices().push({ origin: [10, -110 * lineCount] })
      }
    }

    const maxX = max(this.framesSet[0].groups.flat(2).map(x => x.x))
    this.groups(
      group =>
        group
          .flat()
          .forEach(point =>
            point
              .multiplyScalar(width / this.gridSet[0] / maxX!)
              .add({ x: origin[0], y: origin[1] })
          ),
      [0, -1]
    )

    this.clearMatrices()
    this.clearTransforms()

    return this
  }

  letters: Record<string, () => GroupBuilder> = {
    ' ': () => this.push({ origin: [50, 0] }),
    '\t': () => this.push({ origin: [200, 0] }),
    a: () =>
      this.new([80, 80], true)
        .curve([20, 50], [30, -40])
        .curve([80, 20], [50, -40])
        .new([80, 80])
        .curve([80, 5], [50, -10])
        .slide(0.1)
        .within([0, 0], [50, 50])
        .push({ origin: [50, 0] }),
    b: () =>
      this.new([10, 90], true)
        .line([10, 10])
        .new([10, 50])
        .curve([50, -20, { mode: 'relative' }], [50, 20])
        .curve([10, 10, { mode: 'absolute' }], [50, 20])
        .within([0, 0], [50, 100])
        .push({ origin: [50, 0] }),
    c: () =>
      this.new([80, 70, { scale: [70, 70] }], true)
        .arc([50, 50], 0.8)
        .within([0, 0, { reset: true }], [50, 50])
        .push({ origin: [50, 0] }),
    d: () =>
      this.new([90, 90], true)
        .line([0, -70, { mode: 'relative' }])
        .new([90, 55, { mode: 'absolute' }])
        .curve([-50, -20, { mode: 'relative' }], [50, -30])
        .curve([90, 23.5, { mode: 'absolute' }], [50, -20])
        .within([0, 0], [50, 100])
        .push({ origin: [50, 0] }),
    e: () =>
      this.new([80, 50], true)
        .addPoints([80, 70])
        .arc([-30, -20, { mode: 'relative' }], 0.8)
        .new([55, -1, { mode: 'intersect' }])
        .line([80, 50, { mode: 'absolute' }])
        .within([0, 0], [50, 50])
        .push({ origin: [50, 0] }),
    f: () =>
      this.new([70, 70], true)
        .arc([-20, 0, { mode: 'relative' }], 0.5)
        .line([0, -50])
        .new([70, -1, { mode: 'intersect' }])
        .line([30, 0, { mode: 'relative' }])
        .slide(0.2)
        .within([0, 0, { mode: 'absolute' }], [50, 100])
        .push({ origin: [25, 0] }),
    g: () =>
      this.new([70, 60], true)
        .arc([20, -45, { mode: 'polar' }], 1)
        .new([0, 0])
        .addPoints(
          [100, -25],
          [
            50,
            0,
            {
              translate: [0, -100, { mode: 'absolute' }],
              mode: 'intersect'
            }
          ],
          [0, 20, { mode: 'relative' }]
        )
        .debug()
        .within([0, -50, { mode: 'absolute' }], [50, 50])
        .debug()
        .push({ origin: [50, 0] }),
    h: () =>
      this.new([10, 90], true)
        .line([0, -80, { mode: 'relative' }])
        .new([70, -1, { mode: 'intersect' }])
        .curve([50, 10, { mode: 'absolute' }], [10, 150])
        .within([0, 0], [50, 100])
        .push({ origin: [50, 0] }),
    i: () =>
      this.new([51, 70], true)
        .arc([-1, -1, { mode: 'relative' }], 1)
        .new([-1, -10])
        .line([50, 10, { mode: 'absolute' }])
        .within([0, 0], [10, 75])
        .push({ origin: [10, 0] }),
    j: () =>
      this.push({ origin: [-25, 0] })
        .new([51, 76, { translate: [0, -40], scale: [100, 120] }], true)
        .arc([-1, -1, { mode: 'relative' }], 1)
        .new([-1, -10])
        .addPoints([10, -60], [-30, 0], [0, 15])
        .within([0, -50, { mode: 'absolute' }], [50, 50])
        .push({ origin: [50, 0] }),
    k: () =>
      this.new([30, 90], true)
        .line([0, -80, { mode: 'relative' }])
        .new([
          30,
          30,
          { mode: 'absolute', translate: [50, -1, { mode: 'intersect' }] }
        ])
        .addPoints(
          [0, 0, { strength: 1, mode: 'absolute', reset: false }],
          [50, 0, { translate: [100, -2, { mode: 'intersect' }] }]
        )
        .debug()
        .within([0, 0, { reset: true }], [50, 100])
        .push({ origin: [50, 0] }),
    l: () =>
      this.new([50, 90], true)
        .addPoints([0, -70, { mode: 'relative' }])
        .curve([10, -10], [50, -50, { strength: 0.5 }])
        .within([0, 0, { mode: 'absolute' }], [25, 100])
        .push({ origin: [25, 0] }),
    m: () =>
      this.new(
        [
          0,
          0,
          {
            mode: 'absolute',
            translate: [10, 10],
            scale: [40, 40]
          }
        ],
        true
      )
        .addPoints([0, 100], [100, 100], [100, 0])
        .new([
          0,
          0,
          {
            mode: 'absolute',
            translate: [100, -1, { mode: 'intersect' }],
            scale: [40, 40]
          }
        ])
        .addPoints([0, 100], [100, 100], [100, 0])
        .within([0, 0, { reset: true }], [75, 50])
        .push({ origin: [75, 0] }),
    n: () =>
      this.new([70, 10], true)
        .addPoints(
          [
            0,
            100,
            {
              mode: 'absolute',
              translate: [70, 10],
              scale: [-40, 40]
            }
          ],
          [100, 100],
          [100, 40],
          [100, 0]
        )
        .within([0, 0, { translate: [0, 0], scale: [100, 100] }], [50, 50])
        .push({ origin: [50, 0] }),
    o: () =>
      this.new([20, 20, { mode: 'absolute', translate: [50, 50] }], true)
        .arc([0, 0], 1)
        .within([0, 0, { reset: true }], [50, 50])
        .push({ origin: [50, 0] }),
    p: () =>
      this.new([50, 80], true)
        .line([0, -70, { mode: 'relative' }])
        .new([10, -1, { mode: 'intersect' }])
        .curve([0, -30, { mode: 'relative' }], [-40, 100], [140, 100])
        .within([0, -50, { mode: 'absolute', translate: [0, 10] }], [50, 50])
        .push({ origin: [50, 0] }),
    q: () =>
      this.new([50, 80, { scale: [100, 130], translate: [0, -40] }], true)
        .line([0, -80, { mode: 'relative', strength: 1 }])
        .addPoints([30, 12, { mode: 'polar' }])
        .new([5, -1, { mode: 'intersect' }])
        .curve([0, -30, { mode: 'relative' }], [-20, -170], [120, -170])
        .within([0, -50, { mode: 'absolute' }], [50, 100, { mode: 'relative' }])
        .push({ origin: [50, 0] }),
    r: () =>
      this.new([30, 60], true)
        .line([30, 10])
        .new([20, -1, { mode: 'intersect' }])
        .curve([40, 0, { mode: 'relative' }], [50, 50])
        .within([0, 0, { mode: 'absolute' }], [50, 50])
        .push({ origin: [50, 0] }),
    s: () =>
      this.new([70, 70], true)
        .curve([50, 50], [-20, -100], [120, -100])
        .curve([30, 30], [-20, 100], [120, 100])
        .within([0, 0], [50, 50])
        .push({ origin: [50, 0] }),
    t: () =>
      this.push({ origin: [-15, 0] })
        .new([50, 100, { translate: [0, 10] }], true)
        .line([50, 0])
        .new([30, -1, { mode: 'intersect' }])
        .line([40, 0, { mode: 'relative' }])
        .slide(0.5)
        .within([0, 0, { mode: 'absolute' }], [50, 100])
        .push({ origin: [45, 0] }),
    u: () =>
      this.new([0, 100], true)
        .curve([100, 0, { mode: 'relative' }], [0, -100], [100, -100])
        .within([0, 0, { mode: 'absolute' }], [50, 50])
        .push({ origin: [50, 0] }),
    v: () =>
      this.new([0, 100, { mode: 'absolute' }], true)
        .curve([100, 0, { mode: 'relative' }], [50, -100, { strength: 1 }])
        .within([0, 0, { mode: 'absolute' }], [50, 50])
        .push({ origin: [50, 0] }),
    w: () =>
      this.new([0, 50, { scale: [80, 170], translate: [0, -25] }], true)
        .addPoints(
          [25, 0, { strength: 1 }],
          [50, 50, { strength: 1 }],
          [75, 0, { strength: 1 }],
          [100, 50, { strength: 1 }]
        )
        .within([0, 0, { reset: true }], [100, 50])
        .push({ origin: [100, 0] }),
    x: () =>
      this.new([0, 0, { scale: [50, 60], translate: [0, 0] }], true)
        .line([100, 100])
        .new([0, 100])
        .line([100, 0])
        .within([0, 0, { reset: true }], [50, 50])
        .push({ origin: [50, 0] }),
    y: () =>
      this.new([0, 0, { scale: [50, 120], translate: [0, -60] }], true)
        .line([100, 100])
        .new([0, 100])
        .line([50, 50])
        .within([0, -50, { reset: true }], [50, 50])
        .push({ origin: [50, 0] }),
    z: () =>
      this.new([0, 100, { scale: [50, 70] }], true)
        .addPoints(
          [100, 100, { strength: 1 }],
          [0, 0, { strength: 1 }],
          [100, 0, { strength: 1 }]
        )
        .within([0, 0, { reset: true }], [50, 50])
        .push({ origin: [50, 0] })
  }
}
