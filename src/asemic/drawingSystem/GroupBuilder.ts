import { cloneDeep, last, max, maxBy, min, range } from 'lodash'
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
  groups: PointVector[][][] = []
  targetGroups: number = 0

  constructor() {
    super()
  }

  targetGroup(group: number) {
    if (group < 0) group += this.groups.length
    this.targetGroups = group
    return this
  }

  targetCurve(from: number, to?: number) {
    if (from < 0) from += this.groups[this.targetGroups].length
    if (to === undefined) to = from
    else if (to < 0) to += this.groups[this.targetGroups].length
    this.targetCurves = [from, to]
    return this
  }

  eachCurve(callback: (curve: PointVector[]) => void) {
    for (let i = this.targetCurves[0]; i <= this.targetCurves[1]; i++) {
      callback(this.groups[this.targetGroups][i])
    }
    return this
  }

  eachGroup(callback: (group: PointVector[][]) => void) {
    for (let i = 0; i < this.groups.length; i++) {
      callback(this.groups[i])
    }
    return this
  }

  debug() {
    console.log(
      this.groups[this.targetGroups][this.targetCurves[0]]
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

  new(origin: Coordinate, newGroup: boolean = false) {
    if (newGroup) {
      this.groups.push([])
      this.targetGroup(-1)
      this.modeSet = 'absolute'
      this.scaleSet = this.gridSet
      this.rotationSet = 0
      this.originSet = [0, 0]
    }
    this.addToLog('new', { coords: [origin] })
    origin = this.getRelative(origin)
    this.groups[this.targetGroups].push([])
    this.targetCurve(-1)
    this.addToCurve(this.groups[this.targetGroups][this.targetCurves[0]], [
      origin
    ])
    return this
  }

  getPoint(curve: number, point: number): Coordinate {
    if (curve < 0) curve += this.groups[this.targetGroups].length
    if (point < 0) point += this.groups[this.targetGroups][curve].length
    const p = this.groups[this.targetGroups][curve][point]!
    return [p.x * this.gridSet[0], p.y * this.gridSet[1]]
  }

  add(point: Coordinate) {
    this.getLastPoint().add({
      x: point[0] / this.gridSet[0],
      y: point[1] / this.gridSet[1]
    })
    return this
  }

  arc(centerPoint: Coordinate, amount: number) {
    this.addToLog('arc', { coords: [centerPoint], endArgs: [amount] })
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

    return this.eachCurve(curve => {
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
        curve,
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

  private getLastPoint() {
    return (
      last(this.groups[this.targetGroups][this.targetCurves[0]]) ??
      new PointVector([0, 0], this.groups[this.targetGroups][0], 0)
    )
  }

  points(...coords: Coordinate[]) {
    this.addToLog('point', { coords })
    return this.eachCurve(curve => {
      for (let coord of coords) {
        this.addToCurve(curve, [this.getRelative(coord)])
      }
    })
  }

  length(copyCount: number) {
    this.addToLog('length', { endArgs: [copyCount] })
    return this.eachCurve(curve =>
      this.addToCurve(
        curve,
        range(copyCount).map(() => curve[0].toArray())
      )
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
    this.groups = []
    eval(output)
    console.log(output)

    return this
  }

  private getRelative(move: Coordinate): Coordinate {
    let lastPoint: PointVector
    let point: Coordinate

    if (move[2]?.mode) {
      // reset transforms when switching modes
      this.modeSet = move[2].mode
    }
    if (move[2]?.origin) {
      const modeSave = this.modeSet
      const scaleSave = cloneDeep(this.scaleSet)
      this.scaleSet = this.gridSet
      this.originSet = [0, 0]
      const origin = this.getRelative(move[2].origin)
      this.originSet = [
        origin[0] * this.gridSet[0],
        origin[1] * this.gridSet[1]
      ]

      this.modeSet = modeSave
      this.scaleSet = scaleSave
    }
    if (move[2]?.grid) {
      this.gridSet = move[2].grid
    }
    if (move[2]?.rotation) {
      this.rotationSet = move[2].rotation
    }
    if (move[2]?.scale) {
      this.scaleSet = move[2].scale
    }

    const mappedMove: Coordinate = vector
      .set(
        ((move[0] * this.scaleSet[0]) / this.gridSet[0] +
          (this.modeSet === 'absolute' ? this.originSet[0] : 0)) /
          this.gridSet[0],
        ((move[1] * this.scaleSet[1]) / this.gridSet[1] +
          (this.modeSet === 'absolute' ? this.originSet[1] : 0)) /
          this.gridSet[1]
      )
      .rotateAround(
        {
          x: this.originSet[0] / this.gridSet[0],
          y: this.originSet[1] / this.gridSet[1]
        },
        this.rotationSet ?? 0
      )
      .toArray()

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
          this.groups[this.targetGroups][this.targetCurves[0]][
            this.groups[this.targetGroups][this.targetCurves[0]].length - 2
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
      case 'intersect':
        move[1] =
          move[1] < 0
            ? move[1] + this.groups[this.targetGroups].length
            : move[1]

        const curvePath = this.makeCurvePath(
          this.groups[this.targetGroups][move[1]]
        )
        point = curvePath.getPointAt(move[0] / this.gridSet[0]).toArray() as [
          number,
          number
        ]
        break
    }

    return [...point, move[2] ?? {}]
  }

  eval(callback: (self: this) => void) {
    callback(this)
    return this
  }

  text(str: string) {
    for (let letter of str) {
      if (this.letters[letter]) this.letter(letter)
    }
    let i = 0
    let xProgress = 0
    let yProgress = 0

    this.eachGroup(group => {
      const minX = min(group.flat().map(x => x.x))!
      group
        .flat()
        .forEach(point => point.add({ x: xProgress - minX, y: yProgress }))
      const maxX = max(group.flat().map(x => x.x))!
      xProgress = maxX + 0.1
    })
    this.eachGroup(group =>
      group.flat().forEach(point => point.divideScalar(xProgress))
    )

    return this
  }

  within(
    from: Coordinate,
    to: Coordinate,
    { target = [0, -1] }: { target?: [number, number] } = {}
  ) {
    this.targetCurve(target[0], target[1])
    const tGroup = this.groups[this.targetGroups]
    const xMap = tGroup.flat().map(x => x.x)
    const yMap = tGroup.flat().map(y => y.y)
    const minVector = vector.set(min(xMap)!, min(yMap)!)
    const maxVector = vector2.set(max(xMap)!, max(yMap)!)
    const fromMapped = this.getRelative(from)
    const toMapped = this.getRelative(to)
    this.eachPoint(p => {
      p.sub(minVector)
        .multiply({
          x: (toMapped[0] - fromMapped[0]) / (maxVector.x - minVector.x),
          y: (toMapped[1] - fromMapped[1]) / (maxVector.y - minVector.y)
        })
        .add({ x: from[0], y: from[1] })
    })
    return this
  }

  letters: Record<string, () => GroupBuilder> = {
    a: () =>
      this.new([80, 80], true)
        .curve([20, 50], [30, -40])
        .curve([80, 20], [50, -40])
        .new([80, 80])
        .curve([80, 5], [50, -10])
        .slide(0.1)
        .within([0, 0], [50, 50]),
    b: () =>
      this.new([10, 90], true)
        .line([10, 10])
        .new([10, 50])
        .curve([50, -20, { mode: 'relative' }], [50, 20])
        .curve([10, 10, { mode: 'absolute' }], [50, 20])
        .within([0, 0], [50, 100]),
    c: () =>
      this.new([80, 70, { scale: [70, 70] }], true)
        .arc([50, 50], 0.8)
        .within([0, 0], [50, 50]),
    d: () =>
      this.new([90, 90], true)
        .line([0, -70, { mode: 'relative' }])
        .new([90, 55, { mode: 'absolute' }])
        .curve([-50, -20, { mode: 'relative' }], [50, -30])
        .curve([90, 23.5, { mode: 'absolute' }], [50, -20])
        .within([0, 0], [75, 100]),
    e: () =>
      this.new([80, 50], true)
        .points([80, 70])
        .arc([-30, -20, { mode: 'relative' }], 0.8)
        .new([55, -1, { mode: 'intersect' }])
        .line([80, 50, { mode: 'absolute' }])
        .within([0, 0], [50, 50]),
    f: () =>
      this.new([70, 70], true)
        .arc([-20, 0, { mode: 'relative' }], 0.5)
        .line([0, -50])
        .new([70, -1, { mode: 'intersect' }])
        .line([30, 0, { mode: 'relative' }])
        .slide(0.2)
        .within([0, 0, { mode: 'absolute' }], [50, 100]),
    g: () =>
      this.new([70, 60, { origin: [0, -20] }], true)
        .arc([20, -45, { mode: 'polar' }], 1)
        .new([0, 0])
        .points([100, -25], [35, 20, { mode: 'absolute' }])
        .within([0, -50], [50, 50]),
    h: () =>
      this.new([10, 90], true)
        .line([0, -80, { mode: 'relative' }])
        .new([70, -1, { mode: 'intersect' }])
        .curve([50, 10, { mode: 'absolute' }], [10, 150])
        .within([0, 0], [50, 100]),
    i: () =>
      this.new([51, 70, { scale: [100, 80] }], true)
        .arc([-1, -1, { mode: 'relative' }], 1)
        .new([-1, -10])
        .line([50, 10, { mode: 'absolute' }])
        .within([0, 0], [25, 75]),
    j: () =>
      this.new([51, 76, { origin: [0, -40], scale: [100, 120] }], true)
        .arc([-1, -1, { mode: 'relative' }], 1)
        .new([-1, -10])
        .points([10, -60], [-30, 0], [0, 15])
        .within([0, -50, { mode: 'absolute' }], [50, 50]),
    k: () =>
      this.new([30, 90], true)
        .line([0, -80, { mode: 'relative' }])
        .new([
          30,
          30,
          { mode: 'absolute', origin: [50, -1, { mode: 'intersect' }] }
        ])
        .points(
          [0, 0, { strength: 1, mode: 'absolute' }],
          [50, 0, { origin: [100, -2, { mode: 'intersect' }] }]
        )
        .within([0, 0], [70, 100]),
    l: () =>
      this.new([50, 90], true)
        .points([0, -70, { mode: 'relative' }])
        .curve([10, -10], [50, -50, { strength: 0.5 }])
        .within([0, 0, { mode: 'absolute' }], [25, 100]),
    m: () =>
      this.new(
        [
          0,
          0,
          {
            mode: 'absolute',
            origin: [10, 10],
            scale: [40, 40]
          }
        ],
        true
      )
        .points([0, 100], [100, 100], [100, 0])
        .new([
          0,
          0,
          {
            mode: 'absolute',
            origin: [100, -1, { mode: 'intersect' }],
            scale: [40, 40]
          }
        ])
        .points([0, 100], [100, 100], [100, 0])
        .within([0, 0, { origin: [0, 0] }], [100, 50]),
    n: () =>
      this.new([70, 10], true)
        .points(
          [
            0,
            100,
            {
              mode: 'absolute',
              origin: this.getPoint(-1, -1),
              scale: [-40, 40]
            }
          ],
          [100, 100],
          [100, 40],
          [100, 0]
        )
        .within([0, 0], [50, 50]),
    o: () =>
      this.new([20, 20, { mode: 'absolute', origin: [50, 50] }], true)
        .arc([0, 0], 1)
        .within([0, 0], [50, 50]),
    p: () =>
      this.new([50, 80], true)
        .line([0, -70, { mode: 'relative' }])
        .new([10, -1, { mode: 'intersect' }])
        .curve([0, -30, { mode: 'relative' }], [-40, 100], [140, 100])
        .within([0, -50], [50, 100]),
    q: () =>
      this.new([50, 80, { scale: [100, 130], origin: [0, -40] }], true)
        .line([0, -80, { mode: 'relative', strength: 1 }])
        .points([30, 12, { mode: 'polar' }])
        .new([5, -1, { mode: 'intersect' }])
        .curve([0, -30, { mode: 'relative' }], [-40, -80], [140, -80])
        .within([0, -50], [50, 50]),
    r: () =>
      this.new([30, 60], true)
        .line([30, 10])
        .new([20, -1, { mode: 'intersect' }])
        .curve([40, 0, { mode: 'relative' }], [50, 50])
        .within([0, 0], [50, 50]),
    s: () =>
      this.new([70, 70], true)
        .curve([50, 50], [-20, -100], [120, -100])
        .curve([30, 30], [-20, 100], [120, 100])
        .within([0, 0], [50, 50]),
    t: () =>
      this.new([50, 100, { origin: [0, 10] }], true)
        .line([50, 0])
        .new([30, -1, { mode: 'intersect' }])
        .line([40, 0, { mode: 'relative' }])
        .slide(0.5)
        .within([0, 0], [25, 100]),
    u: () =>
      this.new(
        [0, 100, { scale: [50, 80], origin: [0, -20], mode: 'absolute' }],
        true
      )
        .curve([100, 0, { mode: 'relative' }], [0, -100], [100, -100])
        .within([0, 0], [50, 50]),
    v: () =>
      this.new(
        [0, 100, { scale: [60, 50], origin: [0, 10], mode: 'absolute' }],
        true
      )
        .curve([100, 0, { mode: 'relative' }], [50, -100, { strength: 1 }])
        .within([0, 0], [50, 50]),
    w: () =>
      this.new([0, 50, { scale: [80, 170], origin: [0, -25] }], true)
        .points(
          [25, 0, { strength: 1 }],
          [50, 50, { strength: 1 }],
          [75, 0, { strength: 1 }],
          [100, 50, { strength: 1 }]
        )
        .within([0, 0], [100, 50]),
    x: () =>
      this.new([0, 0, { scale: [50, 60], origin: [0, 0] }], true)
        .line([100, 100])
        .new([0, 100])
        .line([100, 0])
        .within([0, 0], [50, 50]),
    y: () =>
      this.new([0, 0, { scale: [50, 120], origin: [0, -60] }], true)
        .line([100, 100])
        .new([0, 100])
        .line([50, 50])
        .within([0, -50], [50, 50]),
    z: () =>
      this.new([0, 100, { scale: [50, 70] }], true)
        .points(
          [100, 100, { strength: 1 }],
          [0, 0, { strength: 1 }],
          [100, 0, { strength: 1 }]
        )
        .within([0, 0], [50, 50])
  }
}
