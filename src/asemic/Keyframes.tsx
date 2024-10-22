import { cloneDeep, last, range } from 'lodash'
import { Vector2 } from 'three'

export class PointVector extends Vector2 {
  pointProgress: number
  curveProgress: number
  origin: Vector2

  constructor(
    points: [number, number] = [0, 0],
    pointProgress: number,
    curveProgress: number,
    origin?: Vector2
  ) {
    super(points[0], points[1])
    this.pointProgress = pointProgress
    this.curveProgress = curveProgress
    this.origin = origin ?? new Vector2(points[0], points[1])
  }

  twist(from: Vector2, amount: number) {
    this.rotateAround(from, amount * Math.PI * 2)
  }

  pull(from: Vector2, to: Vector2, amount: number) {
    this.sub(from).lerp(to, amount).add(from)
  }

  stretch(from: Vector2, amount: number) {
    this.sub(from).multiplyScalar(amount).add(from)
  }

  randomize(from: Vector2, amount: Vector2) {
    this.add(
      vector
        .random()
        .subScalar(0.5)
        .multiply(vector2.copy(amount))
        .rotateAround({ x: 0, y: 0 }, from.angleTo(this))
    )
  }

  grid(size: Vector2, grid: Vector2, progress: number) {
    progress *= grid[0] * grid[1]
    const gridV = vector
      .set((progress % grid[0]) / grid[0], Math.floor(progress % grid[1]))
      .divide(grid)
    this.add(gridV.multiply(size))
  }
}

const vector = new Vector2()
const vector2 = new Vector2()
export default class Keyframes {
  keyframes: KeyframeData[]
  targetFrame: number
  targetCurves: [number, number]
  curveCount: number

  then(frame?: Omit<KeyframeData, 'curves'>) {
    const newKeyframe = {
      ...cloneDeep(last(this.keyframes)),
      ...frame
    } as KeyframeData
    this.keyframes.push(newKeyframe)
    this.targetFrame += 1
    return this
  }

  constructor(curveCount: number, pointCount: number) {
    this.keyframes = [
      {
        curves: range(curveCount).map(i => {
          const origin = new PointVector([0, 0], 0, 0)
          return range(pointCount).map(j => ({
            position:
              j === 0
                ? origin
                : new PointVector(
                    [0, 0],
                    j / Math.max(1, pointCount - 1),
                    i / Math.max(1, curveCount - 1),
                    origin
                  )
          }))
        })
      }
    ]

    this.targetCurves = [0, curveCount]
    this.targetFrame = 0
    this.curveCount = curveCount
  }

  copy(keyframe: number) {
    if (keyframe < 0) keyframe += this.keyframes.length
    this.keyframes.push(cloneDeep(this.keyframes[keyframe]))
    return this
  }

  set(setCurve: [number, number][]) {
    for (let i = this.targetCurves[0]; i < this.targetCurves[1]; i++) {
      const curve = this.keyframes[this.targetFrame].curves[i]
      curve.forEach((point, i) => {
        point.position.set(setCurve[i][0], setCurve[i][1])
      })
    }
    return this
  }

  warp(callback: (point: CurvePoint) => void) {
    const total = this.targetCurves[1] - this.targetCurves[0]
    const origin = new Vector2()
    for (let i = this.targetCurves[0]; i < this.targetCurves[1]; i++) {
      const curve = this.keyframes[this.targetFrame].curves[i]
      const progress = i / total
      origin.copy(curve[0].position)
      curve.forEach((point, i) => {
        callback(point)
      })
    }
    return this
  }
}
