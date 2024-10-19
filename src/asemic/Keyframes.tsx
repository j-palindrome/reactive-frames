import { cloneDeep, last, range } from 'lodash'
import { Vector2 } from 'three'
import { lerp } from 'three/src/math/MathUtils.js'

const scale = (i: number, from = 0, to = 1, exp = 1) => {
  return i * (to - from) ** exp + from
}

type Coord = [number, number]

type Keyframe = {
  curves: Point[][]
  position?: Vector2
  scale?: Vector2
  rotation?: number
}
export default class Keyframes {
  keyframes: Keyframe[]

  targetFrame: number
  targetCurves: [number, number]
  curveCount: number
  vector: Vector2

  then(frame?: Omit<Keyframe, 'curves'>) {
    const newKeyframe = {
      ...cloneDeep(last(this.keyframes)),
      ...frame
    } as Keyframe
    this.keyframes.push(newKeyframe)
    this.targetFrame += 1
    return this
  }

  constructor(curveCount: number, pointCount: number) {
    this.keyframes = [
      {
        curves: range(curveCount).map(i =>
          range(pointCount).map(i => ({ position: new Vector2() }))
        )
      }
    ]
    this.targetCurves = [0, curveCount]
    this.targetFrame = 0
    this.curveCount = curveCount
    this.vector = new Vector2()
  }

  clear() {
    this.iterate(curve => {
      curve.splice(1, curve.length - 1)
      curve[0] = { position: new Vector2() }
    })
    return this
  }

  random(variation: Coord) {
    const variationV = new Vector2(...variation)
    this.iterate((curve, i) => {
      curve.forEach((point, i) => {
        const heading = curve[i + 1]
          ? point.position.angleTo(curve[i + 1].position)
          : curve[i - 1].position.angleTo(point.position)
        point.position.add(
          this.vector
            .random()
            .subScalar(0.5)
            .multiply(variationV.clone().rotateAround({ x: 0, y: 0 }, heading))
        )
      })
    })
    return this
  }

  twist(from: [number, number], to?: [number, number]) {
    if (to === undefined) to = from
    this.iterate((curve, progress) => {
      curve.forEach((point, i) => {
        const pointProgress = i / (curve.length - 1)
        const thisFrom = lerp(from[0], from[1], pointProgress)
        const thisTo = lerp(to[0], to[1], pointProgress)
        point.position.rotateAround(
          curve[0].position,
          lerp(thisFrom, thisTo, progress) * Math.PI * 2
        )
      })
    })
    return this
  }

  stretch(from: Coord, to?: Coord) {
    if (to === undefined) to = from
    const fromV = new Vector2(...from)
    const toV = new Vector2(...to)
    this.iterate((curve, progress) => {
      const destination = this.vector.addVectors(
        this.vector.lerpVectors(fromV, toV, progress),
        curve[0].position
      )
      curve.forEach((point, i) => {
        point.position.lerp(destination, i / Math.max(1, curve.length - 1))
      })
    })
    return this
  }

  translate(from: Coord, to?: Coord) {
    if (to === undefined) to = from
    const fromV = new Vector2(...from)
    const toV = new Vector2(...to)
    this.iterate((curve, progress) => {
      curve.forEach(point => {
        point.position.add(this.vector.lerpVectors(fromV, toV, progress))
      })
    })
    return this
  }

  private iterate(callback: (curve: Point[], progress: number) => void) {
    const total = this.targetCurves[1] - this.targetCurves[0]
    for (let i = this.targetCurves[0]; i < this.targetCurves[1]; i++) {
      const curve = this.keyframes[this.targetFrame].curves[i]
      const progress = i / total
      callback(curve, progress)
    }
  }
}
