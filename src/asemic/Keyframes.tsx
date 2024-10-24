import { cloneDeep, last, range } from 'lodash'
import { Vector2 } from 'three'

export class PointVector extends Vector2 {
  curve: CurvePoint[]
  index: number

  constructor(
    points: [number, number] = [0, 0],
    curve: CurvePoint[],
    index: number
  ) {
    super(points[0], points[1])
    this.curve = curve
    this.index = index
  }

  twist(from: Vector2, amount: number) {
    this.rotateAround(from, amount * Math.PI * 2)
  }

  pull(from: Vector2, to: Vector2, amount: number) {
    this.sub(from).lerp(to, amount).add(from)
  }

  stretch(from: Vector2, amount: Vector2) {
    this.sub(from).multiply(amount).add(from)
  }

  randomize(amount: [number, number]) {
    const v = new Vector2(...amount)
    const ang =
      (this.index
        ? this.curve[this.index - 1].position.angleTo(this)
        : this.angleTo(this.curve[1].position)) +
      0.5 * Math.PI * 2
    this.add(
      vector
        .random()
        .subScalar(0.5)
        .multiply(v)
        .rotateAround({ x: 0, y: 0 }, ang)
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
export default class Keyframes {
  keyframes: KeyframeData[]
  targetFrames: [number, number]
  targetCurves: [number, number]
  curveCount: number

  then(frame?: Omit<KeyframeData, 'curves'>) {
    const newKeyframe = {
      ...cloneDeep(last(this.keyframes)),
      ...frame
    } as KeyframeData
    this.keyframes.push(newKeyframe)
    this.target(-1)
    return this
  }

  constructor(curveCount: number, pointCount: number) {
    this.keyframes = [
      {
        curves: range(curveCount).map(curveI => {
          const thisCurve: CurvePoint[] = []
          for (let i = 0; i < pointCount; i++) {
            thisCurve.push({
              position: new PointVector([0, 0], thisCurve, i),
              pointProgress: i / (pointCount - 1 || 1),
              curveProgress: curveI / (curveCount - 1 || 1)
            })
          }
          return thisCurve
        })
      }
    ]

    this.targetCurves = [0, curveCount]
    this.targetFrames = [0, 0]
    this.curveCount = curveCount
  }

  copy(keyframe: number, copyCount: number = 1) {
    if (keyframe < 0) keyframe += this.keyframes.length
    for (let i = 0; i < copyCount; i++) {
      this.keyframes.push(cloneDeep(this.keyframes[keyframe]))
    }
    this.targetFrames = [keyframe + 1, this.keyframes.length - 1]
    return this
  }

  interpolate(keyframe: number, amount = 0.5) {
    const interpKeyframe = cloneDeep(this.keyframes[keyframe])
    interpKeyframe.curves.forEach((x, curveI) =>
      x.forEach((point, pointI) =>
        point.position.lerp(
          this.keyframes[keyframe + 1].curves[curveI][pointI].position,
          amount
        )
      )
    )
    this.keyframes.splice(keyframe + 1, 0, interpKeyframe)
    return this
  }

  target(from: number, to?: number) {
    if (from < 0) from += this.keyframes.length
    if (to === undefined) to = from
    else if (to < 0) to += this.keyframes.length
    this.targetFrames = [from, to]
    return this
  }

  set(setCurve: [number, number][]) {
    this.eachFrame(frame => {
      for (let i = this.targetCurves[0]; i < this.targetCurves[1]; i++) {
        const curve = frame.curves[i]
        curve.forEach((point, i) => {
          point.position.set(setCurve[i][0], setCurve[i][1])
        })
      }
    })

    return this
  }

  eachFrame(callback: (frame: KeyframeData) => void) {
    for (let i = this.targetFrames[0]; i <= this.targetFrames[1]; i++) {
      callback(this.keyframes[i])
    }
    return this
  }

  eachCurve(callback: (curve: CurvePoint[]) => void) {
    return this.eachFrame(frame => {
      for (let i = this.targetCurves[0]; i < this.targetCurves[1]; i++) {
        const curve = frame.curves[i]
        callback(curve)
      }
    })
  }

  eachPoint(callback: (point: CurvePoint) => void) {
    return this.eachFrame(frame => {
      for (let i = this.targetCurves[0]; i < this.targetCurves[1]; i++) {
        const curve = frame.curves[i]
        curve.forEach((point, i) => {
          callback(point)
        })
      }
    })
  }
}
